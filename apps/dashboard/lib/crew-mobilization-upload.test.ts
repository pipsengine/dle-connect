import assert from 'node:assert/strict';
import {
  extractEmployeeCodesFromText,
  matchCrewUploadCodes,
} from './crew-mobilization-upload.ts';

const csvCodes = extractEmployeeCodesFromText('Employee Code\nC2225\nP0425\nC1830\n');
assert.deepEqual(csvCodes, ['C2225', 'P0425', 'C1830'], 'CSV with header extracts codes');

const pasteCodes = extractEmployeeCodesFromText('C2225, P0425; C1830\tX9999');
assert.deepEqual(pasteCodes, ['C2225', 'P0425', 'C1830', 'X9999'], 'Paste supports mixed delimiters');

const match = matchCrewUploadCodes(
  ['C2225', 'c2225', 'P0425', 'MISSING1'],
  ['C2225', 'P0425', 'C1830'],
);
assert.deepEqual(match.matchedCodes, ['C2225', 'P0425'], 'Matched known codes case-insensitively');
assert.deepEqual(match.unmatchedCodes, ['MISSING1'], 'Reports unmatched codes');
assert.deepEqual(match.duplicateCodes, ['c2225'], 'Reports duplicate uploads');

console.log('crew-mobilization-upload.test.ts: ok');
