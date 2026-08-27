import { ItsmEntityCrud } from '../../_components/ItsmEntityCrud';
export const metadata = { title: 'Change Calendar' };
export default function Page() {
  return (
    <ItsmEntityCrud
      title="Change Calendar"
      description="Scheduled changes with start/end windows."
      resource="changes"
      action="upsert-change"
      idKey="changeId"
      createDefaults={{ changeType: 'Normal', status: 'Scheduled', cabStatus: 'Approved' }}
      fields={[
        { key: 'title', label: 'Title', required: true },
        { key: 'scheduledStart', label: 'Start (ISO)', required: true },
        { key: 'scheduledEnd', label: 'End (ISO)', required: true },
        { key: 'changeType', label: 'Type', type: 'select', options: ['Standard', 'Normal', 'Emergency'] },
        { key: 'status', label: 'Status', type: 'select', options: ['Scheduled', 'In Progress', 'Completed', 'Cancelled'] },
        { key: 'ownerName', label: 'Owner' },
        { key: 'description', label: 'Description', type: 'textarea' },
      ]}
      columns={[
        { key: 'changeId', label: 'ID' },
        { key: 'title', label: 'Title' },
        { key: 'scheduledStart', label: 'Start' },
        { key: 'scheduledEnd', label: 'End' },
        { key: 'status', label: 'Status' },
        { key: 'ownerName', label: 'Owner' },
      ]}
    />
  );
}
