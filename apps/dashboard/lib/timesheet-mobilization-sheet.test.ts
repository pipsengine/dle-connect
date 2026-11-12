import assert from 'node:assert/strict';
import {
  bookedOffshoreLinesForSheet,
  keepMobilizedLineOnSheet,
  isMobilizedOffshoreEmployee,
  mobilizationBelongsOnSheet,
  mobilizationRosterSite,
  mobilizedEmployeeCodes,
  offshoreMobilizationsForSheet,
} from './timesheet-mobilization-sheet.ts';

assert.equal(mobilizationBelongsOnSheet('Mr OWOLOJA AKANDE', 'Mr OWOLOJA AKANDE', 'P0072'), true);
assert.equal(mobilizationBelongsOnSheet('Mr OWOLOJA AKANDE', 'OWOLOJA AKANDE', 'P0072'), true);
assert.equal(mobilizationBelongsOnSheet('BELLO FEMI', 'BELLO FEMI', 'C0585'), true);
assert.equal(mobilizationBelongsOnSheet('MOMOH MOHAMMED', 'MOMOH MOHAMMED', 'C1882'), true);
assert.equal(mobilizationBelongsOnSheet('P0072 - Mr AKANDE', 'OWOLOJA AKANDE', 'P0072'), true);

assert.equal(mobilizationBelongsOnSheet('Mr OWOLOJA AKANDE', 'MOMOH MOHAMMED', 'C1882'), false);
assert.equal(mobilizationBelongsOnSheet('BELLO FEMI', 'MOMOH MOHAMMED', 'C1882'), false);
assert.equal(mobilizationBelongsOnSheet('MOMOH MOHAMMED', 'Mrs TEMITOPE ABIODUN ODULATE', 'P0442'), false);
assert.equal(mobilizationBelongsOnSheet('MOHAMMED IBRAHIM', 'MOMOH MOHAMMED', 'C1882'), false);

const offshoreCrew = [
  { employeeCode: 'C2001', employeeName: 'Adewale Adekoya', site: 'OFFSHORE', supervisor: 'OWOLOJA AKANDE' },
  { employeeCode: 'C2002', employeeName: 'Abraham', site: 'OFFSHORE', supervisor: 'MOMOH MOHAMMED' },
  { employeeCode: 'C2003', employeeName: 'Welder on another crew', site: 'OFFSHORE', supervisor: 'BELLO FEMI' },
];
const mobilizedCodes = mobilizedEmployeeCodes(offshoreCrew);
assert.equal(isMobilizedOffshoreEmployee('C2001', mobilizedCodes), true);
assert.equal(isMobilizedOffshoreEmployee('c2002', mobilizedCodes), true);
assert.equal(isMobilizedOffshoreEmployee('C1882', mobilizedCodes), false, 'home crew who are not mobilized stay on the yard');

const momohOffshore = offshoreMobilizationsForSheet(offshoreCrew, 'OFFSHORE', 'MOMOH MOHAMMED', 'C1882');
assert.deepEqual(momohOffshore.map((row) => row.employeeCode), ['C2002'], 'Momoh keeps only people hosted to him offshore');
assert.deepEqual(
  offshoreMobilizationsForSheet(offshoreCrew, 'IDI-ORO', 'MOMOH MOHAMMED', 'C1882'),
  [],
  'a yard location does not list the offshore mobilization',
);
assert.deepEqual(
  offshoreMobilizationsForSheet(offshoreCrew, 'OFFSHORE', 'OWOLOJA AKANDE', 'P0072').map((row) => row.employeeCode),
  ['C2001'],
);

assert.equal(mobilizationRosterSite('IDI_ORO'), 'OFFSHORE', 'a yard site on a mobilization sits on the offshore sheet');
assert.equal(mobilizationRosterSite('IDI - IDI_ORO'), 'OFFSHORE');
assert.equal(mobilizationRosterSite('OFFSHORE'), 'OFFSHORE');
assert.equal(mobilizationRosterSite('BONGA'), 'BONGA');

const henryOnYardSite = [
  { employeeCode: 'C2725', employeeName: 'Henry Audu Amodu', site: 'IDI_ORO', supervisor: 'Mr KOLAWOLE OJO OLOKO' },
  { employeeCode: 'C2456', employeeName: 'Ogah Imoni', site: 'OFFSHORE', supervisor: 'Mr KOLAWOLE OJO OLOKO' },
];
assert.deepEqual(
  offshoreMobilizationsForSheet(henryOnYardSite, 'OFFSHORE', 'Mr KOLAWOLE OJO OLOKO', 'P0045').map((row) => row.employeeCode),
  ['C2725', 'C2456'],
  'Henry saved against IDI_ORO still sits with Oloko on OFFSHORE',
);
assert.deepEqual(
  offshoreMobilizationsForSheet(henryOnYardSite, 'IDI_ORO', 'Mr KOLAWOLE OJO OLOKO', 'P0045'),
  [],
  'the yard location does not become his offshore sheet',
);

const karonwiLines = [
  { employeeCode: 'C1544', employeeName: 'Adeniyi Joseph', location: 'OFFSHORE' },
  { employeeCode: 'C2647', employeeName: 'Adeyemi Adeshina', location: 'OFFSHORE' },
  { employeeCode: 'C2663', employeeName: 'Jeremiah David', location: 'OFFSHORE' },
  { employeeCode: 'C2225', employeeName: 'Abel Daniel', location: 'AGEGE' },
  { employeeCode: 'C1720', employeeName: 'Adanou Raymond', location: 'OFFSHORE' },
];
const karonwiMobilized = new Set(['C1544', 'C1686', 'C1229', 'C1720', 'C2647']);
const hostedByKaronwi = (code: string) => ['C1544', 'C1686', 'C1229'].includes(code.toUpperCase());
assert.deepEqual(
  bookedOffshoreLinesForSheet(karonwiLines, 'OFFSHORE').map((row) => row.employeeCode),
  ['C1544', 'C2647', 'C2663', 'C1720'],
  'Karonwi keeps everyone already booked on his offshore sheet, including a foreman mobilization',
);
assert.equal(keepMobilizedLineOnSheet(karonwiLines[1], karonwiMobilized, hostedByKaronwi), true, 'a booked offshore line is saved with the sheet');
assert.equal(keepMobilizedLineOnSheet({ employeeCode: 'C1720', location: 'AGEGE' }, karonwiMobilized, hostedByKaronwi), false, 'a yard line mobilized to someone else is not kept');

console.log('timesheet-mobilization-sheet.test.ts: ok');
