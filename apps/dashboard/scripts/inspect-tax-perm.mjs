import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const path = 'G:\\Files Implementations\\DLE_SEPTEMBER 2026 SALARY SCHEDULE.xlsx';
const wb = XLSX.readFile(path, { cellFormula: true });
const ws = wb.Sheets['TAX PERM'];
const range = XLSX.utils.decode_range(ws['!ref']);
const headers = [];
for (let c = 0; c <= range.e.c; c++) {
  const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
  headers.push(cell ? String(cell.v ?? '').replace(/\s+/g, ' ').slice(0, 42) : '');
}
console.log('cols', range.e.c + 1, 'rows', range.e.r + 1);
headers.forEach((h, i) => { if (h) console.log(i, h); });

const want = new Set(['0013', '0185', '13', '185']);
for (let r = 1; r <= range.e.r; r++) {
  const code = String(ws[XLSX.utils.encode_cell({ r, c: 0 })]?.v ?? '').replace(/\s/g, '');
  if (!want.has(code)) continue;
  console.log('\nROW', r + 1, 'code', code);
  for (let c = 0; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c })];
    if (!cell) continue;
    const v = cell.v;
    if (v === 0 || v === '0' || v === '') continue;
    console.log(c, headers[c], 'v=', typeof v === 'number' ? v : String(v).slice(0, 40), 'f=', (cell.f || '').slice(0, 180));
  }
}
