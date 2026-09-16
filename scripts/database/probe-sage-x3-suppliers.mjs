import { fetchDistinctSageX3Suppliers } from '../../apps/dashboard/lib/sage-x3-suppliers.ts';

const result = await fetchDistinctSageX3Suppliers();
console.log(JSON.stringify({
  table: result.table,
  distinctSuppliers: result.suppliers.length,
  sample: result.suppliers.slice(0, 5).map((row) => ({ code: row.sageCode, name: row.name })),
}));
