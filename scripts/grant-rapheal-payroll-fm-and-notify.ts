/**
 * Grant Rapheal (P0429) Finance Manager for payroll FM approval and
 * resend Finance Manager approval emails for runs currently at HR Approved.
 *
 * Usage (from repo root):
 *   npx tsx scripts/grant-rapheal-payroll-fm-and-notify.ts
 */
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
for (const file of [
  path.join(repoRoot, 'apps', 'dashboard', '.env.local'),
  path.join(repoRoot, 'apps', 'dashboard', '.env'),
]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

async function main() {
  const { updateUser, readUsers } = await import('../apps/dashboard/lib/auth/auth-store.ts');
  const { permissionsForRoles } = await import('../apps/dashboard/lib/auth/rbac.ts');
  const { listPayrollRuns } = await import('../apps/dashboard/lib/payroll-run-store.ts');
  const { notifyPayrollApprovalStage, resolvePayrollApproverRecipients } = await import('../apps/dashboard/lib/payroll-approval-notification-service.ts');
  const { resolvePublicAppOrigin } = await import('../apps/dashboard/lib/public-app-url.ts');

  const users = await readUsers();
  const rapheal = users.find((user) =>
    String(user.employeeCode || user.username || '').toUpperCase() === 'P0429'
    || /iyanda/i.test(user.fullName || ''),
  );
  if (!rapheal) throw new Error('Rapheal P0429 not found in auth users.');

  const nextRoles = Array.from(new Set([...(rapheal.roles || []), 'Accountant', 'Finance Manager']));
  const headers = new Headers({ 'user-agent': 'dle-connect-ops-script', 'x-forwarded-for': '127.0.0.1' });
  const updated = await updateUser(
    rapheal.id,
    'assign-roles',
    { roles: nextRoles },
    headers,
    'System Ops',
    { sub: 'global-admin', username: 'Admin', isGlobalAdmin: true, roles: ['Super Administrator'] },
  );

  // Ensure account can sign in (Pending First Login was blocking useful access).
  if (updated.status !== 'Active' || updated.firstLoginRequired) {
    await updateUser(
      rapheal.id,
      'recover-account',
      { resetPassword: false, clearPasswordFlags: true },
      headers,
      'System Ops',
      { sub: 'global-admin', username: 'Admin', isGlobalAdmin: true, roles: ['Super Administrator'] },
    );
  }

  const refreshed = (await readUsers()).find((user) => user.id === rapheal.id);
  const expectedPerms = permissionsForRoles(nextRoles);
  console.log(JSON.stringify({
    user: {
      id: refreshed?.id,
      username: refreshed?.username,
      fullName: refreshed?.fullName,
      email: refreshed?.email,
      status: refreshed?.status,
      roles: refreshed?.roles,
      hasFinanceManager: refreshed?.roles?.includes('Finance Manager'),
      hasPayrollFinanceApprove: expectedPerms.includes('payroll.workflow.finance-review.approve')
        || (refreshed?.permissions || []).includes('payroll.workflow.finance-review.approve'),
    },
  }, null, 2));

  const fmRecipients = await resolvePayrollApproverRecipients('finance-manager');
  console.log('Finance Manager recipients:', fmRecipients.map((item) => ({
    name: item.fullName,
    email: item.email,
    roles: item.roles,
  })));

  const runs = await listPayrollRuns();
  const pendingFm = runs.filter((run) => run.status === 'HR Approved');
  console.log(`HR Approved runs awaiting FM: ${pendingFm.length}`);

  const baseUrl = resolvePublicAppOrigin() || process.env.DLE_PUBLIC_APP_URL || 'http://192.168.5.5:3020';
  const results = [];
  for (const run of pendingFm) {
    const result = await notifyPayrollApprovalStage({
      run,
      stageId: 'finance-manager',
      actor: 'System Ops (resend to acting Finance Manager)',
      baseUrl,
    });
    results.push({
      runId: run.id,
      period: run.period,
      pack: run.pack,
      periodLabel: run.periodLabel,
      notified: result.notified,
      emailed: result.emailed,
    });
  }
  console.log(JSON.stringify({ resent: results, baseUrl }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
