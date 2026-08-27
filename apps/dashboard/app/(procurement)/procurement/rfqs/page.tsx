import { ProcEntityCrud } from '../_components/ProcEntityCrud';
export const metadata = { title: 'RFQs' };
export default function Page() {
  return (
    <ProcEntityCrud
      title="Request for Quotations"
      description="RFQs linked to purchase requisitions."
      resource="rfqs"
      action="upsert-rfq"
      idKey="rfqId"
      createDefaults={{ status: 'Draft' }}
      fields={[
        { key: 'title', label: 'Title', required: true },
        { key: 'prId', label: 'PR ID' },
        { key: 'buyerName', label: 'Buyer' },
        { key: 'status', label: 'Status', type: 'select', options: ['Draft', 'Issued', 'Closed', 'Cancelled', 'Awarded'] },
        { key: 'issueDate', label: 'Issue date (YYYY-MM-DD)' },
        { key: 'submissionDeadline', label: 'Submission deadline (YYYY-MM-DD)' },
      ]}
      columns={[
        { key: 'rfqId', label: 'RFQ #' },
        { key: 'title', label: 'Title' },
        { key: 'prId', label: 'PR' },
        { key: 'status', label: 'Status' },
        { key: 'buyerName', label: 'Buyer' },
        { key: 'updatedAt', label: 'Updated' },
      ]}
    />
  );
}
