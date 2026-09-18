import assert from 'node:assert/strict';
import { canAccessCrewMobilization, canAccessHrisPath } from './route-access.ts';
import { cookieSafeExtraPermissions, resolveAccessPermissions } from '../auth/resolve-access-session.ts';
import { hasPermission } from '../auth/permission-match.ts';

const supervisor = {
  roles: ['Supervisor', 'Employee'],
  department: 'PRODUCTION',
  unit: 'DLE',
  isGlobalAdmin: false,
};

const denied = { ...supervisor, permissions: ['hris.view', 'operations.timesheets.submit'] };
assert.equal(canAccessCrewMobilization(denied), false);
assert.equal(canAccessHrisPath(denied, '/hris/workforce-management/crew-mobilization'), false);

const granted = { ...supervisor, permissions: ['page.hris.time-and-logs.crew-mobilization.view'] };
assert.equal(canAccessCrewMobilization(granted), true);
assert.equal(canAccessHrisPath(granted, '/hris/workforce-management/crew-mobilization'), true);
assert.equal(canAccessHrisPath(granted, '/hris/time-and-logs/crew-mobilization'), true);

assert.equal(
  hasPermission(['page.hris.time-and-logs.crew-mobilization'], 'page.hris.time-and-logs.crew-mobilization.view'),
  true,
);
assert.equal(
  canAccessCrewMobilization({ ...supervisor, permissions: ['page.hris.time-and-logs.crew-mobilization'] }),
  true,
);

const hr = {
  roles: ['HR Officer'],
  department: 'HUMAN RESOURCES',
  unit: 'HR',
  permissions: ['hris.view'],
  isGlobalAdmin: false,
};
assert.equal(canAccessCrewMobilization(hr), true);
assert.equal(canAccessHrisPath(hr, '/hris/workforce-management/crew-mobilization'), true);

const extras = cookieSafeExtraPermissions(
  supervisor.roles,
  ['hris.view', 'operations.timesheets.submit', 'page.hris.time-and-logs.crew-mobilization.view'],
);
assert.ok(extras.includes('page.hris.time-and-logs.crew-mobilization.view'));
const resolved = resolveAccessPermissions({ roles: supervisor.roles, permissions: extras });
assert.ok(resolved.includes('page.hris.time-and-logs.crew-mobilization.view'));
assert.ok(resolved.includes('operations.timesheets.submit'));

console.log('crew-mobilization-access.test.ts: ok');
