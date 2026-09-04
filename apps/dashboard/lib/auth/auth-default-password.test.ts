import assert from 'node:assert/strict';
import {
  defaultPasswordFromSurname,
  passwordVerifyCandidates,
} from './auth-store.ts';

assert.equal(defaultPasswordFromSurname('Kalu Eke'), 'KaluEke', 'strips single space');
assert.equal(defaultPasswordFromSurname('KALU  EKE'), 'KALUEKE', 'strips repeated spaces');
assert.equal(defaultPasswordFromSurname('  Eke  '), 'Eke', 'trims edges');
assert.equal(defaultPasswordFromSurname('', 'P0051'), 'P0051', 'falls back to username');

assert.deepEqual(
  passwordVerifyCandidates('Kalu Eke'),
  ['Kalu Eke', 'KaluEke'],
  'login accepts spaced and compact forms',
);
assert.deepEqual(
  passwordVerifyCandidates('  Kalu   Eke  '),
  ['  Kalu   Eke  ', 'Kalu   Eke', 'Kalu Eke', 'KaluEke'],
  'login normalizes messy spacing',
);

console.log('auth-default-password.test.ts: ok');
