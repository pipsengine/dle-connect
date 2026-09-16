import { fetchDistinctSageX3Suppliers } from '@/lib/sage-x3-suppliers';
import { syncSageSuppliersFromX3 } from '@/lib/procurement-store';

const fetched = await fetchDistinctSageX3Suppliers();
const withEmail = fetched.suppliers.filter((row) => row.email).length;
const withPhone = fetched.suppliers.filter((row) => row.phone || row.mobile).length;
const withAddress = fetched.suppliers.filter((row) => row.addressLine || row.city).length;
const sample = fetched.suppliers.find((row) => row.email || row.phone) || fetched.suppliers[0];
console.log(JSON.stringify({
  table: fetched.table,
  distinctSuppliers: fetched.suppliers.length,
  withEmail,
  withPhone,
  withAddress,
  sample: sample
    ? {
        code: sample.sageCode,
        name: sample.name,
        email: sample.email,
        phone: sample.phone,
        city: sample.city,
        country: sample.country,
        contactName: sample.contactName,
      }
    : null,
}));

const synced = await syncSageSuppliersFromX3('sage-x3-sync');
console.log(JSON.stringify(synced));
process.exit(0);
