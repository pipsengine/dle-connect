import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type WorkflowDeliveryModule = 'leave' | 'payroll' | 'overtime' | 'mail';
export type WorkflowDeliveryChannel = 'email' | 'in-app' | 'database' | 'balance' | 'system';
export type WorkflowDeliveryStatus = 'started' | 'success' | 'failed' | 'skipped';

export type WorkflowDeliveryEntry = {
  id: string;
  requestId: string;
  module: WorkflowDeliveryModule;
  step: string;
  channel: WorkflowDeliveryChannel;
  status: WorkflowDeliveryStatus;
  recipientCode?: string;
  recipientEmail?: string;
  provider?: string;
  message?: string;
  error?: string;
  actor?: string;
  createdAt: string;
  durationMs?: number;
  metadata?: Record<string, string | number | boolean | null>;
};

const compact = (value: unknown) => String(value || '').trim();

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const DATA_DIR = process.env.DLE_HRIS_DATA_DIR
  ? path.resolve(process.env.DLE_HRIS_DATA_DIR)
  : path.join(resolveDashboardRoot(), 'data', 'hris');

const uniquePaths = (paths: Array<string | null | undefined>) => Array.from(new Set(paths.reduce<string[]>((items, item) => {
  if (item) items.push(path.normalize(item));
  return items;
}, [])));

const deliveryLogFile = path.join(DATA_DIR, 'workflow-delivery-log.json');
const DELIVERY_LOG_PATHS = uniquePaths([
  deliveryLogFile,
  path.join(resolveDashboardRoot(), 'data', 'hris', 'workflow-delivery-log.json'),
  path.join(process.cwd(), 'apps', 'dashboard', 'data', 'hris', 'workflow-delivery-log.json'),
]);

const MAX_ENTRIES = 5000;

const parseTimestamp = (value: string) => {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
};

const readDeliveryLogEntries = async (): Promise<WorkflowDeliveryEntry[]> => {
  const merged = new Map<string, WorkflowDeliveryEntry>();
  for (const file of DELIVERY_LOG_PATHS) {
    try {
      const parsed = JSON.parse(await readFile(file, 'utf8'));
      if (!Array.isArray(parsed)) continue;
      for (const item of parsed as WorkflowDeliveryEntry[]) {
        if (!item?.id) continue;
        const existing = merged.get(item.id);
        if (!existing || parseTimestamp(item.createdAt) >= parseTimestamp(existing.createdAt)) {
          merged.set(item.id, item);
        }
      }
    } catch {
      // Try the next candidate path.
    }
  }
  return [...merged.values()].sort((left, right) => parseTimestamp(right.createdAt) - parseTimestamp(left.createdAt));
};

const writeDeliveryLogEntries = async (entries: WorkflowDeliveryEntry[]) => {
  const trimmed = entries
    .sort((left, right) => parseTimestamp(right.createdAt) - parseTimestamp(left.createdAt))
    .slice(0, MAX_ENTRIES);
  const content = JSON.stringify(trimmed, null, 2);
  let lastError: unknown = null;
  let wrote = false;
  for (const file of DELIVERY_LOG_PATHS) {
    try {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, content, 'utf8');
      wrote = true;
    } catch (error) {
      lastError = error;
      console.warn('[workflow-delivery-log] unable to write delivery log store', { file, error });
    }
  }
  if (!wrote && lastError) throw lastError;
};

export class WorkflowDeliveryError extends Error {
  readonly step: string;
  readonly channel: WorkflowDeliveryChannel;
  readonly requestId: string;
  readonly reason: string;

  constructor(input: { step: string; channel: WorkflowDeliveryChannel; requestId: string; reason: string }) {
    super(`${input.step} failed (${input.channel}): ${input.reason}`);
    this.name = 'WorkflowDeliveryError';
    this.step = input.step;
    this.channel = input.channel;
    this.requestId = input.requestId;
    this.reason = input.reason;
  }
}

export const recordWorkflowDelivery = async (input: Omit<WorkflowDeliveryEntry, 'id' | 'createdAt'> & {
  id?: string;
  createdAt?: string;
}) => {
  const entry: WorkflowDeliveryEntry = {
    id: input.id || `delivery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    requestId: compact(input.requestId) || 'system',
    module: input.module,
    step: input.step,
    channel: input.channel,
    status: input.status,
    recipientCode: compact(input.recipientCode) || undefined,
    recipientEmail: compact(input.recipientEmail) || undefined,
    provider: compact(input.provider) || undefined,
    message: compact(input.message) || undefined,
    error: compact(input.error) || undefined,
    actor: compact(input.actor) || undefined,
    createdAt: input.createdAt || new Date().toISOString(),
    durationMs: input.durationMs,
    metadata: input.metadata,
  };
  const entries = await readDeliveryLogEntries();
  await writeDeliveryLogEntries([entry, ...entries.filter((item) => item.id !== entry.id)]);
  return entry;
};

export const listWorkflowDeliveries = async (input?: {
  requestId?: string;
  step?: string;
  status?: WorkflowDeliveryStatus;
  failedOnly?: boolean;
  limit?: number;
}) => {
  const limit = Math.max(1, Math.min(200, Number(input?.limit || 50)));
  let entries = await readDeliveryLogEntries();
  if (input?.requestId) entries = entries.filter((item) => item.requestId === input.requestId);
  if (input?.step) entries = entries.filter((item) => item.step === input.step);
  if (input?.status) entries = entries.filter((item) => item.status === input.status);
  if (input?.failedOnly) entries = entries.filter((item) => item.status === 'failed');
  return entries.slice(0, limit);
};

export const summarizeWorkflowDeliveries = (entries: WorkflowDeliveryEntry[]) => {
  const latestByStep = new Map<string, WorkflowDeliveryEntry>();
  for (const entry of entries) {
    const key = `${entry.step}:${entry.channel}`;
    if (!latestByStep.has(key)) latestByStep.set(key, entry);
  }
  const steps = [...latestByStep.values()].sort((left, right) => parseTimestamp(right.createdAt) - parseTimestamp(left.createdAt));
  const failures = steps.filter((item) => item.status === 'failed');
  return {
    steps,
    failures,
    hasFailures: failures.length > 0,
    lastSuccessAt: steps.find((item) => item.status === 'success')?.createdAt || null,
    lastFailureAt: failures[0]?.createdAt || null,
  };
};

export const wasLeaveManagerEmailDelivered = async (requestId: string) => {
  const successes = await listWorkflowDeliveries({
    requestId,
    step: 'line-manager-approval-email',
    status: 'success',
    limit: 1,
  });
  return successes.length > 0;
};

export const runWorkflowDeliveryStep = async <T>(input: {
  requestId: string;
  module: WorkflowDeliveryModule;
  step: string;
  channel: WorkflowDeliveryChannel;
  actor?: string;
  recipientCode?: string;
  recipientEmail?: string;
  provider?: string;
  critical?: boolean;
  task: () => Promise<T>;
}): Promise<T> => {
  const started = Date.now();
  await recordWorkflowDelivery({
    requestId: input.requestId,
    module: input.module,
    step: input.step,
    channel: input.channel,
    status: 'started',
    actor: input.actor,
    recipientCode: input.recipientCode,
    recipientEmail: input.recipientEmail,
    provider: input.provider,
  });
  try {
    const result = await input.task();
    await recordWorkflowDelivery({
      requestId: input.requestId,
      module: input.module,
      step: input.step,
      channel: input.channel,
      status: 'success',
      actor: input.actor,
      recipientCode: input.recipientCode,
      recipientEmail: input.recipientEmail,
      provider: input.provider,
      durationMs: Date.now() - started,
      message: typeof result === 'object' && result && 'messageId' in (result as Record<string, unknown>)
        ? `messageId=${compact((result as Record<string, unknown>).messageId)}`
        : undefined,
    });
    return result;
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Workflow step failed.';
    await recordWorkflowDelivery({
      requestId: input.requestId,
      module: input.module,
      step: input.step,
      channel: input.channel,
      status: 'failed',
      actor: input.actor,
      recipientCode: input.recipientCode,
      recipientEmail: input.recipientEmail,
      provider: input.provider,
      durationMs: Date.now() - started,
      error: reason,
    });
    if (input.critical === false) return undefined as T;
    throw new WorkflowDeliveryError({
      step: input.step,
      channel: input.channel,
      requestId: input.requestId,
      reason,
    });
  }
};
