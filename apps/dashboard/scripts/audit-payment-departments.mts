import { buildPaymentRequestLookups } from '../lib/finance-intelligence/payment-request-lookups';
import { readSystemDepartmentsFromOrganizationDb } from '../lib/organization-departments-store';

const lookups = await buildPaymentRequestLookups();
let orgDepts: string[] = [];
try {
  const payload = await readSystemDepartmentsFromOrganizationDb();
  orgDepts = (payload.departments || []).map((d) => String(d.name || '').trim()).filter(Boolean);
} catch (error) {
  orgDepts = [`ERROR: ${error instanceof Error ? error.message : String(error)}`];
}

console.log(JSON.stringify({
  lookupDeptCount: lookups.departments.length,
  lookupDepartments: lookups.departments,
  lookupHasSecurity: lookups.departments.some((d) => /security/i.test(d)),
  orgDeptCount: orgDepts.length,
  orgDepartments: orgDepts,
  orgHasSecurity: orgDepts.some((d) => /security/i.test(d)),
}, null, 2));
