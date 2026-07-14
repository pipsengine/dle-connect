import { NextResponse } from 'next/server';
import { appendBackupDisasterRecoveryAudit } from '@/lib/backup-disaster-recovery-store';
import {
  enrichBackupDisasterRecoveryState,
  readEnrichedBackupDisasterRecoveryState,
  runApplicationBackup,
  runDleEnterpriseDifferentialBackup,
  runDleEnterpriseFullBackup,
  runDleEnterpriseLogBackup,
  runDleEnterpriseRestoreDrill,
  saveBackupDisasterRecoveryConfiguration,
} from '@/lib/backup-disaster-recovery-service';
import { ensureBackupSchedulerStarted, getBackupSchedulerStatus, runBackupSchedulerTick } from '@/lib/backup-scheduler';
import { runPayrollCutoverBackup } from '@/lib/payroll-cutover-backup-service';
import type { BackupDisasterRecoveryState } from '@/lib/backup-disaster-recovery-types';

const ok = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const actorFrom = (request: Request) =>
  request.headers.get('x-hris-actor')
  || request.headers.get('x-auth-user')
  || request.headers.get('x-user-name')
  || request.headers.get('x-hris-role')
  || 'System Administrator';

const canConfigureBackup = (request: Request) => {
  const permissions = (request.headers.get('x-auth-permissions') || '').split(',').map((item) => item.trim()).filter(Boolean);
  const isGlobalAdmin = request.headers.get('x-auth-global-admin') === '1';
  if (isGlobalAdmin || permissions.includes('*')) return true;
  return ['backup.configure', 'backup.view', 'security.configure', 'page.admin.backup-disaster-recovery.view']
    .some((permission) => permissions.includes(permission) || permissions.includes(`${permission.split('.')[0]}.*`));
};

export async function GET() {
  try {
    ensureBackupSchedulerStarted();
    const state = await readEnrichedBackupDisasterRecoveryState();
    return ok({ ...state, scheduler: getBackupSchedulerStatus() });
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to read backup and disaster recovery state.');
  }
}

export async function PATCH(request: Request) {
  if (!canConfigureBackup(request)) {
    return err(403, 'You do not have permission to configure backup and disaster recovery settings.');
  }
  try {
    const body = await request.json() as Partial<BackupDisasterRecoveryState>;
    const actor = actorFrom(request);
    const saved = await saveBackupDisasterRecoveryConfiguration(body, actor);
    ensureBackupSchedulerStarted();
    return ok({ ...saved, scheduler: getBackupSchedulerStatus() });
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to save backup and disaster recovery state.');
  }
}

export async function POST(request: Request) {
  if (!canConfigureBackup(request)) {
    return err(403, 'You do not have permission to run backup and disaster recovery operations.');
  }
  try {
    const body = await request.json().catch(() => ({})) as {
      action?: string;
      detail?: string;
      operation?: string;
      payrollPeriod?: string;
      force?: boolean;
    };
    const actor = actorFrom(request);
    if (body.operation === 'run-full-backup') {
      return ok(await runDleEnterpriseFullBackup(actor));
    }
    if (body.operation === 'run-log-backup') {
      return ok(await runDleEnterpriseLogBackup(actor));
    }
    if (body.operation === 'run-differential-backup') {
      return ok(await runDleEnterpriseDifferentialBackup(actor));
    }
    if (body.operation === 'run-application-backup') {
      return ok(await runApplicationBackup(actor, 'application'));
    }
    if (body.operation === 'run-scheduler-tick') {
      ensureBackupSchedulerStarted();
      const tick = await runBackupSchedulerTick({ force: Boolean(body.force) });
      const state = await readEnrichedBackupDisasterRecoveryState();
      return ok({ tick, scheduler: getBackupSchedulerStatus(), state });
    }
    if (body.operation === 'run-payroll-cutover-backup') {
      const payrollPeriod = String(body.payrollPeriod || '').trim();
      if (!payrollPeriod) return err(400, 'payrollPeriod is required for payroll cutover backup.');
      await runPayrollCutoverBackup(payrollPeriod, actor);
      return ok(await readEnrichedBackupDisasterRecoveryState());
    }
    if (body.operation === 'run-restore-drill') {
      return ok(await runDleEnterpriseRestoreDrill(actor));
    }
    const action = String(body.action || 'Backup centre event');
    const detail = String(body.detail || 'Administrative action recorded from Backup & Disaster Recovery Centre.');
    const audited = await appendBackupDisasterRecoveryAudit({ actor, action, detail });
    return ok(await enrichBackupDisasterRecoveryState(audited));
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to record backup and disaster recovery event.');
  }
}
