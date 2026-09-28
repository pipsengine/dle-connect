import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const wb = XLSX.readFile('G:\\Files Implementations\\DLE_SEPTEMBER 2026 SALARY SCHEDULE.xlsx', { cellFormula: true });

const usd = wb.Sheets['USD REPORT'];
const range = XLSX.utils.decode_range(usd['!ref']);
const headers = [];
for (let c = 0; c <= range.e.c; c++) {
  const cell = usd[XLSX.utils.encode_cell({ r: 0, c })];
  headers.push(cell ? String(cell.v ?? '') : '');
}
for (let r = 1; r < range.e.r; r++) {
  console.log('\nUSD', usd[XLSX.utils.encode_cell({ r, c: 0 })]?.v, usd[XLSX.utils.encode_cell({ r, c: 1 })]?.v);
  for (let c = 9; c <= 25; c++) {
    const cell = usd[XLSX.utils.encode_cell({ r, c })];
    if (!cell || cell.v === 0 || cell.v === '0') continue;
    console.log(c, headers[c].slice(0, 40), 'v=', cell.v, 'f=', (cell.f || '').slice(0, 160));
  }
}

const cont = wb.Sheets['CONT. STAFF'];
const cr = XLSX.utils.decode_range(cont['!ref']);
let n = 0;
const companies = {};
for (let r = 1; r <= cr.e.r; r++) {
  const code = String(cont[XLSX.utils.encode_cell({ r, c: 0 })]?.v ?? '').trim();
  const name = String(cont[XLSX.utils.encode_cell({ r, c: 2 })]?.v ?? '');
  if (!code || /total|dlen|dlpc/i.test(name) || !/^[A-Z]?\d+$/i.test(code)) continue;
  n++;
  const co = String(cont[XLSX.utils.encode_cell({ r, c: 28 })]?.v ?? '');
  const key = co.slice(0, 5);
  companies[key] = (companies[key] || 0) + 1;
}
console.log('\nCONT employees', n, companies);
// formulas on row 2 for paye, gross, net
const ch = [];
for (let c = 0; c <= cr.e.c; c++) ch.push(String(cont[XLSX.utils.encode_cell({ r: 0, c })]?.v ?? ''));
for (const c of [19, 20, 21, 26, 27]) {
  const cell = cont[XLSX.utils.encode_cell({ r: 1, c })];
  console.log('CONT c', c, ch[c], 'v=', cell?.v, 'f=', cell?.f || '');
}
