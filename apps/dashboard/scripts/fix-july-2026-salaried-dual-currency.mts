/**
 * Fix July 2026 salaried dual-currency (DLE_USD) + align other JULY PAYROLL packages.
 *
 * 1. DLE_USD group:
 *    P0442 Odulate, P0458 Mamora, P0457 Austen-Peters, P0413 Chris Ijeli, P0364 Mgbeoji
 *    - Primary package = USD (user-indicated dollar values)
 *    - Local package = NGN from JULY PAYROLL.xlsx (where present)
 *
 * 2. Other Permanent / Lumpsum / IT / NYSC packages synced from JULY PAYROLL.xlsx
 *    into sage_earning_lines_json + period_salary (and create missing staff).
 *
 * Usage:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/fix-july-2026-salaried-dual-currency.mts
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/fix-july-2026-salaried-dual-currency.mts --apply
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import sql from 'mssql';
import { getDleEnterpriseDbPool, loadWorkspaceEnv } from '../lib/dle-enterprise-db.ts';
import { invalidatePayrollEmployeeCache } from '../lib/payroll-employee-source.ts';
import { invalidatePayrollCalculationCache } from '../lib/payroll-calculation-service.ts';

loadWorkspaceEnv();

const APPLY = process.argv.includes('--apply');
const PERIOD = '2026-07';
const XLSX = path.join(
  process.cwd(),
  'backups',
  'Dayrate Payment Schedule',
  'JULY PAYROLL.xlsx',
);

const USD_GROUP = [
  {
    code: 'P0442',
    usdGross: 5650.44,
    grade: 'EXP_USDSNMGT - USD SENIOR MANAGEMENT',
    usdLines: [
      { code: 'EXP_BASIC_TAX', name: 'EXP_ SMGT BASIC', amount: 1130.09, taxableAmount: 1130.09 },
      { code: 'EXP_HOUSING_TAX', name: 'EXP_SMGT HOUSING', amount: 847.57, taxableAmount: 847.57 },
      { code: 'EXP_OTHALL', name: 'EXP_ SMGT OTHER ALLOWANCE', amount: 3107.74, taxableAmount: 3107.74 },
      { code: 'EXP_TRANSP', name: 'EXP_SNMG TRANSPORT', amount: 565.04, taxableAmount: 565.04 },
    ],
  },
  {
    code: 'P0458',
    usdGross: 5391.39,
    grade: 'EXP_USDSNMGT - USD SENIOR MANAGEMENT',
    usdLines: [
      { code: 'EXP_BASIC_TAX', name: 'EXP_ SMGT BASIC', amount: 1078.28, taxableAmount: 1078.28 },
      { code: 'EXP_HOUSING_TAX', name: 'EXP_SMGT HOUSING', amount: 808.71, taxableAmount: 808.71 },
      { code: 'EXP_OTHALL', name: 'EXP_ SMGT OTHER ALLOWANCE', amount: 2965.26, taxableAmount: 2965.26 },
      { code: 'EXP_TRANSP', name: 'EXP_SNMG TRANSPORT', amount: 539.14, taxableAmount: 539.14 },
    ],
  },
  {
    code: 'P0457',
    usdGross: 1220,
    grade: 'EXP_USDSNMGT - USD SENIOR MANAGEMENT',
    usdLines: [
      { code: 'BASIC_USD', name: 'BASIC SALARY', amount: 1220, taxableAmount: 1220 },
    ],
  },
  {
    code: 'P0413',
    usdGross: 9000,
    grade: 'EXP_USDSNMGT - USD SENIOR MANAGEMENT',
    usdLines: [
      { code: 'BASIC_USD', name: 'BASIC SALARY', amount: 9000, taxableAmount: 9000 },
    ],
  },
  {
    code: 'P0364',
    usdGross: 22095.84,
    grade: 'EXP_USDSNMGT - USD SENIOR MANAGEMENT',
    usdLines: [
      { code: 'EXP_BASIC_TAX', name: 'EXP_ SMGT BASIC', amount: 4419.17, taxableAmount: 4419.17 },
      { code: 'EXP_HOUSING_TAX', name: 'EXP_SMGT HOUSING', amount: 3314.38, taxableAmount: 3314.38 },
      { code: 'EXP_OTHALL', name: 'EXP_ SMGT OTHER ALLOWANCE', amount: 12152.71, taxableAmount: 12152.71 },
      { code: 'EXP_TRANSP', name: 'EXP_SNMG TRANSPORT', amount: 2209.58, taxableAmount: 2209.58 },
    ],
  },
] as const;

const USD_CODES = new Set(USD_GROUP.map((row) => row.code));
const IGNORE_CODES = new Set(['0057', '57', '0106', '106']); // blank-name total rows

type SageLine = { code: string; name: string; amount: number; taxableAmount: number | null };

type JulyRow = {
  code: string;
  sheet: 'Perm.Staff' | 'Cont. Staff';
  contType: string;
  firstName: string;
  surname: string;
  name: string;
  gross: number;
  net: number;
  periodSalary: number;
  annualSalary: number;
  deductionTotal: number;
  earnings: SageLine[];
  deductions: SageLine[];
  contributions: SageLine[];
};

const round = (value: unknown) => Math.round((Number(value) || 0) * 100) / 100;
const upper = (value: unknown) => String(value || '').trim().toUpperCase();

const earningCodeForHeader = (header: string) => {
  const h = upper(header).replace(/ \(EARNING\)$/, '');
  if (h === 'BASIC SALARY') return 'BASIC';
  if (h === 'MD BASIC') return 'MD_BASIC';
  if (h === 'HOUSING') return 'HOUSING';
  if (h === 'FURNITURE') return 'FURNITURE';
  if (h === 'FURNITURE ALLOWANCE') return 'FURNITURE_ALLOW';
  if (h === 'TRANSPORT ALLOWANCE') return 'TRANSPORT';
  if (h === 'SENIOR MANAGER TRANSPORT') return 'SNMTRANSPTAX';
  if (h === 'SENIOR MANAGEMENT HOUSING_TAX') return 'SNMHOUSINGTAX';
  if (h === 'SENIOR MANAGEMENT OTHER ALLOWANCE_T') return 'SNMOTHALLTAX';
  if (h === 'TCM TRANSPORT') return 'TCMTRANSPORT';
  if (h === 'MEAL') return 'MEAL';
  if (h === 'MEAL ALLOWANCE') return 'MEAL_ALLOW';
  if (h === 'JNR STAFF_MEAL ALLOWANCE') return 'JNR_MEAL';
  if (h === 'MEDICAL') return 'MEDICAL';
  if (h === 'JNR MEDICAL') return 'JNR_MEDICAL';
  if (h === 'UTILITY' || h === 'UTILITIES') return 'UTILITY';
  if (h === 'JNR UTILITY') return 'JNR_UTILITY';
  if (h === 'OTHER ALLOWANCE') return 'OTHER_ALLOW';
  if (h === 'JNR OTHER ALLOWANCE') return 'JNR_OTHER';
  if (h === 'LEAVE ALLOWANCE') return 'LEAVEALLOW';
  if (h === 'OVERTIME') return 'OVERTIME';
  if (h === 'PENSION REFUND') return 'PENSION_REFUND';
  if (h === 'REFUND') return 'REFUND';
  if (h === 'SITE ALLOWANCE') return 'SITE_ALLOW';
  if (h === 'STOCK COUNT') return 'STOCK_COUNT';
  if (h === 'JUNIOR UNION') return 'JNR_UNION';
  if (h === 'SNR UNION') return 'SNR_UNION';
  return h.replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'EARNING';
};

const deductionCodeForHeader = (header: string) => {
  const h = upper(header);
  if (h.includes('PAYE')) return 'PAYE';
  if (h.includes('PENSION EE2')) return 'PENSION_EE2';
  if (h.includes('PENSION') && h.includes('DEDUCTION')) return 'PENSION';
  if (h.includes('NHF')) return 'NHF';
  if (h.includes('UNION')) return 'UNION_DUES';
  if (h.includes('TAX')) return 'TAX';
  return h.replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'DEDUCTION';
};

const contributionCodeForHeader = (header: string) => {
  const h = upper(header);
  if (h.includes('ITF')) return 'ITF';
  if (h.includes('NSITF')) return 'NSITF';
  if (h.includes('USD')) return 'PENSION_ER_USD';
  if (h.includes('PENSION')) return 'PENSION_ER';
  return h.replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'CONTRIBUTION';
};

const directoryCode = (code: string, sheet: string, contType: string) => {
  const raw = upper(code);
  if (/^L\d+/i.test(raw) || /^IT\d+/i.test(raw) || /^N\d+/i.test(raw) || /^I\d+/i.test(raw)) return raw;
  if (sheet === 'Cont. Staff') {
    if (/lumpsum/i.test(contType)) return raw.startsWith('L') ? raw : `L${raw}`;
    if (/intern/i.test(contType) && /^I/i.test(raw)) return raw;
    if (/nysc/i.test(contType)) return raw.startsWith('N') ? raw : raw;
  }
  if (/^\d+$/.test(raw)) return `P${raw.padStart(4, '0')}`;
  if (/^P\d+$/i.test(raw)) return `P${raw.slice(1).padStart(4, '0')}`;
  return raw;
};

const readJulyRows = (): JulyRow[] => {
  const escaped = XLSX.replace(/\\/g, '\\\\');
  const py = `
from openpyxl import load_workbook
import json, re
path = r'''${escaped}'''
wb = load_workbook(path, data_only=True, read_only=True)
out = []

def num(v):
  try: return float(v or 0)
  except: return 0.0

def lines_from(row, headers, idx, suffix, coder):
  items = []
  for h in headers:
    if not h.endswith(suffix): continue
    amount = num(row[idx[h]])
    if abs(amount) < 0.005: continue
    code = coder(h)
    items.append({'code': code, 'name': h.replace(suffix, '').strip(), 'amount': round(amount, 2), 'taxableAmount': round(amount, 2) if suffix == ' (Earning)' else None})
  return items

for sheet in ['Perm.Staff', 'Cont. Staff']:
  ws = wb[sheet]
  rows = list(ws.iter_rows(values_only=True))
  headers = [str(c or '').strip() for c in rows[0]]
  idx = {h:i for i,h in enumerate(headers)}
  for row in rows[1:]:
    code = str(row[idx.get('Employee Code', 0)] or '').strip().upper()
    if not code: continue
    if sheet == 'Perm.Staff':
      surname = str(row[idx.get('EmployeeSurname', 1)] or '').strip()
      first = str(row[idx.get('EmployeeFirstName', 2)] or '').strip()
      cont = 'Permanent'
    else:
      cont = str(row[idx.get('Cont Type', 1)] or '').strip()
      surname = str(row[idx.get('EmployeeSurname', 2)] or '').strip()
      first = str(row[idx.get('EmployeeFirstName', 3)] or '').strip()
    if not surname and not first:
      continue
    earn_headers = [h for h in headers if h.endswith(' (Earning)')]
    ded_headers = [h for h in headers if h.endswith(' (Deduction)')]
    con_headers = [h for h in headers if h.endswith(' (CompanyContribution)')]
    def earn_code(h):
      key = h[:-10].strip().upper()
      mapping = {
        'BASIC SALARY': 'BASIC',
        'MD BASIC': 'MD_BASIC',
        'HOUSING': 'HOUSING',
        'FURNITURE': 'FURNITURE',
        'FURNITURE ALLOWANCE': 'FURNITURE_ALLOW',
        'TRANSPORT ALLOWANCE': 'TRANSPORT',
        'SENIOR MANAGER TRANSPORT': 'SNMTRANSPTAX',
        'SENIOR MANAGEMENT HOUSING_TAX': 'SNMHOUSINGTAX',
        'SENIOR MANAGEMENT OTHER ALLOWANCE_T': 'SNMOTHALLTAX',
        'TCM TRANSPORT': 'TCMTRANSPORT',
        'MEAL': 'MEAL',
        'MEAL ALLOWANCE': 'MEAL_ALLOW',
        'JNR STAFF_MEAL ALLOWANCE': 'JNR_MEAL',
        'MEDICAL': 'MEDICAL',
        'JNR MEDICAL': 'JNR_MEDICAL',
        'UTILITY': 'UTILITY',
        'UTILITIES': 'UTILITY',
        'JNR UTILITY': 'JNR_UTILITY',
        'OTHER ALLOWANCE': 'OTHER_ALLOW',
        'JNR OTHER ALLOWANCE': 'JNR_OTHER',
        'LEAVE ALLOWANCE': 'LEAVEALLOW',
        'OVERTIME': 'OVERTIME',
        'PENSION REFUND': 'PENSION_REFUND',
        'REFUND': 'REFUND',
        'SITE ALLOWANCE': 'SITE_ALLOW',
        'STOCK COUNT': 'STOCK_COUNT',
        'JUNIOR UNION': 'JNR_UNION',
        'SNR UNION': 'SNR_UNION',
      }
      return mapping.get(key) or re.sub(r'[^A-Z0-9]+', '_', key).strip('_')[:40] or 'EARNING'
    def ded_code(h):
      key = h.upper()
      if 'PAYE' in key: return 'PAYE'
      if 'PENSION EE2' in key: return 'PENSION_EE2'
      if 'PENSION' in key: return 'PENSION'
      if 'NHF' in key: return 'NHF'
      if 'UNION' in key: return 'UNION_DUES'
      if 'TAX' in key: return 'TAX'
      return re.sub(r'[^A-Z0-9]+', '_', key).strip('_')[:40] or 'DEDUCTION'
    def con_code(h):
      key = h.upper()
      if 'ITF' in key: return 'ITF'
      if 'NSITF' in key: return 'NSITF'
      if 'USD' in key: return 'PENSION_ER_USD'
      if 'PENSION' in key: return 'PENSION_ER'
      return re.sub(r'[^A-Z0-9]+', '_', key).strip('_')[:40] or 'CONTRIBUTION'
    earnings = []
    for h in earn_headers:
      amount = num(row[idx[h]])
      if abs(amount) < 0.005: continue
      earnings.append({'code': earn_code(h), 'name': h[:-10].strip(), 'amount': round(amount, 2), 'taxableAmount': round(amount, 2)})
    deductions = []
    for h in ded_headers:
      amount = num(row[idx[h]])
      if abs(amount) < 0.005: continue
      deductions.append({'code': ded_code(h), 'name': h.replace(' (Deduction)', '').strip(), 'amount': round(amount, 2), 'taxableAmount': None})
    contributions = []
    for h in con_headers:
      amount = num(row[idx[h]])
      if abs(amount) < 0.005: continue
      contributions.append({'code': con_code(h), 'name': h.replace(' (CompanyContribution)', '').strip(), 'amount': round(amount, 2), 'taxableAmount': None})
    out.append({
      'code': code,
      'sheet': sheet,
      'contType': cont,
      'firstName': first,
      'surname': surname,
      'name': (first + ' ' + surname).strip(),
      'gross': round(num(row[idx['Gross Earnings']]) if 'Gross Earnings' in idx else num(row[idx.get('Earning Total')]), 2),
      'net': round(num(row[idx['Net Pay']]) if 'Net Pay' in idx else 0, 2),
      'periodSalary': round(num(row[idx['Period Salary']]) if 'Period Salary' in idx else 0, 2),
      'annualSalary': round(num(row[idx['Annual Salary']]) if 'Annual Salary' in idx else 0, 2),
      'deductionTotal': round(num(row[idx['Deduction Total']]) if 'Deduction Total' in idx else 0, 2),
      'earnings': earnings,
      'deductions': deductions,
      'contributions': contributions,
    })
wb.close()
print(json.dumps(out))
`;
  const result = spawnSync('python', ['-c', py], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Failed reading JULY PAYROLL.xlsx');
  return JSON.parse(result.stdout) as JulyRow[];
};

const findEmployeeId = async (pool: sql.ConnectionPool, code: string) => {
  const raw = upper(code);
  const request = pool.request().input('code', sql.NVarChar(50), raw);
  // Never auto-prefix IT/NYSC/L/C codes with P (PIT0106 must not match IT0106 lookups).
  if (/^(IT|NYSC|L|C|I|N)\d+/i.test(raw) || !/^\d+$/.test(raw.replace(/^P/i, ''))) {
    const rs = await request.query(`
SELECT TOP (1) employee_id
FROM hris.Employees
WHERE REPLACE(UPPER(LTRIM(RTRIM(employee_code))), '_', '') = REPLACE(UPPER(@code), '_', '')
ORDER BY employee_id
`);
    return rs.recordset[0]?.employee_id as string | undefined;
  }
  const padded = raw.replace(/^P/i, '').padStart(4, '0');
  const rs = await request
    .input('padded', sql.NVarChar(50), padded)
    .input('pcode', sql.NVarChar(50), `P${padded}`)
    .query(`
SELECT TOP (1) employee_id
FROM hris.Employees
WHERE REPLACE(UPPER(LTRIM(RTRIM(employee_code))), '_', '') IN (
  REPLACE(UPPER(@code), '_', ''),
  @padded,
  @pcode
)
ORDER BY employee_id
`);
  return rs.recordset[0]?.employee_id as string | undefined;
};

const ensureEmployee = async (
  pool: sql.ConnectionPool,
  code: string,
  row: JulyRow,
  employmentType: string,
) => {
  const existing = await findEmployeeId(pool, code);
  if (existing) return { employeeId: existing, created: false };
  if (!APPLY) return { employeeId: null, created: false };

  const fullName = row.name || `${row.firstName} ${row.surname}`.trim() || code;
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const employeeRs = await new sql.Request(tx)
      .input('employee_code', sql.NVarChar(50), code)
      .input('full_name', sql.NVarChar(250), fullName)
      .input('employment_status', sql.VarChar(40), 'Active')
      .input('employment_type', sql.VarChar(40), employmentType)
      .query(`
        INSERT [hris].[Employees](employee_code, full_name, employment_status, employment_type)
        OUTPUT INSERTED.employee_id
        VALUES (@employee_code, @full_name, @employment_status, @employment_type);
      `);
    const employeeId = String(employeeRs.recordset[0].employee_id);

    await new sql.Request(tx)
      .input('employee_id', sql.BigInt, employeeId)
      .input('first_name', sql.NVarChar(100), row.firstName || fullName)
      .input('last_name', sql.NVarChar(100), row.surname || fullName)
      .query(`
        INSERT [hris].[EmployeePersonalInfo](employee_id, first_name, last_name)
        VALUES (@employee_id, @first_name, @last_name);
      `);

    await new sql.Request(tx)
      .input('employee_id', sql.BigInt, employeeId)
      .input('staff_category', sql.NVarChar(100), employmentType === 'Permanent' ? 'Permanent' : 'Contract')
      .input('employee_category', sql.NVarChar(100), employmentType)
      .query(`
        INSERT [hris].[EmployeeEmploymentInfo](employee_id, staff_category, employee_category)
        VALUES (@employee_id, @staff_category, @employee_category);
      `);

    await new sql.Request(tx)
      .input('employee_id', sql.BigInt, employeeId)
      .input('business_unit', sql.NVarChar(120), 'DLE')
      .query(`
        INSERT [hris].[EmployeeJobInfo](employee_id, business_unit)
        VALUES (@employee_id, @business_unit);
      `);

    await new sql.Request(tx)
      .input('employee_id', sql.BigInt, employeeId)
      .input('source_employee_id', sql.NVarChar(80), code)
      .input('raw_payload_json', sql.NVarChar(sql.MAX), JSON.stringify({ source: 'JULY PAYROLL.xlsx', ...row }))
      .query(`
        INSERT [hris].[EmployeeSourceRecords](employee_id, source_system, source_employee_id, raw_payload_json)
        VALUES (@employee_id, N'Sage July Payroll Schedule', @source_employee_id, @raw_payload_json);
      `);

    await tx.commit();
    return { employeeId, created: true };
  } catch (error) {
    await tx.rollback();
    throw error;
  }
};

const employmentTypeFor = (row: JulyRow) => {
  if (row.sheet === 'Perm.Staff') return 'Permanent';
  const cont = upper(row.contType);
  if (cont.includes('LUMP')) return 'Lumpsum';
  if (cont.includes('NYSC') || /^N\d+/i.test(row.code)) return 'NYSC';
  if (cont.includes('INTERN') || /^IT\d+/i.test(row.code) || /^I\d+/i.test(row.code)) return 'Industrial Trainee';
  return 'Contract';
};

const upsertPayroll = async (
  pool: sql.ConnectionPool,
  employeeId: string,
  patch: {
    payrollGroup?: string | null;
    payCurrency?: string | null;
    salaryGrade?: string | null;
    periodSalary?: number | null;
    basicSalary?: number | null;
    annualSalary?: number | null;
    latestDeductions?: number | null;
    earningLines?: SageLine[] | null;
    deductionLines?: SageLine[] | null;
    contributionLines?: SageLine[] | null;
    localPayrollGroup?: string | null;
    localPayCurrency?: string | null;
    localPeriodSalary?: number | null;
    localLatestDeductions?: number | null;
    localEarningLines?: SageLine[] | null;
    localDeductionLines?: SageLine[] | null;
    localContributionLines?: SageLine[] | null;
    clearLocal?: boolean;
  },
) => {
  if (!APPLY) return;
  const basicFromLines = patch.earningLines?.find((line) => /BASIC/i.test(line.code))?.amount ?? null;
  await pool.request()
    .input('employee_id', sql.BigInt, employeeId)
    .input('payroll_group', sql.NVarChar(80), patch.payrollGroup ?? null)
    .input('pay_currency', sql.NVarChar(10), patch.payCurrency ?? null)
    .input('salary_grade', sql.NVarChar(80), patch.salaryGrade ?? null)
    .input('period_salary', sql.Decimal(19, 4), patch.periodSalary ?? null)
    .input('basic_salary', sql.Decimal(19, 4), patch.basicSalary ?? basicFromLines)
    .input('annual_salary', sql.Decimal(19, 4), patch.annualSalary ?? (patch.periodSalary != null ? round(patch.periodSalary * 12) : null))
    .input('latest_deductions', sql.Decimal(19, 4), patch.latestDeductions ?? null)
    .input('sage_payslip_period', sql.NVarChar(7), PERIOD)
    .input('sage_earning_lines_json', sql.NVarChar(sql.MAX), patch.earningLines ? JSON.stringify(patch.earningLines) : null)
    .input('sage_deduction_lines_json', sql.NVarChar(sql.MAX), patch.deductionLines ? JSON.stringify(patch.deductionLines) : null)
    .input('sage_contribution_lines_json', sql.NVarChar(sql.MAX), patch.contributionLines ? JSON.stringify(patch.contributionLines) : null)
    .input('sage_local_payroll_group', sql.NVarChar(80), patch.clearLocal ? null : (patch.localPayrollGroup ?? null))
    .input('sage_local_pay_currency', sql.NVarChar(10), patch.clearLocal ? null : (patch.localPayCurrency ?? null))
    .input('sage_local_period_salary', sql.Decimal(19, 4), patch.clearLocal ? null : (patch.localPeriodSalary ?? null))
    .input('sage_local_latest_deductions', sql.Decimal(19, 4), patch.clearLocal ? null : (patch.localLatestDeductions ?? null))
    .input('sage_local_earning_lines_json', sql.NVarChar(sql.MAX), patch.clearLocal ? null : (patch.localEarningLines ? JSON.stringify(patch.localEarningLines) : null))
    .input('sage_local_deduction_lines_json', sql.NVarChar(sql.MAX), patch.clearLocal ? null : (patch.localDeductionLines ? JSON.stringify(patch.localDeductionLines) : null))
    .input('sage_local_contribution_lines_json', sql.NVarChar(sql.MAX), patch.clearLocal ? null : (patch.localContributionLines ? JSON.stringify(patch.localContributionLines) : null))
    .input('clear_local', sql.Bit, patch.clearLocal ? 1 : 0)
    .query(`
MERGE hris.EmployeePayrollSetup AS target
USING (SELECT @employee_id AS employee_id) AS source
ON target.employee_id = source.employee_id
WHEN MATCHED THEN UPDATE SET
  payroll_group = COALESCE(NULLIF(@payroll_group, N''), target.payroll_group),
  pay_currency = COALESCE(NULLIF(@pay_currency, N''), target.pay_currency),
  salary_grade = COALESCE(NULLIF(@salary_grade, N''), target.salary_grade),
  period_salary = COALESCE(@period_salary, target.period_salary),
  basic_salary = COALESCE(@basic_salary, target.basic_salary),
  annual_salary = COALESCE(@annual_salary, target.annual_salary),
  latest_deductions = COALESCE(@latest_deductions, target.latest_deductions),
  sage_payslip_period = @sage_payslip_period,
  sage_earning_lines_json = COALESCE(@sage_earning_lines_json, target.sage_earning_lines_json),
  sage_deduction_lines_json = COALESCE(@sage_deduction_lines_json, target.sage_deduction_lines_json),
  sage_contribution_lines_json = COALESCE(@sage_contribution_lines_json, target.sage_contribution_lines_json),
  sage_payslip_synced_at = SYSUTCDATETIME(),
  sage_local_payroll_group = CASE WHEN @clear_local = 1 THEN NULL ELSE COALESCE(@sage_local_payroll_group, target.sage_local_payroll_group) END,
  sage_local_pay_currency = CASE WHEN @clear_local = 1 THEN NULL ELSE COALESCE(@sage_local_pay_currency, target.sage_local_pay_currency) END,
  sage_local_period_salary = CASE WHEN @clear_local = 1 THEN NULL ELSE COALESCE(@sage_local_period_salary, target.sage_local_period_salary) END,
  sage_local_latest_deductions = CASE WHEN @clear_local = 1 THEN NULL ELSE COALESCE(@sage_local_latest_deductions, target.sage_local_latest_deductions) END,
  sage_local_earning_lines_json = CASE WHEN @clear_local = 1 THEN NULL ELSE COALESCE(@sage_local_earning_lines_json, target.sage_local_earning_lines_json) END,
  sage_local_deduction_lines_json = CASE WHEN @clear_local = 1 THEN NULL ELSE COALESCE(@sage_local_deduction_lines_json, target.sage_local_deduction_lines_json) END,
  sage_local_contribution_lines_json = CASE WHEN @clear_local = 1 THEN NULL ELSE COALESCE(@sage_local_contribution_lines_json, target.sage_local_contribution_lines_json) END,
  setup_assigned_to_payroll = 1,
  modified_at = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT (
  employee_id, payroll_group, pay_currency, salary_grade, period_salary, basic_salary, annual_salary, latest_deductions,
  sage_payslip_period, sage_earning_lines_json, sage_deduction_lines_json, sage_contribution_lines_json,
  sage_local_payroll_group, sage_local_pay_currency, sage_local_period_salary, sage_local_latest_deductions,
  sage_local_earning_lines_json, sage_local_deduction_lines_json, sage_local_contribution_lines_json,
  sage_payslip_synced_at, setup_assigned_to_payroll
) VALUES (
  @employee_id, @payroll_group, @pay_currency, @salary_grade, @period_salary, @basic_salary, @annual_salary, @latest_deductions,
  @sage_payslip_period, @sage_earning_lines_json, @sage_deduction_lines_json, @sage_contribution_lines_json,
  @sage_local_payroll_group, @sage_local_pay_currency, @sage_local_period_salary, @sage_local_latest_deductions,
  @sage_local_earning_lines_json, @sage_local_deduction_lines_json, @sage_local_contribution_lines_json,
  SYSUTCDATETIME(), 1
);
`);
};

const main = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('No DLE enterprise DB pool');

  const julyRows = readJulyRows().filter((row) => !IGNORE_CODES.has(upper(row.code)));
  const byDirectory = new Map<string, JulyRow>();
  for (const row of julyRows) {
    const code = directoryCode(row.code, row.sheet, row.contType);
    byDirectory.set(code, row);
    byDirectory.set(upper(row.code), row);
  }

  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`July employee rows (excl. totals): ${julyRows.length}`);

  // 1) Dual-currency DLE_USD quartet
  for (const usd of USD_GROUP) {
    const july = byDirectory.get(usd.code) || byDirectory.get(usd.code.replace(/^P/, '')) || byDirectory.get(usd.code.slice(1).replace(/^0+/, ''));
    const employeeId = await findEmployeeId(pool, usd.code);
    if (!employeeId) {
      console.log(`[USD] ${usd.code} MISSING in HRIS — skip`);
      continue;
    }
    const usdBasic = usd.usdLines.find((line) => /BASIC/i.test(line.code))?.amount ?? usd.usdGross;
    console.log(`[USD] ${usd.code} USD ${usd.usdGross} | NGN local ${july ? july.gross : '(none in JULY PAYROLL)'} → DLE_USD`);
    await upsertPayroll(pool, employeeId, {
      payrollGroup: 'DLE_USD',
      payCurrency: 'USD',
      salaryGrade: usd.grade,
      periodSalary: usd.usdGross,
      basicSalary: usdBasic,
      annualSalary: round(usd.usdGross * 12),
      earningLines: [...usd.usdLines],
      deductionLines: [],
      contributionLines: [],
      ...(july
        ? {
            localPayrollGroup: 'DLE',
            localPayCurrency: 'NGN',
            localPeriodSalary: july.gross,
            localLatestDeductions: july.deductionTotal,
            localEarningLines: july.earnings,
            localDeductionLines: july.deductions,
            localContributionLines: july.contributions,
            clearLocal: false,
          }
        : {
            // Ijeli: USD only for July (not on Perm.Staff NGN file)
            clearLocal: true,
          }),
    });
  }

  // Ensure no other active employee remains in DLE_USD / USD pay outside the quartet
  const usdOthers = await pool.request().query(`
SELECT e.employee_id, e.employee_code, e.full_name, p.payroll_group, p.pay_currency
FROM hris.Employees e
JOIN hris.EmployeePayrollSetup p ON p.employee_id = e.employee_id
WHERE (
  UPPER(ISNULL(p.payroll_group, N'')) LIKE N'%USD%'
  OR UPPER(ISNULL(p.pay_currency, N'')) = N'USD'
)
AND e.employee_code NOT IN (N'P0442', N'P0458', N'P0457', N'P0413', N'P0364')
`);
  for (const row of usdOthers.recordset) {
    console.log(`[USD cleanup] ${row.employee_code} ${row.full_name} was ${row.payroll_group}/${row.pay_currency} → DLE/NGN`);
    if (!APPLY) continue;
    await pool.request()
      .input('employee_id', sql.BigInt, row.employee_id)
      .query(`
UPDATE hris.EmployeePayrollSetup
SET payroll_group = N'DLE',
    pay_currency = N'NGN',
    modified_at = SYSUTCDATETIME()
WHERE employee_id = @employee_id
`);
  }

  // 2) Sync other July packages (skip USD quartet primary overwrite — already handled)
  let created = 0;
  let updated = 0;
  for (const row of julyRows) {
    const code = directoryCode(row.code, row.sheet, row.contType);
    if (USD_CODES.has(code)) continue;
    const employmentType = employmentTypeFor(row);
    const ensured = await ensureEmployee(pool, code, row, employmentType);
    if (!ensured.employeeId) {
      console.log(`[sync] ${code} would create (${row.name}) gross=${row.gross}`);
      continue;
    }
    if (ensured.created) {
      created += 1;
      console.log(`[create] ${code} ${row.name}`);
    }
    const isStipend = employmentType === 'Industrial Trainee' || employmentType === 'NYSC';
    await upsertPayroll(pool, ensured.employeeId, {
      payrollGroup: 'DLE',
      payCurrency: 'NGN',
      periodSalary: isStipend ? row.gross : (row.periodSalary || row.gross),
      basicSalary: row.earnings.find((line) => /BASIC/i.test(line.code))?.amount ?? (isStipend ? row.gross : null),
      annualSalary: row.annualSalary || round((row.periodSalary || row.gross) * 12),
      latestDeductions: row.deductionTotal,
      earningLines: row.earnings.length
        ? row.earnings.map((line) => (isStipend ? { ...line, taxableAmount: 0 } : line))
        : [{ code: isStipend ? 'STIPEND_NT' : 'BASIC', name: isStipend ? 'NYSC / IT STIPEND' : 'BASIC SALARY', amount: row.gross, taxableAmount: isStipend ? 0 : row.gross }],
      deductionLines: row.deductions,
      contributionLines: row.contributions,
      clearLocal: true,
    });
    updated += 1;
  }

  if (APPLY) {
    invalidatePayrollEmployeeCache();
    invalidatePayrollCalculationCache(PERIOD);
  }

  console.log(`\nDone. updated=${updated} created=${created} apply=${APPLY}`);
  if (!APPLY) console.log('Re-run with --apply to write changes.');
  process.exit(0);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
