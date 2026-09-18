import assert from 'node:assert/strict';
import {
  buildLocationRecordsFromPeople,
  canonicalOrganizationSiteName,
  categoryForSite,
  CORE_OPERATING_SITES,
  regionForSite,
  type OrganizationLocationPerson,
} from './organization-locations-store.ts';

assert.equal(canonicalOrganizationSiteName('AGEGE - AGEGE'), 'AGEGE');
assert.equal(canonicalOrganizationSiteName('Lagos - Idi Oro'), 'IDI-ORO');
assert.equal(canonicalOrganizationSiteName('IDI_ORO'), 'IDI-ORO');
assert.equal(canonicalOrganizationSiteName('NND'), 'IDI-ORO');
assert.equal(canonicalOrganizationSiteName('OFFSHORE'), 'OFFSHORE');
assert.equal(canonicalOrganizationSiteName('Port Harcourt'), 'Port Harcourt');

assert.equal(regionForSite('AGEGE'), 'Lagos State');
assert.equal(regionForSite('IDI-ORO'), 'Lagos State');
assert.equal(regionForSite('OFFSHORE'), 'Offshore');
assert.equal(regionForSite('Port Harcourt'), 'Rivers State');
assert.equal(categoryForSite('AGEGE'), 'Yard');
assert.equal(categoryForSite('IDI-ORO'), 'Head Office');
assert.equal(categoryForSite('OFFSHORE'), 'Field Site');

const person = (
  employeeCode: string,
  locationName: string,
  extras: Partial<OrganizationLocationPerson> = {},
): OrganizationLocationPerson => ({
  employeeCode,
  fullName: extras.fullName || employeeCode,
  managerName: extras.managerName || 'Samuel Karonwi',
  managerCode: extras.managerCode || 'P0013',
  department: extras.department || 'Fabrication',
  jobTitle: extras.jobTitle || 'Welder',
  locationName,
  locationCode: extras.locationCode || locationName.toUpperCase().replace(/[^A-Z0-9]+/g, '-'),
  annualSalary: extras.annualSalary ?? 0,
  terminated: extras.terminated ?? false,
});

const records = buildLocationRecordsFromPeople(
  [
    person('C1001', 'AGEGE'),
    person('C1002', 'AGEGE - AGEGE', { managerName: '' }),
    person('P0201', 'Lagos - Idi Oro', { department: 'Administration' }),
    person('P0301', 'OFFSHORE', { department: 'Projects' }),
  ],
  [...CORE_OPERATING_SITES],
);

const sites = records.filter((record) => record.recordType === 'Site');
const locations = records.filter((record) => record.recordType === 'Location');
const agege = sites.find((site) => site.name === 'AGEGE');
const idiOro = sites.find((site) => site.name === 'IDI-ORO');
const offshore = sites.find((site) => site.name === 'OFFSHORE');

assert.ok(agege, 'AGEGE site must exist');
assert.ok(idiOro, 'IDI-ORO site must exist');
assert.ok(offshore, 'OFFSHORE site must exist');
assert.equal(agege.headcount, 2);
assert.equal(idiOro.headcount, 1);
assert.equal(offshore.headcount, 1);
assert.equal(agege.region, 'Lagos State');
assert.equal(idiOro.region, 'Lagos State');
assert.equal(offshore.region, 'Offshore');
assert.ok(locations.some((location) => location.name === 'Lagos State' && location.headcount === 3));
assert.ok(locations.some((location) => location.name === 'Offshore' && location.headcount === 1));

const catalogOnly = buildLocationRecordsFromPeople([], [...CORE_OPERATING_SITES]);
assert.ok(catalogOnly.some((record) => record.recordType === 'Site' && record.name === 'AGEGE'));
assert.ok(catalogOnly.some((record) => record.recordType === 'Site' && record.name === 'IDI-ORO'));
assert.ok(catalogOnly.some((record) => record.recordType === 'Site' && record.name === 'OFFSHORE'));

console.log('organization-locations-store tests passed');
