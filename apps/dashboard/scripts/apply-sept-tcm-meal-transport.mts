/**
 * Apply September TCM meal / transport from the site-days workbook onto HRIS packages.
 * Days × ₦1,500.
 * Transport days "-" means no transport: L1940 (meal ₦39,000) and L2763 (meal ₦31,500).
 * Sheet community row (L12611 / L5611, Unoh Evelyn) is HRIS L2611.
 *
 * Dry-run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/apply-sept-tcm-meal-transport.mts
 * Apply:   npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/apply-sept-tcm-meal-transport.mts --apply
 */
import sql from 'mssql';
import { getDleEnterpriseDbPool, loadWorkspaceEnv } from '../lib/dle-enterprise-db.ts';
import { invalidatePayrollEmployeeCache } from '../lib/payroll-employee-source.ts';
import { invalidatePayrollCalculationCache } from '../lib/payroll-calculation-service.ts';

loadWorkspaceEnv();

const APPLY = process.argv.includes('--apply');
const TCM_RATE = 1500;

type TcmRow = { code: string; aliases?: string[]; days: number; transportDays: number };

const ROWS: TcmRow[] = [
  { code: 'L1939', days: 21, transportDays: 21 },
  { code: 'L1940', days: 26, transportDays: 0 },
  { code: 'L2237', days: 21, transportDays: 21 },
  { code: 'L2611', aliases: ['L5611', 'L12611'], days: 21, transportDays: 21 },
  { code: 'L2719', days: 21, transportDays: 21 },
  { code: 'P0315', aliases: ['0315', 'L0315'], days: 21, transportDays: 21 },
  { code: 'L2763', days: 21, transportDays: 0 },
  { code: 'L2772', days: 21, transportDays: 21 },
  { code: 'L2774', days: 21, transportDays: 21 },
  { code: 'L2773', days: 21, transportDays: 21 },
];

const compactCode = (value: unknown) => String(value || '').trim().toUpperCase().replace(/[\s_]/g, '');
const isMealLine = (code: string, name: string) => /^(TCMMEAL|MEAL)$/i.test(code) || /^(TCM\s*)?MEAL$/i.test(String(name || '').trim());
const isTcmTransportLine = (code: string, name: string) =>
  /^(TCMTRNSPT|TCMTRANS|TCMTRANSPORT|TCMTRANSP)$/i.test(compactCode(code))
  || /TCM\s*TRANS/i.test(name);

type Line = Record<string, unknown> & { code?: string; name?: string; amount?: number; sourceAmount?: number };

const standingLine = (code: string, name: string, amount: number): Line => ({
  code,
  name,
  amount,
  sourceAmount: amount,
  runFrequency: 'monthly',
  includeInMonthlyPayroll: true,
  taxableAmount: amount,
  ytdTotal: 0,
});

const patchLines = (lines: Line[], meal: number, transport: number) => {
  const next = lines.filter((line) =>
    !isMealLine(String(line.code || ''), String(line.name || ''))
    && !isTcmTransportLine(String(line.code || ''), String(line.name || '')),
  );
  if (meal > 0) next.push(standingLine('TCMMEAL', 'MEAL', meal));
  if (transport > 0) next.push(standingLine('TCM_TRNSPT', 'TCM TRANSPORT', transport));
  return next;
};

const summarize = (lines: Line[]) =>
  lines
    .filter((line) => isMealLine(String(line.code || ''), String(line.name || '')) || isTcmTransportLine(String(line.code || ''), String(line.name || '')))
    .map((line) => `${line.code}=${line.amount}`)
    .join(', ') || '(none)';

const pool = await getDleEnterpriseDbPool();
if (!pool) throw new Error('DLE_Enterprise is unavailable');

console.log(APPLY ? 'APPLY September TCM meal/transport' : 'DRY-RUN September TCM meal/transport');

let updated = 0;
let missing = 0;
for (const row of ROWS) {
  const meal = row.days * TCM_RATE;
  const transport = row.transportDays * TCM_RATE;
  const lookupCodes = [row.code, ...(row.aliases || [])];
  const request = pool.request();
  lookupCodes.forEach((code, index) => request.input(`c${index}`, sql.NVarChar(50), code));
  const rs = await request.query(`
SELECT e.employee_id, e.employee_code, e.full_name, p.sage_earning_lines_json
FROM hris.Employees e
JOIN hris.EmployeePayrollSetup p ON p.employee_id = e.employee_id
WHERE UPPER(LTRIM(RTRIM(e.employee_code))) IN (${lookupCodes.map((_, index) => `@c${index}`).join(', ')})
`);
  const found = rs.recordset[0];
  if (!found) {
    missing += 1;
    console.log('MISSING', row.code, lookupCodes.join('|'));
    continue;
  }
  let lines: Line[] = [];
  try {
    lines = JSON.parse(found.sage_earning_lines_json || '[]');
  } catch {
    lines = [];
  }
  if (!Array.isArray(lines)) lines = [];
  const next = patchLines(lines, meal, transport);
  const changed = JSON.stringify(lines) !== JSON.stringify(next);
  console.log(
    found.employee_code,
    found.full_name,
    `days ${row.days}/${row.transportDays}`,
    `want meal ${meal} transport ${transport}`,
    '| before', summarize(lines),
    '| after', summarize(next),
    changed ? (APPLY ? 'UPDATED' : 'WOULD UPDATE') : 'UNCHANGED',
  );
  if (!APPLY || !changed) continue;
  await pool.request()
    .input('id', sql.BigInt, found.employee_id)
    .input('json', sql.NVarChar(sql.MAX), JSON.stringify(next))
    .query(`
UPDATE hris.EmployeePayrollSetup
SET sage_earning_lines_json = @json, modified_at = SYSUTCDATETIME()
WHERE employee_id = @id
`);
  updated += 1;
}

const patchScheduleEarnings = (earnings: Line[] | undefined, meal: number, transport: number) => {
  const current = Array.isArray(earnings) ? earnings.map((line) => ({ ...line })) : [];
  return patchLines(current, meal, transport);
};

const scheduleRs = await pool.request()
  .input('period', sql.Char(7), '2026-09')
  .query(`
SELECT upload_id, payload_json
FROM hris.SalaryScheduleUploads
WHERE period_code = @period AND is_active = 1
`);
let scheduleUpdated = 0;
if (scheduleRs.recordset[0]?.payload_json) {
  const parsed = JSON.parse(String(scheduleRs.recordset[0].payload_json));
  const scheduleRows: Array<Record<string, unknown> & { employeeCode?: string; earnings?: Line[] }> = parsed?.rows || [];
  const byCode = new Map<string, TcmRow>();
  for (const row of ROWS) {
    byCode.set(row.code, row);
    for (const alias of row.aliases || []) byCode.set(alias, row);
  }
  for (const scheduleRow of scheduleRows) {
    const key = String(scheduleRow.employeeCode || '').trim().toUpperCase();
    const match = byCode.get(key);
    if (!match) continue;
    const meal = match.days * TCM_RATE;
    const transport = match.transportDays * TCM_RATE;
    const before = summarize((scheduleRow.earnings || []) as Line[]);
    scheduleRow.earnings = patchScheduleEarnings(scheduleRow.earnings as Line[], meal, transport);
    const after = summarize(scheduleRow.earnings as Line[]);
    if (before !== after) {
      scheduleUpdated += 1;
      console.log('SCHEDULE', scheduleRow.employeeCode, before, '->', after);
    }
  }
  if (APPLY && scheduleUpdated) {
    await pool.request()
      .input('id', sql.NVarChar(80), scheduleRs.recordset[0].upload_id)
      .input('json', sql.NVarChar(sql.MAX), JSON.stringify(parsed))
      .query(`
UPDATE hris.SalaryScheduleUploads
SET payload_json = @json
WHERE upload_id = @id
`);
  }
} else {
  console.log('No active 2026-09 salary schedule upload');
}

if (APPLY && (updated || scheduleUpdated)) {
  invalidatePayrollEmployeeCache();
  invalidatePayrollCalculationCache('2026-09');
}

console.log({ apply: APPLY, updated, missing, scheduleUpdated, staff: ROWS.length });
process.exit(0);
