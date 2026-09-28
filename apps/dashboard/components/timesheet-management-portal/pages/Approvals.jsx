'use client';
import RecordWorkspace from '../components/RecordWorkspace';

const TABS = ['Supervisor', 'Cost Control', 'Project Manager', 'Consolidation', 'HR', 'Payroll Readiness'];
const HEADERS = ['Reference', 'Employee', 'Work Date', 'Project', 'Value', 'Reason', 'Current Stage', 'Location', 'Status'];

export default function Approvals() {
  return <RecordWorkspace
    area="approval"
    title="Approvals"
    description="Approval items saved in DLE Enterprise. The queue stays empty until a booking is submitted or an item is created."
    tabs={TABS}
    headers={HEADERS}
    mapRow={(record, { formatDisplayDate, badge }) => [
      record.reference,
      record.employeeName || '—',
      formatDisplayDate(record.workDate),
      record.projectCode || '—',
      record.payload.value || '—',
      record.payload.reason || '—',
      record.tab,
      record.location || '—',
      badge(record.status),
    ]}
  />;
}
