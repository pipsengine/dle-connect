export type EarningComponentFamily =
  | 'basic'
  | 'housing'
  | 'medical'
  | 'other'
  | 'transport'
  | 'furniture'
  | 'utilities'
  | 'meal'
  | 'leave'
  | 'lumpsum'
  | 'njic';

const blob = (code?: string | null, name?: string | null) => `${code || ''} ${name || ''}`;

export const earningComponentFamily = (code?: string | null, name?: string | null): EarningComponentFamily | null => {
  const text = blob(code, name);
  if (!text.trim()) return null;
  if (/LUMPSUM/i.test(text)) return 'lumpsum';
  if (/(_BASIC|^BASIC\b)|BASIC SALARY|BASIC EARNING/i.test(text)) return 'basic';
  if (/HOUSE/i.test(text)) return 'housing';
  if (/UTILIT/i.test(text)) return 'utilities';
  if (/MEDICAL/i.test(text)) return 'medical';
  if (/FURN/i.test(text)) return 'furniture';
  if (/TRANSP|TRANSPORT/i.test(text)) return 'transport';
  if (/OTHALL|OTHER ALLOW/i.test(text)) return 'other';
  if (/MEAL/i.test(text)) return 'meal';
  if (/NJIC/i.test(text)) return 'njic';
  if (/LEAVE/i.test(text)) return 'leave';
  return null;
};

export const STANDARD_SALARY_BREAKDOWN_COLUMNS: Array<{ id: string; label: string; family: EarningComponentFamily; pattern: RegExp }> = [
  { id: 'earning-basic', label: 'Basic Salary', family: 'basic', pattern: /(_BASIC|^BASIC$)|BASIC SALARY|BASIC EARNING|JUNIOR\s*BASIC|SENIOR\s*BASIC/i },
  { id: 'earning-housing', label: 'Housing', family: 'housing', pattern: /HOUSE/i },
  { id: 'earning-medical', label: 'Medical', family: 'medical', pattern: /MEDICAL/i },
  { id: 'earning-other', label: 'Other Allowance', family: 'other', pattern: /OTHALL|OTHER ALLOW/i },
  { id: 'earning-transport', label: 'Transport Allowance', family: 'transport', pattern: /TRANSP|TRANSPORT/i },
  { id: 'earning-furniture', label: 'Furniture Allowance', family: 'furniture', pattern: /FURN|FURNITURE/i },
  { id: 'earning-utilities', label: 'Utilities', family: 'utilities', pattern: /UTILIT/i },
  { id: 'earning-meal', label: 'Meal Allowance', family: 'meal', pattern: /MEAL/i },
  { id: 'earning-leave', label: 'Leave Allowance', family: 'leave', pattern: /LEAVE/i },
  { id: 'earning-lumpsum', label: 'Lumpsum Amount', family: 'lumpsum', pattern: /LUMPSUM/i },
  { id: 'earning-njic', label: 'NJIC', family: 'njic', pattern: /NJIC/i },
];
