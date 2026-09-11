import fs from 'node:fs';
import path from 'node:path';
import sql from 'mssql';
import { readAllPayrollSnapshotsByPeriods } from '../apps/dashboard/lib/payroll-run-store.ts';
import { preferredPayrollCalculationRecord, findPayrollCalculationRecord } from '../apps/dashboard/lib/payroll-ess-payslip-store.ts';

const loadEnv = () => {
  for (const file of [path.join(process.cwd(), 'apps', 'dashboard', '.env')]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      process.env[match[1]] = value;
    }
  }
};
loadEnv();

const pool = await new sql.ConnectionPool({
  server: process.env.DLE_ENTERPRISE_DB_HOST,
  database: process.env.DLE_ENTERPRISE_DB_NAME,
  user: process.env.DLE_ENTERPRISE_DB_USER,
  password: process.env.DLE_ENTERPRISE_DB_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true },
}).connect();
const excelRow = await pool.request().query(`
  SELECT TOP 1 payload_json FROM [hris].[SalaryScheduleUploads]
  WHERE period_code = '2026-08' AND is_active = 1
`);
const excel = JSON.parse(String(excelRow.recordset[0].payload_json));
await pool.close();

const staff = (excel.rows || []).filter((row) => String(row.employeeCode || '').toUpperCase() === 'P0440' || /P0440/.test(String(row.employeeName || '')));
const snapshots = await readAllPayrollSnapshotsByPeriods(['2026-08']);
const rows = snapshots.get('2026-08') || [];
const locations = rows.map((row) => ({
  runId: row.runId,
  match: Boolean(findPayrollCalculationRecord(row.snapshot, ['P0440', '0440'])),
  codes: row.snapshot.records.filter((rec) => /440/.test(String(rec.employeeCode || ''))).map((rec) => rec.employeeCode),
}));

const payeDiffs = [];
for (const item of excel.rows || []) {
  if (item.kind === 'usd') continue;
  const record = preferredPayrollCalculationRecord(rows, [item.employeeCode]);
  if (!record) continue;
  if (Math.abs(Number(record.paye || 0) - Number(item.paye || 0)) > 1) {
    payeDiffs.push({
      code: item.employeeCode,
      kind: item.kind,
      excelPaye: item.paye,
      essPaye: record.paye,
      excelNet: item.netPay,
      essNet: record.netPay,
      excelGross: item.grossPay,
      essGross: record.grossPay,
    });
  }
}

console.log(JSON.stringify({ staff, locations, preferred: preferredPayrollCalculationRecord(rows, ['P0440']), payeDiffs }, null, 2));
