import assert from 'node:assert/strict';
import { contractToPermanentPair } from './leave-management-store';

const fromArchive = contractToPermanentPair(
  'L2770',
  'Archive inactive lumpsum after permanent conversion',
  'L2770 inactivated; live identity is P0467',
);
assert.deepEqual(fromArchive, { permanentCode: 'P0467', priorCode: 'L2770' });

const fromConfirm = contractToPermanentPair(
  'P0467',
  'Confirm permanent payroll identity after L2770 archive',
  'P0467 remains Active Permanent with payroll assignment',
);
assert.deepEqual(fromConfirm, { permanentCode: 'P0467', priorCode: 'L2770' });

const fromNote = contractToPermanentPair(
  'L2770',
  'Payslip identity',
  'Archive inactive lumpsum L2770 after conversion to P0467',
);
assert.deepEqual(fromNote, { permanentCode: 'P0467', priorCode: 'L2770' });

assert.equal(contractToPermanentPair('P0100', 'Sage payroll employee import', 'Imported'), null);
assert.equal(contractToPermanentPair('L2792', 'Manual employee_code rename', 'Renamed AGAH BASSEY from L2793 to L2792'), null);

console.log('leave-converted-balance.test.ts OK');
