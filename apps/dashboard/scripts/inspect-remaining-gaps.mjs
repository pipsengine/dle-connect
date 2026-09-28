import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const wb = XLSX.readFile('G:\\Files Implementations\\DLE_SEPTEMBER 2026 SALARY SCHEDULE.xlsx', { cellFormula: true });

const dump = (sheet, code, headerRow = 0) => {
  const ws = wb.Sheets[sheet];
  const range = XLSX.utils.decode_range(ws['!ref']);
  const headers = [];
  for (let c = 0; c <= range.e.c; c++) headers.push(String(ws[XLSX.utils.encode_cell({ r: headerRow, c })]?.v ?? ''));
  for (let r = 1; r <= range.e.r; r++) {
    const raw = String(ws[XLSX.utils.encode_cell({ r, c: 0 })]?.v ?? '').replace(/\s/g, '');
    if (raw !== code && raw !== code.replace(/^P|^L/, '') && raw !== code.replace(/^0+/, '')) continue;
    console.log('\n', sheet, code, 'row', r + 1);
    for (let c = 0; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (!cell || cell.v === 0 || cell.v === '0' || cell.v === '') continue;
      const label = headers[c].replace(/\s+/g, ' ').slice(0, 42);
      if (/date|age|gender|joined|title|surname|first|company|department|location|profile|project|supervisor|pension fund|employee type/i.test(label)) continue;
      console.log(c, label, 'v=', cell.v, cell.f ? 'f=' + cell.f.slice(0, 120) : '');
    }
  }
};
for (const code of ['0272', '0436']) dump('PERM STAFF', code);
for (const code of ['L1940', 'L1986', 'L2125', 'L2144', 'L2191', 'L2214', 'L2289', 'L2331', 'L2336', 'L2347', 'L2580', 'L2635', 'L2729', 'L2771']) dump('CONT. STAFF', code);
