/**
 * Canonical department labels for IT Asset Management filters.
 * Source data often mixes casing and near-duplicate names (e.g. Human Resource vs HUMAN RESOURCES).
 */

const clean = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ');

/** Stable comparison key: lowercased, punctuation normalized. */
export const departmentMatchKey = (value: unknown) =>
  clean(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const DEPARTMENT_ALIASES: Record<string, string> = {
  'human resource': 'Human Resources',
  'human resources': 'Human Resources',
  hr: 'Human Resources',
  'hr + admin': 'Human Resources',
  'hr and admin': 'Human Resources',
  'hr admin': 'Human Resources',
  'hse': 'Health and Safety',
  'health and safety': 'Health and Safety',
  'health safety': 'Health and Safety',
  finance: 'Finance and Accounts',
  'finance and account': 'Finance and Accounts',
  'finance and accounts': 'Finance and Accounts',
  'finance account': 'Finance and Accounts',
  'finance accounts': 'Finance and Accounts',
  'information technology': 'Information Technology',
  it: 'Information Technology',
  'it and enterprise systems': 'Information Technology',
  'it enterprise systems': 'Information Technology',
  legal: 'Legal',
  'marketing and sales': 'Marketing and Sales',
  'marketing sales': 'Marketing and Sales',
  procurement: 'Procurement',
  production: 'Production',
  engineering: 'Engineering',
  maintenance: 'Maintenance',
  clinic: 'Clinic',
  corporate: 'Corporate',
  esg: 'ESG',
};

const toTitleCase = (value: string) =>
  value
    .toLowerCase()
    .replace(/\b([a-z])/g, (letter) => letter.toUpperCase())
    .replace(/\bAnd\b/g, 'and')
    .replace(/\bOf\b/g, 'of');

/** Display label used in filter dropdowns. */
export const canonicalDepartmentLabel = (value: unknown) => {
  const raw = clean(value);
  if (!raw) return '';
  const key = departmentMatchKey(raw);
  if (DEPARTMENT_ALIASES[key]) return DEPARTMENT_ALIASES[key];
  if (raw === raw.toUpperCase() && /[A-Z]/.test(raw)) return toTitleCase(raw);
  return raw;
};

/** Canonical key used to compare/filter departments after alias collapse. */
export const canonicalDepartmentKey = (value: unknown) => departmentMatchKey(canonicalDepartmentLabel(value));

export const departmentsMatch = (left: unknown, right: unknown) => {
  const selected = canonicalDepartmentKey(right);
  if (!selected) return true;
  return canonicalDepartmentKey(left) === selected;
};

/** Unique, sorted department labels for filter dropdowns. */
export const uniqueDepartmentLabels = (values: Array<string | null | undefined>) => {
  const byKey = new Map<string, string>();
  for (const value of values) {
    const label = canonicalDepartmentLabel(value);
    if (!label) continue;
    const key = canonicalDepartmentKey(label);
    if (!byKey.has(key)) byKey.set(key, label);
  }
  return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
};
