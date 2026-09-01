/**
 * Assign auth roles to a portal account and sync to DLE_Enterprise security.AuthUsers.
 * Usage: npx tsx scripts/assign-user-roles.mts P0432 "HR Administrator"
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

const code = String(process.argv[2] || '').trim().toUpperCase();
const roles = process.argv.slice(3).map((item) => String(item || '').trim()).filter(Boolean);
if (!code || !roles.length) {
  console.error('Usage: npx tsx scripts/assign-user-roles.mts <employeeCode> <role> [role...]');
  process.exit(1);
}

const { readUsers, updateUser } = await import('../lib/auth/auth-store.ts');

const headers = new Headers({ 'user-agent': 'assign-user-roles', 'x-forwarded-for': '127.0.0.1' });
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

const updated = await updateUser(user.id, 'assign-roles', { roles }, headers, 'System Repair', actor);

console.log(JSON.stringify({
  ok: true,
  code,
  fullName: updated.fullName,
  roles: updated.roles,
  permissionCount: updated.permissions.length,
}, null, 2));

process.exit(0);
