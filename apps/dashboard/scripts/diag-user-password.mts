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
const { readUsersStoreRaw, hashPassword } = await import('../lib/auth/auth-store.ts');

const verifyPassword = (password: string, hash: string, salt: string) =>
  hashPassword(password, salt).hash === hash;

const users = await readUsersStoreRaw();
const user = users.find((item) =>
  [item.username, item.employeeCode, item.employeeId].some((value) => String(value || '').toUpperCase() === code),
);

if (!user) {
  console.log(JSON.stringify({ found: false, code }, null, 2));
  process.exit(1);
}

const candidates = [
  user.surname,
  'OGBETAH',
  user.username,
  user.employeeCode,
  `${user.surname}@123`,
  'Password@123',
  'P@ssw0rd',
  'P@882w0rd',
];

const matches = candidates
  .filter(Boolean)
  .map((password) => ({
    password,
    ok: verifyPassword(String(password), user.passwordHash, user.passwordSalt),
  }));

console.log(JSON.stringify({
  found: true,
  id: user.id,
  username: user.username,
  fullName: user.fullName,
  status: user.status,
  roles: user.roles,
  firstLoginRequired: user.firstLoginRequired,
  passwordResetRequired: user.passwordResetRequired,
  failedAttempts: user.failedAttempts,
  lockedUntil: user.lockedUntil,
  lastLoginAt: user.lastLoginAt,
  passwordMatches: matches.filter((item) => item.ok).map((item) => item.password),
  tested: matches,
}, null, 2));

process.exit(0);
