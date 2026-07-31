import BackupDisasterRecoveryClient from './BackupDisasterRecoveryClient';
import { readBackupDisasterRecoveryStateSafe } from '@/lib/backup-disaster-recovery-store';
import { enrichBackupDisasterRecoveryState } from '@/lib/backup-disaster-recovery-service';
import { ensureBackupSchedulerStarted, getBackupSchedulerStatus } from '@/lib/backup-scheduler';

export const metadata = {
  title: 'Backup & Disaster Recovery Centre',
};

export default async function BackupDisasterRecoveryPage() {
  ensureBackupSchedulerStarted();
  const initialState = {
    ...(await enrichBackupDisasterRecoveryState(await readBackupDisasterRecoveryStateSafe())),
    scheduler: getBackupSchedulerStatus(),
  };
  return <BackupDisasterRecoveryClient initialState={initialState} />;
}
