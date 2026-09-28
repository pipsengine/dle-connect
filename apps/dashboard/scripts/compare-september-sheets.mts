import { createRequire } from 'node:module';
import { loadWorkspaceEnv } from '../lib/dle-enterprise-db.ts';
import { calculatePayrollForPeriod } from '../lib/payroll-calculation-service.ts';

loadWorkspaceEnv();
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const wb = XLSX.readFile('G:\\Files Implementations\\DLE_SEPTEMBER 2026 SALARY SCHEDULE.xlsx', { cellFormula: true });

const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;
const codeKey = (raw: unknown) => {
  let token = String(raw ?? '').trim().toUpperCase().split(/\s+/)[0].replace(/_+$/g, '');
  token = token.replace(/^P(?=\d)/, '');
  if (/^L\d+$/.test(token)) return `L${Number(token.slice(1))}`;
  if (/^\d+$/.test(token)) return String(Number(token));
  return token;
};
const companyKey = (raw: unknown) => {
  const text = String(raw ?? '').toUpperCase();
  if (text.includes('DLPC')) return 'DLPC';
  if (text.includes('DLEN') || text.includes('DLE')) return 'DLE';
  return '';
};

type Row = { code: string; name: string; company: string; gross: number; paye: number; pension: number; net: number };
const readSheet = (name: string, cols: { code: number; name: number; company: number; gross: number; paye: number; pension: number; net: number }, nameIsSurname = true) => {
  const ws = wb.Sheets[name];
  const range = XLSX.utils.decode_range(ws['!ref']);
  const rows: Row[] = [];
  for (let r = 1; r <= range.e.r; r++) {
    const codeCell = ws[XLSX.utils.encode_cell({ r, c: cols.code })];
    const nameCell = ws[XLSX.utils.encode_cell({ r, c: cols.name })];
    const code = codeKey(codeCell?.v);
    const name = String(nameCell?.v ?? '');
    if (!code || /total|dlen|dlpc/i.test(name)) continue;
    if (!/^(?:L)?\d+$/.test(code) && !/^[A-Z]+\d+$/.test(code)) continue;
    const num = (c: number) => round2(Number(ws[XLSX.utils.encode_cell({ r, c })]?.v || 0));
    rows.push({
      code,
      name,
      company: companyKey(ws[XLSX.utils.encode_cell({ r, c: cols.company })]?.v),
      gross: num(cols.gross),
      paye: num(cols.paye),
      pension: cols.pension >= 0 ? num(cols.pension) : 0,
      net: num(cols.net),
    });
  }
  return rows;
};

const perm = readSheet('PERM STAFF', { code: 0, name: 1, company: 57, gross: 55, paye: 39, pension: 41, net: 56 });
const cont = readSheet('CONT. STAFF', { code: 0, name: 2, company: 28, gross: 26, paye: 20, pension: -1, net: 27 });
const usd = readSheet('USD REPORT', { code: 0, name: 1, company: 26, gross: 23, paye: 15, pension: 16, net: 24 });

const main = async () => {
  const byKey = new Map<string, { company: string; currency: string; gross: number; paye: number; pension: number; net: number; name: string }>();
  for (const company of ['DLE', 'DLPC'] as const) {
    const calc = await calculatePayrollForPeriod('2026-09', { forceRefresh: true, pack: 'salaried', company });
    for (const record of calc.records) {
      const key = `${record.payCurrency || 'NGN'}:${codeKey(record.employeeCode)}`;
      byKey.set(key, {
        company,
        currency: record.payCurrency || 'NGN',
        gross: round2(record.grossPay),
        paye: round2(record.paye),
        pension: round2(record.pensionEmployee),
        net: round2(record.netPay),
        name: record.fullName,
      });
    }
    console.log(company, 'records', calc.records.length, 'gross', calc.summary.grossPay, 'net', calc.summary.netPay);
  }

  const compare = (label: string, rows: Row[], currency: string) => {
    let matched = 0;
    const diffs: string[] = [];
    let sheetGross = 0;
    let payGross = 0;
    let sheetNet = 0;
    let payNet = 0;
    let missing = 0;
    for (const row of rows) {
      const pay = byKey.get(`${currency}:${row.code}`);
      sheetGross += row.gross;
      sheetNet += row.net;
      if (!pay) {
        missing++;
        diffs.push(`${row.code} ${row.name} MISSING ON PAYROLL sheetGross=${row.gross.toFixed(2)}`);
        continue;
      }
      payGross += pay.gross;
      payNet += pay.net;
      const fields: Array<[string, number, number]> = [
        ['gross', row.gross, pay.gross],
        ['paye', row.paye, pay.paye],
        ['pension', row.pension, pay.pension],
        ['net', row.net, pay.net],
      ];
      const bad = fields.filter(([, sheet, payroll]) => Math.abs(sheet - payroll) >= 0.005);
      if (!bad.length) matched++;
      else diffs.push(`${row.code} ${row.name} ${bad.map(([name, sheet, payroll]) => `${name} sheet ${sheet.toFixed(2)} payroll ${payroll.toFixed(2)} d ${(payroll - sheet).toFixed(2)}`).join(' | ')}`);
    }
    console.log(`\n${label} rows ${rows.length} matched ${matched} differ ${rows.length - matched - missing} missing ${missing}`);
    console.log(`  sheet gross ${round2(sheetGross).toFixed(2)} payroll ${round2(payGross).toFixed(2)} net sheet ${round2(sheetNet).toFixed(2)} payroll ${round2(payNet).toFixed(2)}`);
    for (const line of diffs) console.log(' ', line);
  };

  compare('PERM STAFF', perm, 'NGN');
  compare('CONT. STAFF', cont, 'NGN');
  compare('USD REPORT', usd, 'USD');
};

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
