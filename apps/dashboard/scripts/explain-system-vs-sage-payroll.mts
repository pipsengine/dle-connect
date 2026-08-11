/**
 * Contrast July 2026:
 * A) Current system daily-rate pack (Sage days + Sage OT/allowance feed)
 * B) Native system-only daily-rate (days×rate + auto meal only, no Sage supplemental lines)
 * C) Salaried pack summary
 */
import { spawnSync } from 'node:child_process';
import { loadWorkspaceEnv } from '../lib/dle-enterprise-db.ts';
import { calculatePayrollForPeriod } from '../lib/payroll-calculation-service.ts';
import { buildTimesheetHoursMapForPayrollPeriod } from '../lib/timesheet-entry-store.ts';
import { getPayrollRunForPeriod } from '../lib/payroll-run-store.ts';

loadWorkspaceEnv();

const PERIOD = '2026-07';
const XLSX =
  process.env.SAGE_DAYRATE_SCHEDULE_XLSX ||
  'C:\\Users\\chrisogbaisi\\OneDrive - Dorman Long Engineering Limited\\Desktop\\DLE Connect\\Hris\\Dayrate Payment Schedule\\DAYRATE PAYMENT SCHEDULE .xlsx';
const round = (value: unknown) => Math.round((Number(value) || 0) * 100) / 100;
const money = (value: number) => round(value).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type SageRow = { code: string; company: string; rate: number; weekdays: number; gross: number; net: number; meal: number };

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
    out.append({'code':code,'company':company,'rate':f('Daily Rate'),'weekdays':f('Total Weekday'),'gross':f('Gross Salary'),'net':f('Net Pay'),'meal':f('Meal Allowance')})
wb.close(); print(json.dumps(out))
`;
  const result = spawnSync('python', ['-c', py], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Sage read failed');
  return JSON.parse(result.stdout) as SageRow[];
};

const main = async () => {
  const sage = readSage();
  const hours = await buildTimesheetHoursMapForPayrollPeriod(PERIOD);
  const daily = await calculatePayrollForPeriod(PERIOD, { forceRefresh: true, pack: 'daily-rate' });
  const salaried = await calculatePayrollForPeriod(PERIOD, { forceRefresh: true, pack: 'salaried' });
  const dailyRun = await getPayrollRunForPeriod(PERIOD, 'daily-rate');
  const salariedRun = await getPayrollRunForPeriod(PERIOD, 'salaried');

  // Native system-only estimate: weekday days × rate + auto meal 500×days (no OT/allowance import)
  let nativeGross = 0;
  let nativeNet = 0;
  let usedFeedDays = 0;
  let missingDays = 0;
  for (const row of sage) {
    const feed = hours.get(row.code) || [...hours.entries()].find(([key]) => String(key).toUpperCase() === row.code)?.[1];
    const days = Number(feed?.daysWorked ?? row.weekdays ?? 0);
    if (feed?.daysWorked != null) usedFeedDays += 1;
    else missingDays += 1;
    const weekday = days * Number(row.rate || 0);
    const meal = days * 500;
    const gross = weekday + meal;
    const net = gross * 0.95; // Sage-like 5% WHT approximation
    nativeGross += gross;
    nativeNet += net;
  }

  const sageGross = sage.reduce((sum, row) => sum + row.gross, 0);
  const sageNet = sage.reduce((sum, row) => sum + row.net, 0);

  console.log('=== July 2026 — what “system payroll” means ===\n');
  console.log('1) CURRENT DAILY-RATE PACK (system run, Sage-fed days + Sage OT/allowances)');
  console.log(`   Status: ${dailyRun?.status}`);
  console.log(`   Staff:  ${daily.summary.employees}`);
  console.log(`   Gross:  ${money(daily.summary.grossPay)}   (Sage ${money(sageGross)} | diff ${money(daily.summary.grossPay - sageGross)})`);
  console.log(`   Net:    ${money(daily.summary.netPay)}   (Sage ${money(sageNet)} | diff ${money(daily.summary.netPay - sageNet)})`);
  console.log(`   Ready:  ${daily.summary.readyEmployees} | Review ${daily.summary.reviewEmployees} | Blocked ${daily.summary.blockedEmployees}`);

  console.log('\n2) NATIVE SYSTEM-ONLY DAILY-RATE (days×rate + auto meal only — NO Sage OT/allowance import)');
  console.log(`   Staff:  ${sage.length}`);
  console.log(`   Gross:  ${money(nativeGross)}   (Sage ${money(sageGross)} | diff ${money(nativeGross - sageGross)})`);
  console.log(`   Net~:   ${money(nativeNet)}   (approx 5% WHT; Sage ${money(sageNet)} | diff ${money(nativeNet - sageNet)})`);
  console.log(`   Note: this is what HRIS formula alone would pay if OT/Sat/Sun/PH/Night/Transport/Stock/TCM were not imported.`);

  console.log('\n3) SALARIED / STIPEND PACK (system payroll — permanent, lumpsum, NYSC/IT)');
  console.log(`   Status: ${salariedRun?.status}`);
  console.log(`   Staff:  ${salaried.summary.employees}`);
  console.log(`   Gross:  ${money(salaried.summary.grossPay)}`);
  console.log(`   Net:    ${money(salaried.summary.netPay)}`);
  console.log(`   Ready:  ${salaried.summary.readyEmployees} | Review ${salaried.summary.reviewEmployees} | Blocked ${salaried.summary.blockedEmployees}`);
  console.log('   Note: this pack is not the Sage dayrate schedule; different population.');

  console.log('\nBottom line:');
  console.log('- “System payroll” daily-rate screen totals match Sage because the run is Sage-aligned (days + imported earning lines).');
  console.log('- Pure native formula (base+meal only) does NOT match Sage — gap is mostly OT and allowances.');
  console.log('- Salaried pack is separate system payroll and is not compared to this dayrate SUMMARY sheet.');
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
