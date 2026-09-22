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

/** Meal allowance is taxable and annualized with the monthly package. */
export const isMealEarningForPaye = (line: PayeEarningLineRef) => {
  const code = canonicalCode(line.code);
  const text = lineText(line);
  return /MEAL/.test(code) || /\bMEAL\b/.test(text);
};

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
  'BASIC1_LUMPSUM',
  'LUMSUM_AMOUNT',
  'MEAL',
  'MEAL_ALLOW',
  'TCMTRANS',
  'TCM_TRNSPT',
  'TCM_TRANSPORT',
]);

const VARIABLE_EARNING_CODE = new Set([
  'ARREARS',
  'WKDAY_OVT',
  'SITE_ALLOW',
  'OVERTIME',
  'OVT',
  'OT',
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

const isLumpsumBaseEarning = (code: string, text: string) =>
  /^(LUMPSUMTAX|BASIC1_LUMPSUM|LUMSUM_AMOUNT)$/i.test(code)
  || /\bLUMPSUM ALLOWANCE\b/.test(text)
  || /\bLUMSUM AMOUNT\b/.test(text);

/**
 * Variable earnings are taxed only in the month paid (not annualized).
 * Fixed earnings use the standard annualized PAYE method.
 * Lumpsum monthly package items (base, TCM transport, meal) are annualized;
 * overtime, leave, arrears and other one-offs stay month-only.
 */
export const isVariableEarningForPaye = (line: PayeEarningLineRef, _options?: { category?: string }) => {
  const code = canonicalCode(line.code);
  const text = lineText(line);

  if (!code && !String(line.name || '').trim()) return false;

  if (isLumpsumBaseEarning(code, text)) return false;
  if (FIXED_EARNING_CODE.has(code)) return false;
  if (isStructuralProfileCode(code)) return false;
  if (VARIABLE_EARNING_CODE.has(code)) return true;

  if (
    /\b(OVERTIME|OVT|OT|STOCK\s*COUNT|GRATUITY|LONG\s*SERVICE|SITE\s*ALLOWANCE|NIGHT\s*ALLOWANCE|OTHER\s*PAY|LEAVE\s*ALLOWANCE|WEEKDAY\s*OVT|SATURDAY\s*OVERTIME|SUNDAY\s*OVERTIME|PUBLIC\s*HOLIDAY)\b/.test(
      text,
    )
  ) {
    return true;
  }

  return false;
};

export const splitEarningLinesForPaye = <T extends PayeEarningLineRef>(
  lines: T[],
  options?: { category?: string },
) => {
  const fixed: T[] = [];
  const variable: T[] = [];
  for (const line of lines) {
    if (isVariableEarningForPaye(line, options)) variable.push(line);
    else fixed.push(line);
  }
  return { fixed, variable };
};
