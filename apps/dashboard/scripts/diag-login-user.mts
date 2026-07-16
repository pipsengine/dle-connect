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

const code = String(process.argv[2] || 'NYSC0032').trim();
const password = String(process.argv[3] || 'OGBETAH');

const { authenticate } = await import('../lib/auth/auth-store.ts');
const { createSessionToken, verifySessionToken } = await import('../lib/auth/session.ts');

const headers = new Headers({ 'user-agent': 'diag-login', 'x-forwarded-for': '127.0.0.1' });

try {
  const user = await authenticate(code, password, headers);
  const token = await createSessionToken(user);
  const verified = await verifySessionToken(token);
  console.log(JSON.stringify({
    ok: true,
    userId: user.userId,
    username: user.username,
    roles: user.roles,
    permCount: user.permissions?.length,
    tokenBytes: Buffer.byteLength(token, 'utf8'),
    tokenTooLargeForCookie: Buffer.byteLength(token, 'utf8') > 3800,
    verified: Boolean(verified),
    status: user.status,
    firstLoginRequired: user.firstLoginRequired,
    passwordResetRequired: user.passwordResetRequired,
  }, null, 2));
} catch (error) {
  console.log(JSON.stringify({ ok: false, code, error: error instanceof Error ? error.message : String(error) }, null, 2));
}

process.exit(0);
