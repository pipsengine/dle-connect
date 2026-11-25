/**
 * Employee source for the ID card generator.
 * Records come from the Employee Directory through /api/hris/onboarding/id-cards.
 */

export interface Employee {
  /** Employee number printed on the card and encoded in the QR code. */
  id: string;
  firstName: string;
  lastName: string;
  department: string;
  jobTitle: string;
  /** Same-origin passport photo from the HRIS employee record. */
  photoUrl?: string;
  lastIssuedAt?: string;
  issueCount?: number;
}

export interface IdCardIssue {
  id: string;
  batchId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  jobTitle: string;
  templateId: string;
  exportFormat: string;
  photoPresent: boolean;
  status: 'Issued' | 'Reprinted';
  issuedAt: string;
  issuedBy: string;
}

export interface IdCardWorkspace {
  employees: Employee[];
  issues: IdCardIssue[];
}

export async function fetchIdCardWorkspace(): Promise<IdCardWorkspace> {
  const response = await fetch('/api/hris/onboarding/id-cards', { cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.status === 'error') {
    throw new Error(body?.error || 'Could not load employees from the Employee Directory.');
  }
  return {
    employees: Array.isArray(body?.data?.employees) ? body.data.employees : [],
    issues: Array.isArray(body?.data?.issues) ? body.data.issues : [],
  };
}

export async function recordIdCards(input: { employeeCodes: string[]; templateId: string; format: string }): Promise<IdCardWorkspace> {
  const response = await fetch('/api/hris/onboarding/id-cards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'issue', ...input }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.status === 'error') {
    throw new Error(body?.error || 'The cards were created, but the HRIS issuance record was not saved.');
  }
  return {
    employees: Array.isArray(body?.data?.employees) ? body.data.employees : [],
    issues: Array.isArray(body?.data?.issues) ? body.data.issues : [],
  };
}

export const fullName = (e: Pick<Employee, 'firstName' | 'lastName'>) => `${e.firstName} ${e.lastName}`.replace(/\s+/g, ' ').trim();

export const initials = (e: Pick<Employee, 'firstName' | 'lastName'>) => `${e.firstName.charAt(0)}${e.lastName.charAt(0)}`.toUpperCase();
