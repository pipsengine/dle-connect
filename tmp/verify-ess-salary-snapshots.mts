import fs from 'node:fs';
import path from 'node:path';
import sql from 'mssql';
import { readAllPayrollSnapshotsByPeriods } from '../apps/dashboard/lib/payroll-run-store.ts';
import { preferredPayrollCalculationRecord } from '../apps/dashboard/lib/payroll-ess-payslip-store.ts';

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

const round = (value) => Math.round((Number(value) || 0) * 100) / 100;
const key = (value) => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

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

const snapshots = await readAllPayrollSnapshotsByPeriods(['2026-08']);
const rows = snapshots.get('2026-08') || [];

let hit = 0;
let miss = 0;
let sameGross = 0;
let sameNet = 0;
let samePaye = 0;
const misses = [];
const diffs = [];

for (const staff of excel.rows || []) {
  if (staff.kind === 'usd') continue;
  const code = String(staff.employeeCode || '').trim();
  if (!code) continue;
  const record = preferredPayrollCalculationRecord(rows, [code, staff.employeeName]);
  if (!record) {
    miss += 1;
    if (misses.length < 15) misses.push(code);
    continue;
  }
  hit += 1;
  const grossOk = Math.abs(round(record.grossPay) - round(staff.grossPay)) <= 1;
  const netOk = Math.abs(round(record.netPay) - round(staff.netPay)) <= 1;
  const payeOk = Math.abs(round(record.paye) - round(staff.paye)) <= 1;
  if (grossOk) sameGross += 1;
  if (netOk) sameNet += 1;
  if (payeOk) samePaye += 1;
  if (!grossOk || !netOk) {
    if (diffs.length < 12) {
      diffs.push({
        code,
        kind: staff.kind,
        excelGross: round(staff.grossPay),
        essGross: round(record.grossPay),
        excelNet: round(staff.netPay),
        essNet: round(record.netPay),
        excelPaye: round(staff.paye),
        essPaye: round(record.paye),
      });
    }
  }
}

const samples = ['P0146', 'P0013', 'P0033', 'P0467', 'P0051'].map((code) => {
  const staff = (excel.rows || []).find((row) => key(row.employeeCode) === key(code));
  const record = preferredPayrollCalculationRecord(rows, [code]);
  return {
    code,
    found: Boolean(record),
    excelNet: staff ? round(staff.netPay) : null,
    essNet: record ? round(record.netPay) : null,
    match: staff && record ? Math.abs(round(record.netPay) - round(staff.netPay)) <= 1 : false,
  };
});

console.log(JSON.stringify({
  snapshotRuns: rows.map((row) => ({ runId: row.runId, status: row.status, action: row.snapshot.action, employees: row.snapshot.records.length, payslipsGeneratedAt: row.payslipsGeneratedAt })),
  ngnSalaryRows: hit + miss,
  essHit: hit,
  essMiss: miss,
  misses,
  sameGross,
  sameNet,
  samePaye,
  diffs,
  samples,
}, null, 2));
