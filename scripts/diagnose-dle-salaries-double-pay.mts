/**
 * Read-only investigation: DLE Salaries pack double-pay.
 * Does not change payroll data.
 */
import { getDleEnterpriseDbPool, loadWorkspaceEnv } from '../apps/dashboard/lib/dle-enterprise-db';

loadWorkspaceEnv();

const round = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
const compact = (v: unknown) => String(v || '').trim();
const canon = (code: unknown) => compact(code).toUpperCase().replace(/[^A-Z0-9]/g, '');

type Line = { code?: string; name?: string; amount?: number; calculation?: string };
type RecordRow = {
  employeeCode?: string;
  employeeId?: string;
  fullName?: string;
  payCurrency?: string;
  payrollGroup?: string;
  employmentType?: string;
  salaryGrade?: string;
  isDailyRate?: boolean;
  grossPay?: number;
  netPay?: number;
  basePay?: number;
  allowances?: number;
  periodPackageGross?: number;
  earningProfile?: string;
  earningProfileId?: string;
  earningLines?: Line[];
  companyCode?: string;
  companyName?: string;
};

const isUsd = (row: RecordRow) =>
  compact(row.payCurrency).toUpperCase() === 'USD' || /USD/i.test(compact(row.payrollGroup));

const analyzeLines = (lines: Line[]) => {
  const byCode = new Map<string, Line[]>();
  for (const line of lines || []) {
    const key = canon(line.code) || canon(line.name) || 'UNKNOWN';
    const list = byCode.get(key) || [];
    list.push(line);
    byCode.set(key, list);
  }
  const duplicateCodes = [...byCode.entries()]
    .filter(([, list]) => list.length > 1 || list.reduce((s, l) => s + Number(l.amount || 0), 0) > Number(list[0]?.amount || 0) * 1.5 && list.length > 1)
    .map(([code, list]) => ({
      code,
      count: list.length,
      amounts: list.map((l) => Number(l.amount || 0)),
      names: list.map((l) => compact(l.name || l.code)),
    }));
  const family = {
    grade: 0,
    basic: 0,
    lumpsum: 0,
    leave: 0,
    overtime: 0,
    other: 0,
  };
  for (const line of lines || []) {
    const code = canon(line.code);
    const amount = Number(line.amount || 0);
    if (/^(JNR|SNR|MGT|SNM|MGT1COLA)/.test(code) && !/LEAVE/.test(code)) family.grade += amount;
    else if (/BASIC|BASICSALARY/.test(code)) family.basic += amount;
    else if (/LUMPSUM/.test(code)) family.lumpsum += amount;
    else if (/LEAVE/.test(code)) family.leave += amount;
    else if (/OVT|OVERTIME|SATEARN|SUNDAY|PUBHOL/.test(code)) family.overtime += amount;
    else family.other += amount;
  }
  return { duplicateCodes, family, lineCount: (lines || []).length };
};

const main = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) {
    console.log(JSON.stringify({ error: 'NO_DB' }));
    return;
  }

  const runs = await pool.request().query(`
    SELECT r.run_id, r.period_code, r.run_status, r.employee_count, r.gross_pay, r.net_pay,
           r.modified_at, s.captured_at, s.action,
           CASE WHEN s.snapshot_json IS NULL THEN 0 ELSE 1 END AS has_snapshot,
           DATALENGTH(s.snapshot_json) AS snapshot_bytes
    FROM [hris].[PayrollRuns] r
    LEFT JOIN [hris].[PayrollRunSnapshots] s ON s.run_id = r.run_id
    ORDER BY r.modified_at DESC
  `);

  console.log('=== RUNS ===');
  for (const row of runs.recordset || []) {
    console.log(JSON.stringify({
      runId: row.run_id,
      period: row.period_code,
      status: row.run_status,
      employees: row.employee_count,
      gross: Number(row.gross_pay),
      net: Number(row.net_pay),
      modifiedAt: row.modified_at,
      capturedAt: row.captured_at,
      action: row.action,
      hasSnapshot: Boolean(row.has_snapshot),
      snapshotMb: row.snapshot_bytes ? round(Number(row.snapshot_bytes) / 1024 / 1024) : 0,
    }));
  }

  const salaried = (runs.recordset || []).filter((row: { run_id?: string }) =>
    /salaried/i.test(String(row.run_id || '')) && /DLE/i.test(String(row.run_id || '')) && !/DLPC/i.test(String(row.run_id || '')),
  );
  const target = salaried[0] || (runs.recordset || []).find((row: { run_id?: string; has_snapshot?: number }) =>
    /salaried/i.test(String(row.run_id || '')) && row.has_snapshot,
  );
  if (!target) {
    console.log(JSON.stringify({ error: 'NO_DLE_SALARIED_RUN' }));
    await pool.close().catch(() => undefined);
    return;
  }

  console.log('\n=== TARGET RUN ===', target.run_id, target.period_code, target.run_status);

  const snap = await pool.request()
    .input('run_id', String(target.run_id))
    .query(`SELECT snapshot_json FROM [hris].[PayrollRunSnapshots] WHERE run_id = @run_id`);
  const raw = String(snap.recordset[0]?.snapshot_json || '');
  if (!raw) {
    console.log(JSON.stringify({ error: 'NO_SNAPSHOT', runId: target.run_id }));
    await pool.close().catch(() => undefined);
    return;
  }

  const parsed = JSON.parse(raw) as { capturedAt?: string; action?: string; records?: RecordRow[]; summary?: Record<string, unknown> };
  const all = parsed.records || [];
  const dleSalaries = all.filter((row) => !row.isDailyRate && !isUsd(row));
  const usd = all.filter((row) => !row.isDailyRate && isUsd(row));

  const byCode = new Map<string, RecordRow[]>();
  for (const row of dleSalaries) {
    const key = compact(row.employeeCode || row.employeeId).toUpperCase();
    if (!key) continue;
    const list = byCode.get(key) || [];
    list.push(row);
    byCode.set(key, list);
  }
  const duplicateEmployees = [...byCode.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([code, list]) => ({
      code,
      name: list[0]?.fullName,
      count: list.length,
      gros: list.map((r) => Number(r.grossPay || 0)),
      currencies: list.map((r) => r.payCurrency),
      groups: list.map((r) => r.payrollGroup),
    }));

  const suspects: Array<Record<string, unknown>> = [];
  for (const row of dleSalaries) {
    const lines = row.earningLines || [];
    const lineSum = round(lines.reduce((s, l) => s + Number(l.amount || 0), 0));
    const gross = round(Number(row.grossPay || 0));
    const packageGross = round(Number(row.periodPackageGross || 0));
    const analysis = analyzeLines(lines);
    const ratio = packageGross > 0 ? gross / packageGross : 0;
    const hasGrade = analysis.family.grade > 0;
    const hasBasic = analysis.family.basic > 0;
    const stackedFamilies = hasGrade && hasBasic && analysis.family.grade > 1000 && analysis.family.basic > 1000;
    const nearDouble = ratio >= 1.8 && ratio <= 2.25;
    const duplicateCodes = analysis.duplicateCodes.length > 0;
    if (duplicateCodes || stackedFamilies || nearDouble || Math.abs(lineSum - gross) > 1) {
      suspects.push({
        employeeCode: row.employeeCode,
        fullName: row.fullName,
        employmentType: row.employmentType,
        salaryGrade: row.salaryGrade,
        payrollGroup: row.payrollGroup,
        earningProfile: row.earningProfile,
        gross,
        packageGross,
        lineSum,
        ratio: round(ratio),
        nearDouble,
        stackedFamilies,
        duplicateCodes: analysis.duplicateCodes,
        family: {
          grade: round(analysis.family.grade),
          basic: round(analysis.family.basic),
          lumpsum: round(analysis.family.lumpsum),
          leave: round(analysis.family.leave),
          overtime: round(analysis.family.overtime),
          other: round(analysis.family.other),
        },
        lines: lines.map((l) => ({
          code: l.code,
          name: l.name,
          amount: Number(l.amount || 0),
          calculation: l.calculation,
        })),
      });
    }
  }

  const packageRows = await pool.request().query(`
    SELECT e.employee_code, e.full_name, e.employment_type, e.employment_status,
           ps.salary_grade, ps.payroll_group,
           ps.pay_currency, ps.period_salary, ps.basic_salary,
           ps.sage_earning_lines_json, ps.sage_local_earning_lines_json
    FROM [hris].[Employees] e
    INNER JOIN [hris].[EmployeePayrollSetup] ps ON ps.employee_id = e.employee_id
    WHERE ISNULL(e.employment_status, N'') NOT LIKE N'%Inactive%'
      AND ISNULL(e.employment_status, N'') NOT LIKE N'%Terminated%'
      AND e.employee_code LIKE N'P%'
  `);

  const packageDupes: Array<Record<string, unknown>> = [];
  for (const row of packageRows.recordset || []) {
    let lines: Line[] = [];
    try { lines = JSON.parse(String(row.sage_earning_lines_json || '[]')) || []; } catch { lines = []; }
    if (!Array.isArray(lines) || !lines.length) continue;
    const analysis = analyzeLines(lines);
    const sum = round(lines.reduce((s, l) => s + Number(l.amount || 0), 0));
    const periodSalary = Number(row.period_salary || 0);
    const ratio = periodSalary > 0 ? sum / periodSalary : 0;
    if (analysis.duplicateCodes.length || (ratio >= 1.8 && ratio <= 2.25)) {
      packageDupes.push({
        employeeCode: row.employee_code,
        fullName: row.full_name,
        grade: row.salary_grade,
        periodSalary,
        packageSum: sum,
        ratio: round(ratio),
        duplicateCodes: analysis.duplicateCodes,
        lines: lines.map((l) => ({ code: l.code, amount: Number(l.amount || 0), freq: (l as { runFrequency?: string }).runFrequency })),
      });
    }
  }

  const augustSnap = await pool.request()
    .input('aug_id', 'payroll-2026-08-salaried-DLE')
    .query(`SELECT snapshot_json FROM [hris].[PayrollRunSnapshots] WHERE run_id = @aug_id`);
  const augustRaw = String(augustSnap.recordset[0]?.snapshot_json || '');
  const augustRecords = augustRaw
    ? ((JSON.parse(augustRaw) as { records?: RecordRow[] }).records || []).filter((row) => !row.isDailyRate && !isUsd(row))
    : [];
  const augustByCode = new Map<string, RecordRow>();
  for (const row of augustRecords) {
    const key = compact(row.employeeCode || row.employeeId).toUpperCase();
    if (key && !augustByCode.has(key)) augustByCode.set(key, row);
  }
  const vsAugust: Array<Record<string, unknown>> = [];
  for (const row of dleSalaries) {
    const key = compact(row.employeeCode || row.employeeId).toUpperCase();
    const prev = augustByCode.get(key);
    if (!prev) continue;
    const sepGross = round(Number(row.grossPay || 0));
    const augGross = round(Number(prev.grossPay || 0));
    if (!(augGross > 0) || !(sepGross > 0)) continue;
    const ratio = sepGross / augGross;
    if (ratio >= 1.7) {
      vsAugust.push({
        employeeCode: row.employeeCode,
        fullName: row.fullName,
        employmentType: row.employmentType,
        salaryGrade: row.salaryGrade,
        earningProfile: row.earningProfile,
        augGross,
        sepGross,
        ratio: round(ratio),
        augLines: (prev.earningLines || []).map((l) => `${l.code}=${Number(l.amount || 0)}`),
        sepLines: (row.earningLines || []).map((l) => `${l.code}=${Number(l.amount || 0)}`),
      });
    }
  }

  const salaryUploads = await pool.request().query(`
    SELECT period_code, file_name, is_active, applied_at, applied_by
    FROM [hris].[SalaryScheduleUploads]
    ORDER BY applied_at DESC
  `).catch(() => ({ recordset: [] as Array<Record<string, unknown>> }));

  console.log('\n=== DLE SALARIES SNAPSHOT ===');
  console.log(JSON.stringify({
    runId: target.run_id,
    period: target.period_code,
    status: target.run_status,
    capturedAt: parsed.capturedAt,
    action: parsed.action,
    snapshotSummary: parsed.summary,
    recordCounts: {
      all: all.length,
      dleSalariesNgn: dleSalaries.length,
      usd: usd.length,
      dailyRate: all.filter((r) => r.isDailyRate).length,
    },
    duplicateEmployeesInPack: duplicateEmployees,
    suspectCount: suspects.length,
    vsAugustDoubleCount: vsAugust.length,
    vsAugust: vsAugust.slice(0, 50),
    packageJsonDuplicateOrDoubleCount: packageDupes.length,
    salaryUploads: salaryUploads.recordset,
  }, null, 2));

  console.log('\n=== SUSPECTS (snapshot) ===');
  console.log(JSON.stringify(suspects.slice(0, 40), null, 2));
  if (suspects.length > 40) console.log(`... ${suspects.length - 40} more suspects`);

  console.log('\n=== PACKAGE JSON DUPES / ~2x period_salary ===');
  console.log(JSON.stringify(packageDupes.slice(0, 40), null, 2));
  if (packageDupes.length > 40) console.log(`... ${packageDupes.length - 40} more package dupes`);
};

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
