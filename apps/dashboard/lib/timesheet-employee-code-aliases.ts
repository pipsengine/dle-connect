/**
 * Biometric terminals sometimes still punch a previous contract code after HRIS
 * reissued the employee. Clocks must land on the current HRIS timesheet code.
 */
type EmployeeCodeValue = string | number | null | undefined;

const compactEmployeeCode = (value?: EmployeeCodeValue) =>
  String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

/** Legacy / biometric punch code → current HRIS employee code. */
export const TIMESHEET_BIOMETRIC_CODE_ALIASES: Record<string, string> = {
  C1734: 'C2585', // Emmanuel Aziekwe
  C1817: 'C2825', // Akande Ismaila
};

export const canonicalTimesheetEmployeeCode = (value?: EmployeeCodeValue) => {
  const code = compactEmployeeCode(value);
  if (!code) return '';
  return TIMESHEET_BIOMETRIC_CODE_ALIASES[code] || code;
};

export const timesheetEmployeeCodeEquivalents = (value?: EmployeeCodeValue) => {
  const code = compactEmployeeCode(value);
  if (!code) return [];
  const canonical = TIMESHEET_BIOMETRIC_CODE_ALIASES[code] || code;
  const aliases = Object.entries(TIMESHEET_BIOMETRIC_CODE_ALIASES)
    .filter(([, hris]) => hris === canonical)
    .map(([alias]) => alias);
  return [...new Set([canonical, ...aliases, code])];
};

export const isTimesheetEmployeeCodeAlias = (value?: EmployeeCodeValue) =>
  Boolean(TIMESHEET_BIOMETRIC_CODE_ALIASES[compactEmployeeCode(value)]);

export const timesheetEmployeeCodesAreSamePerson = (left?: EmployeeCodeValue, right?: EmployeeCodeValue) => {
  const a = canonicalTimesheetEmployeeCode(left);
  const b = canonicalTimesheetEmployeeCode(right);
  return Boolean(a && b && a === b);
};
