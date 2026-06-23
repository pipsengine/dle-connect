import BackupDisasterRecoveryClient from './BackupDisasterRecoveryClient';
import { readBackupDisasterRecoveryState } from '@/lib/backup-disaster-recovery-store';

export const metadata = {
  title: 'Backup & Disaster Recovery Centre',
};

export default async function BackupDisasterRecoveryPage() {
  const initialState = await readBackupDisasterRecoveryState();
  return <BackupDisasterRecoveryClient initialState={initialState} />;
}
