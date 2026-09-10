import assert from 'node:assert/strict';
import {
  canonicalProjectManagerForCode,
  withCanonicalProjectManager,
} from './timesheet-canonical-project-managers.ts';

assert.equal(canonicalProjectManagerForCode('DL0062'), 'P0442 - Mrs TEMITOPE ABIODUN ODULATE');
assert.equal(canonicalProjectManagerForCode('dl0062'), 'P0442 - Mrs TEMITOPE ABIODUN ODULATE');
assert.equal(canonicalProjectManagerForCode('DL9999'), '');

assert.equal(
  withCanonicalProjectManager({ code: 'DL0062', projectManager: '' }).projectManager,
  'P0442 - Mrs TEMITOPE ABIODUN ODULATE',
);
assert.equal(
  withCanonicalProjectManager({ code: 'DL0062', projectManager: 'Someone Else' }).projectManager,
  'P0442 - Mrs TEMITOPE ABIODUN ODULATE',
);
assert.equal(
  withCanonicalProjectManager({ code: 'DL1985', projectManager: 'PM One' }).projectManager,
  'PM One',
);

console.log('timesheet-canonical-project-managers.test.ts: ok');
