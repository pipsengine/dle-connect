/*
  Replays the exporter's schedule-driven arithmetic against HR's signed workbook.
  Every derived column is recomputed from the sheet's own hours, daily rate and
  HR-entered allowances, then compared with the amounts HR printed.

  Usage: node scripts/verify-dayrate-schedule-formulas.mjs "<hr-workbook.xlsx>"
*/

import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

const u16 = (b, o) => b.readUInt16LE(o);
const u32 = (b, o) => b.readUInt32LE(o);

const readZip = (buffer) => {
  const out = new Map();
  let eocd = -1;
  for (let i = Math.max(0, buffer.length - 22 - 65535); i <= buffer.length - 22; i += 1) {
    if (u32(buffer, i) === 0x06054b50) eocd = i;
  }
  let offset = u32(buffer, eocd + 16);
  const count = u16(buffer, eocd + 10);
  for (let i = 0; i < count; i += 1) {
    if (u32(buffer, offset) !== 0x02014b50) break;
    const method = u16(buffer, offset + 10);
    const compSize = u32(buffer, offset + 20);
    const uncompSize = u32(buffer, offset + 24);
    const nameLen = u16(buffer, offset + 28);
    const extraLen = u16(buffer, offset + 30);
    const commentLen = u16(buffer, offset + 32);
    const localOffset = u32(buffer, offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLen).toString('utf8');
    const dataStart = localOffset + 30 + u16(buffer, localOffset + 26) + u16(buffer, localOffset + 28);
    const raw = buffer.subarray(dataStart, dataStart + compSize);
    out.set(name.replace(/\\/g, '/'), method === 0 ? raw.subarray(0, uncompSize) : inflateRawSync(raw));
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return out;
};

const unescapeXml = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
  .replace(/&amp;/g, '&');

const colIndex = (ref) => {
  const letters = ref.match(/^[A-Z]+/)[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

const loadSheet = (file, sheetName) => {
  const entries = readZip(readFileSync(file));
  const ssXml = entries.get('xl/sharedStrings.xml')?.toString('utf8') || '';
  const strings = [...ssXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) =>
    [...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unescapeXml(t[1])).join(''));
  const wb = entries.get('xl/workbook.xml').toString('utf8');
  const rels = entries.get('xl/_rels/workbook.xml.rels').toString('utf8');
  const relMap = new Map([...rels.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)]
    .map((m) => [m[1], m[2].replace(/^\/?xl\//, '').replace(/^\.\//, '')]));
  const sheet = [...wb.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)]
    .find((m) => unescapeXml(m[1]).toUpperCase() === sheetName.toUpperCase());
  const xml = entries.get(`xl/${relMap.get(sheet[2])}`).toString('utf8');

  const rows = [];
  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowNum = Number((rowMatch[1].match(/\br="(\d+)"/) || [])[1] || 0);
    const cells = [];
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2] || '';
      const ref = (attrs.match(/\br="([A-Z]+\d+)"/) || [])[1];
      if (!ref) continue;
      const type = (attrs.match(/\bt="([^"]+)"/) || [])[1] || 'n';
      let value = '';
      if (type === 'inlineStr') value = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unescapeXml(t[1])).join('');
      else if (type === 's') value = strings[Number((body.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || -1)] ?? '';
      else value = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || '';
      cells[colIndex(ref)] = value;
    }
    rows.push({ rowNum, cells });
  }
  const header = (rows.find((r) => r.rowNum === 1)?.cells || []).map((c) => String(c || '').trim());
  const records = new Map();
  for (const r of rows) {
    if (r.rowNum <= 1) continue;
    const code = String(r.cells[0] || '').trim().toUpperCase();
    if (!/^C\d+$/.test(code)) continue;
    const obj = {};
    header.forEach((h, i) => { if (h) obj[h] = r.cells[i]; });
    records.set(code, obj);
  }
  return records;
};

const num = (v) => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const roundMoney = (v) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
const money = (n) => n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Mirrors apps/dashboard/lib/dayrate-schedule-template-export.ts
const HOURS_PER_DAY = 8;
const WEEKDAY_OVT_MULTIPLIER = 1.5;
const SATURDAY_MULTIPLIER = 1.5;
const SUNDAY_MULTIPLIER = 2;
const PUBLIC_HOLIDAY_MULTIPLIER = 2;
const WHT_RATE = 0.05;

const file = process.argv[2];

for (const sheetName of ['DLE', 'DLPC']) {
  const records = loadSheet(file, sheetName);
  const rateCol = [...records.values()][0]['Daily Rate'] !== undefined ? 'Daily Rate' : 'DAILY RATE';

  const mismatches = new Map();
  let netDelta = 0;
  let grossDelta = 0;
  const samples = [];

  for (const [code, row] of records) {
    const rate = num(row[rateCol]);
    const hourly = rate / HOURS_PER_DAY;
    const computed = {
      'Wkd Earning': roundMoney(num(row['Total Weekday']) * rate),
      'Wkd Ovt Amt': roundMoney(hourly * WEEKDAY_OVT_MULTIPLIER * num(row['Weekday OVT'])),
      'Sat Ovt Amt': roundMoney(hourly * SATURDAY_MULTIPLIER * num(row['Total Saturday'])),
      'Sun Ovt Amt': roundMoney(hourly * SUNDAY_MULTIPLIER * num(row['Total Sunday'])),
    };
    if (row['PH Amt'] !== undefined) {
      computed['PH Amt'] = roundMoney(hourly * PUBLIC_HOLIDAY_MULTIPLIER * num(row['PH Hours'] ?? 0));
    }

    // HR-entered amounts are taken as-is by the exporter, so they carry straight through.
    const passthrough = ['Night Amt', 'Meal Allowance', 'Transport', 'Site Allowance', 'TCM Meal', 'TCM TRANSPORT', 'Arrears']
      .filter((c) => row[c] !== undefined)
      .reduce((sum, c) => sum + num(row[c]), 0);

    const total = roundMoney(Object.values(computed).reduce((a, b) => a + b, 0) + passthrough);
    const wht = roundMoney(total * WHT_RATE);
    const net = roundMoney(total - wht);

    const diffs = [];
    for (const [col, value] of Object.entries(computed)) {
      const printed = num(row[col]);
      if (Math.abs(printed - value) > 0.02) {
        diffs.push(`${col}: HR=${money(printed)} computed=${money(value)}`);
        mismatches.set(col, (mismatches.get(col) || 0) + 1);
      }
    }
    for (const [col, value] of [['Total Earnings', total], ['WHT', wht], ['Net Pay', net]]) {
      const printed = num(row[col]);
      if (Math.abs(printed - value) > 0.02) {
        diffs.push(`${col}: HR=${money(printed)} computed=${money(value)}`);
        mismatches.set(col, (mismatches.get(col) || 0) + 1);
      }
    }
    grossDelta += total - num(row['Total Earnings']);
    netDelta += net - num(row['Net Pay']);
    if (diffs.length && samples.length < 8) samples.push({ code, diffs });
  }

  console.log(`\n########## ${sheetName}: ${records.size} HR rows replayed`);
  if (!mismatches.size) {
    console.log('  every derived column, total, WHT and net matches HR exactly');
  } else {
    for (const [col, n] of [...mismatches.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${col}: ${n} row(s) differ`);
    for (const s of samples) {
      console.log(`  ${s.code}`);
      for (const d of s.diffs) console.log(`      ${d}`);
    }
  }
  console.log(`  aggregate gross delta = ${money(grossDelta)}, net delta = ${money(netDelta)}`);
}
