import { ProcEntityCrud } from '../_components/ProcEntityCrud';

export const metadata = { title: 'Contracts & Frameworks' };

export default function Page() {
  return (
    <ProcEntityCrud
      title="Contracts & Frameworks"
      description="Supplier contracts, frameworks and key obligations linked to purchase orders."
      resource="contracts"
      action="upsert-contract"
      idKey="contractId"
      createDefaults={{ status: 'Draft', currency: 'NGN', contractType: 'Framework' }}
      fields={[
        { key: 'title', label: 'Title', required: true },
        { key: 'supplierName', label: 'Supplier' },
        { key: 'supplierId', label: 'Supplier ID' },
        { key: 'poId', label: 'Linked PO' },
        { key: 'contractType', label: 'Contract type', type: 'select', options: ['Framework', 'Fixed Price', 'Call-off', 'Service Agreement', 'Works Contract'] },
        { key: 'status', label: 'Status', type: 'select', options: ['Draft', 'Active', 'Expired', 'Cancelled', 'Closed'] },
        { key: 'startDate', label: 'Start date (YYYY-MM-DD)' },
        { key: 'endDate', label: 'End date (YYYY-MM-DD)' },
        { key: 'value', label: 'Contract value', type: 'number' },
        { key: 'currency', label: 'Currency', type: 'select', options: ['NGN', 'USD', 'EUR', 'GBP'] },
        { key: 'paymentTerms', label: 'Payment terms' },
        { key: 'performanceSecurity', label: 'Performance security' },
        { key: 'warranty', label: 'Warranty' },
        { key: 'notes', label: 'Key obligations', type: 'textarea' },
      ]}
      columns={[
        { key: 'contractId', label: 'Reference' },
        { key: 'title', label: 'Title' },
        { key: 'supplierName', label: 'Supplier' },
        { key: 'contractType', label: 'Type' },
        { key: 'status', label: 'Status' },
        { key: 'value', label: 'Value' },
        { key: 'endDate', label: 'End date' },
      ]}
    />
  );
}
