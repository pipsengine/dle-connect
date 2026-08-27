import { ItsmEntityCrud } from '../../_components/ItsmEntityCrud';
export const metadata = { title: 'Active Problems' };
export default function Page() {
  return (
    <ItsmEntityCrud
      title="Active Problems"
      description="Problem records in DLE_Enterprise."
      resource="problems"
      action="upsert-problem"
      idKey="problemId"
      query={{ kind: 'Problem' }}
      createDefaults={{ kind: 'Problem', status: 'Active', priority: 'Medium' }}
      fields={[
        { key: 'title', label: 'Title', required: true },
        { key: 'description', label: 'Description', type: 'textarea' },
        { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Investigating', 'Resolved', 'Closed'] },
        { key: 'priority', label: 'Priority', type: 'select', options: ['Critical', 'High', 'Medium', 'Low'] },
        { key: 'ownerName', label: 'Owner' },
        { key: 'linkedIncidentId', label: 'Linked Incident ID' },
        { key: 'rootCause', label: 'Root Cause', type: 'textarea' },
      ]}
      columns={[
        { key: 'problemId', label: 'ID' },
        { key: 'title', label: 'Title' },
        { key: 'status', label: 'Status' },
        { key: 'priority', label: 'Priority' },
        { key: 'ownerName', label: 'Owner' },
        { key: 'updatedAt', label: 'Updated' },
      ]}
    />
  );
}
