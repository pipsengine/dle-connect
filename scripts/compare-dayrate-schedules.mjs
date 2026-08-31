/*
  Compares two Dayrate Payment Schedule workbooks (payroll-generated vs uploaded)
  sheet by sheet and row by row, keyed on employee code.

  Usage: node scripts/compare-dayrate-schedules.mjs "<generated.xlsx>" "<uploaded.xlsx>"
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
  if (eocd < 0) throw new Error('not a zip');
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

const sharedStrings = (entries) => {
  const xml = entries.get('xl/sharedStrings.xml')?.toString('utf8');
  if (!xml) return [];
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) =>
    [...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unescapeXml(t[1])).join(''));
};

const colIndex = (ref) => {
  const letters = ref.match(/^[A-Z]+/)[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

/** Returns rows as arrays of display strings, plus each row's sheet row number. */
const readSheet = (xml, strings) => {
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
      if (type === 'inlineStr') {
        value = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unescapeXml(t[1])).join('');
      } else if (type === 's') {
        const idx = Number((body.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || -1);
        value = strings[idx] ?? '';
      } else if (type === 'str') {
        value = unescapeXml((body.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || '');
      } else {
        value = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || '';
      }
      cells[colIndex(ref)] = value;
    }
    rows.push({ rowNum, cells });
  }
  return rows;
};

const loadWorkbook = (file) => {
  const entries = readZip(readFileSync(file));
  const strings = sharedStrings(entries);
  const wb = entries.get('xl/workbook.xml').toString('utf8');
  const rels = entries.get('xl/_rels/workbook.xml.rels').toString('utf8');
  const relMap = new Map([...rels.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)]
    .map((m) => [m[1], m[2].replace(/^\/?xl\//, '').replace(/^\.\//, '')]));
  const sheets = [...wb.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)].map((m) => {
    const target = relMap.get(m[2]);
    const xml = entries.get(`xl/${target}`)?.toString('utf8') || '';
    return { name: unescapeXml(m[1]), rows: readSheet(xml, strings) };
  });
  return { file, sheets };
};

const num = (v) => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const money = (n) => n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const [genPath, upPath] = process.argv.slice(2);
const generated = loadWorkbook(genPath);
const uploaded = loadWorkbook(upPath);

for (const wb of [generated, uploaded]) {
  console.log(`\n=== ${wb.file}`);
  for (const s of wb.sheets) {
    const dataRows = s.rows.filter((r) => r.cells.some((c) => String(c ?? '').trim() !== ''));
    console.log(`  sheet "${s.name}": ${dataRows.length} non-empty rows, ${Math.max(0, ...s.rows.map((r) => r.cells.length))} cols`);
  }
}

const sheetByName = (wb, name) => wb.sheets.find((s) => s.name.toUpperCase() === name.toUpperCase());

const detailSheets = ['DLE', 'DLPC'];
for (const name of detailSheets) {
  const g = sheetByName(generated, name);
  const u = sheetByName(uploaded, name);
  if (!g || !u) { console.log(`\n--- ${name}: missing in one workbook (generated=${!!g}, uploaded=${!!u})`); continue; }

  const header = (sheet) => (sheet.rows.find((r) => r.rowNum === 1)?.cells || []).map((c) => String(c || '').trim());
  const gh = header(g);
  const uh = header(u);
  console.log(`\n--- ${name} headers`);
  const maxCols = Math.max(gh.length, uh.length);
  for (let i = 0; i < maxCols; i += 1) {
    if ((gh[i] || '') !== (uh[i] || '')) console.log(`  col ${i + 1}: generated="${gh[i] || ''}" uploaded="${uh[i] || ''}"`);
  }

  const index = (sheet, headers) => {
    const map = new Map();
    for (const r of sheet.rows) {
      if (r.rowNum <= 1) continue;
      const code = String(r.cells[0] || '').trim().toUpperCase();
      if (!code || !/^[A-Z]*\d/.test(code)) continue;
      const obj = {};
      headers.forEach((h, i) => { if (h) obj[h] = r.cells[i]; });
      map.set(code, obj);
    }
    return map;
  };
  const gi = index(g, gh);
  const ui = index(u, uh);

  const onlyG = [...gi.keys()].filter((k) => !ui.has(k));
  const onlyU = [...ui.keys()].filter((k) => !gi.has(k));
  console.log(`\n--- ${name} roster: generated=${gi.size} uploaded=${ui.size}`);
  if (onlyG.length) console.log(`  only in generated (${onlyG.length}): ${onlyG.join(', ')}`);
  if (onlyU.length) console.log(`  only in uploaded (${onlyU.length}): ${onlyU.join(', ')}`);

  const compareCols = uh.filter((h) => h && gh.includes(h));
  const colDiff = new Map();
  const samples = [];
  for (const [code, urow] of ui.entries()) {
    const grow = gi.get(code);
    if (!grow) continue;
    const diffs = [];
    for (const col of compareCols) {
      const a = urow[col];
      const b = grow[col];
      const aNum = num(a);
      const bNum = num(b);
      const bothNumeric = String(a ?? '').trim() !== '' || String(b ?? '').trim() !== '';
      const isNumericCol = Number.isFinite(Number(String(a ?? '').replace(/,/g, ''))) && String(a ?? '').trim() !== '';
      if (isNumericCol || (String(b ?? '').trim() !== '' && Number.isFinite(Number(String(b).replace(/,/g, ''))))) {
        if (Math.abs(aNum - bNum) > 0.01) {
          diffs.push(`${col}: uploaded=${money(aNum)} generated=${money(bNum)} delta=${money(bNum - aNum)}`);
          colDiff.set(col, (colDiff.get(col) || 0) + 1);
        }
      } else if (bothNumeric && String(a ?? '').trim().toUpperCase() !== String(b ?? '').trim().toUpperCase()) {
        diffs.push(`${col}: uploaded="${a ?? ''}" generated="${b ?? ''}"`);
        colDiff.set(col, (colDiff.get(col) || 0) + 1);
      }
    }
    if (diffs.length && samples.length < 12) samples.push({ code, diffs });
  }

  console.log(`\n--- ${name} per-column difference counts (matched employees)`);
  for (const [col, n] of [...colDiff.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${col}: ${n}`);

  console.log(`\n--- ${name} sample rows with differences`);
  for (const s of samples) {
    console.log(`  ${s.code}`);
    for (const d of s.diffs) console.log(`      ${d}`);
  }

  const totalOf = (map, col) => [...map.values()].reduce((sum, row) => sum + num(row[col]), 0);
  const totalCols = compareCols.filter((c) => /earning|amt|allowance|transport|wht|net|gross|arrears|rate/i.test(c));
  console.log(`\n--- ${name} column totals (uploaded vs generated, matched+unmatched all rows)`);
  for (const col of totalCols) {
    const a = totalOf(ui, col);
    const b = totalOf(gi, col);
    if (Math.abs(a - b) > 0.01) console.log(`  ${col}: uploaded=${money(a)} generated=${money(b)} delta=${money(b - a)}`);
  }
}
