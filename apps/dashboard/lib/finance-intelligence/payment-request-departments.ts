/**
 * Client-safe payment department helpers (no Node/fs imports).
 * Keep server-only lookup builders in payment-request-lookups.ts.
 */

const compact = (value: unknown) => String(value ?? '').trim();
const uniqueSorted = (values: string[]) =>
  Array.from(new Set(values.map(compact).filter(Boolean))).sort((a, b) => a.localeCompare(b));

/** Empty project on a payment request — Corporate / overhead, not a Timesheet project. */
export const CORPORATE_PROJECT_LABEL = '[Corporate]';

export const formatPaymentProjectLabel = (projectCode?: string | null) =>
  compact(projectCode) ? compact(projectCode) : CORPORATE_PROJECT_LABEL;

export const paymentProjectSelectOptions = (projects?: Array<{ code: string; label: string }>) => [
  { value: '', label: CORPORATE_PROJECT_LABEL },
  ...(projects || []).map((item) => ({ value: item.code, label: item.label })),
];

/** Empty / overhead labels that must not switch a payment onto the Project approval path. */
export const isCorporateOrPlaceholderProjectCode = (value?: string | null) =>
  /^(n\/?a|none|nil|null|—|-|no project|unassigned|\[?corporate\]?)$/i.test(compact(value));

/**
 * Canonical departments for Cash Advance / Supplier Invoice / Expense payment forms.
 * Always merged into the dropdown so operating units like SECURITY remain selectable
 * even when directory headcount is currently filed under another label (e.g. ADMINSTRATION).
 */
export const PAYMENT_REQUEST_CANONICAL_DEPARTMENTS = [
  'ADMINSTRATION',
  'ADMINISTRATION',
  'CORPORATE OFFICE',
  'ENGINEERING',
  'FINANCE AND ACCOUNT',
  'HEALTH AND SAFETY',
  'HUMAN RESOURCES',
  'INFORMATION TECHNOLOGY',
  'LEGAL',
  'LOGISTICS',
  'MAINTENANCE',
  'MARKETING AND SALES',
  'PLANNING',
  'PROCUREMENT',
  'PRODUCTION',
  'PROJECT',
  'PROPOSAL',
  'QUALITY ASSURANCE CONTROL',
  'SECURITY',
  'STORES',
] as const;

/** Prefer SECURITY (etc.) when job title is clear but directory department is still under ADMINSTRATION. */
export const preferredPaymentDepartment = (input: {
  department?: string | null;
  jobTitle?: string | null;
  departments?: string[];
}) => {
  const available = uniqueSorted([
    ...(input.departments || []),
    ...PAYMENT_REQUEST_CANONICAL_DEPARTMENTS,
  ]);
  const availableUpper = new Set(available.map((item) => item.toUpperCase()));
  const job = compact(input.jobTitle).toUpperCase();
  if (/\bSECURITY\b/.test(job) && availableUpper.has('SECURITY')) {
    return available.find((item) => item.toUpperCase() === 'SECURITY') || 'SECURITY';
  }
  const current = compact(input.department);
  if (current) return current;
  return '';
};
