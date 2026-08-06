import { ensureFinanceDb } from '@/lib/finance-intelligence/store';
import { readDirectoryEmployees } from '@/lib/payroll-employee-source';
import { readProjects } from '@/lib/timesheet-entry-store';

export type PaymentSite = {
  siteCode: string;
  siteName: string;
};

export type ExpenseCodeOption = {
  expenseCode: string;
  description: string;
  label: string;
};

export type PaymentEmployeeOption = {
  employeeCode: string;
  fullName: string;
  department: string;
  location: string;
  jobTitle: string;
  projectCode: string;
};

export type PaymentRequestLookups = {
  paymentSites: PaymentSite[];
  expenseCodes: ExpenseCodeOption[];
  departments: string[];
  locations: string[];
  projects: Array<{ code: string; name: string; label: string }>;
  employees: PaymentEmployeeOption[];
};

const compact = (value: unknown) => String(value ?? '').trim();
const uniqueSorted = (values: string[]) =>
  Array.from(new Set(values.map(compact).filter(Boolean))).sort((a, b) => a.localeCompare(b));

export const FALLBACK_SITES: PaymentSite[] = [
  { siteCode: 'DLE', siteName: 'Dorman Long Engineering Limited' },
  { siteCode: 'DLPC', siteName: 'Dorman Long Protective Coatings' },
];

/** Normalize legacy site codes (DLENG/DLPCG) to the short codes Finance uses. */
export const normalizePaymentSiteCode = (value?: string | null) => {
  const code = compact(value).toUpperCase();
  if (code === 'DLENG' || code === 'DLE') return 'DLE';
  if (code === 'DLPCG' || code === 'DLPC') return 'DLPC';
  return code;
};

export const FALLBACK_EXPENSE_CODES: ExpenseCodeOption[] = [
  ['COE', 'Corporate Office Expenses'],
  ['DEM', 'Demurrage payment'],
  ['DPR', 'Department of Petroleum Resources'],
  ['DUTY', 'Duty Payment'],
  ['ENT', 'Entertainment Expense'],
  ['EXP', 'Expatriate Expenses'],
  ['FLD', 'Petrol and Diesel'],
  ['FLT', 'Float'],
  ['GAS', 'Maintenance'],
  ['HTA', 'Hotel Accommodation'],
  ['INT', 'Internet Expense'],
  ['LOG', 'Logistics cost of project'],
  ['LTP', 'Local Transportation'],
  ['MDE', 'Medical Expenses'],
  ['MIS', 'Miscellaneous'],
  ['MKT', 'Marketing Expense'],
  ['MOE', 'Maintenance of equipment'],
  ['MTN', 'Maintenance'],
  ['NWS', 'Newspapers and Subscriptions'],
  ['OFFS', 'Office Stationaries'],
  ['OFS', 'Office Supply'],
  ['ORE', 'Office Running Expenses'],
  ['PRE', 'Project Expense'],
  ['PRT', 'Printing and Stationery'],
  ['PTC', 'Postage and Courier'],
  ['SND', 'Sundry Admin Expenses'],
  ['SPG', 'Safety and Protective Gear'],
  ['TLE', 'Telephone Expenses'],
].map(([expenseCode, description]) => ({
  expenseCode,
  description,
  label: `${expenseCode} – ${description}`,
}));

export const listPaymentSites = async (): Promise<PaymentSite[]> => {
  const pool = await ensureFinanceDb().catch(() => null);
  const normalizeRows = (rows: PaymentSite[]) => {
    const mapped = rows.map((row) => ({
      siteCode: normalizePaymentSiteCode(row.siteCode),
      siteName: row.siteName
        || (normalizePaymentSiteCode(row.siteCode) === 'DLPC'
          ? 'Dorman Long Protective Coatings'
          : 'Dorman Long Engineering Limited'),
    }));
    const byCode = new Map<string, PaymentSite>();
    for (const row of mapped) {
      if (!row.siteCode) continue;
      if (!byCode.has(row.siteCode)) byCode.set(row.siteCode, row);
    }
    // Always expose canonical short codes.
    for (const fallback of FALLBACK_SITES) {
      if (!byCode.has(fallback.siteCode)) byCode.set(fallback.siteCode, fallback);
    }
    return Array.from(byCode.values()).sort((a, b) => a.siteCode.localeCompare(b.siteCode));
  };

  if (!pool) return FALLBACK_SITES;
  try {
    const result = await pool.request().query(`
SELECT [SiteCode], [SiteName]
FROM [finance].[PaymentSites]
WHERE [IsActive] = 1
ORDER BY [SortOrder], [SiteCode]
`);
    const rows = (result.recordset || []).map((row: Record<string, unknown>) => ({
      siteCode: compact(row.SiteCode),
      siteName: compact(row.SiteName),
    })).filter((row) => row.siteCode);
    return rows.length ? normalizeRows(rows) : FALLBACK_SITES;
  } catch {
    return FALLBACK_SITES;
  }
};

export const listExpenseCodes = async (): Promise<ExpenseCodeOption[]> => {
  const pool = await ensureFinanceDb().catch(() => null);
  if (!pool) return FALLBACK_EXPENSE_CODES;
  try {
    const result = await pool.request().query(`
SELECT [ExpenseCode], [Description]
FROM [finance].[ExpenseCodes]
WHERE [IsActive] = 1
ORDER BY [SortOrder], [ExpenseCode]
`);
    const rows = (result.recordset || []).map((row: Record<string, unknown>) => {
      const expenseCode = compact(row.ExpenseCode);
      const description = compact(row.Description);
      return {
        expenseCode,
        description,
        label: `${expenseCode} – ${description}`,
      };
    }).filter((row) => row.expenseCode);
    return rows.length ? rows : FALLBACK_EXPENSE_CODES;
  } catch {
    return FALLBACK_EXPENSE_CODES;
  }
};

export const buildPaymentRequestLookups = async (): Promise<PaymentRequestLookups> => {
  const [paymentSites, expenseCodes, directory, projects] = await Promise.all([
    listPaymentSites(),
    listExpenseCodes(),
    readDirectoryEmployees().catch(() => ({ employees: [] as Awaited<ReturnType<typeof readDirectoryEmployees>>['employees'] })),
    readProjects().catch(() => []),
  ]);

  const employees: PaymentEmployeeOption[] = (directory.employees || [])
    .map((employee) => ({
      employeeCode: compact(employee.employeeCode || employee.employeeId),
      fullName: compact(employee.fullName),
      department: compact(employee.department || employee.businessUnit),
      location: compact(employee.workLocation || employee.location || employee.officeLocation || employee.projectSite),
      jobTitle: compact(employee.jobTitle || employee.designation),
      projectCode: compact(employee.projectSite || ''),
    }))
    .filter((employee) => employee.employeeCode && employee.fullName)
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  return {
    paymentSites,
    expenseCodes,
    departments: uniqueSorted(employees.map((employee) => employee.department)),
    locations: uniqueSorted(employees.map((employee) => employee.location)),
    projects: projects
      .filter((project) => compact(project.code))
      .map((project) => ({
        code: compact(project.code),
        name: compact(project.name),
        label: `${compact(project.code)} – ${compact(project.name)}`,
      }))
      .sort((a, b) => a.code.localeCompare(b.code)),
    employees,
  };
};
