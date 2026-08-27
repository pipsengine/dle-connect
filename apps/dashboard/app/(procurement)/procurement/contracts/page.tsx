import { ProcEntityCrud } from '../_components/ProcEntityCrud';
export const metadata = { title: 'Contracts' };
export default function Page() {
  return (
    <ProcEntityCrud
      title="Contracts"
      description="Supplier contracts linked to POs."
      resource="contracts"
      action="upsert-contract"
      idKey="contractId"
      createDefaults={{ status: 'Draft' }}
      fields={[
        { key: 'title', label: 'Title', required: true },
        { key: 'supplierName', label: 'Supplier name' },
        { key: 'supplierId', label: 'Supplier ID' },
        { key: 'poId', label: 'PO ID' },
        { key: 'status', label: 'Status', type: 'select', options: ['Draft', 'Active', 'Expired', 'Cancelled', 'Closed'] },
        { key: 'startDate', label: 'Start date (YYYY-MM-DD)' },
        { key: 'endDate', label: 'End date (YYYY-MM-DD)' },
        { key: 'value', label: 'Value', type: 'number' },
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ]}
      columns={[
        { key: 'contractId', label: 'ID' },
        { key: 'title', label: 'Title' },
        { key: 'supplierName', label: 'Supplier' },
        { key: 'status', label: 'Status' },
        { key: 'value', label: 'Value' },
        { key: 'poId', label: 'PO' },
      ]}
    />
  );
}
