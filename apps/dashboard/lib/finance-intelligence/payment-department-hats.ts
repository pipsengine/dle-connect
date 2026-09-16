/**
 * Dual-department (matrix) hats for payment Reporting Manager routing.
 * Leave / ESS / timesheet still use the employee's single HRIS managerName.
 */

const compact = (value: unknown) => String(value ?? '').trim();

export type PaymentDepartmentHat = {
  employeeCode: string;
  aliases?: string[];
  department: string;
  managerCode: string;
  managerName: string;
  home?: boolean;
};

/** Seeded hats. Add the next dual-hat person here — no HRIS schema change required. */
export const PAYMENT_DEPARTMENT_HATS: PaymentDepartmentHat[] = [
  {
    employeeCode: 'P0465',
    aliases: ['L2641'],
    department: 'CORPORATE OFFICE',
    managerCode: 'P0060',
    managerName: 'Mrs ROSEMARY NGOZICHUKWUKA BENSON',
    home: true,
  },
  {
    employeeCode: 'P0465',
    aliases: ['L2641'],
    department: 'PROCUREMENT',
    managerCode: 'P0059',
    managerName: 'Mrs AGNES NDIDI AJIERE',
  },
];

const normalizeEmployeeCode = (value?: string | null) =>
  compact(value).toUpperCase().replace(/[^A-Z0-9]/g, '');

const normalizeDepartmentKey = (value?: string | null) =>
  compact(value)
    .toUpperCase()
    .replace(/[''`]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const DEPARTMENT_ALIASES: Record<string, string> = {
  CORPORATE: 'CORPORATE OFFICE',
  'CORPORATE OFFICE': 'CORPORATE OFFICE',
  'MD OFFICE': 'CORPORATE OFFICE',
  'MDS OFFICE': 'CORPORATE OFFICE',
  'MD S OFFICE': 'CORPORATE OFFICE',
  PROCUREMENT: 'PROCUREMENT',
};

export const canonicalPaymentHatDepartment = (value?: string | null) => {
  const key = normalizeDepartmentKey(value);
  return DEPARTMENT_ALIASES[key] || key;
};

export const paymentHatEmployeeCodesMatch = (left?: string | null, right?: string | null) => {
  const a = normalizeEmployeeCode(left);
  const b = normalizeEmployeeCode(right);
  return Boolean(a && b && a === b);
};

const hatEmployeeCodes = (hat: PaymentDepartmentHat) => [hat.employeeCode, ...(hat.aliases || [])];

export const paymentDepartmentHatsForEmployee = (employeeCode?: string | null) =>
  PAYMENT_DEPARTMENT_HATS.filter((hat) =>
    hatEmployeeCodes(hat).some((code) => paymentHatEmployeeCodesMatch(code, employeeCode)),
  );

export const resolvePaymentDepartmentHat = (input: {
  employeeCode?: string | null;
  department?: string | null;
}): PaymentDepartmentHat | null => {
  const hats = paymentDepartmentHatsForEmployee(input.employeeCode);
  if (!hats.length) return null;
  const department = canonicalPaymentHatDepartment(input.department);
  if (department) {
    return hats.find((hat) => canonicalPaymentHatDepartment(hat.department) === department) || null;
  }
  return hats.find((hat) => hat.home) || null;
};

/** Supplier invoices default onto a Procurement hat when the raiser has one. */
export const preferredPaymentDepartmentForHats = (input: {
  paymentType?: string | null;
  employeeCode?: string | null;
  homeDepartment?: string | null;
}) => {
  const hats = paymentDepartmentHatsForEmployee(input.employeeCode);
  if (/supplier invoice/i.test(compact(input.paymentType))) {
    const procurement = hats.find((hat) => canonicalPaymentHatDepartment(hat.department) === 'PROCUREMENT');
    if (procurement) return procurement.department;
  }
  const home = hats.find((hat) => hat.home);
  return home?.department || compact(input.homeDepartment);
};

export const previewPaymentReportingManager = (input: {
  employeeCode?: string | null;
  department?: string | null;
  fallbackManager?: string | null;
}) => {
  const hat = resolvePaymentDepartmentHat(input);
  if (hat) return `${hat.managerCode} · ${hat.managerName}`;
  return compact(input.fallbackManager);
};

export const paymentUsesProcurementHat = (input: {
  employeeCode?: string | null;
  department?: string | null;
  paymentType?: string | null;
}) => {
  const hats = paymentDepartmentHatsForEmployee(input.employeeCode);
  const procurement = hats.find((hat) => canonicalPaymentHatDepartment(hat.department) === 'PROCUREMENT');
  if (!procurement) return false;
  if (/supplier invoice/i.test(compact(input.paymentType))) return true;
  return canonicalPaymentHatDepartment(input.department) === 'PROCUREMENT';
};
