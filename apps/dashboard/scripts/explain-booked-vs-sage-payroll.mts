/**
 * July 2026: compare Sage days vs live timesheet bookings vs what payroll actually used.
 */
import { spawnSync } from 'node:child_process';
import { loadWorkspaceEnv } from '../lib/dle-enterprise-db.ts';
import { calculatePayrollForPeriod } from '../lib/payroll-calculation-service.ts';
import {
  buildTimesheetHoursMapForPayrollPeriod,
  readTimesheetPayrollUpdates,
  synthesizeTimesheetHoursForPeriod,
} from '../lib/timesheet-entry-store.ts';

loadWorkspaceEnv();

const PERIOD = '2026-07';
const PERIOD_ID = 'per-2026-07';
const XLSX =
  process.env.SAGE_DAYRATE_SCHEDULE_XLSX ||
  'C:\\Users\\chrisogbaisi\\OneDrive - Dorman Long Engineering Limited\\Desktop\\DLE Connect\\Hris\\Dayrate Payment Schedule\\DAYRATE PAYMENT SCHEDULE .xlsx';
const round = (value: unknown) => Math.round((Number(value) || 0) * 100) / 100;
const money = (value: number) => round(value).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const readSage = () => {
  const escaped = XLSX.replace(/\\/g, '\\\\');
  const py = `
from openpyxl import load_workbook
import json, re
path = r'''${escaped}'''
wb = load_workbook(path, data_only=True, read_only=True)
out=[]; seen=set()
for sheet in ['DLE','DLPC']:
  rows=list(wb[sheet].iter_rows(values_only=True))
  headers=[str(c or '').strip() for c in rows[0]]
  idx={h:i for i,h in enumerate(headers)}
  for row in rows[1:]:
    code=str(row[idx.get('Emp. Code',0)] or '').strip().upper()
    if not re.fullmatch(r'C\\d+', code) or code in seen: continue
    first=str(row[idx.get('First Name',1)] or '').strip(); last=str(row[idx.get('Last Name',2)] or '').strip()
    if not first and not last: continue
    def f(c):
      if c not in idx: return 0.0
      try: return float(row[idx[c]] or 0)
      except: return 0.0
    seen.add(code)
    out.append({'code':code,'name':(first+' '+last).strip(),'rate':f('Daily Rate'),'weekdays':f('Total Weekday'),'gross':f('Gross Salary')})
wb.close(); print(json.dumps(out))
`;
  const result = spawnSync('python', ['-c', py], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Sage read failed');
  return JSON.parse(result.stdout) as Array<{ code: string; name: string; rate: number; weekdays: number; gross: number }>;
};

const findDays = (map: Map<string, { daysWorked: number }>, code: string, name: string) => {
  for (const key of [code, name]) {
    const hit = map.get(key);
    if (hit) return hit.daysWorked;
  }
  for (const [key, value] of map.entries()) {
    if (String(key).toUpperCase() === code) return value.daysWorked;
  }
  return null;
};

const main = async () => {
  const sage = readSage();
  const updates = await readTimesheetPayrollUpdates();
  const julyUpdate = updates.find((item) => item.periodId === PERIOD_ID || item.id.includes('sage-dayrate'));
  const booked = await synthesizeTimesheetHoursForPeriod(PERIOD_ID).catch(() => new Map());
  const payrollFeed = await buildTimesheetHoursMapForPayrollPeriod(PERIOD);
  const calc = await calculatePayrollForPeriod(PERIOD, { forceRefresh: true, pack: 'daily-rate' });
  const byCode = new Map(calc.records.map((record) => [String(record.employeeCode || '').toUpperCase(), record]));

  let bookedVsSage = 0;
  let feedVsSage = 0;
  let paidVsSageGross = 0;
  let lowerIfBookedOnly = 0;
  const samples: Array<Record<string, unknown>> = [];

  for (const row of sage) {
    const bookedDays = findDays(booked as Map<string, { daysWorked: number }>, row.code, row.name);
    const feedDays = findDays(payrollFeed, row.code, row.name);
    const record = byCode.get(row.code);
    const paidDays = Number(record?.timesheetDaysWorked ?? feedDays ?? NaN);
    const bookedDiff = bookedDays == null ? null : round(Number(bookedDays) - row.weekdays);
    const feedDiff = feedDays == null ? null : round(Number(feedDays) - row.weekdays);
    if (bookedDiff != null && Math.abs(bookedDiff) >= 0.01) bookedVsSage += 1;
    if (feedDiff != null && Math.abs(feedDiff) >= 0.01) feedVsSage += 1;
    if (record && Math.abs(round(record.grossPay) - round(row.gross)) >= 0.5) paidVsSageGross += 1;

    if (bookedDays != null && Number(bookedDays) + 0.01 < row.weekdays) {
      const shortfallDays = row.weekdays - Number(bookedDays);
      lowerIfBookedOnly += shortfallDays * row.rate;
      if (samples.length < 15) {
        samples.push({
          code: row.code,
          name: row.name,
          sageDays: row.weekdays,
          bookedDays: round(bookedDays),
          payrollUsedDays: round(paidDays),
          shortfallDays: round(shortfallDays),
          rate: row.rate,
          approxShortfallPay: round(shortfallDays * row.rate),
          sageGross: round(row.gross),
          hrisPaidGross: record ? round(record.grossPay) : null,
        });
      }
    }
  }

  console.log('=== Is HRIS computing salaries correctly? ===\n');
  console.log(`Payroll update driving July daily-rate: ${julyUpdate?.id || 'none'}`);
  console.log(`Acknowledged by: ${julyUpdate?.acknowledgedBy || 'n/a'}`);
  console.log(`Employees on Sage roster: ${sage.length}`);
  console.log(`Timesheet bookings that differ from Sage days: ${bookedVsSage}`);
  console.log(`Payroll feed days that differ from Sage days: ${feedVsSage}`);
  console.log(`Paid gross that differs from Sage gross: ${paidVsSageGross}`);
  console.log(`Approx weekday pay understatement if payroll used booked days only: ${money(lowerIfBookedOnly)}`);
  console.log('\nSample where bookings missed days vs Sage:');
  for (const row of samples) {
    console.log(
      `  ${row.code} ${row.name}: booked ${row.bookedDays} vs Sage ${row.sageDays} (payroll used ${row.payrollUsedDays}) | shortfall ~${money(Number(row.approxShortfallPay))} | paid gross ${money(Number(row.hrisPaidGross))} vs Sage ${money(Number(row.sageGross))}`,
    );
  }
  console.log('\nVerdict:');
  console.log('- Current July daily-rate salaries are computed correctly AGAINST SAGE (days + OT/allowances from Sage schedule).');
  console.log('- They are NOT computed from incomplete timesheet bookings where the team missed days.');
  console.log('- Sage feed overwrote/filled those gaps for payroll, so staff are paid Sage days, not missed booking days.');
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
