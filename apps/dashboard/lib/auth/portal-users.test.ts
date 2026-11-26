import assert from 'node:assert/strict';
import { isPortalVisitorRole, nextPortalUsername, portalVisitorPathAllowed } from './portal-users.ts';

assert.equal(nextPortalUsername([]), 'DL-0001');
assert.equal(nextPortalUsername(['P0442', 'dl-0007', 'DL-0003']), 'DL-0008');
assert.equal(nextPortalUsername(['DL-0001', 'DL-0002']), 'DL-0003');
assert.equal(nextPortalUsername(['DL-9999']), 'DL-10000');
assert.equal(isPortalVisitorRole('Visitor Reception'), true);
assert.equal(isPortalVisitorRole('Employee'), false);
assert.equal(portalVisitorPathAllowed('/security/visitor-management/dashboard'), true);
assert.equal(portalVisitorPathAllowed('/hris/employees'), false);
assert.equal(portalVisitorPathAllowed('/api/security/visitors'), true);
assert.equal(portalVisitorPathAllowed('/api/hris/payroll'), false);

console.log('portal-users tests passed');
