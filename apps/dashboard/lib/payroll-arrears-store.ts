import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { normalizePayrollPeriod } from '@/lib/payroll-leave-allowance-store';
import {
  HR_ARREARS_POSTING_SOURCE,
  removePayrollPeriodEarningAdjustments,
  upsertPayrollPeriodEarningAdjustment,
} from '@/lib/payroll-period-earning-adjustments-store';
import { readEmployeeFromDbByCode } from '@/lib/dle-enterprise-db';

export type PayrollArrearsStatus =
  | 'Draft'
  | 'Pending HR Approval'
  | 'Pending Finance Approval'
  | 'Approved'
  | 'Posted'
  | 'Rejected';

export type PayrollArrearsRequest = {
  id: string;
  employeeId: string;
  employeeCode: string;
  fullName: string;
  department?: string;
  period: string;
  amount: number;
  code: string;
  reason: string;
  memo?: string;
  status: PayrollArrearsStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  postedAt?: string;
  audit: Array<{ at: string; actor: string; action: string; note?: string }>;
};

const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const compact = (value: unknown) => String(value || '').trim();
const nowIso = () => new Date().toISOString();

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const REQUESTS_PATH = path.join(resolveDashboardRoot(), 'data', 'hris', 'payroll-arrears-requests.json');

const readRequestsRaw = async (): Promise<PayrollArrearsRequest[]> => {
  try {
    const parsed = JSON.parse(await readFile(REQUESTS_PATH, 'utf8'));
    return Array.isArray(parsed) ? parsed as PayrollArrearsRequest[] : [];
  } catch {
    return [];
  }
};

export const readPayrollArrearsRequests = readRequestsRaw;

export const writePayrollArrearsRequests = async (requests: PayrollArrearsRequest[]) => {
  await mkdir(path.dirname(REQUESTS_PATH), { recursive: true });
  const sorted = [...requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  await writeFile(REQUESTS_PATH, JSON.stringify(sorted, null, 2), 'utf8');
};

const employeeIdentity = (employee: Pick<DleEmployeeDirectoryRow, 'employeeCode' | 'employeeId' | 'fullName'>) => {
  const code = compact(employee.employeeCode || employee.employeeId);
  const name = compact(employee.fullName);
  return name ? `${code} - ${name}` : code;
};

export const createPayrollArrearsRequest = async (input: {
  employeeCode: string;
  period: string;
  amount: number;
  reason: string;
  memo?: string;
  actor: string;
  submitForApproval?: boolean;
}) => {
  const employeeCode = compact(input.employeeCode).toUpperCase();
  const period = normalizePayrollPeriod(input.period);
  const amount = roundMoney(Number(input.amount || 0));
  const reason = compact(input.reason);
  if (!employeeCode) throw new Error('Employee code is required.');
  if (!period) throw new Error('Payroll period is required.');
  if (amount <= 0) throw new Error('Arrears amount must be greater than zero.');
  if (!reason) throw new Error('Reason is required for arrears capture.');

  const employee = await readEmployeeFromDbByCode(employeeCode);
  if (!employee) throw new Error(`Employee ${employeeCode} was not found in HRIS.`);

  const now = nowIso();
  const request: PayrollArrearsRequest = {
    id: `arr-${period}-${employeeCode}-${Date.now()}`,
    employeeId: employee.employeeId,
    employeeCode,
    fullName: compact(employee.fullName),
    department: compact(employee.department),
    period,
    amount,
    code: 'ARREARS',
    reason,
    memo: compact(input.memo) || undefined,
    status: input.submitForApproval ? 'Pending HR Approval' : 'Draft',
    createdBy: compact(input.actor) || 'HR',
    createdAt: now,
    updatedAt: now,
    audit: [{
      at: now,
      actor: compact(input.actor) || 'HR',
      action: input.submitForApproval ? 'Submitted for HR approval' : 'Created draft arrears request',
      note: reason,
    }],
  };

  const requests = await readRequestsRaw();
  await writePayrollArrearsRequests([request, ...requests]);
  return request;
};

const postArrearsToPayroll = async (request: PayrollArrearsRequest) => {
  const identity = employeeIdentity(request);
  await removePayrollPeriodEarningAdjustments({
    period: request.period,
    source: HR_ARREARS_POSTING_SOURCE,
    employeeCode: request.employeeCode,
  });
  await upsertPayrollPeriodEarningAdjustment({
    period: request.period,
    employeeId: identity,
    employeeCode: identity,
    code: request.code,
    name: 'ARREARS',
    amount: request.amount,
    taxable: true,
    source: HR_ARREARS_POSTING_SOURCE,
  });
};

export const actOnPayrollArrearsRequest = async (input: {
  requestId: string;
  action: 'submit' | 'hr-approve' | 'finance-approve' | 'reject' | 'post';
  actor: string;
  note?: string;
}) => {
  const requests = await readRequestsRaw();
  const index = requests.findIndex((item) => item.id === input.requestId);
  if (index < 0) throw new Error('Arrears request was not found.');
  const current = requests[index];
  const actor = compact(input.actor) || 'HR';
  const note = compact(input.note) || undefined;
  const now = nowIso();
  let next: PayrollArrearsRequest = { ...current, updatedAt: now };

  if (input.action === 'submit') {
    if (current.status !== 'Draft') throw new Error('Only draft arrears requests can be submitted.');
    next.status = 'Pending HR Approval';
    next.audit = [...current.audit, { at: now, actor, action: 'Submitted for HR approval', note }];
  } else if (input.action === 'hr-approve') {
    if (current.status !== 'Pending HR Approval') throw new Error('Request is not waiting for HR approval.');
    next.status = 'Pending Finance Approval';
    next.audit = [...current.audit, { at: now, actor, action: 'HR approved', note }];
  } else if (input.action === 'finance-approve') {
    if (current.status !== 'Pending Finance Approval') throw new Error('Request is not waiting for finance approval.');
    next.status = 'Approved';
    next.approvedBy = actor;
    next.approvedAt = now;
    next.audit = [...current.audit, { at: now, actor, action: 'Finance approved', note }];
    await postArrearsToPayroll(next);
    next.status = 'Posted';
    next.postedAt = now;
    next.audit = [...next.audit, { at: now, actor, action: 'Posted to payroll period adjustments', note: `ARREARS ${next.amount}` }];
  } else if (input.action === 'post') {
    if (!['Approved', 'Draft'].includes(current.status)) throw new Error('Request cannot be posted in its current status.');
    await postArrearsToPayroll(current);
    next.status = 'Posted';
    next.postedAt = now;
    next.approvedBy = actor;
    next.approvedAt = now;
    next.audit = [...current.audit, { at: now, actor, action: 'Posted to payroll period adjustments', note: `ARREARS ${current.amount}` }];
  } else if (input.action === 'reject') {
    if (['Posted', 'Rejected'].includes(current.status)) throw new Error('Request cannot be rejected.');
    next.status = 'Rejected';
    next.audit = [...current.audit, { at: now, actor, action: 'Rejected', note }];
  } else {
    throw new Error('Unsupported arrears action.');
  }

  requests[index] = next;
  await writePayrollArrearsRequests(requests);
  return next;
};

export const arrearsRequestsForPeriod = async (period?: string) => {
  const normalized = normalizePayrollPeriod(period || '');
  const requests = await readRequestsRaw();
  if (!normalized) return requests;
  return requests.filter((item) => item.period === normalized);
};
