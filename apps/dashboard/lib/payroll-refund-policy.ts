import { isEnterprisePayrollPeriod } from '@/lib/payroll-enterprise-source';

const compact = (value: unknown) => String(value || '').trim();

/** Sage earning codes used to reverse PAYE over-charged when variable pay was annualized. */
export const isSagePayeRefundEarning = (code?: string | null, name?: string | null) => {
  const normalizedCode = compact(code).toUpperCase().replace(/\s+/g, '_');
  const normalizedName = compact(name).toUpperCase();
  if (/^(REFUND|PENSION_REFUND|HIGH_TAX|PAYE_REFUND|TAX_REFUND)$/.test(normalizedCode)) return true;
  return /\b(PAYE REFUND|TAX REFUND|HIGH TAX|PENSION REFUND)\b/.test(normalizedName);
};

/** Refund lines compensated for Sage annualizing variable earnings — not used under DLE enterprise PAYE. */
export const shouldUseSagePayeRefundEarnings = (period?: string | null) => {
  const normalized = compact(period);
  if (!normalized) return false;
  return !isEnterprisePayrollPeriod(normalized);
};
