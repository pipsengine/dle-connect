import { readEmployeeDirectoryFromDb } from '../apps/dashboard/lib/dle-enterprise-db.ts';

const rows = await readEmployeeDirectoryFromDb();
if (!rows) {
  console.log('NO_DB');
  process.exit(0);
}

const textOf = (e: any) =>
  [e.jobTitle, e.designation, e.department, e.unit, e.businessUnit].map((v) => String(v || '')).join(' ');

const gm = rows.filter((e) => {
  const t = textOf(e).toLowerCase();
  return /gm\s*commercial|general\s*manager.*commercial/.test(t)
    || (/\bcommercial\b/.test(t) && /general\s*manager|\bgm\b/.test(t));
});

console.log('GM_COUNT', gm.length);
for (const e of gm) {
  console.log(JSON.stringify({
    code: e.employeeCode || e.employeeId,
    name: e.fullName,
    title: e.jobTitle || e.designation,
    dept: e.department,
  }));
}

const commercial = rows.filter((e) => /commercial/i.test(`${e.department || ''} ${e.unit || ''} ${e.jobTitle || ''}`));
console.log('COMMERCIAL_RELATED', commercial.length);
for (const e of commercial) {
  const parts = String(e.fullName || '').trim().split(/\s+/).filter(Boolean);
  const ini = parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase() : '';
  console.log(JSON.stringify({
    code: e.employeeCode || e.employeeId,
    name: e.fullName,
    title: e.jobTitle || e.designation,
    dept: e.department,
    ini,
  }));
}

const mc = rows.filter((e) => {
  const parts = String(e.fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return false;
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase() === 'MC';
});
console.log('MC_INITIALS', mc.length);
for (const e of mc) {
  console.log(JSON.stringify({
    code: e.employeeCode || e.employeeId,
    name: e.fullName,
    title: e.jobTitle || e.designation,
    dept: e.department,
  }));
}
