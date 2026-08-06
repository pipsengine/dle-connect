/** Client-safe helpers for supplier invoice PO vs expense (no PO) labeling. */

const textOf = (value: unknown) => String(value ?? '').trim();

export const SUPPLIER_INVOICE_CATEGORIES = ['po-backed', 'expense-no-po'] as const;
export type SupplierInvoiceCategory = (typeof SUPPLIER_INVOICE_CATEGORIES)[number];

export const EXPENSE_NATURE_OPTIONS = [
  'Utility',
  'LAWMA / Waste',
  'Rent / Lease',
  'Telecom / Internet',
  'Professional fees',
  'Insurance',
  'Subscription / License',
  'Statutory / Regulatory',
  'Other',
] as const;

export const isExpenseNoPoPayment = (row: {
  paymentType?: string | null;
  requestCategory?: string | null;
  payload?: Record<string, unknown> | null;
}) => {
  if (!/supplier invoice/i.test(textOf(row.paymentType))) return false;
  const fromPayload = textOf(row.payload?.invoiceCategory).toLowerCase();
  if (fromPayload === 'expense-no-po') return true;
  if (fromPayload === 'po-backed') return false;
  return /expense|no\s*po/i.test(textOf(row.requestCategory));
};

export const supplierInvoiceCategoryLabel = (row: {
  paymentType?: string | null;
  requestCategory?: string | null;
  payload?: Record<string, unknown> | null;
}) => {
  if (!/supplier invoice/i.test(textOf(row.paymentType))) return '';
  return isExpenseNoPoPayment(row) ? 'Expense · No PO' : 'PO-backed';
};
