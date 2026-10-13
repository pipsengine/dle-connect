import assert from 'node:assert/strict';
import { canAccessTenderPortal } from './commercial-access.ts';

assert.equal(canAccessTenderPortal({ department: 'IT', roles: ['Employee'] }), true);
assert.equal(canAccessTenderPortal({ department: 'Proposal', roles: [] }), true);
assert.equal(canAccessTenderPortal({ department: 'Sales', roles: [] }), true);
assert.equal(canAccessTenderPortal({ department: 'Corporate Services', roles: [] }), true);
assert.equal(canAccessTenderPortal({ department: 'Finance', roles: ['CFO'] }), true);
assert.equal(canAccessTenderPortal({ department: 'Operations', roles: ['GM Operations'] }), true);
assert.equal(canAccessTenderPortal({ department: 'Executive', roles: ['Managing Director'] }), true);
assert.equal(canAccessTenderPortal({ department: 'Commercial', roles: ['GM Commercial'] }), true);
assert.equal(canAccessTenderPortal({ isGlobalAdmin: true, department: 'Production', roles: [] }), true);
assert.equal(canAccessTenderPortal({ roles: ['Super Administrator'], department: 'Production' }), true);
assert.equal(canAccessTenderPortal({ department: 'Production', roles: ['Employee'] }), false);
assert.equal(canAccessTenderPortal({ department: 'Finance', roles: ['Accountant'] }), false);

console.log('tender portal access passed');
