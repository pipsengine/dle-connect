import fs from 'node:fs';
import path from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';

for (const file of [path.resolve('apps/dashboard/.env'), path.resolve('apps/dashboard/.env.local'), path.resolve('deployment/iis/site/.env')]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
}

const { readPayrollSnapshot } = await import('../apps/dashboard/lib/payroll-run-store.ts');
const { readPayrollEmployees } = await import('../apps/dashboard/lib/payroll-employee-source.ts');
const { buildDayratePaymentScheduleXlsx } = await import('../apps/dashboard/lib/dayrate-schedule-template-export.ts');
const { buildOfficialPayrollExcelWorksheets } = await import('../apps/dashboard/lib/payroll-official-excel-export.ts');
const { buildExcelWorkbookXml } = await import('../apps/dashboard/lib/excel-export.ts');

const dle = await readPayrollSnapshot('payroll-2026-09-daily-rate-DLE');
const dlpc = await readPayrollSnapshot('payroll-2026-09-daily-rate-DLPC');
const records = [...(dle?.records || []), ...(dlpc?.records || [])].filter((record) => record.isDailyRate && Number(record.grossPay || 0) > 0);
const directory = await readPayrollEmployees();
const outDir = path.resolve('apps/dashboard/data/hris/payroll-exports/2026-09');
mkdirSync(outDir, { recursive: true });

const schedule = await buildDayratePaymentScheduleXlsx({
  period: '2026-09',
  periodLabel: 'September 2026',
  records,
  directoryEmployees: directory.employees,
  company: null,
});
const schedulePath = path.join(outDir, schedule.fileName);
writeFileSync(schedulePath, Buffer.from(schedule.buffer));

const worksheets = await buildOfficialPayrollExcelWorksheets({
  report: 'payroll-register',
  pack: 'daily-rate',
  period: '2026-09',
  periodLabel: 'September 2026',
  salariedRecords: [],
  dayrateRecords: records,
  directoryEmployees: directory.employees,
  currencyScope: 'all',
  company: null,
});
const registerPath = path.join(outDir, 'September 2026 DAYRATE PAYROLL REGISTER.xls');
writeFileSync(registerPath, buildExcelWorkbookXml({ worksheets }));
console.log(JSON.stringify({ counts: schedule.counts, schedulePath, registerPath }, null, 2));
process.exit(0);
