import { ItsmEntityCrud } from '../../_components/ItsmEntityCrud';
export const metadata = { title: 'Workarounds' };
export default function Page() {
  return (
    <ItsmEntityCrud
      title="Workarounds"
      resource="problems"
      action="upsert-problem"
      idKey="problemId"
      query={{ kind: 'Workaround' }}
      createDefaults={{ kind: 'Workaround', status: 'Active', priority: 'Low' }}
      fields={[
        { key: 'title', label: 'Title', required: true },
        { key: 'workaround', label: 'Workaround steps', type: 'textarea', required: true },
        { key: 'description', label: 'Context', type: 'textarea' },
        { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Retired'] },
        { key: 'ownerName', label: 'Owner' },
      ]}
      columns={[
        { key: 'problemId', label: 'ID' },
        { key: 'title', label: 'Title' },
        { key: 'workaround', label: 'Workaround' },
        { key: 'status', label: 'Status' },
        { key: 'updatedAt', label: 'Updated' },
      ]}
    />
  );
}
