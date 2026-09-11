import assert from 'node:assert/strict';
import { isEmergencyUnlinkedGlobalAdmin } from './protected-global-admin.ts';

assert.equal(
  isEmergencyUnlinkedGlobalAdmin({
    isGlobalAdmin: true,
    sub: 'global-admin',
    username: 'Admin',
  }),
  true,
  'break-glass Admin is unlinked',
);

assert.equal(
  isEmergencyUnlinkedGlobalAdmin({
    isGlobalAdmin: true,
    sub: 'usr-P0146',
    username: 'P0146',
    employeeCode: 'P0146',
    employeeId: 'P0146',
  }),
  false,
  'P0146 Super Administrator stays a linked employee',
);

assert.equal(
  isEmergencyUnlinkedGlobalAdmin({
    isGlobalAdmin: false,
    username: 'Admin',
  }),
  false,
  'non-global Admin username is not treated as emergency admin',
);

console.log('protected-global-admin.test.ts: ok');
