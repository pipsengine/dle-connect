import { ProcEntityCrud } from '../_components/ProcEntityCrud';
export const metadata = { title: 'Purchase Orders' };
export default function Page() {
  return (
    <ProcEntityCrud
      title="Purchase Orders"
      description="Enterprise purchase orders (can link awarded CBE)."
      resource="purchase-orders"
      action="upsert-po"
      idKey="poId"
      createDefaults={{ status: 'Draft', currency: 'NGN' }}
      fields={[
        { key: 'title', label: 'Title', required: true },
        { key: 'supplierName', label: 'Supplier name' },
        { key: 'supplierId', label: 'Supplier ID' },
        { key: 'cbeId', label: 'Linked CBE' },
        { key: 'status', label: 'Status', type: 'select', options: ['Draft', 'Issued', 'In Progress', 'Completed', 'Cancelled', 'Closed'] },
        { key: 'currency', label: 'Currency' },
        { key: 'amount', label: 'Amount', type: 'number' },
        { key: 'orderDate', label: 'Order date (YYYY-MM-DD)' },
        { key: 'expectedDate', label: 'Expected date (YYYY-MM-DD)' },
      ]}
      columns={[
        { key: 'poId', label: 'PO #' },
        { key: 'title', label: 'Title' },
        { key: 'supplierName', label: 'Supplier' },
        { key: 'status', label: 'Status' },
        { key: 'amount', label: 'Amount' },
        { key: 'cbeId', label: 'CBE' },
      ]}
    />
  );
}
