import { loadWorkspaceEnv } from '../../apps/dashboard/lib/dle-enterprise-db.ts';
import { invalidatePayrollEmployeeCache, readDirectoryEmployees } from '../../apps/dashboard/lib/payroll-employee-source.ts';

loadWorkspaceEnv();
invalidatePayrollEmployeeCache();

const main = async () => {
  const dir = await readDirectoryEmployees();
  const hits = (dir.employees || []).filter((e) => {
    const blob = [
      e.fullName, e.jobTitle, e.designation, e.employeeCode, e.officialEmail, e.email,
    ].map((v) => String(v || '').toUpperCase()).join(' ');
    return /EMESIANA|AGBOOLA|MANAGING DIRECTOR|\bMD\/?CEO\b|CHIEF EXECUTIVE/.test(blob);
  });
  console.log('hits', hits.length);
  for (const e of hits.slice(0, 30)) {
    console.log({
      code: e.employeeCode || e.employeeId,
      name: e.fullName,
      title: e.jobTitle || e.designation,
      email: e.officialEmail || e.email,
      loc: e.location || e.workLocation,
      dept: e.department,
    });
  }
};

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
