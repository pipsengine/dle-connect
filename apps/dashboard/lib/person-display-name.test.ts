import assert from 'node:assert/strict';
import {
  composePersonDisplayName,
  personGreetingName,
  sanitizePersonDisplayName,
} from './person-display-name.ts';

assert.equal(
  composePersonDisplayName({
    title: 'Mr',
    firstName: 'CHRISTIAN',
    middleName: 'ONUWABHAGBE',
    lastName: 'OGBAISI',
  }),
  'Mr. CHRISTIAN ONUWABHAGBE OGBAISI',
);

assert.equal(
  composePersonDisplayName({
    title: 'Mr',
    firstName: 'Mr ONUWABHAGBE',
    middleName: 'Mr ONUWABHAGBE CHRISTIAN',
    lastName: 'ONUWABHAGBE OGBAISI',
  }),
  'Mr. CHRISTIAN ONUWABHAGBE OGBAISI',
);

assert.equal(
  sanitizePersonDisplayName('Mr Mr ONUWABHAGBE Mr ONUWABHAGBE CHRISTIAN ONUWABHAGBE OGBAISI'),
  'Mr. CHRISTIAN ONUWABHAGBE OGBAISI',
);

assert.equal(
  sanitizePersonDisplayName('Mr ONUWABHAGBE CHRISTIAN ONUWABHAGBE OGBAISI'),
  'Mr. CHRISTIAN ONUWABHAGBE OGBAISI',
);

assert.equal(
  composePersonDisplayName({
    title: 'Mrs',
    firstName: 'Adaobi',
    lastName: 'Okonkwo',
  }),
  'Mrs. Adaobi Okonkwo',
);

assert.equal(
  composePersonDisplayName({
    title: 'Mr',
    firstName: 'CHRISTIAN ONUWABHAGBE',
    lastName: 'OGBAISI',
  }),
  'Mr. CHRISTIAN ONUWABHAGBE OGBAISI',
);

assert.equal(
  composePersonDisplayName({
    title: 'Mr',
    firstName: 'CHRISTIAN',
    lastName: 'ONUWABHAGBE OGBAISI',
  }),
  'Mr. CHRISTIAN ONUWABHAGBE OGBAISI',
);

assert.equal(
  composePersonDisplayName({ fallback: 'Jane Doe' }),
  'Jane Doe',
);

assert.equal(composePersonDisplayName({}), '');

assert.equal(
  personGreetingName({
    title: 'Mr',
    firstName: 'CHRISTIAN',
    middleName: 'ONUWABHAGBE',
    lastName: 'OGBAISI',
  }),
  'Christian',
);

assert.equal(
  personGreetingName({
    preferredName: 'Chris',
    firstName: 'CHRISTIAN',
    lastName: 'OGBAISI',
  }),
  'Chris',
);

assert.equal(
  personGreetingName({
    fullName: 'Mr Mr ONUWABHAGBE Mr ONUWABHAGBE CHRISTIAN ONUWABHAGBE OGBAISI',
  }),
  'Christian',
);

assert.equal(sanitizePersonDisplayName('Mr. CHRISTIAN OGBAISI'), 'Mr. CHRISTIAN OGBAISI');

console.log('person display name tests passed');
