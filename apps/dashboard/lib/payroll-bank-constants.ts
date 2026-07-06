const compact = (value: unknown) => String(value || '').trim();

export const ZENITH_BANK_SORT_CODE = '057150013';

export const isZenithBank = (bankName: unknown) => {
  const normalized = compact(bankName).toLowerCase();
  return normalized.includes('zenith');
};

export const normalizeBankSortCode = (input: {
  bankName?: unknown;
  branchCode?: unknown;
  bankCode?: unknown;
  sortCode?: unknown;
}) => {
  if (!isZenithBank(input.bankName)) {
    return compact(input.sortCode || input.branchCode || input.bankCode);
  }
  return ZENITH_BANK_SORT_CODE;
};

export const withNormalizedBankCodes = <T extends {
  bankName?: string;
  bankCode?: string;
  branchCode?: string;
  sortCode?: string;
}>(record: T): T => {
  if (!isZenithBank(record.bankName)) return record;
  const sortCode = ZENITH_BANK_SORT_CODE;
  return {
    ...record,
    branchCode: sortCode,
    sortCode,
    bankCode: compact(record.bankCode) || sortCode,
  };
};
