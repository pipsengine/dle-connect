import type { BackupPolicy } from '@/lib/backup-disaster-recovery-types';

/** Default on-disk backup root used when Primary Backup location is blank. */
export const defaultBackupRoot = () =>
  String(process.env.DLE_BACKUP_ROOT || process.env.BACKUP_ROOT || 'C:\\SQLBackups\\DLE_Enterprise').trim();

/** Returns the repeating interval in ms for high-frequency schedules, else null (wall-clock schedules). */
export const scheduleIntervalMs = (schedule: string): number | null => {
  const text = schedule.trim().toLowerCase();
  if (!text) return null;
  if (text.includes('real-time') || text.includes('every 5 minutes')) return 5 * 60 * 1000;
  if (text.includes('every 15 minutes')) return 15 * 60 * 1000;
  if (text.includes('every 30 minutes')) return 30 * 60 * 1000;
  if (text === 'hourly' || text.includes('every hour')) return 60 * 60 * 1000;
  if (text.includes('every 6 hours')) return 6 * 60 * 60 * 1000;
  if (text.includes('every 12 hours')) return 12 * 60 * 60 * 1000;
  return null;
};

export const computeNextRun = (schedule: string, from = new Date()) => {
  const text = schedule.trim().toLowerCase();
  if (!text || text.startsWith('before ')) return '';

  const interval = scheduleIntervalMs(schedule);
  if (interval != null) {
    const next = new Date(from.getTime() + interval);
    next.setSeconds(0, 0);
    return next.toISOString();
  }

  const next = new Date(from);
  const dailyMatch = text.match(/daily\s+(\d{2}):(\d{2})/);
  if (dailyMatch) {
    next.setHours(Number(dailyMatch[1]), Number(dailyMatch[2]), 0, 0);
    if (next <= from) next.setDate(next.getDate() + 1);
    return next.toISOString();
  }

  const weeklyMatch = text.match(/weekly\s+sunday(?:\s+(\d{2}):(\d{2}))?/);
  if (weeklyMatch || text.includes('weekly sunday')) {
    const hour = weeklyMatch?.[1] ? Number(weeklyMatch[1]) : 23;
    const minute = weeklyMatch?.[2] ? Number(weeklyMatch[2]) : 0;
    next.setHours(hour, minute, 0, 0);
    const day = next.getDay();
    const daysUntilSunday = (7 - day) % 7;
    if (daysUntilSunday === 0) {
      if (next <= from) next.setDate(next.getDate() + 7);
    } else {
      next.setDate(next.getDate() + daysUntilSunday);
    }
    return next.toISOString();
  }
  return '';
};

export const isAutomatedPolicy = (policy: BackupPolicy) =>
  String(policy.status || '').trim().toLowerCase() === 'automated';

/**
 * Whether an automated policy is due to run now based on lastRunAt + schedule.
 * Missed wall-clock windows are caught up for up to 36 hours so overnight
 * process restarts still fire Daily 23:00 backups.
 */
export const isPolicyDue = (policy: BackupPolicy, now = new Date()) => {
  if (!isAutomatedPolicy(policy)) return false;
  const schedule = String(policy.schedule || '').trim();
  if (!schedule || schedule.toLowerCase().startsWith('before ')) return false;

  const lastMs = policy.lastRunAt ? new Date(policy.lastRunAt).getTime() : 0;
  const interval = scheduleIntervalMs(schedule);
  const nowMs = now.getTime();

  if (interval != null) {
    if (!lastMs || !Number.isFinite(lastMs)) return true;
    return nowMs - lastMs >= interval;
  }

  // Wall-clock schedules (Daily HH:mm / Weekly Sunday HH:mm)
  if (!lastMs || !Number.isFinite(lastMs)) {
    const lookback = new Date(nowMs - 36 * 60 * 60 * 1000);
    const candidateIso = computeNextRun(schedule, lookback);
    if (!candidateIso) return false;
    const candidate = new Date(candidateIso).getTime();
    return candidate <= nowMs;
  }

  const nextIso = computeNextRun(schedule, new Date(lastMs));
  if (!nextIso) return false;
  return new Date(nextIso).getTime() <= nowMs;
};

export const parseRetentionDays = (retention: string): number | null => {
  const text = retention.trim().toLowerCase();
  const dayMatch = text.match(/(\d+)\s*days?/);
  if (dayMatch) return Number(dayMatch[1]);
  if (text.includes('6 months')) return 180;
  if (text.includes('1 year')) return 365;
  if (text.includes('10 releases')) return 90;
  return null;
};

export const policyKind = (type: string) => {
  const text = type.trim().toLowerCase();
  if (text.includes('transaction log') || text.includes('log backup')) return 'log' as const;
  if (text.includes('differential')) return 'differential' as const;
  if (text.includes('full database') || text === 'database full backup') return 'full' as const;
  if (text.includes('application')) return 'application' as const;
  if (text.includes('document')) return 'document' as const;
  if (text.includes('configuration') || text.includes('config')) return 'configuration' as const;
  if (text.includes('snapshot') || text.includes('system')) return 'snapshot' as const;
  return 'unknown' as const;
};
