import { ProcEntityCrud } from '../_components/ProcEntityCrud';
export const metadata = { title: 'Suppliers' };
export default function Page() {
  return (
    <ProcEntityCrud
      title="Suppliers"
      description="Supplier master data in DLE_Enterprise."
      resource="suppliers"
      action="upsert-supplier"
      idKey="supplierId"
      createDefaults={{ isApproved: true, currency: 'NGN', isActive: true }}
      fields={[
        { key: 'name', label: 'Name', required: true },
        { key: 'code', label: 'Code' },
        { key: 'currency', label: 'Currency' },
        { key: 'paymentTerms', label: 'Payment terms' },
        { key: 'deliveryPeriod', label: 'Delivery period' },
        { key: 'deliveryLocation', label: 'Delivery location' },
        { key: 'outstanding', label: 'Outstanding', type: 'number' },
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Phone' },
        { key: 'notes', label: 'Notes', type: 'textarea' },
        { key: 'isApproved', label: 'Approved supplier', type: 'checkbox' },
        { key: 'isActive', label: 'Active', type: 'checkbox' },
      ]}
      columns={[
        { key: 'supplierId', label: 'ID' },
        { key: 'name', label: 'Name' },
        { key: 'code', label: 'Code' },
        { key: 'isApproved', label: 'Approved' },
        { key: 'outstanding', label: 'Outstanding' },
        { key: 'updatedAt', label: 'Updated' },
      ]}
    />
  );
}
