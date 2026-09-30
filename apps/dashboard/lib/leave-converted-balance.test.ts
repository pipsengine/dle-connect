import assert from 'node:assert/strict';
import { contractToPermanentPair, validateLeaveAction, type LeavePayload } from './leave-management-store';

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

const leavePayload = (manualAnnualEntitlement: number | null): LeavePayload => ({
  balances: [{
    employeeId: 'P0465',
    fullName: 'Miss ABE OLUFUNKE COMFORT',
    department: 'HR',
    leaveType: 'Annual Leave',
    currentBalance: 20,
    accruedBalance: 20,
    usedBalance: 0,
    pendingBalance: 0,
    forfeitedBalance: 0,
    carryForwardBalance: 0,
    liabilityValue: 0,
    status: 'Healthy',
    exceptions: [],
    manualAnnualEntitlement,
  }],
  applications: [],
  summary: { pendingApplications: 0, pendingApprovals: 0 },
} as LeavePayload);

const applyBody = {
  employeeId: 'P0465',
  employeeCode: 'P0465',
  employeeCategory: 'Permanent',
  leaveType: 'Annual Leave',
  days: 5,
  confirmed: false,
  availableBalance: 20,
};
assert.equal(validateLeaveAction('apply', 'Employee', leavePayload(20), applyBody).ok, true, 'HR-edited annual leave can be applied without confirmation');
assert.equal(validateLeaveAction('apply', 'Employee', leavePayload(null), applyBody).ok, false, 'unconfirmed staff without an HR leave edit stay locked');

assert.equal(contractToPermanentPair('P0100', 'Sage payroll employee import', 'Imported'), null);
assert.equal(contractToPermanentPair('L2792', 'Manual employee_code rename', 'Renamed AGAH BASSEY from L2793 to L2792'), null);

console.log('leave-converted-balance.test.ts OK');
