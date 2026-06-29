import BackupDisasterRecoveryClient from './BackupDisasterRecoveryClient';
import { readBackupDisasterRecoveryStateSafe } from '@/lib/backup-disaster-recovery-store';
import { enrichBackupDisasterRecoveryState } from '@/lib/backup-disaster-recovery-service';

export const metadata = {
  title: 'Backup & Disaster Recovery Centre',
};

export default async function BackupDisasterRecoveryPage() {
  const initialState = await enrichBackupDisasterRecoveryState(await readBackupDisasterRecoveryStateSafe());
  return <BackupDisasterRecoveryClient initialState={initialState} />;
}
