/**
 * Daily birthday / anniversary honoree matching and email copy.
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/celebration-moments.test.ts
 */
import assert from 'node:assert/strict';
import {
  celebrationEmailIntro,
  celebrationEmailSubject,
  celebrationWishPortalPath,
  findCelebrationMoment,
  listTodaysCelebrationMoments,
  prettyPersonName,
} from './celebration-moments.ts';
import { remainingCelebrationRecipients, type CelebrationSendLedger } from './celebration-wish-store.ts';
import { buildFallbackCelebrationCopy } from './celebration-copy.ts';
import { buildCelebrationEmail } from './celebration-email.ts';

const people = [
  {
    employeeId: '1',
    employeeCode: 'P100',
    fullName: 'Ada Okonkwo',
    firstName: 'Ada',
    department: 'Finance',
    status: 'Active',
    dateOfBirth: '1990-09-17',
    dateJoined: '2018-03-01',
    hasPhoto: true,
  },
  {
    employeeId: '2',
    employeeCode: 'L200',
    fullName: 'Ben Musa',
    firstName: 'Ben',
    department: 'Operations',
    status: 'Active',
    dateOfBirth: '1988-01-02',
    dateJoined: '2021-09-17',
    hasPhoto: false,
  },
  {
    employeeId: '3',
    employeeCode: 'C300',
    fullName: 'Chioma Bello',
    firstName: 'Chioma',
    department: 'HR',
    status: 'Terminated',
    dateOfBirth: '1992-09-17',
    dateJoined: '2015-09-17',
    hasPhoto: true,
  },
  {
    employeeId: '4',
    employeeCode: 'IT9',
    fullName: 'Ife Newhire',
    firstName: 'Ife',
    department: 'IT',
    status: 'Active',
    dateOfBirth: '1999-04-04',
    dateJoined: '2026-09-17',
    hasPhoto: false,
  },
];

const today = '2026-09-17';
const moments = listTodaysCelebrationMoments(people, today);
assert.equal(moments.length, 2);
assert.equal(moments[0].kind, 'anniversary');
assert.equal(moments[0].employeeCode, 'L200');
assert.equal(moments[0].years, 5);
assert.equal(moments[1].kind, 'birthday');
assert.equal(moments[1].employeeCode, 'P100');
assert.equal(moments.some((item) => item.employeeCode === 'C300'), false);
assert.equal(moments.some((item) => item.employeeCode === 'IT9'), false);

assert.equal(celebrationEmailSubject([moments[1]], people[0]), 'Happy Birthday, Ada');
assert.match(celebrationEmailSubject([moments[0]], people[1]), /Happy Work Anniversary, Ben/);
assert.match(celebrationEmailSubject(moments, people[3]), /Birthdays and work anniversaries/);
assert.match(celebrationEmailIntro([moments[1]], people[2]), /Ada Okonkwo/);
assert.match(celebrationWishPortalPath({ employeeCode: 'P100', kind: 'birthday', date: today }), /celebrate=P100/);
assert.equal(findCelebrationMoment(moments, 'p100', 'birthday')?.fullName, 'Ada Okonkwo');

const ledger: CelebrationSendLedger = {
  date: today,
  honoreeKeys: ['birthday:P100'],
  recipientEmailsSent: ['ada@example.com'],
  sentCount: 1,
  failedCount: 0,
};
assert.deepEqual(
  remainingCelebrationRecipients(ledger, ['ada@example.com', 'ben@example.com']),
  ['ben@example.com'],
);

assert.equal(prettyPersonName('CHINAECHEREM STEPHEN-EHIRIM'), 'Chinaecherem Stephen-Ehirim');

const copy = buildFallbackCelebrationCopy(moments);
assert.match(copy.byKey['birthday:P100'].colleagueMessage, /Ada/);
assert.match(copy.byKey['anniversary:L200'].colleagueMessage, /Ben/);
assert.match(copy.byKey['anniversary:L200'].colleagueMessage, /5/);

const mail = buildCelebrationEmail({
  moments,
  recipient: people[3],
  recipientName: 'Ife',
  baseUrl: 'https://dleconnect.dormanlongeng.com:1432',
  photoCids: ['celeb-photo-P100'],
  copy,
});
assert.match(mail.subject, /Birthdays and work anniversaries/);
assert.match(mail.html, /cid:celeb-photo-P100/);
assert.match(mail.html, /celebrate=P100/);
assert.match(mail.html, /Send a birthday wish/);
assert.match(mail.html, /Send an anniversary wish/);
assert.match(mail.html, /Happy Birthday, Ada/);
assert.match(mail.html, /Year/);
assert.match(mail.text, /Hello Ife/);
assert.equal(mail.html.includes('Open the workforce portal to send a wish'), false);
assert.equal(mail.html.includes('Send a wish in DLE Connect'), false);

console.log('celebration-moments.test.ts ok');
