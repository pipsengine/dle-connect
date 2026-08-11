/**
 * July 2026 salaried PAYE / deductions / net variance report vs JULY PAYROLL.xlsx.
 * Compare-only: HRIS formulas are the computation authority; Sage Excel is the reference baseline.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { loadWorkspaceEnv } from '../lib/dle-enterprise-db.ts';
import { calculatePayrollForPeriod, invalidatePayrollCalculationCache } from '../lib/payroll-calculation-service.ts';

loadWorkspaceEnv();
invalidatePayrollCalculationCache('2026-07');

const PERIOD = '2026-07';
const XLSX = path.join(process.cwd(), 'backups', 'Dayrate Payment Schedule', 'JULY PAYROLL.xlsx');
const round = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;
const upper = (v: unknown) => String(v || '').trim().toUpperCase();

const readSage = () => {
  const escaped = XLSX.replace(/\\/g, '\\\\');
  const py = `
from openpyxl import load_workbook
import json
path = r'''${escaped}'''
wb = load_workbook(path, data_only=True, read_only=True)
out=[]

def num(v):
  try: return float(v or 0)
  except: return 0.0

for sheet in ['Perm.Staff', 'Cont. Staff']:
  ws=wb[sheet]
  rows=list(ws.iter_rows(values_only=True))
  headers=[str(c or '').strip() for c in rows[0]]
  idx={h:i for i,h in enumerate(headers)}
  for row in rows[1:]:
    code=str(row[idx.get('Employee Code',0)] or '').strip().upper()
    if not code: continue
    if sheet=='Perm.Staff':
      surname=str(row[idx.get('EmployeeSurname',1)] or '').strip()
      first=str(row[idx.get('EmployeeFirstName',2)] or '').strip()
      cont='Permanent'
    else:
      cont=str(row[idx.get('Cont Type',1)] or '').strip()
      surname=str(row[idx.get('EmployeeSurname',2)] or '').strip()
      first=str(row[idx.get('EmployeeFirstName',3)] or '').strip()
    if not surname and not first: continue
    out.append({
      'code': code,
      'sheet': sheet,
      'contType': cont,
      'name': (first + ' ' + surname).strip(),
      'gross': round(num(row[idx['Gross Earnings']]) if 'Gross Earnings' in idx else num(row[idx.get('Earning Total')]), 2),
      'net': round(num(row[idx['Net Pay']]) if 'Net Pay' in idx else 0, 2),
      'deductions': round(num(row[idx['Deduction Total']]) if 'Deduction Total' in idx else 0, 2),
      'paye': round(num(row[idx['PAYE Tax (Deduction)']]) if 'PAYE Tax (Deduction)' in idx else 0, 2),
      'pension': round(num(row[idx['Pension (Deduction)']]) if 'Pension (Deduction)' in idx else 0, 2),
      'pension2': round(num(row[idx['PENSION EE2 (Deduction)']]) if 'PENSION EE2 (Deduction)' in idx else 0, 2),
      'nhf': round(num(row[idx['NHF - National Housing Fund (Deduction)']]) if 'NHF - National Housing Fund (Deduction)' in idx else 0, 2),
    })
print(json.dumps(out))
`;
  const result = spawnSync('python', ['-c', py], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'excel failed');
  return JSON.parse(result.stdout) as Array<Record<string, unknown>>;
};

const directoryCode = (code: string, sheet: string, contType: string) => {
  const raw = upper(code);
  if (/^L\d+/i.test(raw) || /^IT\d+/i.test(raw) || /^NYSC\d+/i.test(raw) || /^N\d+/i.test(raw) || /^I\d+/i.test(raw)) return raw;
  if (sheet === 'Cont. Staff' && /lumpsum/i.test(contType)) return raw.startsWith('L') ? raw : `L${raw}`;
  if (/^\d+$/.test(raw)) return `P${raw.padStart(4, '0')}`;
  if (/^P\d+$/i.test(raw)) return `P${raw.slice(1).padStart(4, '0')}`;
  return raw;
};

const sage = readSage();
const calc = await calculatePayrollForPeriod(PERIOD, { forceRefresh: true, pack: 'salaried' });
const byCode = new Map<string, typeof calc.records[number]>();
for (const row of calc.records) {
  // Prefer NGN row for dual-currency staff when comparing to July NGN file
  const code = upper(row.employeeCode);
  const existing = byCode.get(code);
  if (!existing || (row.payCurrency === 'NGN' && existing.payCurrency !== 'NGN')) {
    byCode.set(code, row);
  }
}

const diffs: Array<Record<string, unknown>> = [];
let matched = 0;
let exactPaye = 0;
let exactNet = 0;
let exactDed = 0;

for (const row of sage) {
  const code = directoryCode(String(row.code), String(row.sheet), String(row.contType));
  const hris = byCode.get(code) || byCode.get(upper(String(row.code)));
  if (!hris) continue;
  matched += 1;
  const sagePaye = round(row.paye);
  const sageDed = round(row.deductions);
  const sageNet = round(row.net);
  const payeDiff = round(hris.paye - sagePaye);
  const dedDiff = round(hris.totalDeductions - sageDed);
  const netDiff = round(hris.netPay - sageNet);
  if (Math.abs(payeDiff) <= 1) exactPaye += 1;
  if (Math.abs(dedDiff) <= 1) exactDed += 1;
  if (Math.abs(netDiff) <= 1) exactNet += 1;
  if (Math.abs(payeDiff) > 1 || Math.abs(dedDiff) > 1 || Math.abs(netDiff) > 1) {
    diffs.push({
      code,
      name: row.name,
      sheet: row.sheet,
      contType: row.contType,
      sagePaye,
      hrisPaye: hris.paye,
      payeDiff,
      sageDed,
      hrisDed: hris.totalDeductions,
      dedDiff,
      sageNet,
      hrisNet: hris.netPay,
      netDiff,
      sageGross: round(row.gross),
      hrisGross: hris.grossPay,
      hasSageDedLines: Boolean((hris as { deductionLines?: unknown[] }).deductionLines?.length),
      currency: hris.payCurrency,
      group: hris.payrollGroup,
    });
  }
}

diffs.sort((a, b) => Math.abs(Number(b.payeDiff)) - Math.abs(Number(a.payeDiff)));
console.log(JSON.stringify({
  matched,
  exactPaye,
  exactDed,
  exactNet,
  payeGaps: diffs.filter((d) => Math.abs(Number(d.payeDiff)) > 1).length,
  netGaps: diffs.filter((d) => Math.abs(Number(d.netDiff)) > 1).length,
  topPaye: diffs.slice(0, 25),
}, null, 2));

writeFileSync(
  path.join(process.cwd(), 'apps/dashboard/data/hris/july-2026-paye-gaps.json'),
  JSON.stringify({ matched, exactPaye, exactDed, exactNet, diffs }, null, 2),
);
process.exit(0);
