/**
 * Remembers a payment-list filter so opening a request and coming back
 * returns to the same list, not the unfiltered home view.
 */

export type PaymentListHeaderFilter = {
  selected?: string[] | null;
  min?: string;
  max?: string;
};

export type PaymentListViewState = {
  tab: string;
  kpi: string;
  q: string;
  paymentType: string;
  status: string;
  department: string;
  project: string;
  currency: string;
  approver: string;
  location: string;
  submittedFrom: string;
  submittedTo: string;
  sort: string;
  dir: 'asc' | 'desc';
  page: number;
  pageSize: number;
  headers: Partial<Record<string, PaymentListHeaderFilter>>;
};

const COLUMN_KEYS = [
  'requestNumber',
  'paymentType',
  'beneficiary',
  'description',
  'grossAmount',
  'netAmount',
  'amountNgn',
  'currency',
  'department',
  'project',
  'submitted',
  'currentStage',
  'approver',
  'status',
] as const;

const TABS = ['all', 'mine', 'drafts', 'pending', 'returned', 'approved', 'ready', 'paid', 'rejected', 'retirement'];
const KPIS = ['total', 'pending', 'returned', 'approved', 'ready', 'progress', 'paid', 'rejected'];
const PAGE_SIZES = [10, 25, 50];
const VIEW_KEYS = ['tab', 'kpi', 'q', 'type', 'status', 'department', 'project', 'currency', 'approver', 'location', 'from', 'to', 'sort', 'dir', 'page', 'pageSize', 'cols'];

const viewStorageKey = (pathname: string) => `dle-payment-list:${pathname}`;
const restoreStorageKey = (pathname: string) => `dle-payment-list-restore:${pathname}`;

export const defaultPaymentListTab = (listMode?: string | null) => {
  if (listMode === 'inbox') return 'pending';
  if (listMode === 'approved') return 'approved';
  if (listMode === 'mine') return 'mine';
  return 'all';
};

export const emptyPaymentListView = (tab = 'all'): PaymentListViewState => ({
  tab,
  kpi: '',
  q: '',
  paymentType: 'All',
  status: 'All',
  department: 'All',
  project: 'All',
  currency: 'All',
  approver: 'All',
  location: 'All',
  submittedFrom: '',
  submittedTo: '',
  sort: '',
  dir: 'asc',
  page: 1,
  pageSize: 10,
  headers: {},
});

const readParam = (
  source: URLSearchParams | Record<string, string | string[] | undefined>,
  key: string,
) => {
  if (source instanceof URLSearchParams) return source.get(key) || '';
  const value = source[key];
  if (Array.isArray(value)) return String(value[0] || '');
  return String(value || '');
};

export const paymentTypeToQuery = (paymentType: string) => {
  if (/cash\s*advance/i.test(paymentType)) return 'cash-advance';
  if (/supplier/i.test(paymentType)) return 'supplier';
  if (/expense/i.test(paymentType)) return 'expense';
  return '';
};

export const paymentTypeFromQuery = (value: string) => {
  const raw = value.trim().toLowerCase();
  if (raw === 'cash-advance' || raw === 'cash' || raw === 'cash advance payment') return 'Cash Advance Payment';
  if (raw === 'supplier' || raw === 'si' || raw === 'supplier invoice payment') return 'Supplier Invoice Payment';
  if (raw === 'expense' || raw === 'ex' || raw === 'expense payment') return 'Expense Payment';
  return 'All';
};

const cleanHeaders = (value: unknown): PaymentListViewState['headers'] => {
  if (!value || typeof value !== 'object') return {};
  const next: PaymentListViewState['headers'] = {};
  for (const key of COLUMN_KEYS) {
    const item = (value as Record<string, unknown>)[key];
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const selected = Array.isArray(record.selected)
      ? record.selected.map((entry) => String(entry || '').slice(0, 180)).filter(Boolean).slice(0, 80)
      : undefined;
    const min = String(record.min || '').trim().slice(0, 40);
    const max = String(record.max || '').trim().slice(0, 40);
    if ((selected && selected.length) || min || max) {
      next[key] = {
        ...(selected && selected.length ? { selected } : {}),
        ...(min ? { min } : {}),
        ...(max ? { max } : {}),
      };
    }
  }
  return next;
};

export const paymentListQueryHasView = (
  source: URLSearchParams | Record<string, string | string[] | undefined>,
) => VIEW_KEYS.some((key) => readParam(source, key).trim().length > 0);

export const parsePaymentListView = (
  source: URLSearchParams | Record<string, string | string[] | undefined>,
): Partial<PaymentListViewState> => {
  const next: Partial<PaymentListViewState> = {};
  const tab = readParam(source, 'tab').trim().toLowerCase();
  if (TABS.includes(tab)) next.tab = tab;
  const kpi = readParam(source, 'kpi').trim().toLowerCase();
  if (KPIS.includes(kpi)) next.kpi = kpi;
  const q = readParam(source, 'q').trim().slice(0, 200);
  if (q) next.q = q;
  const type = paymentTypeFromQuery(readParam(source, 'type'));
  if (type !== 'All') next.paymentType = type;
  for (const key of ['status', 'department', 'project', 'currency', 'approver', 'location'] as const) {
    const value = readParam(source, key).trim().slice(0, 180);
    if (value && value.toLowerCase() !== 'all') next[key] = value;
  }
  const submittedFrom = readParam(source, 'from').trim().slice(0, 10);
  const submittedTo = readParam(source, 'to').trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(submittedFrom)) next.submittedFrom = submittedFrom;
  if (/^\d{4}-\d{2}-\d{2}$/.test(submittedTo)) next.submittedTo = submittedTo;
  const sort = readParam(source, 'sort').trim();
  if ((COLUMN_KEYS as readonly string[]).includes(sort)) next.sort = sort;
  const dir = readParam(source, 'dir').trim().toLowerCase();
  if (dir === 'asc' || dir === 'desc') next.dir = dir;
  const page = Number(readParam(source, 'page'));
  if (Number.isInteger(page) && page > 1 && page <= 500) next.page = page;
  const pageSize = Number(readParam(source, 'pageSize'));
  if (PAGE_SIZES.includes(pageSize)) next.pageSize = pageSize;
  const cols = readParam(source, 'cols');
  if (cols) {
    try {
      next.headers = cleanHeaders(JSON.parse(cols));
    } catch {
      next.headers = {};
    }
  }
  return next;
};

export const serializePaymentListView = (
  view: PaymentListViewState,
  defaultTab = 'all',
) => {
  const params = new URLSearchParams();
  if (view.tab && view.tab !== defaultTab) params.set('tab', view.tab);
  if (view.kpi) params.set('kpi', view.kpi);
  if (view.q.trim()) params.set('q', view.q.trim());
  const type = paymentTypeToQuery(view.paymentType);
  if (type) params.set('type', type);
  for (const key of ['status', 'department', 'project', 'currency', 'approver', 'location'] as const) {
    const value = view[key].trim();
    if (value && value !== 'All') params.set(key, value);
  }
  if (view.submittedFrom) params.set('from', view.submittedFrom);
  if (view.submittedTo) params.set('to', view.submittedTo);
  if (view.sort) {
    params.set('sort', view.sort);
    if (view.dir === 'desc') params.set('dir', 'desc');
  }
  if (view.page > 1) params.set('page', String(view.page));
  if (view.pageSize && view.pageSize !== 10) params.set('pageSize', String(view.pageSize));
  if (Object.keys(view.headers).length) params.set('cols', JSON.stringify(view.headers));
  return params;
};

export const listReturnPath = (pathname: string, view: PaymentListViewState, defaultTab = 'all') => {
  const qs = serializePaymentListView(view, defaultTab).toString();
  return qs ? `${pathname}?${qs}` : pathname;
};

export const safePaymentReturnPath = (value: unknown, fallback = '/finance/approvals/payments') => {
  const raw = String(value ?? '').trim();
  if (!raw.startsWith('/finance/approvals') || raw.startsWith('//') || raw.includes('\\') || raw.includes('://') || raw.includes('..')) {
    return fallback;
  }
  try {
    const url = new URL(raw, 'http://dle.local');
    if (!url.pathname.startsWith('/finance/approvals')) return fallback;
    if (url.pathname.includes('/request/')) return fallback;
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
};

export const paymentRequestHref = (requestId: string, returnTo?: string | null) => {
  const path = `/finance/approvals/request/${encodeURIComponent(requestId)}`;
  const safe = returnTo ? safePaymentReturnPath(returnTo, '') : '';
  if (!safe) return path;
  return `${path}?from=${encodeURIComponent(safe)}`;
};

export const paymentEditHref = (requestId: string, returnTo?: string | null) => {
  const safe = safePaymentReturnPath(returnTo, '/finance/approvals/payments');
  const url = new URL(safe, 'http://dle.local');
  const listPaths = [
    '/finance/approvals/payments',
    '/finance/approvals/inbox',
    '/finance/approvals/my-requests',
    '/finance/approvals/team-payments',
  ];
  if (!listPaths.includes(url.pathname)) {
    return `/finance/approvals/payments?edit=${encodeURIComponent(requestId)}`;
  }
  url.searchParams.set('edit', requestId);
  return `${url.pathname}${url.search}`;
};

export const paymentReturnLabel = (returnTo: string) => {
  const path = safePaymentReturnPath(returnTo);
  if (path.startsWith('/finance/approvals/inbox')) return 'Back to inbox';
  if (path.startsWith('/finance/approvals/my-requests')) return 'Back to my requests';
  if (path.startsWith('/finance/approvals/team-payments')) return 'Back to team payments';
  if (path === '/finance/approvals' || path.startsWith('/finance/approvals?')) return 'Back to dashboard';
  if (path.startsWith('/finance/approvals/payments')) return 'Back to payment requests';
  return 'Back';
};

const storage = () => {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage;
  } catch {
    return null;
  }
};

export const savePaymentListView = (pathname: string, view: PaymentListViewState) => {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(viewStorageKey(pathname), JSON.stringify(view));
  } catch {
    // Ignore quota or private-mode failures. The return URL still carries the filter.
  }
};

export const loadPaymentListView = (pathname: string): PaymentListViewState | null => {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(viewStorageKey(pathname));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PaymentListViewState>;
    const tab = TABS.includes(String(parsed.tab || '')) ? String(parsed.tab) : 'all';
    return {
      ...emptyPaymentListView(tab),
      ...parsed,
      tab,
      dir: parsed.dir === 'desc' ? 'desc' : 'asc',
      page: Number.isInteger(parsed.page) && Number(parsed.page) > 0 ? Number(parsed.page) : 1,
      pageSize: PAGE_SIZES.includes(Number(parsed.pageSize)) ? Number(parsed.pageSize) : 10,
      headers: cleanHeaders(parsed.headers),
      paymentType: paymentTypeFromQuery(String(parsed.paymentType || 'All')),
    };
  } catch {
    return null;
  }
};

export const armPaymentListRestore = (pathname: string) => {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(restoreStorageKey(pathname), '1');
  } catch {
    // The return query string is the primary path.
  }
};

export const consumePaymentListRestore = (pathname: string) => {
  const store = storage();
  if (!store) return false;
  try {
    const armed = store.getItem(restoreStorageKey(pathname)) === '1';
    store.removeItem(restoreStorageKey(pathname));
    return armed;
  } catch {
    return false;
  }
};
