'use client';
import RecordWorkspace from '../components/RecordWorkspace';

const TABS = ['Daily Reconciliation', 'Biometric Punches', 'Identity Mapping', 'Manual Attendance', 'Exceptions'];
const HEADERS = ['Employee', 'Work Date', 'Reference', 'Location', 'Evidence', 'Value', 'Reason', 'Exception', 'Status'];

export default function AttendanceReconciliation() {
  return <RecordWorkspace
    area="attendance"
    title="Attendance Reconciliation"
    description="Attendance reconciliation records saved in DLE Enterprise. Raw punches are only shown when a record has been saved."
    tabs={TABS}
    headers={HEADERS}
    mapRow={(record, { formatDisplayDate, badge }) => [
      record.employeeName || '—',
      formatDisplayDate(record.workDate),
      record.reference,
      record.location || '—',
      record.payload.notes || '—',
      record.payload.value || '—',
      record.payload.reason || '—',
      record.status === 'Exception' ? record.payload.reason || 'Exception' : '—',
      badge(record.status),
    ]}
  />;
}
