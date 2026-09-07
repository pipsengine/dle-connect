import assert from 'node:assert/strict';
import {
  defaultPasswordFromSurname,
  passwordVerifyCandidates,
} from './auth-store.ts';

assert.equal(defaultPasswordFromSurname('Kalu Eke'), 'KALUEKE', 'strips spaces and uppercases');
assert.equal(defaultPasswordFromSurname('KALU  EKE'), 'KALUEKE', 'strips repeated spaces');
assert.equal(defaultPasswordFromSurname('  Eke  '), 'EKE', 'trims edges and uppercases');
assert.equal(defaultPasswordFromSurname('', 'P0051'), 'P0051', 'falls back to username uppercased');
assert.equal(defaultPasswordFromSurname('', 'p0051'), 'P0051', 'uppercases fallback codes');

assert.deepEqual(
  passwordVerifyCandidates('Kalu Eke'),
  ['Kalu Eke', 'KALU EKE', 'KaluEke', 'KALUEKE'],
  'login accepts spaced, compact, and CAPS forms',
);
assert.deepEqual(
  passwordVerifyCandidates('  Kalu   Eke  '),
  [
    '  Kalu   Eke  ',
    '  KALU   EKE  ',
    'Kalu   Eke',
    'KALU   EKE',
    'Kalu Eke',
    'KALU EKE',
    'KaluEke',
    'KALUEKE',
  ],
  'login normalizes messy spacing and case',
);

console.log('auth-default-password.test.ts: ok');
