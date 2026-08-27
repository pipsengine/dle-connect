import { ProcEntityCrud } from '../_components/ProcEntityCrud';
export const metadata = { title: 'Purchase Requisitions' };
export default function Page() {
  return (
    <ProcEntityCrud
      title="Purchase Requisitions"
      description="Create and manage purchase requisitions in DLE_Enterprise."
      resource="purchase-requisitions"
      action="upsert-pr"
      idKey="prId"
      createDefaults={{ status: 'Draft', currency: 'NGN' }}
      fields={[
        { key: 'title', label: 'Title', required: true },
        { key: 'description', label: 'Description', type: 'textarea' },
        { key: 'department', label: 'Department' },
        { key: 'project', label: 'Project' },
        { key: 'requesterName', label: 'Requester' },
        { key: 'status', label: 'Status', type: 'select', options: ['Draft', 'Submitted', 'Approved', 'Rejected', 'Closed', 'Cancelled'] },
        { key: 'currency', label: 'Currency' },
        { key: 'estimatedAmount', label: 'Estimated amount', type: 'number' },
      ]}
      columns={[
        { key: 'prId', label: 'PR #' },
        { key: 'title', label: 'Title' },
        { key: 'department', label: 'Department' },
        { key: 'status', label: 'Status' },
        { key: 'estimatedAmount', label: 'Estimate' },
        { key: 'updatedAt', label: 'Updated' },
      ]}
    />
  );
}
