import assert from 'node:assert/strict';
import { displayEmployeeJobTitle, formatOrganizationJobTitleLabel } from './job-title-label.ts';
import { JobTitleInputError, normalizeJobTitleWrite } from './job-titles-store.ts';

const saved = normalizeJobTitleWrite({
  code: ' jcjt99 ',
  title: '  Senior   Fitter ',
  grade: 'JC_REM - JC REMUNERATION',
  family: 'technical',
  level: 'Senior',
  reportingLevel: 'Department',
  standardizationStatus: 'Standard',
  healthStatus: 'Healthy',
  openPositions: '2',
  jobPurpose: 'Lead fitting work.',
  keyResponsibilities: ['Fit assemblies', ' ', 'Report exceptions'],
});

assert.equal(saved.code, 'JCJT99');
assert.equal(saved.title, 'Senior Fitter');
assert.equal(saved.gradeCode, 'JC_REM - JC REMUNERATION');
assert.equal(saved.family, 'Technical');
assert.equal(saved.openPositions, 2);
assert.deepEqual(saved.keyResponsibilities, ['Fit assemblies', 'Report exceptions']);
assert.equal(saved.jobPurpose, 'Lead fitting work.');

const defaults = normalizeJobTitleWrite({ code: 'jt-1', title: 'Planner', grade: 'PRO' });
assert.equal(defaults.family, 'Professional');
assert.equal(defaults.level, 'Mid');
assert.equal(defaults.reportingLevel, 'Team');
assert.equal(defaults.healthStatus, 'Healthy');
assert.equal(defaults.benchmarkPosition, 'Planner');
assert.equal(defaults.keyResponsibilities.length > 0, true);

assert.throws(() => normalizeJobTitleWrite({ title: 'Planner', grade: 'PRO' }), JobTitleInputError);
assert.throws(() => normalizeJobTitleWrite({ code: 'JT-1', grade: 'PRO' }), JobTitleInputError);
assert.throws(() => normalizeJobTitleWrite({ code: 'JT-1', title: 'Planner' }), JobTitleInputError);
assert.throws(() => normalizeJobTitleWrite({ code: 'JT-1', title: 'Planner', grade: 'PRO', family: 'Casual' }), JobTitleInputError);
assert.throws(() => normalizeJobTitleWrite({ code: 'JT-1', title: 'Planner', grade: 'PRO', openPositions: -1 }), JobTitleInputError);
assert.throws(() => normalizeJobTitleWrite({ code: 'JT-1', title: 'Planner', grade: 'PRO', openPositions: 1.5 }), JobTitleInputError);

const review = normalizeJobTitleWrite({ code: 'JT-2', title: 'Helper', grade: 'OPS', standardizationStatus: 'Needs Review' });
assert.equal(review.healthStatus, 'Critical');

assert.equal(formatOrganizationJobTitleLabel('JCJT78', 'LEAD DESIGN ENGINEER'), 'JCJT78 - LEAD DESIGN ENGINEER');
assert.equal(formatOrganizationJobTitleLabel('JCJT78', 'JCJT78 - LEAD DESIGN ENGINEER'), 'JCJT78 - LEAD DESIGN ENGINEER');
assert.equal(formatOrganizationJobTitleLabel('JCJT78', 'JCJT78'), 'JCJT78');
assert.equal(displayEmployeeJobTitle('LEAD DESIGN ENGINEER', 'JCJT78'), 'JCJT78 - LEAD DESIGN ENGINEER');
assert.equal(displayEmployeeJobTitle('JCJT78 - LEAD DESIGN ENGINEER', 'JCJT78'), 'JCJT78 - LEAD DESIGN ENGINEER');
assert.equal(displayEmployeeJobTitle('-', 'JCJT78'), 'JCJT78');

console.log('job-titles-store tests passed');
