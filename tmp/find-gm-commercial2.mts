import { readEmployeeDirectoryFromDb } from '../apps/dashboard/lib/dle-enterprise-db.ts';
import { readUsers } from '../apps/dashboard/lib/auth/auth-store.ts';

const rows = (await readEmployeeDirectoryFromDb()) || [];
const managers = rows.filter((e) => /general\s*manager|\bgm\b|commercial|proposal|sales/i.test(`${e.jobTitle || ''} ${e.designation || ''} ${e.department || ''}`));
console.log('BROAD_HITS', managers.length);
for (const e of managers) {
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

const users = await readUsers();
const gmUsers = users.filter((u) =>
  (u.roles || []).some((r) => /gm\s*commercial|general\s*manager.*commercial/i.test(String(r)))
  || /gm\s*commercial|general\s*manager.*commercial/i.test(String(u.jobTitle || ''))
);
console.log('AUTH_GM_USERS', gmUsers.length);
for (const u of gmUsers) {
  console.log(JSON.stringify({
    id: u.id,
    username: u.username,
    name: u.fullName,
    code: u.employeeCode,
    title: u.jobTitle,
    dept: u.department,
    roles: u.roles,
  }));
}

const mcUsers = users.filter((u) => {
  const parts = String(u.fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return false;
  const ini = `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return ini === 'MC' || String(u.username || '').toUpperCase() === 'MC';
});
console.log('AUTH_MC_USERS', mcUsers.length);
for (const u of mcUsers) {
  console.log(JSON.stringify({
    id: u.id,
    username: u.username,
    name: u.fullName,
    code: u.employeeCode,
    title: u.jobTitle,
    dept: u.department,
    roles: u.roles,
  }));
}
