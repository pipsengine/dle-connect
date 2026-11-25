/**
 * Maps Employee Directory rows onto the fields printed on an ID card.
 * Payroll amounts and identity documents stay off this projection.
 */

export type DirectoryCardSource = {
  employeeCode?: string | null;
  employeeId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  department?: string | null;
  jobTitle?: string | null;
  designation?: string | null;
  status?: string | null;
  hasPhoto?: boolean | null;
};

export type IdCardEmployee = {
  id: string;
  firstName: string;
  lastName: string;
  department: string;
  jobTitle: string;
  photoUrl?: string;
  lastIssuedAt?: string;
  issueCount: number;
};

const INACTIVE = /terminated|resigned|retired|inactive|deceased|suspend/i;

const clean = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();

export const employeeCodeOf = (row: DirectoryCardSource) => clean(row.employeeCode || row.employeeId).toUpperCase();

export const isActiveDirectoryEmployee = (row: DirectoryCardSource) => {
  if (!employeeCodeOf(row)) return false;
  return !INACTIVE.test(clean(row.status));
};

const splitName = (row: DirectoryCardSource) => {
  let firstName = clean(row.firstName);
  let lastName = clean(row.lastName);
  if (firstName || lastName) return { firstName, lastName };
  const parts = clean(row.fullName).split(' ').filter(Boolean);
  firstName = parts[0] || '';
  lastName = parts.slice(1).join(' ');
  return { firstName, lastName };
};

export const toIdCardEmployee = (
  row: DirectoryCardSource,
  issue?: { lastIssuedAt?: string; issueCount?: number },
): IdCardEmployee | null => {
  if (!isActiveDirectoryEmployee(row)) return null;
  const id = employeeCodeOf(row);
  const { firstName, lastName } = splitName(row);
  const photoUrl = row.hasPhoto ? `/api/hris/employees/${encodeURIComponent(id)}/photo` : undefined;
  return {
    id,
    firstName: firstName || id,
    lastName,
    department: clean(row.department) || 'Unassigned',
    jobTitle: clean(row.jobTitle) || clean(row.designation),
    photoUrl,
    lastIssuedAt: issue?.lastIssuedAt || undefined,
    issueCount: Number(issue?.issueCount || 0),
  };
};

export type IdCardIssueStatus = 'Issued' | 'Reprinted';

export const nextIssueStatus = (priorCount: number): IdCardIssueStatus => (priorCount > 0 ? 'Reprinted' : 'Issued');

export const ID_CARD_TEMPLATE_ID = 'dorman-long';
export const ID_CARD_FORMATS = ['png', 'jpg', 'pdf'] as const;
export type IdCardExportFormat = (typeof ID_CARD_FORMATS)[number];

export const assertIdCardExport = (templateId: string, format: string) => {
  if (templateId !== ID_CARD_TEMPLATE_ID) throw new Error('Unknown ID card template.');
  if (!ID_CARD_FORMATS.includes(format as IdCardExportFormat)) throw new Error('Export format must be PNG, JPG, or PDF.');
};
