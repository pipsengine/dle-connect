/**
 * Unlock / reactivate NYSC0032 without requiring Access Control DB bootstrap.
 * Usage: npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/unlock-nysc0032.mts
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const TARGET = 'NYSC0032';

const resolveUsersPath = () => {
  if (process.env.DLE_AUTH_DATA_DIR) return path.join(path.resolve(process.env.DLE_AUTH_DATA_DIR), 'users.json');
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  const root = cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
  return path.join(root, 'data', 'auth', 'users.json');
};

const main = async () => {
  const usersPath = resolveUsersPath();
  await mkdir(path.dirname(usersPath), { recursive: true });
  const users = JSON.parse(await readFile(usersPath, 'utf8')) as Array<Record<string, unknown>>;
  const index = users.findIndex((item) => String(item.username || '').toLowerCase() === TARGET.toLowerCase()
    || String(item.employeeCode || '').toLowerCase() === TARGET.toLowerCase()
    || String(item.employeeId || '').toLowerCase() === TARGET.toLowerCase());
  if (index < 0) {
    console.error(`User ${TARGET} was not found in ${usersPath}`);
    process.exit(1);
  }

  const now = new Date().toISOString();
  const current = users[index];
  users[index] = {
    ...current,
    status: current.firstLoginRequired ? 'Pending First Login' : 'Active',
    failedAttempts: 0,
    lockedUntil: null,
    disabledAt: null,
    deleted: false,
    updatedAt: now,
  };
  await writeFile(usersPath, JSON.stringify(users, null, 2), 'utf8');
  console.log(JSON.stringify({
    path: usersPath,
    username: users[index].username,
    status: users[index].status,
    failedAttempts: users[index].failedAttempts,
    lockedUntil: users[index].lockedUntil,
    lastLoginAt: users[index].lastLoginAt,
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
