'use client';
import RecordWorkspace from '../components/RecordWorkspace';

const TABS = ['Draft Corrections', 'Returned', 'Recall Requests', 'Post-Approval Adjustments', 'History'];
const HEADERS = ['Reference', 'Employee', 'Work Date', 'Change Type', 'Value', 'Reason', 'Requested By', 'Project', 'Status'];

export default function CorrectionsAdjustments() {
  return <RecordWorkspace
    area="correction"
    title="Corrections & Adjustments"
    description="Correction requests saved in DLE Enterprise. Approved history is inserted as a new record and is not overwritten."
    tabs={TABS}
    headers={HEADERS}
    mapRow={(record, { formatDisplayDate, badge }) => [
      record.reference,
      record.employeeName || '—',
      formatDisplayDate(record.workDate),
      record.tab,
      record.payload.value || '—',
      record.payload.reason || '—',
      record.createdBy || '—',
      record.projectCode || '—',
      badge(record.status),
    ]}
  />;
}
