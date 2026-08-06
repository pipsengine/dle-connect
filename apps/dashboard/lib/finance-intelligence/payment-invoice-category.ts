/** Client-safe helpers for supplier invoice vs expense payment labeling. */

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

/** True for Expense Payment type, or legacy Supplier Invoice rows tagged expense-no-po. */
export const isExpenseNoPoPayment = (row: {
  paymentType?: string | null;
  requestCategory?: string | null;
  payload?: Record<string, unknown> | null;
}) => {
  const paymentType = textOf(row.paymentType);
  if (/^expense payment$/i.test(paymentType)) return true;
  if (!/supplier invoice/i.test(paymentType)) return false;
  const fromPayload = textOf(row.payload?.invoiceCategory).toLowerCase();
  if (fromPayload === 'expense-no-po') return true;
  if (fromPayload === 'po-backed') return false;
  return /expense|no\s*po/i.test(textOf(row.requestCategory));
};

/** True for PO-backed supplier invoices (excludes Expense Payment and legacy expense-no-po). */
export const isSupplierPoInvoicePayment = (row: {
  paymentType?: string | null;
  requestCategory?: string | null;
  payload?: Record<string, unknown> | null;
}) => {
  if (!/supplier invoice/i.test(textOf(row.paymentType))) return false;
  return !isExpenseNoPoPayment(row);
};

export const supplierInvoiceCategoryLabel = (row: {
  paymentType?: string | null;
  requestCategory?: string | null;
  payload?: Record<string, unknown> | null;
}) => {
  if (/^expense payment$/i.test(textOf(row.paymentType))) {
    const nature = textOf(row.payload?.expenseNature);
    return nature ? `Expense · ${nature}` : 'Expense · No PO';
  }
  if (!/supplier invoice/i.test(textOf(row.paymentType))) return '';
  return isExpenseNoPoPayment(row) ? 'Expense · No PO' : 'PO-backed';
};

/** Resolve invoiceCategory used in payload for supplier/expense create flows. */
export const invoiceCategoryForPaymentType = (paymentType: string): SupplierInvoiceCategory | null => {
  if (/^expense payment$/i.test(paymentType)) return 'expense-no-po';
  if (/supplier invoice/i.test(paymentType)) return 'po-backed';
  return null;
};
