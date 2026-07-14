import {
  markBackupPolicyRun,
  resolvePrimaryBackupTarget,
  runApplicationBackup,
  runDleEnterpriseDifferentialBackup,
  runDleEnterpriseFullBackup,
  runDleEnterpriseLogBackup,
} from '@/lib/backup-disaster-recovery-service';
import { readBackupDisasterRecoveryState } from '@/lib/backup-disaster-recovery-store';
import { isPolicyDue, policyKind } from '@/lib/backup-schedule';
import type { BackupPolicy } from '@/lib/backup-disaster-recovery-types';

const ACTOR = 'DLE Backup Scheduler';
const TICK_MS = Number(process.env.DLE_BACKUP_SCHEDULER_INTERVAL_MS || 60_000);

let started = false;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let tickInFlight = false;
let lastTickAt: string | null = null;
let lastTickSummary = '';

const runPolicy = async (policy: BackupPolicy) => {
  const kind = policyKind(policy.type);
  try {
    if (kind === 'full') {
      await runDleEnterpriseFullBackup(ACTOR);
    } else if (kind === 'log') {
      await runDleEnterpriseLogBackup(ACTOR);
    } else if (kind === 'differential') {
      await runDleEnterpriseDifferentialBackup(ACTOR);
    } else if (kind === 'application') {
      await runApplicationBackup(ACTOR, 'application', policy.retention);
    } else if (kind === 'document') {
      await runApplicationBackup(ACTOR, 'document', policy.retention);
    } else if (kind === 'configuration') {
      await runApplicationBackup(ACTOR, 'configuration', policy.retention);
    } else if (kind === 'snapshot') {
      await runApplicationBackup(ACTOR, 'snapshot', policy.retention);
    } else {
      await markBackupPolicyRun(policy.type, policy.schedule, {
        status: 'skipped',
        detail: `Unsupported policy type "${policy.type}".`,
      }, ACTOR);
      return { type: policy.type, status: 'skipped' as const };
    }

    await markBackupPolicyRun(policy.type, policy.schedule, {
      status: 'success',
      detail: `Completed per schedule "${policy.schedule}".`,
    }, ACTOR);
    return { type: policy.type, status: 'success' as const };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Scheduled backup failed.';
    try {
      await markBackupPolicyRun(policy.type, policy.schedule, { status: 'failed', detail }, ACTOR);
    } catch {
      // ignore secondary state write failures
    }
    return { type: policy.type, status: 'failed' as const, detail };
  }
};

export const getBackupSchedulerStatus = () => ({
  started,
  tickIntervalMs: TICK_MS,
  lastTickAt,
  lastTickSummary,
  tickInFlight,
});

export const runBackupSchedulerTick = async (options?: { force?: boolean }) => {
  if (tickInFlight) {
    return { skipped: true, reason: 'Tick already in progress.', results: [] as Array<{ type: string; status: string }> };
  }
  tickInFlight = true;
  lastTickAt = new Date().toISOString();
  try {
    const state = await readBackupDisasterRecoveryState();
    const primary = resolvePrimaryBackupTarget(state);
    if (!primary?.location.trim()) {
      lastTickSummary = 'Primary backup location is not configured.';
      return { skipped: true, reason: lastTickSummary, results: [] as Array<{ type: string; status: string }> };
    }

    const due = state.backupPolicies.filter((policy) => options?.force || isPolicyDue(policy));
    if (!due.length) {
      lastTickSummary = 'No automated policies due.';
      return { skipped: false, reason: lastTickSummary, results: [] as Array<{ type: string; status: string }> };
    }

    const results: Array<{ type: string; status: string; detail?: string }> = [];
    for (const policy of due) {
      // Run policies sequentially to avoid competing BACKUP DATABASE commands.
      results.push(await runPolicy(policy));
    }
    lastTickSummary = results.map((item) => `${item.type}:${item.status}`).join(', ');
    return { skipped: false, reason: lastTickSummary, results };
  } catch (error) {
    lastTickSummary = error instanceof Error ? error.message : 'Scheduler tick failed.';
    return { skipped: true, reason: lastTickSummary, results: [] as Array<{ type: string; status: string }> };
  } finally {
    tickInFlight = false;
  }
};

export const ensureBackupSchedulerStarted = () => {
  if (started) return getBackupSchedulerStatus();
  if (process.env.DLE_BACKUP_SCHEDULER_DISABLED === '1') {
    lastTickSummary = 'Scheduler disabled by DLE_BACKUP_SCHEDULER_DISABLED.';
    return getBackupSchedulerStatus();
  }
  started = true;
  void runBackupSchedulerTick();
  tickTimer = setInterval(() => {
    void runBackupSchedulerTick();
  }, TICK_MS);
  if (typeof tickTimer === 'object' && 'unref' in tickTimer && typeof tickTimer.unref === 'function') {
    tickTimer.unref();
  }
  lastTickSummary = 'Scheduler started.';
  return getBackupSchedulerStatus();
};

export const stopBackupScheduler = () => {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
  started = false;
};
