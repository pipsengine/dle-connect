export type PayeEarningLineRef = {
  code?: string;
  name?: string;
};

const canonicalCode = (value: unknown) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const lineText = (line: PayeEarningLineRef) =>
  `${canonicalCode(line.code)} ${String(line.name || '').toUpperCase()}`;

/** Fixed monthly structural / supplemental earnings — annualized for PAYE. */
const FIXED_EARNING_CODE = new Set([
  'PER_MEAL',
  'PER_MEAL_JNR',
  'SNR_NJIC',
  'JNR_NJIC',
  'SNR_NTC',
  'TCMMEAL',
  'JCWEEKDAY',
  'JCWEEKDAY_NT',
  'LUMPSUMTAX',
  'MEAL',
  'MEAL_ALLOW',
]);

const VARIABLE_EARNING_CODE = new Set([
  'ARREARS',
  'WKDAY_OVT',
  'SITE_ALLOW',
  'OVERTIME',
  'MISC',
  'OTHER_PAY',
  'NIGHT_ALLOW',
  'SPECIAL_ALLOW',
  'WEEKEND_ALLOW',
  'STOCKCOUNT',
  'STOCK_COUNT',
  'GRATUITY',
  'GRATUITY_PAY',
  'LONGSERVICE',
  'LONG_SERVICE',
  'LONG_SERVICE_AWARD',
  'LEAVEALLOW',
  'WEEKDAYOVT',
  'PUBHOL',
  'PUBLIC_OVT',
  'SATEARN',
  'SATURDAY_OVT',
  'SUNDAY_OVT',
  'SUNDAYEARN',
  'JR_WKDAY_OVT',
  'PAR_SATOVT',
  'PER_SUNOVT',
]);

const isStructuralProfileCode = (code: string) =>
  /^(JNR_|SNR_|MGT1COLA_|MGT_|SNM_)/.test(code) || /_(BASIC|HOUSE|HOUSIN|LEAVE|MEDICAL|OTHERALL|TRANS|FURN|UTILITY|UTILIT)$/i.test(code);

/**
 * Variable earnings are taxed only in the month paid (not annualized).
 * Fixed earnings use the standard annualized PAYE method.
 */
export const isVariableEarningForPaye = (line: PayeEarningLineRef) => {
  const code = canonicalCode(line.code);
  const text = lineText(line);

  if (!code && !String(line.name || '').trim()) return false;
  if (FIXED_EARNING_CODE.has(code)) return false;
  if (isStructuralProfileCode(code)) return false;
  if (VARIABLE_EARNING_CODE.has(code)) return true;

  if (
    /\b(OVERTIME|STOCK\s*COUNT|GRATUITY|LONG\s*SERVICE|SITE\s*ALLOWANCE|NIGHT\s*ALLOWANCE|OTHER\s*PAY|LEAVE\s*ALLOWANCE|WEEKDAY\s*OVT|SATURDAY\s*OVERTIME|SUNDAY\s*OVERTIME|PUBLIC\s*HOLIDAY)\b/.test(
      text,
    )
  ) {
    return true;
  }

  return false;
};

export const splitEarningLinesForPaye = <T extends PayeEarningLineRef>(lines: T[]) => {
  const fixed: T[] = [];
  const variable: T[] = [];
  for (const line of lines) {
    if (isVariableEarningForPaye(line)) variable.push(line);
    else fixed.push(line);
  }
  return { fixed, variable };
};
