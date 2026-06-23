import { NextResponse } from 'next/server';
import { appendBackupDisasterRecoveryAudit, readBackupDisasterRecoveryState, writeBackupDisasterRecoveryState } from '@/lib/backup-disaster-recovery-store';
import { runDleEnterpriseFullBackup } from '@/lib/backup-disaster-recovery-service';
import type { BackupDisasterRecoveryState } from '@/lib/backup-disaster-recovery-types';

const ok = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });
const actorFrom = (request: Request) => request.headers.get('x-hris-actor') || request.headers.get('x-user-name') || request.headers.get('x-hris-role') || 'System Administrator';

export async function GET() {
  try {
    return ok(await readBackupDisasterRecoveryState());
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to read backup and disaster recovery state.');
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as Partial<BackupDisasterRecoveryState>;
    const current = await readBackupDisasterRecoveryState();
    const actor = actorFrom(request);
    const next = await writeBackupDisasterRecoveryState({ ...current, ...body, schemaVersion: 1 }, actor);
    return ok(next);
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to save backup and disaster recovery state.');
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { action?: string; detail?: string; operation?: string };
    const actor = actorFrom(request);
    if (body.operation === 'run-full-backup') {
      return ok(await runDleEnterpriseFullBackup(actor));
    }
    const action = String(body.action || 'Backup centre event');
    const detail = String(body.detail || 'Administrative action recorded from Backup & Disaster Recovery Centre.');
    return ok(await appendBackupDisasterRecoveryAudit({ actor, action, detail }));
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to record backup and disaster recovery event.');
  }
}
