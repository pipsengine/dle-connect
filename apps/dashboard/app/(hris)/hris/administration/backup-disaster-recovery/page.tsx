import BackupDisasterRecoveryClient from '@/app/(dashboard)/administration/backup-disaster-recovery/BackupDisasterRecoveryClient';
import { readBackupDisasterRecoveryState } from '@/lib/backup-disaster-recovery-store';

export const metadata = {
  title: 'Backup & Disaster Recovery Centre',
};

export default async function HrisBackupDisasterRecoveryPage() {
  const initialState = await readBackupDisasterRecoveryState();
  return <BackupDisasterRecoveryClient initialState={initialState} />;
}
