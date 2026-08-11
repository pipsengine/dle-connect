/**
 * Explain days-worked mismatches vs matching Sage gross for July 2026 daily-rate.
 */
import { spawnSync } from 'node:child_process';
import { loadWorkspaceEnv } from '../lib/dle-enterprise-db.ts';
import { calculatePayrollForPeriod } from '../lib/payroll-calculation-service.ts';
import { buildTimesheetHoursMapForPayrollPeriod } from '../lib/timesheet-entry-store.ts';

loadWorkspaceEnv();

const XLSX =
  process.env.SAGE_DAYRATE_SCHEDULE_XLSX ||
  'C:\\Users\\chrisogbaisi\\OneDrive - Dorman Long Engineering Limited\\Desktop\\DLE Connect\\Hris\\Dayrate Payment Schedule\\DAYRATE PAYMENT SCHEDULE .xlsx';

const round = (value: unknown) => Math.round((Number(value) || 0) * 100) / 100;

type SageRow = {
  code: string;
  company: string;
  name: string;
  rate: number;
  weekdays: number;
  wkdEarn: number;
  gross: number;
  net: number;
};

const readSage = (): SageRow[] => {
  const escaped = XLSX.replace(/\\/g, '\\\\');
  const py = `
from openpyxl import load_workbook
import json, re
path = r'''${escaped}'''
wb = load_workbook(path, data_only=True, read_only=True)
out=[]; seen=set()
for sheet, company in [('DLE','DLE'),('DLPC','DLPC')]:
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
    out.append({'code':code,'company':company,'name':(first+' '+last).strip(),'rate':f('Daily Rate'),'weekdays':f('Total Weekday'),'wkdEarn':f('Wkd Earning'),'gross':f('Gross Salary'),'net':f('Net Pay')})
wb.close(); print(json.dumps(out))
`;
  const result = spawnSync('python', ['-c', py], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Sage read failed');
  return JSON.parse(result.stdout) as SageRow[];
};

const resolveDays = (hours: Map<string, { daysWorked: number; bookedHours: number }>, code: string, name: string) => {
  const keys = [code, name, code.toLowerCase(), name.toLowerCase()];
  for (const key of keys) {
    const hit = hours.get(key);
    if (hit) return hit.daysWorked;
  }
  for (const [key, value] of hours.entries()) {
    if (String(key).toUpperCase() === code.toUpperCase()) return value.daysWorked;
  }
  return null;
};

const main = async () => {
  const sage = readSage();
  const hours = await buildTimesheetHoursMapForPayrollPeriod('2026-07');
  const calc = await calculatePayrollForPeriod('2026-07', { forceRefresh: true, pack: 'daily-rate' });
  const byCode = new Map(calc.records.map((record) => [String(record.employeeCode || '').toUpperCase(), record]));

  const dayMismatches: Array<Record<string, unknown>> = [];
  const wkdMismatches: Array<Record<string, unknown>> = [];
  let sameDays = 0;

  for (const s of sage) {
    const record = byCode.get(s.code);
    if (!record) continue;
    const mapDays = resolveDays(hours, s.code, s.name);
    const hrisDays = Number(record.timesheetDaysWorked ?? mapDays ?? NaN);
    const dayDiff = round(hrisDays - s.weekdays);
    const wkdLine = (record.paidEarningLines || record.earningLines || [])
      .filter((line) => /JCWEEKDAY/i.test(String(line.code || '')))
      .reduce((sum, line) => sum + Number(line.amount || 0), 0);
    const expected = round(s.weekdays * s.rate);
    const row = {
      code: s.code,
      name: s.name,
      company: s.company,
      sageDays: s.weekdays,
      hrisDays,
      mapDays,
      dayDiff,
      rate: s.rate,
      sageWkdEarn: round(s.wkdEarn),
      daysTimesRate: expected,
      hrisWkd: round(wkdLine),
      wkdDiff: round(wkdLine - s.wkdEarn),
      sageGross: round(s.gross),
      hrisGross: round(record.grossPay),
      grossDiff: round(record.grossPay - s.gross),
    };
    if (Math.abs(dayDiff) < 0.01) sameDays += 1;
    else dayMismatches.push(row);
    if (Math.abs(Number(row.wkdDiff)) >= 0.5) wkdMismatches.push(row);
  }

  dayMismatches.sort((a, b) => Math.abs(Number(b.dayDiff)) - Math.abs(Number(a.dayDiff)));

  console.log('=== Days worked vs gross alignment ===');
  console.log(`Employees: ${sage.length}`);
  console.log(`Same Sage Total Weekday vs HRIS days: ${sameDays}`);
  console.log(`Different days: ${dayMismatches.length}`);
  console.log(`Different weekday earning amount: ${wkdMismatches.length}`);
  console.log(`Day mismatch but gross still exact: ${dayMismatches.filter((row) => Math.abs(Number(row.grossDiff)) < 0.5).length}`);
  console.log(`Day mismatch and weekday earning mismatch: ${dayMismatches.filter((row) => Math.abs(Number(row.wkdDiff)) >= 0.5).length}`);
  console.log('\nHow HRIS builds daily-rate pay:');
  console.log('1) Weekday base = timesheet/Sage days × daily rate (JCWEEKDAY)');
  console.log('2) Plus imported Sage lines (OT/Sat/Sun/PH/Night/Meal/Transport/Stock/Site/TCM)');
  console.log('3) Gross = sum of those lines; Net ≈ Gross − 5% WHT');
  console.log('\nSo totals can match Sage even if a UI "days" field looks different,');
  console.log('as long as the earning amounts (especially imported Sage amounts) match.');

  if (dayMismatches.length) {
    console.log('\nEmployees with days mismatch:');
    for (const row of dayMismatches.slice(0, 30)) {
      console.log(
        `  ${row.code} [${row.company}] SageDays=${row.sageDays} HRISDays=${row.hrisDays} (map=${row.mapDays}) | SageWkd=${row.sageWkdEarn} HRISWkd=${row.hrisWkd} | GrossDiff=${row.grossDiff}`,
      );
    }
  } else {
    console.log('\nNo days-worked mismatches found between Sage Total Weekday and HRIS timesheetDaysWorked/feed.');
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
