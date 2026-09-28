import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const path = 'G:\\Files Implementations\\DLE_SEPTEMBER 2026 SALARY SCHEDULE.xlsx';
const wb = XLSX.readFile(path, { cellFormula: true, cellDates: true });
console.log('SHEETS', wb.SheetNames.join(' | '));
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const ref = ws['!ref'];
  console.log('\n==', name, ref);
  const range = XLSX.utils.decode_range(ref);
  const maxR = Math.min(range.e.r, 6);
  const maxC = Math.min(range.e.c, 45);
  for (let r = range.s.r; r <= maxR; r++) {
    const cells = [];
    for (let c = 0; c <= maxC; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (!cell) continue;
      const v = cell.w ?? cell.v;
      if (v === undefined || v === '') continue;
      cells.push(`${c}:${String(v).slice(0, 40)}`);
    }
    if (cells.length) console.log('R' + (r + 1), cells.join(' | '));
  }
}
