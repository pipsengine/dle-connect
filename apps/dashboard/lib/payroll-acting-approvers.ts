/**
 * Named approvers for payroll stages.
 * Used when a person is the stage owner by job title / designation
 * without (or in addition to) the formal auth role title.
 */
export const PAYROLL_ACTING_FINANCE_MANAGER_CODES = [
  'P0429', // RAPHEAL OLAITAN IYANDA — acting Finance Manager
] as const;

export const PAYROLL_NAMED_CFO_CODES = [
  'P0458', // Mrs ABIODUN OLUWAFUNMI MAMORA — Chief Financial Officer
] as const;

export const PAYROLL_NAMED_MD_CEO_CODES = [
  'P0413', // Mr CHRIS IJELI — Managing Director
] as const;

export const PAYROLL_NAMED_HR_MANAGER_CODES = [
  'P0468', // Mr. BANKOLE OMOLOLU — Head, HR & Administration
] as const;

const compactIdentity = (value?: string | null) => String(value || '').trim();

const hrManagerCodeKeys = (value?: string | null) => {
  const raw = compactIdentity(value).toUpperCase();
  if (!raw) return [] as string[];
  const alnum = raw.replace(/[^A-Z0-9]/g, '');
  const keys = new Set<string>([raw, alnum]);
  const embedded = raw.match(/\b(P\d+)\b/);
  if (embedded && embedded[1] !== alnum) {
    for (const key of hrManagerCodeKeys(embedded[1])) keys.add(key);
  }
  const permanent = alnum.match(/^P0*(\d+)$/);
  if (permanent) {
    const digits = permanent[1].replace(/^0+/, '') || permanent[1];
    keys.add(digits);
    keys.add(`P${digits}`);
    keys.add(`P${digits.padStart(4, '0')}`);
  } else if (/^\d+$/.test(alnum)) {
    const digits = alnum.replace(/^0+/, '') || alnum;
    keys.add(digits);
    keys.add(`P${digits}`);
    keys.add(`P${digits.padStart(4, '0')}`);
  }
  return [...keys];
};

/** P0468, 0468, and Mr Bankole Omololu are the HR Manager seat. */
export const isNamedHrManagerIdentity = (input?: {
  employeeCode?: string | null;
  employeeId?: string | null;
  username?: string | null;
  fullName?: string | null;
} | null) => {
  if (!input) return false;
  const named = PAYROLL_NAMED_HR_MANAGER_CODES.flatMap((code) => hrManagerCodeKeys(code));
  const candidates = [
    ...hrManagerCodeKeys(input.employeeCode),
    ...hrManagerCodeKeys(input.employeeId),
    ...hrManagerCodeKeys(input.username),
  ];
  if (candidates.some((key) => named.includes(key))) return true;
  const name = compactIdentity(input.fullName);
  return /omololu/i.test(name) && /bankole/i.test(name);
};

export const findNamedHrManager = <T extends {
  employeeCode?: string | null;
  employeeId?: string | null;
  fullName?: string | null;
  status?: string | null;
}>(employees: T[]) => {
  const active = employees.filter((employee) => !/inactive|terminated|resigned|retired|deceased|suspend/i.test(compactIdentity(employee.status)));
  return active.find((employee) => isNamedHrManagerIdentity(employee)) || null;
};

const candidateCodes = (employeeCode?: string | null, username?: string | null) =>
  [employeeCode, username]
    .map((value) => String(value || '').trim().toUpperCase())
    .filter(Boolean);

const matchesNamedCodes = (
  codes: readonly string[],
  employeeCode?: string | null,
  username?: string | null,
) => {
  const candidates = candidateCodes(employeeCode, username);
  if (!candidates.length) return false;
  return codes.some((code) => candidates.includes(code));
};

export const isPayrollActingFinanceManager = (employeeCode?: string | null, username?: string | null) =>
  matchesNamedCodes(PAYROLL_ACTING_FINANCE_MANAGER_CODES, employeeCode, username);

export const isPayrollNamedCfo = (employeeCode?: string | null, username?: string | null) =>
  matchesNamedCodes(PAYROLL_NAMED_CFO_CODES, employeeCode, username);

export const isPayrollNamedMdCeo = (employeeCode?: string | null, username?: string | null) =>
  matchesNamedCodes(PAYROLL_NAMED_MD_CEO_CODES, employeeCode, username);

export const isPayrollNamedHrManager = (employeeCode?: string | null, username?: string | null) =>
  isNamedHrManagerIdentity({ employeeCode, username });
