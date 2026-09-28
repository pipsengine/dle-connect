import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const path = 'G:\\Files Implementations\\DLE_SEPTEMBER 2026 SALARY SCHEDULE.xlsx';
const wb = XLSX.readFile(path, { cellFormula: true });

const dumpSheet = (name, headerRow, sampleRows, formulaCols) => {
  const ws = wb.Sheets[name];
  if (!ws) { console.log('MISSING', name); return; }
  const range = XLSX.utils.decode_range(ws['!ref']);
  console.log('\n====', name, ws['!ref'], 'rows', range.e.r + 1);
  const headers = [];
  for (let c = 0; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: headerRow, c })];
    headers.push(cell ? String(cell.v ?? '').replace(/\s+/g, ' ').slice(0, 48) : '');
  }
  headers.forEach((h, i) => { if (h) console.log(i, h); });
  for (const r of sampleRows) {
    console.log('-- row', r + 1);
    for (const c of formulaCols) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (!cell) continue;
      console.log(`  c${c} ${headers[c] || ''} v=${cell.v} w=${cell.w || ''} f=${cell.f || ''}`);
    }
  }
};

const perm = wb.Sheets['PERM STAFF'];
const permRange = XLSX.utils.decode_range(perm['!ref']);
const headers = [];
for (let c = 0; c <= permRange.e.c; c++) {
  const cell = perm[XLSX.utils.encode_cell({ r: 0, c })];
  headers.push(cell ? String(cell.v ?? '') : '');
}
console.log('PERM extra headers from 45');
headers.forEach((h, i) => { if (i >= 45 && h) console.log(i, h); });

// Find P0185
let target = -1;
for (let r = 1; r <= permRange.e.r; r++) {
  const cell = perm[XLSX.utils.encode_cell({ r, c: 0 })];
  const code = String(cell?.v ?? '').replace(/\s/g, '');
  if (code === '0185' || code === '185') { target = r; break; }
}
console.log('P0185 row', target + 1);
const interesting = headers.map((h, i) => ({ i, h })).filter((x) => /net|paye|pension|earning total|deduction total|gross/i.test(x.h));
console.log('interesting', interesting);
if (target >= 0) {
  for (const { i, h } of interesting) {
    const cell = perm[XLSX.utils.encode_cell({ r: target, c: i })];
    console.log(i, h, 'v=', cell?.v, 'f=', cell?.f || '');
  }
  // also print formula of pension and paye from row 2
  for (const c of interesting.map((x) => x.i)) {
    const cell = perm[XLSX.utils.encode_cell({ r: 1, c })];
    console.log('row2', c, headers[c], 'v=', cell?.v, 'f=', cell?.f || '', 'z=', cell?.z || '');
  }
}

dumpSheet('USD REPORT', 0, [1, 2, 3, 4], []);
const usd = wb.Sheets['USD REPORT'];
const usdRange = XLSX.utils.decode_range(usd['!ref']);
console.log('\nUSD REPORT full headers');
for (let c = 0; c <= usdRange.e.c; c++) {
  const cell = usd[XLSX.utils.encode_cell({ r: 0, c })];
  if (cell) console.log(c, String(cell.v).slice(0, 60));
}
console.log('USD rows', usdRange.e.r);
for (let r = 1; r <= Math.min(usdRange.e.r, 12); r++) {
  const code = usd[XLSX.utils.encode_cell({ r, c: 0 })]?.v;
  const name = usd[XLSX.utils.encode_cell({ r, c: 1 })]?.v;
  console.log('usdrow', r + 1, code, name);
}
