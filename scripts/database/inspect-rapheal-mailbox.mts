import { loadWorkspaceEnv } from '../../apps/dashboard/lib/dle-enterprise-db.ts';
import { readDirectoryEmployees } from '../../apps/dashboard/lib/payroll-employee-source.ts';
import { resolveEmployeeMailbox } from '../../apps/dashboard/lib/mail-service.ts';
import { readUsers } from '../../apps/dashboard/lib/auth/auth-store.ts';

loadWorkspaceEnv();

const main = async () => {
  const dir = await readDirectoryEmployees();
  const hit = (dir.employees || []).filter((e) => {
    const code = String(e.employeeCode || e.employeeId || '').toUpperCase();
    const name = String(e.fullName || '').toUpperCase();
    return code === 'P0429' || (name.includes('IYANDA') && (name.includes('RAPHEAL') || name.includes('RAPHAEL')));
  });
  console.log('directory hits', hit.length);
  for (const e of hit.slice(0, 5)) {
    const mailbox = await resolveEmployeeMailbox(e);
    console.log({
      code: e.employeeCode,
      id: e.employeeId,
      name: e.fullName,
      officialEmail: e.officialEmail,
      email: e.email,
      personalEmail: e.personalEmail,
      mailbox,
      status: e.status,
      jobTitle: e.jobTitle,
    });
  }
  const users = await readUsers();
  const u = users.find((row) => String(row.employeeCode || '').toUpperCase() === 'P0429');
  console.log('auth user', u && {
    id: u.id,
    username: u.username,
    email: u.email,
    status: u.status,
    roles: u.roles,
    firstLoginRequired: u.firstLoginRequired,
  });
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
