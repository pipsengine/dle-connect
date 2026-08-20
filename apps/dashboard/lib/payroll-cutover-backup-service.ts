import {
  payrollCutoverBackupFilePath,
  resolvePrimaryBackupTarget,
  runDleEnterpriseFullBackupToPath,
} from '@/lib/backup-disaster-recovery-service';
import { readBackupDisasterRecoveryState, writeBackupDisasterRecoveryState } from '@/lib/backup-disaster-recovery-store';
import type { PayrollCutoverBackupRecord } from '@/lib/backup-disaster-recovery-types';
import { listPayrollPeriods } from '@/lib/payroll-period-store';

const envFlag = (name: string, defaultEnabled = true) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultEnabled;
  return !['0', 'false', 'no', 'off'].includes(String(raw).toLowerCase());
};

export const isPayrollCutoverBackupEnabled = () => envFlag('HRIS_PAYROLL_CUTOVER_BACKUP_ENABLED', true);

export const isPayrollCutoverBackupGateEnabled = () => envFlag('HRIS_PAYROLL_CUTOVER_BACKUP_BLOCK_OPEN', true);

const payrollCutoverSettings = async () => {
  const state = await readBackupDisasterRecoveryState();
  return state.payrollCutover || { enabled: true, requireBeforeNextPeriodOpen: true, records: [] };
};

export const getPayrollCutoverBackupForPeriod = async (payrollPeriod: string) => {
  const settings = await payrollCutoverSettings();
  return settings.records
    .filter((record) => record.payrollPeriod === payrollPeriod && record.status === 'success')
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0] || null;
};

const recordPayrollCutoverBackup = async (
  record: PayrollCutoverBackupRecord,
  actor: string,
) => {
  const state = await readBackupDisasterRecoveryState();
  const current = state.payrollCutover || { enabled: true, requireBeforeNextPeriodOpen: true, records: [] };
  const records = [record, ...current.records.filter((item) => !(item.payrollPeriod === record.payrollPeriod && item.status === 'success'))].slice(0, 48);
  return writeBackupDisasterRecoveryState({
    ...state,
    payrollCutover: {
      ...current,
      records,
    },
    audit: [
      {
        at: record.completedAt,
        actor,
        action: record.status === 'success' ? 'Payroll cutover backup completed' : 'Payroll cutover backup failed',
        detail: `${record.payrollPeriod}: ${record.message || record.backupFilePath}`,
      },
      ...state.audit,
    ].slice(0, 100),
  }, actor);
};

export const runPayrollCutoverBackup = async (payrollPeriod: string, actor: string) => {
  if (!isPayrollCutoverBackupEnabled()) {
    return { skipped: true as const, payrollPeriod, reason: 'Payroll cutover backup is disabled.' };
  }

  const existing = await getPayrollCutoverBackupForPeriod(payrollPeriod);
  if (existing) {
    return { skipped: true as const, payrollPeriod, reason: 'Verified cutover backup already exists.', record: existing };
  }

  const state = await readBackupDisasterRecoveryState();
  const target = resolvePrimaryBackupTarget(state);
  if (!target?.location.trim()) {
    return { skipped: true as const, payrollPeriod, reason: 'Primary backup location is not configured in Backup & Disaster Recovery.' };
  }

  const filePath = payrollCutoverBackupFilePath(target.location, payrollPeriod);
  try {
    const result = await runDleEnterpriseFullBackupToPath(actor, filePath, {
      operationType: 'payroll-cutover',
      jobLabel: `Payroll cutover backup (${payrollPeriod})`,
      successAuditAction: 'Payroll cutover backup completed',
      failedAuditAction: 'Payroll cutover backup failed',
      payrollPeriod,
    });
    const record: PayrollCutoverBackupRecord = {
      payrollPeriod,
      backupFilePath: result.filePath,
      completedAt: result.completedAt,
      status: 'success',
      actor,
      message: `Verified payroll cutover backup completed in ${result.elapsedSeconds}s.`,
    };
    await recordPayrollCutoverBackup(record, actor);
    return { skipped: false as const, payrollPeriod, record, filePath: result.filePath };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Payroll cutover backup failed.';
    const failedAt = new Date().toISOString();
    await recordPayrollCutoverBackup({
      payrollPeriod,
      backupFilePath: filePath,
      completedAt: failedAt,
      status: 'failed',
      actor,
      message,
    }, actor);
    throw new Error(`Payroll period ${payrollPeriod} was closed but the automatic database backup failed: ${message} Open the next period only after a successful cutover backup from Backup & Disaster Recovery.`);
  }
};

export const latestClosedPayrollPeriodBefore = async (periodToOpen: string) => {
  const { periods } = await listPayrollPeriods();
  return periods
    .filter((item) => item.status === 'Closed' && item.period !== periodToOpen)
    .sort((a, b) => b.period.localeCompare(a.period))[0] || null;
};

export const assertPayrollCutoverBackupBeforeOpen = async (periodToOpen: string) => {
  if (!isPayrollCutoverBackupEnabled() || !isPayrollCutoverBackupGateEnabled()) return;

  const settings = await payrollCutoverSettings();
  if (!settings.requireBeforeNextPeriodOpen) return;

  const priorClosed = await latestClosedPayrollPeriodBefore(periodToOpen);
  if (!priorClosed) return;

  const backup = await getPayrollCutoverBackupForPeriod(priorClosed.period);
  if (backup) return;

  throw new Error(
    `Cannot open payroll period ${periodToOpen}. A verified database backup is required for closed period ${priorClosed.period} before the next period can open. Close the prior period again to trigger the automatic backup, or run a full backup from Backup & Disaster Recovery.`,
  );
};
