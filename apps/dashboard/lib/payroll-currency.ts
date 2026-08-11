const compact = (value: unknown) => String(value ?? '').trim();

export const resolvePayCurrency = (input: {
  payCurrency?: string | null;
  payrollGroup?: string | null;
  salaryGrade?: string | null;
  jobGrade?: string | null;
  businessUnit?: string | null;
}) => {
  const explicit = compact(input.payCurrency).toUpperCase();
  // Explicit currency on the record/setup wins so dual-currency rows stay pure
  // (DLE + NGN must not become USD just because a sibling row uses DLE_USD).
  if (explicit === 'USD' || explicit === 'US$' || explicit === 'NGN' || explicit === 'NAIRA') {
    return explicit === 'US$' || explicit === 'USD' ? 'USD' : 'NGN';
  }
  const group = compact(input.payrollGroup).toUpperCase();
  const grade = `${compact(input.salaryGrade)} ${compact(input.jobGrade)}`.toUpperCase();
  const unit = compact(input.businessUnit).toUpperCase();

  if (group.includes('USD') || unit.includes('USD') || grade.includes('EXP_USD') || grade.includes('USD SN') || grade.includes('USD SENIOR')) {
    return 'USD';
  }
  return 'NGN';
};

export const currencyCode = (value: unknown) => {
  const text = String(value || '').toUpperCase();
  if (text.includes('USD') || text.includes('DOLLAR') || text === '$') return 'USD';
  return 'NGN';
};

export const formatPayrollMoney = (
  value: number | null | undefined,
  currency: string,
  options?: { minimumFractionDigits?: number; maximumFractionDigits?: number },
) => {
  if (value === null || value === undefined) return '';
  const code = currencyCode(currency);
  const minimumFractionDigits = options?.minimumFractionDigits ?? (code === 'USD' ? 2 : 0);
  const maximumFractionDigits = options?.maximumFractionDigits ?? (code === 'USD' ? 2 : 0);
  return new Intl.NumberFormat(code === 'USD' ? 'en-US' : 'en-NG', {
    style: 'currency',
    currency: code,
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(value);
};
