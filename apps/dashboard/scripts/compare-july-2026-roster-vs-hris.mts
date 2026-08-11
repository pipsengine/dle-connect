/**
 * Compare JULY PAYROLL.xlsx employee roster vs HRIS salaried payroll calc (list-level).
 * Report only — no payroll formula changes.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { loadWorkspaceEnv } from '../lib/dle-enterprise-db.ts';
import { calculatePayrollForPeriod, invalidatePayrollCalculationCache } from '../lib/payroll-calculation-service.ts';
import { isEmployeeExcludedFromPayrollRun } from '../lib/payroll-employee-classification.ts';

loadWorkspaceEnv();
invalidatePayrollCalculationCache('2026-07');

const XLSX = path.join(process.cwd(), 'backups', 'Dayrate Payment Schedule', 'JULY PAYROLL.xlsx');
const OUT = path.join(process.cwd(), 'apps', 'dashboard', 'data', 'hris', 'july-2026-roster-diff.json');
const upper = (v: unknown) => String(v || '').trim().toUpperCase();
const round = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;

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
    if sheet=='Perm.Staff':
      surname=str(row[idx.get('EmployeeSurname',1)] or '').strip()
      first=str(row[idx.get('EmployeeFirstName',2)] or '').strip()
      cont='Permanent'
      job=str(row[idx.get('Job Title Long Description',7)] or '').strip()
    else:
      cont=str(row[idx.get('Cont Type',1)] or '').strip()
      surname=str(row[idx.get('EmployeeSurname',2)] or '').strip()
      first=str(row[idx.get('EmployeeFirstName',3)] or '').strip()
      job=str(row[idx.get('Job Title Long Description',8)] or '').strip()
    blank_name = not surname and not first
    out.append({
      'rawCode': code,
      'sheet': sheet,
      'contType': cont,
      'name': (first + ' ' + surname).strip(),
      'jobTitle': job,
      'blankName': blank_name,
      'gross': round(num(row[idx['Gross Earnings']]) if 'Gross Earnings' in idx else num(row[idx.get('Earning Total')]), 2),
      'net': round(num(row[idx['Net Pay']]) if 'Net Pay' in idx else 0, 2),
    })
print(json.dumps(out))
`;
  const result = spawnSync('python', ['-c', py], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'excel failed');
  return JSON.parse(result.stdout) as Array<{
    rawCode: string;
    sheet: string;
    contType: string;
    name: string;
    jobTitle: string;
    blankName: boolean;
    gross: number;
    net: number;
  }>;
};

const directoryCode = (code: string, sheet: string, contType: string) => {
  const raw = upper(code);
  if (!raw) return '';
  if (/^L\d+/i.test(raw) || /^IT\d+/i.test(raw) || /^NYSC\d+/i.test(raw) || /^N\d+/i.test(raw) || /^I\d+/i.test(raw) || /^C\d+/i.test(raw)) return raw;
  if (sheet === 'Cont. Staff' && /lumpsum/i.test(contType)) return raw.startsWith('L') ? raw : `L${raw}`;
  if (sheet === 'Cont. Staff' && /nysc/i.test(contType)) {
    if (/^NYSC/i.test(raw)) return raw;
    if (/^N\d+/i.test(raw)) return raw;
    if (/^\d+$/.test(raw)) return `NYSC${raw.padStart(4, '0')}`;
  }
  if (sheet === 'Cont. Staff' && /intern|it\b/i.test(contType)) {
    if (/^IT/i.test(raw)) return raw;
    if (/^I\d+/i.test(raw)) return raw;
    if (/^\d+$/.test(raw)) return `IT${raw.padStart(4, '0')}`;
  }
  if (/^\d+$/.test(raw)) return `P${raw.padStart(4, '0')}`;
  if (/^P\d+$/i.test(raw)) return `P${raw.slice(1).padStart(4, '0')}`;
  return raw;
};

const categoryFrom = (sheet: string, contType: string, code: string) => {
  if (sheet === 'Perm.Staff') return 'Permanent';
  const c = upper(contType);
  if (c.includes('LUMP')) return 'Lumpsum';
  if (c.includes('NYSC') || /^N(YSC)?\d+/i.test(code)) return 'NYSC';
  if (c.includes('INTERN') || c.includes('IT') || /^IT\d+/i.test(code) || /^I\d+/i.test(code)) return 'IT';
  if (c.includes('DAY') || /^C\d+/i.test(code)) return 'Dayrate';
  return contType || 'Other';
};

const sageRows = readSage();
const calc = await calculatePayrollForPeriod('2026-07', { forceRefresh: true, pack: 'salaried' });

type HrisRow = {
  code: string;
  name: string;
  employmentType: string;
  group: string;
  currency: string;
  gross: number;
  net: number;
  dual: boolean;
};

const hrisRows: HrisRow[] = [];
const hrisByCode = new Map<string, HrisRow[]>();
for (const r of calc.records) {
  const code = upper(r.employeeCode);
  const row: HrisRow = {
    code,
    name: String(r.fullName || ''),
    employmentType: String(r.employmentType || ''),
    group: String(r.payrollGroup || ''),
    currency: String(r.payCurrency || ''),
    gross: round(r.grossPay),
    net: round(r.netPay),
    dual: Boolean(r.hasDualCurrencyPayroll),
  };
  hrisRows.push(row);
  const list = hrisByCode.get(code) || [];
  list.push(row);
  hrisByCode.set(code, list);
}

const sageNamed = sageRows.filter((r) => !r.blankName && r.rawCode);
const sageBlank = sageRows.filter((r) => r.blankName || !r.rawCode);

const sageNormalized = sageNamed.map((r) => {
  const code = directoryCode(r.rawCode, r.sheet, r.contType);
  return {
    ...r,
    code,
    category: categoryFrom(r.sheet, r.contType, code),
  };
});

// Detect dayrate / contract daily on Cont sheet that salaried pack may exclude
const sageByCategory: Record<string, number> = {};
for (const r of sageNormalized) {
  sageByCategory[r.category] = (sageByCategory[r.category] || 0) + 1;
}

const matched: Array<Record<string, unknown>> = [];
const missingInHris: Array<Record<string, unknown>> = [];
const usedHris = new Set<string>();

for (const s of sageNormalized) {
  const candidates = hrisByCode.get(s.code) || [];
  // Prefer NGN row for dual
  const h = candidates.find((x) => x.currency === 'NGN') || candidates[0];
  if (!h) {
    missingInHris.push({
      code: s.code,
      rawCode: s.rawCode,
      name: s.name,
      category: s.category,
      sheet: s.sheet,
      contType: s.contType,
      gross: s.gross,
      net: s.net,
    });
    continue;
  }
  usedHris.add(h.code);
  matched.push({
    code: s.code,
    name: s.name,
    category: s.category,
    sageGross: s.gross,
    hrisGross: h.gross,
    grossDiff: round(h.gross - s.gross),
    sageNet: s.net,
    hrisNet: h.net,
    netDiff: round(h.net - s.net),
    hrisCurrency: h.currency,
    hrisGroup: h.group,
    dual: h.dual,
  });
}

// HRIS extras: salaried records whose code not on July named roster
const extrasInHris: Array<Record<string, unknown>> = [];
const sageCodeSet = new Set(sageNormalized.map((r) => r.code));
for (const row of hrisRows) {
  // For dual, only count once (prefer unique code)
  if (row.currency === 'USD' && row.dual) continue;
  if (sageCodeSet.has(row.code)) continue;
  // Also try stripping leading zeros variants already normalized
  extrasInHris.push({
    code: row.code,
    name: row.name,
    employmentType: row.employmentType,
    group: row.group,
    currency: row.currency,
    gross: row.gross,
    net: row.net,
    dual: row.dual,
  });
}

// Unique HRIS salaried people (count NGN+non-dual USD)
const hrisUniqueCodes = new Set(
  hrisRows
    .filter((r) => !(r.dual && r.currency === 'USD'))
    .map((r) => r.code),
);

const exactGross = matched.filter((m) => Math.abs(Number(m.grossDiff)) <= 1).length;
const exactNet = matched.filter((m) => Math.abs(Number(m.netDiff)) <= 1).length;

const report = {
  generatedAt: new Date().toISOString(),
  period: '2026-07',
  sourceExcel: 'backups/Dayrate Payment Schedule/JULY PAYROLL.xlsx',
  excel: {
    permRows: sageRows.filter((r) => r.sheet === 'Perm.Staff').length,
    contRows: sageRows.filter((r) => r.sheet === 'Cont. Staff').length,
    namedEmployees: sageNamed.length,
    blankNameOrTotalRows: sageBlank.length,
    blankRows: sageBlank.map((r) => ({ rawCode: r.rawCode, sheet: r.sheet, gross: r.gross })),
    byCategory: sageByCategory,
  },
  hris: {
    salariedCalcRecords: hrisRows.length,
    uniquePeoplePreferNgn: hrisUniqueCodes.size,
    dualCurrencyPeople: [...new Set(hrisRows.filter((r) => r.dual).map((r) => r.code))],
  },
  overlap: {
    matched: matched.length,
    missingInHris: missingInHris.length,
    extrasInHris: extrasInHris.length,
    exactGross,
    exactNet,
  },
  missingInHris,
  extrasInHris,
  matchedGrossGaps: matched
    .filter((m) => Math.abs(Number(m.grossDiff)) > 1)
    .sort((a, b) => Math.abs(Number(b.grossDiff)) - Math.abs(Number(a.grossDiff))),
  matchedNetGaps: matched
    .filter((m) => Math.abs(Number(m.netDiff)) > 1)
    .sort((a, b) => Math.abs(Number(b.netDiff)) - Math.abs(Number(a.netDiff)))
    .slice(0, 40),
};

writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  excelNamed: report.excel.namedEmployees,
  excelBlank: report.excel.blankNameOrTotalRows,
  excelByCategory: report.excel.byCategory,
  hrisUnique: report.hris.uniquePeoplePreferNgn,
  hrisRecords: report.hris.salariedCalcRecords,
  matched: report.overlap.matched,
  missingInHris: report.overlap.missingInHris,
  extrasInHris: report.overlap.extrasInHris,
  exactGross: report.overlap.exactGross,
  exactNet: report.overlap.exactNet,
  missingCodes: missingInHris.map((m) => `${m.code} (${m.category})`),
  extraCodes: extrasInHris.map((m) => `${m.code} (${m.employmentType})`),
  dual: report.hris.dualCurrencyPeople,
}, null, 2));
console.log('wrote', OUT);
process.exit(0);
