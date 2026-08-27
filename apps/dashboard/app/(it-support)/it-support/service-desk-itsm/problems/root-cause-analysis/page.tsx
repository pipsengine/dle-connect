import { ItsmEntityCrud } from '../../_components/ItsmEntityCrud';
export const metadata = { title: 'Problem RCA' };
export default function Page() {
  return (
    <ItsmEntityCrud
      title="Problem Root Cause Analysis"
      resource="problems"
      action="upsert-problem"
      idKey="problemId"
      createDefaults={{ kind: 'Problem', status: 'Investigating', priority: 'High' }}
      fields={[
        { key: 'title', label: 'Title', required: true },
        { key: 'rootCause', label: 'Root Cause', type: 'textarea', required: true },
        { key: 'description', label: 'Analysis notes', type: 'textarea' },
        { key: 'linkedIncidentId', label: 'Linked Incident' },
        { key: 'status', label: 'Status', type: 'select', options: ['Investigating', 'Confirmed', 'Closed'] },
        { key: 'ownerName', label: 'Owner' },
      ]}
      columns={[
        { key: 'problemId', label: 'ID' },
        { key: 'title', label: 'Title' },
        { key: 'rootCause', label: 'Root Cause' },
        { key: 'status', label: 'Status' },
        { key: 'updatedAt', label: 'Updated' },
      ]}
    />
  );
}
