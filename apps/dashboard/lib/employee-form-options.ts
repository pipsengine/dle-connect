import { listNigeriaBanks, nigeriaBankNames } from '@/lib/nigeria-banks-store';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';

export type EmployeeFormOptions = {
  departments: string[];
  divisions: string[];
  businessUnits: string[];
  locations: string[];
  workCenters: string[];
  jobTitles: string[];
  jobGrades: string[];
  costCenters: string[];
  projectSites: string[];
  payrollGroups: string[];
  salaryGrades: string[];
  banks: string[];
  bankCatalog?: Array<{ name: string; bankCode: string; sortCode: string; aliases?: string[] }>;
  pensionProviders: string[];
  benefitGroups: string[];
  workModes: string[];
  shiftPatterns: string[];
  staffCategories: string[];
  employeeCategories: string[];
  roleProfiles: string[];
  employees?: Array<{ employeeId: string; fullName: string; department?: string; jobTitle?: string; location?: string; manager?: string }>;
};

const uniqueSorted = (values: unknown[]) =>
  Array.from(new Set(values.map((value) => (typeof value === 'string' ? value.trim() : '')).filter(Boolean))).sort((a, b) => a.localeCompare(b));

const mergeUnique = (primary: string[], fallback: string[]) => uniqueSorted([...primary, ...fallback]);

const fallbackOptions = (): EmployeeFormOptions => ({
  departments: [
    'Civil Engineering',
    'Mechanical Engineering',
    'Electrical & Instrumentation',
    'Project Controls',
    'HSE',
    'Quality Assurance',
    'Procurement',
    'Finance',
    'Human Capital',
    'IT & Support',
    'Legal & Compliance',
    'Executive Office',
  ],
  divisions: ['Engineering', 'Operations', 'Corporate Services', 'Projects', 'Commercial'],
  businessUnits: ['DLE Projects', 'DLE Fabrication', 'DLE Marine', 'DLE Corporate', 'DLE Energy'],
  locations: ['Lagos HQ', 'Port Harcourt Office', 'Warri Yard', 'Abuja Office', 'Onne Site', 'Kaduna Site', 'Offshore Platform'],
  workCenters: [],
  jobTitles: [
    'Senior Civil Engineer',
    'Mechanical Supervisor',
    'E&I Technician',
    'Project Manager',
    'Planning Engineer',
    'Quantity Surveyor',
    'HSE Officer',
    'QA/QC Engineer',
    'HR Officer',
    'Payroll Specialist',
    'IT Support Engineer',
    'Legal Counsel',
    'Executive Assistant',
  ],
  jobGrades: ['G7', 'G8', 'G9', 'G10', 'G11', 'G12'],
  costCenters: ['CC-ENG-001', 'CC-OPS-004', 'CC-HR-002', 'CC-FIN-003', 'CC-IT-005'],
  projectSites: ['Lekki Project', 'NLNG Train 7', 'Bonny Island', 'Onshore Pipeline', 'Bridgeworks', 'Fabrication Bay', 'N/A'],
  payrollGroups: ['DLE', 'Daily Rate'],
  salaryGrades: ['SG-07', 'SG-08', 'SG-09', 'SG-10', 'SG-11'],
  banks: [
    'GUARANTY TRUST BANK PLC',
    'ACCESS BANK NIGERIA PLC',
    'ZENITH BANK PLC',
    'FIRST BANK OF NIGERIA PLC',
    'UBA PLC.',
  ],
  pensionProviders: ['ARM Pensions', 'Stanbic IBTC', 'Leadway Pensure', 'PENCOM'],
  benefitGroups: ['Standard', 'Executive', 'Project', 'Contractor'],
  workModes: ['Onsite', 'Hybrid', 'Remote'],
  shiftPatterns: ['Day', 'Night', 'Rotational'],
  staffCategories: ['Senior Staff', 'Junior Staff', 'Contractor'],
  employeeCategories: ['Operations', 'Corporate Services', 'Projects', 'Commercial'],
  roleProfiles: ['HR Generalist', 'Project Delivery', 'Finance Ops', 'HSE Compliance', 'IT Support'],
});

const bankCatalogFrom = (banks: Array<{ name: string; bankCode: string; sortCode: string; aliases?: string[] }>) =>
  banks.map((bank) => ({
    name: bank.name,
    bankCode: bank.bankCode,
    sortCode: bank.sortCode,
    aliases: bank.aliases,
  }));

const readWorkCenterNames = async () => {
  try {
    const mod = await import('@/lib/timesheet-entry-store');
    const catalog = await mod.readTimesheetWorkCenters();
    return uniqueSorted(catalog.map((item) => item.name));
  } catch {
    return [] as string[];
  }
};

/** Dropdown lists for employee profile and add-employee. Always JSON-serializable. */
export const loadEmployeeFormOptions = async (includeEmployees = false): Promise<EmployeeFormOptions> => {
  const fallback = fallbackOptions();
  const nigeriaBanks = await listNigeriaBanks().catch(() => []);
  const bankNames = nigeriaBanks.length
    ? nigeriaBanks.map((bank) => bank.name)
    : await nigeriaBankNames().catch(() => fallback.banks);
  const banks = bankNames.length ? bankNames : fallback.banks;
  const bankCatalog = bankCatalogFrom(nigeriaBanks);
  try {
    const employeeSource = await readPayrollEmployees();
    const employees = employeeSource.employees;
    const catalogWorkCenters = await readWorkCenterNames();
    if (!employees.length) {
      return { ...fallback, workCenters: catalogWorkCenters, banks, bankCatalog };
    }
    const textOf = (employee: (typeof employees)[number], key: string) => {
      const value = (employee as Record<string, unknown>)[key];
      return typeof value === 'string' ? value : '';
    };
    return {
      ...fallback,
      banks,
      bankCatalog,
      departments: mergeUnique(uniqueSorted(employees.map((employee) => textOf(employee, 'department'))), fallback.departments),
      divisions: mergeUnique(uniqueSorted(employees.map((employee) => textOf(employee, 'division'))), fallback.divisions),
      businessUnits: mergeUnique(uniqueSorted(employees.map((employee) => textOf(employee, 'businessUnit'))), fallback.businessUnits),
      locations: mergeUnique(uniqueSorted(employees.flatMap((employee) => [textOf(employee, 'location'), textOf(employee, 'workLocation'), textOf(employee, 'officeLocation')])), fallback.locations),
      workCenters: mergeUnique(uniqueSorted([...catalogWorkCenters, ...employees.map((employee) => textOf(employee, 'workCenter'))]), fallback.workCenters),
      jobTitles: mergeUnique(uniqueSorted(employees.flatMap((employee) => [textOf(employee, 'jobTitle'), textOf(employee, 'designation')])), fallback.jobTitles),
      jobGrades: mergeUnique(uniqueSorted(employees.map((employee) => textOf(employee, 'jobGrade'))), fallback.jobGrades),
      costCenters: mergeUnique(uniqueSorted(employees.map((employee) => textOf(employee, 'costCenter'))), fallback.costCenters),
      projectSites: mergeUnique(uniqueSorted(employees.map((employee) => textOf(employee, 'projectSite'))), fallback.projectSites),
      payrollGroups: mergeUnique(uniqueSorted(employees.map((employee) => textOf(employee, 'payrollGroup'))), fallback.payrollGroups),
      salaryGrades: mergeUnique(uniqueSorted(employees.map((employee) => textOf(employee, 'salaryGrade'))), fallback.salaryGrades),
      pensionProviders: mergeUnique(uniqueSorted(employees.map((employee) => textOf(employee, 'pensionProvider'))), fallback.pensionProviders),
      benefitGroups: mergeUnique(uniqueSorted(employees.map((employee) => textOf(employee, 'benefitGroup'))), fallback.benefitGroups),
      staffCategories: mergeUnique(uniqueSorted(employees.map((employee) => textOf(employee, 'staffCategory'))), fallback.staffCategories),
      employeeCategories: mergeUnique(uniqueSorted(employees.map((employee) => textOf(employee, 'employeeCategory'))), fallback.employeeCategories),
      employees: includeEmployees
        ? employees.map((employee) => ({
          employeeId: String(employee.employeeId || employee.employeeCode || '').trim(),
          fullName: String(employee.fullName || '').trim(),
          department: String(employee.department || '').trim(),
          jobTitle: String(employee.jobTitle || employee.designation || '').trim(),
          location: String(employee.location || employee.workLocation || '').trim(),
          manager: String(employee.managerName || '').trim(),
        })).filter((employee) => employee.employeeId && employee.fullName)
        : undefined,
    };
  } catch {
    return { ...fallback, banks, bankCatalog };
  }
};
