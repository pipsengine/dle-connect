/**
 * Repair a portal account (unlock, roles, password reset to surname).
 * Usage: npx tsx scripts/fix-user-account.mts NYSC0032
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const envPath of [path.join(__dirname, '..', '.env.local'), path.join(__dirname, '..', '.env')]) {
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim().replace(/^"|"$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

const code = String(process.argv[2] || 'NYSC0032').trim().toUpperCase();
const { readUsers, updateUser } = await import('../lib/auth/auth-store.ts');

const headers = new Headers({ 'user-agent': 'fix-user-account', 'x-forwarded-for': '127.0.0.1' });
const actor = {
  sub: 'global-admin',
  username: 'Admin',
  fullName: 'System Repair',
  roles: ['Super Administrator'],
  isGlobalAdmin: true,
};

const users = await readUsers();
const user = users.find((item) =>
  [item.username, item.employeeCode, item.employeeId].some((value) => String(value || '').toUpperCase() === code),
);

if (!user) {
  console.error(JSON.stringify({ ok: false, error: `User ${code} not found` }));
  process.exit(1);
}

const nextRoles = ['Supervisor', 'Employee', 'IT Support Officer'];

if (user.status === 'Locked') {
  await updateUser(user.id, 'unlock', {}, headers, 'System Repair', actor);
}
await updateUser(user.id, 'assign-roles', { roles: nextRoles }, headers, 'System Repair', actor);
const repaired = await updateUser(
  user.id,
  'recover-account',
  { resetPassword: true, clearPasswordFlags: false },
  headers,
  'System Repair',
  actor,
);

console.log(JSON.stringify({
  ok: true,
  code,
  fullName: repaired.fullName,
  roles: repaired.roles,
  status: repaired.status,
  passwordResetRequired: repaired.passwordResetRequired,
  loginHint: `Sign in with ${code} and surname (${user.surname}) — you will be prompted to set a new password.`,
}, null, 2));

process.exit(0);
