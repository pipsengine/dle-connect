import assert from 'node:assert/strict';
import { mobilizationBelongsOnSheet } from './timesheet-mobilization-sheet.ts';

assert.equal(mobilizationBelongsOnSheet('Mr OWOLOJA AKANDE', 'Mr OWOLOJA AKANDE', 'P0072'), true);
assert.equal(mobilizationBelongsOnSheet('Mr OWOLOJA AKANDE', 'OWOLOJA AKANDE', 'P0072'), true);
assert.equal(mobilizationBelongsOnSheet('BELLO FEMI', 'BELLO FEMI', 'C0585'), true);
assert.equal(mobilizationBelongsOnSheet('MOMOH MOHAMMED', 'MOMOH MOHAMMED', 'C1882'), true);
assert.equal(mobilizationBelongsOnSheet('P0072 - Mr AKANDE', 'OWOLOJA AKANDE', 'P0072'), true);

assert.equal(mobilizationBelongsOnSheet('Mr OWOLOJA AKANDE', 'MOMOH MOHAMMED', 'C1882'), false);
assert.equal(mobilizationBelongsOnSheet('BELLO FEMI', 'MOMOH MOHAMMED', 'C1882'), false);
assert.equal(mobilizationBelongsOnSheet('MOMOH MOHAMMED', 'Mrs TEMITOPE ABIODUN ODULATE', 'P0442'), false);
assert.equal(mobilizationBelongsOnSheet('MOHAMMED IBRAHIM', 'MOMOH MOHAMMED', 'C1882'), false);

console.log('timesheet-mobilization-sheet.test.ts: ok');
