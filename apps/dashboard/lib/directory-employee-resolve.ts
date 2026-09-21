import { normalizePayrollMatchKey } from '@/lib/sage-people-payroll-store';
import { employeeCodeFromReference } from '@/lib/reporting-manager-match';

export type DirectoryEmployeeIdentity = {
  employeeId?: string | null;
  employeeCode?: string | null;
  sourceEmployeeId?: string | null;
  fullName?: string | null;
  status?: string | null;
  officialEmail?: string | null;
  email?: string | null;
  personalEmail?: string | null;
  dateJoined?: string | null;
};

export type SessionEmployeeIdentity = {
  employeeCode?: string | null;
  employeeId?: string | null;
  username?: string | null;
};

const compact = (value: unknown) => String(value ?? '').trim();

const identityKeys = (...values: unknown[]) => {
  const keys = new Set<string>();
  for (const value of values) {
    const raw = compact(value).toUpperCase();
    if (!raw) continue;
    keys.add(raw);
    const payroll = normalizePayrollMatchKey(raw);
    if (payroll) keys.add(payroll);
    const embedded = employeeCodeFromReference(raw);
    if (embedded) {
      keys.add(embedded);
      const embeddedPayroll = normalizePayrollMatchKey(embedded);
      if (embeddedPayroll) keys.add(embeddedPayroll);
    }
  }
  return keys;
};

const employeeKeys = (employee: DirectoryEmployeeIdentity) =>
  identityKeys(employee.employeeId, employee.employeeCode, employee.sourceEmployeeId);

const isInactiveEmploymentStatus = (status: unknown) =>
  /\b(inactive|terminated|resigned|retired|exited|deceased|disabled)\b/i.test(compact(status));

const normalizeName = (value: unknown) =>
  compact(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

const emailsOf = (employee: DirectoryEmployeeIdentity) =>
  [employee.officialEmail, employee.email, employee.personalEmail]
    .map((value) => compact(value).toLowerCase())
    .filter(Boolean);

const dateKey = (value: unknown) => compact(value).slice(0, 10);

export const successorCodesFromIdentities = (
  identities: Iterable<{ employeeId?: string | null; employeeCode?: string | null; sourceEmployeeCode?: string | null }>,
) => {
  const successor = new Map<string, string>();
  for (const identity of identities) {
    const from = compact(identity.sourceEmployeeCode).toUpperCase();
    const to = compact(identity.employeeCode || identity.employeeId).toUpperCase();
    if (!from || !to || from === to) continue;
    successor.set(from, to);
    const fromPayroll = normalizePayrollMatchKey(from);
    if (fromPayroll) successor.set(fromPayroll, to);
  }
  return successor;
};

const expandSessionKeys = (session: SessionEmployeeIdentity, successorCodes?: Map<string, string>) => {
  const keys = identityKeys(session.employeeCode, session.employeeId, session.username);
  if (!successorCodes) return keys;
  for (const code of [...keys]) {
    const live = successorCodes.get(code);
    if (live) identityKeys(live).forEach((key) => keys.add(key));
  }
  return keys;
};

const rankEmployee = (employee: DirectoryEmployeeIdentity, session: SessionEmployeeIdentity) => {
  const keys = employeeKeys(employee);
  const sessionCodeKeys = identityKeys(session.employeeCode, session.employeeId);
  const usernameKeys = identityKeys(session.username);
  let score = 0;
  if ([...sessionCodeKeys].some((key) => keys.has(key))) score += 100;
  else if ([...usernameKeys].some((key) => keys.has(key))) score += 10;
  return score;
};

const followLiveSuccessor = <T extends DirectoryEmployeeIdentity>(chosen: T, employees: T[]) => {
  if (!isInactiveEmploymentStatus(chosen.status)) return chosen;
  const name = normalizeName(chosen.fullName);
  const joined = dateKey(chosen.dateJoined);
  const emails = emailsOf(chosen);
  const successors = employees.filter((employee) => {
    if (employee === chosen || isInactiveEmploymentStatus(employee.status)) return false;
    if (emails.length && emailsOf(employee).some((email) => emails.includes(email))) return true;
    return Boolean(name) && normalizeName(employee.fullName) === name && joined && dateKey(employee.dateJoined) === joined;
  });
  if (successors.length === 1) return successors[0];
  const permanent = successors.filter((employee) => /^P/i.test(compact(employee.employeeCode || employee.employeeId)));
  if (permanent.length === 1) return permanent[0];
  return chosen;
};

export const resolveDirectoryEmployeeForSession = <T extends DirectoryEmployeeIdentity>(
  employees: T[],
  session: SessionEmployeeIdentity,
  options?: { successorCodes?: Map<string, string> },
): T | null => {
  const sessionKeys = expandSessionKeys(session, options?.successorCodes);
  if (!sessionKeys.size) return null;
  const matches = employees.filter((employee) => [...employeeKeys(employee)].some((key) => sessionKeys.has(key)));
  if (!matches.length) return null;
  const activeMatches = matches.filter((employee) => !isInactiveEmploymentStatus(employee.status));
  const pool = activeMatches.length ? activeMatches : matches;
  const ranked = [...pool].sort((left, right) => rankEmployee(right, session) - rankEmployee(left, session));
  return followLiveSuccessor(ranked[0], employees);
};
