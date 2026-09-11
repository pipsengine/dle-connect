import fs from 'node:fs';
import path from 'node:path';
import sql from 'mssql';

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

const unordered = await pool.request().query(`
  SELECT r.period_code, r.run_id, r.run_status, r.employee_count,
         JSON_VALUE(s.snapshot_json, '$.action') AS snapshotAction,
         JSON_VALUE(s.snapshot_json, '$.capturedAt') AS capturedAt
  FROM [hris].[PayrollRuns] r
  INNER JOIN [hris].[PayrollRunSnapshots] s ON s.run_id = r.run_id
  WHERE r.period_code = '2026-08'
`);

const lastRow = unordered.recordset[unordered.recordset.length - 1];

const lastSnap = await pool.request().input('run_id', sql.NVarChar, lastRow.run_id).query(`
  SELECT snapshot_json FROM [hris].[PayrollRunSnapshots] WHERE run_id = @run_id
`);
const lastParsed = JSON.parse(String(lastSnap.recordset[0].snapshot_json));
const lastRecords = lastParsed.records || [];

const dleSnap = await pool.request().query(`
  SELECT snapshot_json FROM [hris].[PayrollRunSnapshots] WHERE run_id = 'payroll-2026-08-salaried-DLE'
`);
const dleParsed = JSON.parse(String(dleSnap.recordset[0].snapshot_json));
const dleRecords = dleParsed.records || [];

const sampleCodes = ['P0013', 'P0146', 'P0033', 'P0467', 'L2635', 'C1065'];
const lastIndex = new Map(lastRecords.map((row) => [key(row.employeeCode), row]));
const dleIndex = new Map(dleRecords.map((row) => [key(row.employeeCode), row]));

const excelRow = await pool.request().query(`
  SELECT TOP 1 payload_json FROM [hris].[SalaryScheduleUploads]
  WHERE period_code = '2026-08' AND is_active = 1
`);
const excel = JSON.parse(String(excelRow.recordset[0].payload_json));
const excelIndex = new Map((excel.rows || []).map((row) => [key(row.employeeCode), row]));

const samples = sampleCodes.map((code) => {
  const excelEmp = excelIndex.get(key(code));
  const lastEmp = lastIndex.get(key(code));
  const dleEmp = dleIndex.get(key(code));
  return {
    code,
    inLastSnapshot: Boolean(lastEmp),
    lastGross: lastEmp ? round(lastEmp.grossPay) : null,
    lastNet: lastEmp ? round(lastEmp.netPay) : null,
    lastPaye: lastEmp ? round(lastEmp.paye) : null,
    inDleSnapshot: Boolean(dleEmp),
    dleGross: dleEmp ? round(dleEmp.grossPay) : null,
    dleNet: dleEmp ? round(dleEmp.netPay) : null,
    dlePaye: dleEmp ? round(dleEmp.paye) : null,
    excelGross: excelEmp ? round(excelEmp.grossPay) : null,
    excelNet: excelEmp ? round(excelEmp.netPay) : null,
    excelPaye: excelEmp ? round(excelEmp.paye) : null,
  };
});

let essHit = 0;
let essMiss = 0;
const missCodes = [];
for (const [code, excelEmp] of excelIndex.entries()) {
  if (!excelEmp || excelEmp.kind === 'usd') continue;
  if (lastIndex.has(code)) essHit += 1;
  else {
    essMiss += 1;
    if (missCodes.length < 12) missCodes.push(code);
  }
}

const dleVsExcel = { sameGross: 0, sameNet: 0, samePaye: 0, compared: 0, netDiffs: [] };
for (const rec of dleRecords) {
  const excelEmp = excelIndex.get(key(rec.employeeCode));
  if (!excelEmp) continue;
  dleVsExcel.compared += 1;
  if (Math.abs(round(rec.grossPay) - round(excelEmp.grossPay)) <= 1) dleVsExcel.sameGross += 1;
  if (Math.abs(round(rec.netPay) - round(excelEmp.netPay)) <= 1) dleVsExcel.sameNet += 1;
  if (Math.abs(round(rec.paye) - round(excelEmp.paye)) <= 1) dleVsExcel.samePaye += 1;
  else if (dleVsExcel.netDiffs.length < 6) {
    dleVsExcel.netDiffs.push({
      code: rec.employeeCode,
      dleNet: round(rec.netPay),
      excelNet: round(excelEmp.netPay),
      dlePaye: round(rec.paye),
      excelPaye: round(excelEmp.paye),
      dleGross: round(rec.grossPay),
      excelGross: round(excelEmp.grossPay),
    });
  }
}

console.log(JSON.stringify({
  sqlOrder: unordered.recordset.map((row) => ({
    run_id: row.run_id,
    status: row.run_status,
    employees: row.employee_count,
    snapshotAction: row.snapshotAction,
    capturedAt: row.capturedAt,
  })),
  lastWins: {
    run_id: lastRow.run_id,
    employees: lastRecords.length,
    sampleCodes: lastRecords.slice(0, 8).map((row) => row.employeeCode),
  },
  dlePublished: {
    action: dleParsed.action,
    capturedAt: dleParsed.capturedAt,
    employees: dleRecords.length,
  },
  essLookupAgainstLastSnapshot: { essHit, essMiss, missCodes },
  dleSnapshotVsExcel: dleVsExcel,
  samples,
}, null, 2));

await pool.close();
