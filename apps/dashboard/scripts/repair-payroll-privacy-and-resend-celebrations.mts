/**
 * 1. Delete leaked payroll approval bell items except the live approval chain.
 * 2. Resend today's celebration flyer emails.
 *
 * npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/repair-payroll-privacy-and-resend-celebrations.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { processDailyCelebrationEmails } from '../lib/celebration-notification-service';
import { repairPayrollApprovalNotificationPrivacy, listPayrollApprovalFlowRecipientCodes } from '../lib/payroll-approval-notification-service';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const envPath of [
  path.join(__dirname, '..', '.env.local'),
  path.join(__dirname, '..', '.env'),
  path.join(__dirname, '..', '..', '..', '.env'),
]) {
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim().replace(/^"|"$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main() {
  const allowed = [...await listPayrollApprovalFlowRecipientCodes()].sort();
  console.log('Payroll approval-flow recipients kept:', allowed);
  const purge = await repairPayrollApprovalNotificationPrivacy();
  console.log('Payroll notification purge:', purge);

  const celebration = await processDailyCelebrationEmails({ force: true, resend: true });
  console.log('Celebration resend:', celebration);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
