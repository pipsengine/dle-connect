import { ItsmEntityCrud } from '../../_components/ItsmEntityCrud';
export const metadata = { title: 'Known Errors' };
export default function Page() {
  return (
    <ItsmEntityCrud
      title="Known Errors"
      resource="problems"
      action="upsert-problem"
      idKey="problemId"
      query={{ kind: 'KnownError' }}
      createDefaults={{ kind: 'KnownError', status: 'Active', priority: 'Medium' }}
      fields={[
        { key: 'title', label: 'Title', required: true },
        { key: 'description', label: 'Description', type: 'textarea' },
        { key: 'workaround', label: 'Workaround', type: 'textarea' },
        { key: 'rootCause', label: 'Root Cause', type: 'textarea' },
        { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Resolved', 'Closed'] },
        { key: 'priority', label: 'Priority', type: 'select', options: ['Critical', 'High', 'Medium', 'Low'] },
        { key: 'ownerName', label: 'Owner' },
      ]}
      columns={[
        { key: 'problemId', label: 'ID' },
        { key: 'title', label: 'Title' },
        { key: 'status', label: 'Status' },
        { key: 'workaround', label: 'Workaround' },
        { key: 'updatedAt', label: 'Updated' },
      ]}
    />
  );
}
