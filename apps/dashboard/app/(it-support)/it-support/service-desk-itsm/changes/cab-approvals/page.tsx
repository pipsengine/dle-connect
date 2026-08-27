import { ItsmEntityCrud } from '../../_components/ItsmEntityCrud';
export const metadata = { title: 'CAB Approvals' };
export default function Page() {
  return (
    <ItsmEntityCrud
      title="CAB Approvals"
      resource="changes"
      action="upsert-change"
      idKey="changeId"
      createDefaults={{ changeType: 'Normal', status: 'Draft', cabStatus: 'Pending' }}
      fields={[
        { key: 'title', label: 'Title', required: true },
        { key: 'changeType', label: 'Type', type: 'select', options: ['Standard', 'Normal', 'Emergency'] },
        { key: 'cabStatus', label: 'CAB Status', type: 'select', options: ['Pending', 'Approved', 'Rejected'] },
        { key: 'status', label: 'Change Status', type: 'select', options: ['Draft', 'Scheduled', 'In Progress', 'Completed', 'Cancelled'] },
        { key: 'description', label: 'Notes', type: 'textarea' },
        { key: 'ownerName', label: 'Owner' },
      ]}
      columns={[
        { key: 'changeId', label: 'ID' },
        { key: 'title', label: 'Title' },
        { key: 'changeType', label: 'Type' },
        { key: 'cabStatus', label: 'CAB' },
        { key: 'status', label: 'Status' },
        { key: 'updatedAt', label: 'Updated' },
      ]}
    />
  );
}
