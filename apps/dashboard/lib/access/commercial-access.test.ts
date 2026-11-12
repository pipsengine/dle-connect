import assert from 'node:assert/strict';
import {
  canAccessTenderPortal,
  canActAsGmCommercial,
  canActAsManagingDirector,
  canActAsProposalReviewer,
  isBusinessGmCommercial,
  isBusinessManagingDirector,
  isBusinessProposalReviewer,
  isGmCommercial,
  isManagingDirector,
} from './commercial-access.ts';

assert.equal(canAccessTenderPortal({ department: 'IT', roles: ['Employee'] }), true);
assert.equal(canAccessTenderPortal({ department: 'Proposal', roles: [] }), true);
assert.equal(canAccessTenderPortal({ department: 'Sales', roles: [] }), true);
assert.equal(canAccessTenderPortal({ department: 'Corporate Services', roles: [] }), true);
assert.equal(canAccessTenderPortal({ department: 'Finance', roles: ['CFO'] }), true);
assert.equal(canAccessTenderPortal({ department: 'Operations', roles: ['GM Operations'] }), true);
assert.equal(canAccessTenderPortal({ department: 'Executive', roles: ['Managing Director'] }), true);
assert.equal(canAccessTenderPortal({ department: 'Production', roles: ['Executive Director'] }), true);
assert.equal(canAccessTenderPortal({ department: 'Production', employeeCode: 'P0413', roles: ['Employee'] }), true);
assert.equal(canAccessTenderPortal({ department: 'Commercial', roles: ['GM Commercial'] }), true);
assert.equal(canAccessTenderPortal({ isGlobalAdmin: true, department: 'Production', roles: [] }), true);
assert.equal(canAccessTenderPortal({ roles: ['Super Administrator'], department: 'Production' }), true);
assert.equal(canAccessTenderPortal({ department: 'Production', roles: ['Employee'] }), false);
assert.equal(canAccessTenderPortal({ department: 'Finance', roles: ['Accountant'] }), false);

assert.equal(isBusinessManagingDirector(['Executive Director']), true);
assert.equal(isBusinessManagingDirector(['Executive Management']), true);
assert.equal(isBusinessManagingDirector(['Managing Director']), true);
assert.equal(isBusinessManagingDirector({ roles: ['Employee'], employeeCode: 'P0413' }), true);
assert.equal(isBusinessManagingDirector(['Employee']), false);
assert.equal(isBusinessManagingDirector(['Super Administrator']), false);

assert.equal(isManagingDirector(['Executive Director']), true);
assert.equal(isManagingDirector({ roles: ['Employee'], employeeCode: 'P0413' }), true);
assert.equal(isManagingDirector(['Employee'], true), true);

assert.equal(isBusinessGmCommercial(['GM Commercial']), true);
assert.equal(isBusinessGmCommercial(['General Manager Commercial']), true);
assert.equal(isBusinessGmCommercial(['Manager']), false);
assert.equal(isBusinessGmCommercial(['Super Administrator']), false);
assert.equal(isBusinessGmCommercial({ roles: ['Employee'], jobTitle: 'GM Commercial' }), true);
assert.equal(isBusinessGmCommercial({ roles: ['Employee'], jobTitle: 'General Manager', department: 'Commercial' }), true);
assert.equal(isBusinessGmCommercial({ roles: ['Employee'], employeeCode: 'P0463' }), true);
assert.equal(canActAsGmCommercial({ roles: ['Employee'], jobTitle: 'General Manager', department: 'Commercial' }), true);
assert.equal(canActAsGmCommercial({ roles: ['Employee'], employeeCode: 'P0463' }), true);
assert.equal(isGmCommercial(['GM Commercial']), true);
assert.equal(isGmCommercial(['Employee'], true), true);
assert.equal(isGmCommercial(['Super Administrator']), true);
assert.equal(isManagingDirector(['Super Administrator']), true);

assert.equal(isBusinessProposalReviewer({ employeeCode: 'P0051', roles: ['Employee'] }), true);
assert.equal(isBusinessProposalReviewer({ username: 'P0051', roles: [] }), true);
assert.equal(isBusinessProposalReviewer({ roles: ['Proposal', 'Manager'] }), false);
assert.equal(isBusinessProposalReviewer({ employeeCode: 'P0413', roles: ['Executive Director'] }), false);

assert.equal(canActAsGmCommercial({ isGlobalAdmin: true, roles: [] }), true);
assert.equal(canActAsGmCommercial({ roles: ['Super Administrator'] }), true);
assert.equal(canActAsManagingDirector({ isGlobalAdmin: true, roles: ['Employee'] }), true);
assert.equal(canActAsProposalReviewer({ roles: ['Super Administrator'] }), true);
assert.equal(canActAsProposalReviewer({ employeeCode: 'P0051', roles: ['Employee'] }), true);
assert.equal(canActAsGmCommercial({ roles: ['Employee'] }), false);

console.log('tender portal access passed');
