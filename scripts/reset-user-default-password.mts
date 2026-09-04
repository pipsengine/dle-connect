/**
 * Reset a user's temporary password to the normalized surname default (spaces removed).
 * Usage: npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/reset-user-default-password.mts P0051
 */
import {
  defaultPasswordFromSurname,
  hashPassword,
  readUsers,
  updateUser,
} from '../apps/dashboard/lib/auth/auth-store.ts';

const TARGET = String(process.argv[2] || '').trim();
if (!TARGET) {
  console.error('Usage: reset-user-default-password.mts <employeeCode|username>');
  process.exit(1);
}

const headers = new Headers({
  'x-forwarded-for': 'local-admin-reset',
  'user-agent': 'reset-user-default-password.mts',
});

const main = async () => {
  const users = await readUsers();
  const key = TARGET.toLowerCase();
  const user = users.find((item) => [item.username, item.employeeCode, item.employeeId].some((value) => String(value || '').toLowerCase() === key));
  if (!user) {
    console.error(`User ${TARGET} was not found.`);
    process.exit(1);
  }

  const tempPasswordHint = defaultPasswordFromSurname(user.surname, user.username);
  hashPassword(tempPasswordHint);

  const updated = await updateUser(
    user.id,
    'reset-password',
    {},
    headers,
    'System · surname space normalize',
    { sub: 'global-admin', username: 'Admin', isGlobalAdmin: true, roles: ['Super Administrator'] },
  );

  console.log(JSON.stringify({
    username: updated.username,
    employeeCode: updated.employeeCode,
    surname: updated.surname,
    status: updated.status,
    passwordResetRequired: updated.passwordResetRequired,
    failedAttempts: updated.failedAttempts,
    lockedUntil: updated.lockedUntil,
    temporaryPasswordForm: 'surname with spaces removed',
    temporaryPasswordLength: tempPasswordHint.length,
    example: `${user.surname} → ${tempPasswordHint}`,
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
