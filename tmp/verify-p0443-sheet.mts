import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const rel of ['apps/dashboard/.env.local', 'apps/dashboard/.env', '.env']) {
  const filePath = path.join(repo, rel);
  if (!fs.existsSync(filePath)) continue;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let value = t.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

const { daysWorkedInLeaveYear, buildEntitlementSnapshot } = await import('../apps/dashboard/lib/final-entitlement-sheet.ts');
const { resolveNigeriaPublicHolidays } = await import('../apps/dashboard/lib/nigeria-public-holidays.ts');

const holidaysRaw = await resolveNigeriaPublicHolidays().catch(() => null);
const holidayList = (holidaysRaw?.holidays || [])
  .filter((h: { date?: string }) => String(h.date || '').startsWith('2026'))
  .map((h: { date: string; label?: string }) => ({ date: h.date, label: h.label || '' }));

const days = daysWorkedInLeaveYear({
  lastWorkingDay: '2026-11-30',
  dateOfJoining: '2025-01-13',
  leaveYear: 2026,
  holidays: holidayList,
});
const daysNoHol = daysWorkedInLeaveYear({
  lastWorkingDay: '2026-11-30',
  dateOfJoining: '2025-01-13',
  leaveYear: 2026,
  holidays: [],
});
const snap = buildEntitlementSnapshot({
  lastWorkingDay: '2026-11-30',
  dateOfJoining: '2025-01-13',
  leaveYear: 2026,
  annualLeaveAllowance: 241663.2,
  leaveAllowancePaid: true,
  holidays: holidayList,
});
const sheetRecovery = Math.round(241663.2 * (248 - 228) / 248);

console.log(JSON.stringify({
  daysWithHolidays: days,
  daysNoHolidays: daysNoHol,
  holidayCount2026: holidayList.length,
  holidaysThroughNov: holidayList.filter((h) => h.date <= '2026-11-30').map((h) => h.date + ' ' + h.label),
  snap,
  sheetShowsDays: 228,
  sheetShowsRecovery: 19490,
  expectedRecoveryFrom228: sheetRecovery,
}, null, 2));
