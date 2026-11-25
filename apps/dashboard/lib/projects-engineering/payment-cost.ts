import { isCorporateOrPlaceholderProjectCode } from '@/lib/finance-intelligence/payment-request-departments';

export type ProjectPaymentKind = 'actual' | 'commitment';

export type ProjectPaymentLine = {
  requestId: string;
  requestNumber: string;
  projectCode: string;
  paymentType: string;
  beneficiaryName: string;
  description: string;
  expenseCode: string;
  amountNgn: number;
  currencyCode: string;
  status: string;
  kind: ProjectPaymentKind;
  paidAt: string | null;
  postedAt: string | null;
};

export type ProjectPaymentPosition = {
  projectCode: string;
  actual: number;
  commitments: number;
  actualCount: number;
  commitmentCount: number;
  lines: ProjectPaymentLine[];
};

export type ProjectPaymentLedger = {
  actual: number;
  commitments: number;
};

const compact = (value: unknown) => String(value ?? '').trim();

const ACTUAL_STATUS = /^(paid|awaiting retirement|retirement submitted|treasury verification|finance verification|retired|completed|closed)$/i;
const COMMITMENT_STATUS = /^(pending approval|submitted|finance review|approved|ready for treasury|payment scheduled|payment processing)$/i;
const IGNORED_STATUS = /^(draft|returned|rejected|cancelled)$/i;

export const canonicalPaymentProjectCode = (value: unknown) => compact(value).toUpperCase();

/** NGN amount used for project cost. Prefer the rate captured when the request was routed. */
export const paymentAmountNgn = (netAmount: number, currencyCode: string, payloadJson?: string | null) => {
  if (payloadJson) {
    try {
      const payload = JSON.parse(payloadJson) as { amountNgn?: unknown };
      const stored = Number(payload?.amountNgn);
      if (Number.isFinite(stored) && stored > 0) return Math.round(stored * 100) / 100;
    } catch {
      // fall through to the stored net amount
    }
  }
  const net = Number(netAmount || 0);
  if (!Number.isFinite(net) || net <= 0) return 0;
  return Math.round(net * 100) / 100;
};

export const classifyProjectPayment = (input: {
  projectCode?: string | null;
  status?: string | null;
  paidAt?: string | null;
}): ProjectPaymentKind | null => {
  const projectCode = canonicalPaymentProjectCode(input.projectCode);
  if (!projectCode || isCorporateOrPlaceholderProjectCode(projectCode)) return null;
  const status = compact(input.status);
  if (!status || IGNORED_STATUS.test(status)) return null;
  if (input.paidAt || ACTUAL_STATUS.test(status)) return 'actual';
  if (COMMITMENT_STATUS.test(status)) return 'commitment';
  return null;
};

export const emptyPaymentPosition = (projectCode: string): ProjectPaymentPosition => ({
  projectCode: canonicalPaymentProjectCode(projectCode),
  actual: 0,
  commitments: 0,
  actualCount: 0,
  commitmentCount: 0,
  lines: [],
});

export const groupPaymentLines = (lines: ProjectPaymentLine[]) => {
  const map = new Map<string, ProjectPaymentPosition>();
  for (const line of lines) {
    const code = canonicalPaymentProjectCode(line.projectCode);
    if (!code) continue;
    const current = map.get(code) || emptyPaymentPosition(code);
    current.lines.push(line);
    if (line.kind === 'actual') {
      current.actual += line.amountNgn;
      current.actualCount += 1;
    } else {
      current.commitments += line.amountNgn;
      current.commitmentCount += 1;
    }
    map.set(code, current);
  }
  for (const position of map.values()) {
    position.actual = Math.round(position.actual * 100) / 100;
    position.commitments = Math.round(position.commitments * 100) / 100;
    position.lines.sort((a, b) => (b.paidAt || '').localeCompare(a.paidAt || '') || b.requestNumber.localeCompare(a.requestNumber));
  }
  return map;
};

export const ledgerFromPosition = (position?: ProjectPaymentPosition | null): ProjectPaymentLedger => ({
  actual: Number(position?.actual || 0),
  commitments: Number(position?.commitments || 0),
});
