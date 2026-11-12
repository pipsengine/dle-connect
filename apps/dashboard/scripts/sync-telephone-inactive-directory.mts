/**
 * Remove directory-inactive employees from telephone schedules that are still being prepared.
 * Usage: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/sync-telephone-inactive-directory.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const envFiles = [
  path.join(repoRoot, 'deployment', 'iis', 'site', 'apps', 'dashboard', '.env'),
  path.join(repoRoot, 'deployment', 'iis', 'site', '.env'),
  path.join(__dirname, '..', '.env.local'),
  path.join(__dirname, '..', '.env'),
  path.join(repoRoot, '.env'),
];
for (const envPath of envFiles) {
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim().replace(/^"|"$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

const { syncEditableTelephoneCyclesWithDirectory } = await import('../lib/telephone-allowance-store');
const updated = await syncEditableTelephoneCyclesWithDirectory();
console.log(JSON.stringify({ updated }, null, 2));
process.exit(0);
