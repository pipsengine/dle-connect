import { ItsmEntityCrud } from '../../_components/ItsmEntityCrud';
export const metadata = { title: 'Rollback Plans' };
export default function Page() {
  return (
    <ItsmEntityCrud
      title="Rollback Plans"
      resource="changes"
      action="upsert-change"
      idKey="changeId"
      createDefaults={{ changeType: 'Normal', status: 'Draft', cabStatus: 'Pending' }}
      fields={[
        { key: 'title', label: 'Change title', required: true },
        { key: 'rollbackPlan', label: 'Rollback plan', type: 'textarea', required: true },
        { key: 'changeType', label: 'Type', type: 'select', options: ['Standard', 'Normal', 'Emergency'] },
        { key: 'status', label: 'Status', type: 'select', options: ['Draft', 'Scheduled', 'Completed', 'Rolled Back'] },
        { key: 'ownerName', label: 'Owner' },
      ]}
      columns={[
        { key: 'changeId', label: 'ID' },
        { key: 'title', label: 'Title' },
        { key: 'rollbackPlan', label: 'Rollback' },
        { key: 'status', label: 'Status' },
        { key: 'updatedAt', label: 'Updated' },
      ]}
    />
  );
}
