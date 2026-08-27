import { ItsmEntityCrud } from '../../_components/ItsmEntityCrud';
export const metadata = { title: 'Standard Changes' };
export default function Page() {
  return (
    <ItsmEntityCrud
      title="Standard Changes"
      resource="changes"
      action="upsert-change"
      idKey="changeId"
      query={{ changeType: 'Standard' }}
      createDefaults={{ changeType: 'Standard', status: 'Draft', cabStatus: 'Pending' }}
      fields={[
        { key: 'title', label: 'Title', required: true },
        { key: 'description', label: 'Description', type: 'textarea' },
        { key: 'changeType', label: 'Type', type: 'select', options: ['Standard', 'Normal', 'Emergency'] },
        { key: 'status', label: 'Status', type: 'select', options: ['Draft', 'Scheduled', 'In Progress', 'Completed', 'Rolled Back', 'Cancelled'] },
        { key: 'cabStatus', label: 'CAB Status', type: 'select', options: ['Pending', 'Approved', 'Rejected', 'Not Required'] },
        { key: 'scheduledStart', label: 'Scheduled start (ISO)' },
        { key: 'scheduledEnd', label: 'Scheduled end (ISO)' },
        { key: 'rollbackPlan', label: 'Rollback plan', type: 'textarea' },
        { key: 'ownerName', label: 'Owner' },
      ]}
      columns={[
        { key: 'changeId', label: 'ID' },
        { key: 'title', label: 'Title' },
        { key: 'changeType', label: 'Type' },
        { key: 'status', label: 'Status' },
        { key: 'cabStatus', label: 'CAB' },
        { key: 'ownerName', label: 'Owner' },
        { key: 'updatedAt', label: 'Updated' },
      ]}
    />
  );
}
