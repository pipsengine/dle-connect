import {strict as assert} from 'node:assert';
import {reconcileDay,uniqueWorkedDays} from '../src/services/reconciliationEngine.js';
import {classifyWorkDate} from '../src/services/classificationEngine.js';
assert.equal(reconcileDay({expected:8,attendance:8,regular:8}).status,'Balanced');
assert.equal(reconcileDay({expected:8,attendance:8,regular:6}).unallocated,2);
assert.equal(uniqueWorkedDays([{workDate:'2026-09-25',regular:8},{workDate:'2026-09-25',night:6}]),1);
assert.equal(classifyWorkDate('2026-09-26'),'Saturday');
assert.equal(classifyWorkDate('2026-09-27'),'Sunday');
console.log('domain tests passed');
