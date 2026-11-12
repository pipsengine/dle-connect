import { readEmployeeDirectoryFromDb } from '../apps/dashboard/lib/dle-enterprise-db.ts';
import { readUsers } from '../apps/dashboard/lib/auth/auth-store.ts';

const rows = (await readEmployeeDirectoryFromDb()) || [];
const hits = rows.filter((e) => /chinwe/i.test(String(e.fullName || '')) && /iloh/i.test(String(e.fullName || '')));
console.log('DIR', hits.length);
for (const e of hits) {
  console.log(JSON.stringify({
    code: e.employeeCode || e.employeeId,
    name: e.fullName,
    title: e.jobTitle || e.designation,
    dept: e.department,
  }));
}

const users = await readUsers();
const authHits = users.filter((u) => /chinwe/i.test(String(u.fullName || '')) || /iloh/i.test(String(u.fullName || u.username || '')));
console.log('AUTH', authHits.length);
for (const u of authHits) {
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
