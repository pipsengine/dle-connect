'use client';
import RecordWorkspace from '../components/RecordWorkspace';

const TABS = ['OVT', 'Night Work', 'Authorizations', 'Exceptions'];
const HEADERS = ['Employee', 'Work Date', 'Project', 'Supervisor', 'Value', 'Reason', 'Authorization', 'Location', 'Status'];

export default function OvtNightWork() {
  return <RecordWorkspace
    area="ovt"
    title="OVT & Night Work"
    description="Overtime and night-work records saved in DLE Enterprise. Hours appear only after they are saved."
    tabs={TABS}
    headers={HEADERS}
    mapRow={(record, { formatDisplayDate, badge }) => [
      record.employeeName || '—',
      formatDisplayDate(record.workDate),
      record.projectCode || '—',
      record.supervisor || '—',
      record.payload.value || '—',
      record.payload.reason || '—',
      record.reference,
      record.location || '—',
      badge(record.status),
    ]}
  />;
}
