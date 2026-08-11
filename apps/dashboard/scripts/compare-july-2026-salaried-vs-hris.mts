/**
 * Compare JULY PAYROLL.xlsx (Permanent / Lumpsum / IT / NYSC) vs HRIS salaried pack.
 *
 * Source: backups/Dayrate Payment Schedule/JULY PAYROLL.xlsx
 * Sheets: Perm.Staff, Cont. Staff
 *
 * Usage:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/compare-july-2026-salaried-vs-hris.mts
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadWorkspaceEnv } from '../lib/dle-enterprise-db.ts';
import { calculatePayrollForPeriod } from '../lib/payroll-calculation-service.ts';
import { isStipendPayrollEmployeeCode } from '../lib/payroll-employee-classification.ts';

loadWorkspaceEnv();

const PERIOD = '2026-07';
const XLSX = path.join(
  process.cwd(),
  'backups',
  'Dayrate Payment Schedule',
  'JULY PAYROLL.xlsx',
);

const round = (value: unknown) => Math.round((Number(value) || 0) * 100) / 100;
const money = (value: number) => round(value).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const upper = (value: unknown) => String(value || '').trim().toUpperCase();

type SageCategory = 'Permanent' | 'Lumpsum' | 'IT' | 'NYSC' | 'Other';

type SageRow = {
  code: string;
  category: SageCategory;
  contType: string;
  name: string;
  gross: number;
  net: number;
  deductions: number;
  basic: number;
  sheet: string;
};

const classifyCode = (code: string, contType: string): SageCategory => {
  if (/^L\d+/i.test(code) || /lumpsum/i.test(contType)) return 'Lumpsum';
  if (/^(P?IT|IT|I)\d+/i.test(code) || (/intern/i.test(contType) && /^I\d+/i.test(code))) return 'IT';
  if (/^(P?NYSC|NYSC|N)\d+/i.test(code) || (/intern/i.test(contType) && /^N\d+/i.test(code))) return 'NYSC';
  if (/^\d+/.test(code) || /^P\d+/i.test(code) || /^5\d+/.test(code)) return 'Permanent';
  return 'Other';
};

const normalizeCode = (code: string) => {
  const raw = upper(code).replace(/^EMPLOYEE\s*CODE\s*/i, '');
  if (/^\d+$/.test(raw)) return raw.padStart(4, '0'); // Sage permanent often unpadded
  return raw;
};

const hrisMatchKeys = (code: string) => {
  const keys = new Set<string>([code, upper(code)]);
  if (/^\d+$/.test(code)) {
    keys.add(code.padStart(4, '0'));
    keys.add(`P${code.padStart(4, '0')}`);
    keys.add(`P${code}`);
  }
  if (/^0+\d+$/.test(code)) {
    const stripped = code.replace(/^0+/, '') || '0';
    keys.add(stripped);
    keys.add(stripped.padStart(4, '0'));
    keys.add(`P${stripped.padStart(4, '0')}`);
  }
  return [...keys];
};

const readSage = (): SageRow[] => {
  const escaped = XLSX.replace(/\\/g, '\\\\');
  const py = `
from openpyxl import load_workbook
import json, re
path = r'''${escaped}'''
wb = load_workbook(path, data_only=True, read_only=True)
out=[]

def num(v):
  try: return float(v or 0)
  except: return 0.0

# Permanent
ws=wb['Perm.Staff']
rows=list(ws.iter_rows(values_only=True))
headers=[str(c or '').strip() for c in rows[0]]
idx={h:i for i,h in enumerate(headers)}
for row in rows[1:]:
  code=str(row[idx.get('Employee Code',0)] or '').strip().upper()
  if not code: continue
  surname=str(row[idx.get('EmployeeSurname',1)] or '').strip()
  first=str(row[idx.get('EmployeeFirstName',2)] or '').strip()
  out.append({
    'code': code,
    'category': 'Permanent',
    'contType': 'Permanent',
    'name': (first + ' ' + surname).strip() or (surname + ' ' + first).strip(),
    'gross': num(row[idx.get('Gross Earnings')]) if 'Gross Earnings' in idx else num(row[idx.get('Earning Total')]),
    'net': num(row[idx.get('Net Pay')]) if 'Net Pay' in idx else 0,
    'deductions': num(row[idx.get('Deduction Total')]) if 'Deduction Total' in idx else 0,
    'basic': num(row[idx.get('BASIC SALARY (Earning)')]) if 'BASIC SALARY (Earning)' in idx else 0,
    'sheet': 'Perm.Staff',
  })

# Contract / stipend
ws=wb['Cont. Staff']
rows=list(ws.iter_rows(values_only=True))
headers=[str(c or '').strip() for c in rows[0]]
idx={h:i for i,h in enumerate(headers)}
for row in rows[1:]:
  code=str(row[idx.get('Employee Code',0)] or '').strip().upper()
  if not code: continue
  cont=str(row[idx.get('Cont Type',1)] or '').strip()
  surname=str(row[idx.get('EmployeeSurname',2)] or '').strip()
  first=str(row[idx.get('EmployeeFirstName',3)] or '').strip()
  # classify
  if re.match(r'^L\\d+', code) or cont.lower()=='lumpsum':
    cat='Lumpsum'
  elif re.match(r'^(P?IT|IT|I)\\d+', code):
    cat='IT'
  elif re.match(r'^(P?NYSC|NYSC|N)\\d+', code):
    cat='NYSC'
  elif cont.lower()=='intern' and re.match(r'^I\\d+', code):
    cat='IT'
  elif cont.lower()=='intern' and re.match(r'^N\\d+', code):
    cat='NYSC'
  else:
    cat='Other'
  out.append({
    'code': code,
    'category': cat,
    'contType': cont or cat,
    'name': (first + ' ' + surname).strip() or (surname + ' ' + first).strip(),
    'gross': num(row[idx.get('Gross Earnings')]) if 'Gross Earnings' in idx else num(row[idx.get('Earning Total')]),
    'net': num(row[idx.get('Net Pay')]) if 'Net Pay' in idx else 0,
    'deductions': num(row[idx.get('Deduction Total')]) if 'Deduction Total' in idx else 0,
    'basic': num(row[idx.get('LUMSUM AMOUNT (Earning)')] or row[idx.get('LUMPSUM ALLOWANCE (Earning)')] or row[idx.get('IT ALLOWANCE (Earning)')] or row[idx.get('NYSC ALLOWANCE (Earning)')]),
    'sheet': 'Cont. Staff',
  })
wb.close()
print(json.dumps(out))
`;
  const result = spawnSync('python', ['-c', py], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Failed reading JULY PAYROLL.xlsx');
  return (JSON.parse(result.stdout) as SageRow[]).map((row) => ({
    ...row,
    code: normalizeCode(row.code),
    category: row.category || classifyCode(row.code, row.contType),
  }));
};

const classifyHris = (record: { employeeCode?: string; employmentType?: string; salaryGrade?: string; profileId?: string }): SageCategory => {
  const code = upper(record.employeeCode);
  if (isStipendPayrollEmployeeCode({
    employeeCode: code,
    employeeId: code,
    employmentType: record.employmentType || '',
    staffCategory: '',
    employeeCategory: '',
    jobTitle: '',
  })) {
    if (/^(P?NYSC|NYSC|N)\d+/i.test(code)) return 'NYSC';
    if (/^(P?IT|IT|I)\d+/i.test(code)) return 'IT';
    return /nysc/i.test(String(record.employmentType || record.salaryGrade || '')) ? 'NYSC' : 'IT';
  }
  if (/^L\d+/i.test(code) || /lumpsum|lump sum/i.test(String(record.employmentType || record.salaryGrade || ''))) return 'Lumpsum';
  if (/^C\d+/i.test(code)) return 'Other';
  return 'Permanent';
};

const main = async () => {
  console.log('Reading', XLSX);
  const sage = readSage();
  const calc = await calculatePayrollForPeriod(PERIOD, { forceRefresh: true, pack: 'salaried' });

  const hrisByKey = new Map<string, (typeof calc.records)[number]>();
  for (const record of calc.records) {
    for (const key of hrisMatchKeys(upper(record.employeeCode || record.employeeId))) {
      if (!hrisByKey.has(key)) hrisByKey.set(key, record);
    }
  }

  const categories: SageCategory[] = ['Permanent', 'Lumpsum', 'IT', 'NYSC', 'Other'];
  const summary: Record<string, {
    sageHc: number; hrisHc: number; matched: number; missingInHris: number; extraHint: number;
    sageGross: number; hrisGross: number; sageNet: number; hrisNet: number;
    grossDiffEmployees: number; exactGross: number; exactNet: number;
  }> = Object.fromEntries(categories.map((category) => [category, {
    sageHc: 0, hrisHc: 0, matched: 0, missingInHris: 0, extraHint: 0,
    sageGross: 0, hrisGross: 0, sageNet: 0, hrisNet: 0,
    grossDiffEmployees: 0, exactGross: 0, exactNet: 0,
  }]));

  const missing: Array<Record<string, unknown>> = [];
  const diffs: Array<Record<string, unknown>> = [];
  const matchedCodes = new Set<string>();

  for (const row of sage) {
    const bucket = summary[row.category];
    bucket.sageHc += 1;
    bucket.sageGross += row.gross;
    bucket.sageNet += row.net;

    let record: (typeof calc.records)[number] | undefined;
    for (const key of hrisMatchKeys(row.code)) {
      record = hrisByKey.get(key);
      if (record) break;
    }
    if (!record) {
      bucket.missingInHris += 1;
      missing.push({ code: row.code, category: row.category, name: row.name, sageGross: round(row.gross), sageNet: round(row.net) });
      continue;
    }
    matchedCodes.add(upper(record.employeeCode || record.employeeId));
    bucket.matched += 1;
    bucket.hrisGross += record.grossPay;
    bucket.hrisNet += record.netPay;
    const gDiff = round(record.grossPay - row.gross);
    const nDiff = round(record.netPay - row.net);
    if (Math.abs(gDiff) < 0.5) bucket.exactGross += 1;
    else bucket.grossDiffEmployees += 1;
    if (Math.abs(nDiff) < 0.5) bucket.exactNet += 1;
    diffs.push({
      code: row.code,
      hrisCode: record.employeeCode,
      category: row.category,
      name: row.name,
      sageGross: round(row.gross),
      hrisGross: round(record.grossPay),
      grossDiff: gDiff,
      sageNet: round(row.net),
      hrisNet: round(record.netPay),
      netDiff: nDiff,
      hrisStatus: record.payrollStatus || record.status,
      employmentType: record.employmentType,
    });
  }

  for (const record of calc.records) {
    const category = classifyHris(record);
    summary[category].hrisHc += 1;
    const code = upper(record.employeeCode || record.employeeId);
    if (!matchedCodes.has(code) && !hrisMatchKeys(code).some((key) => sage.some((row) => hrisMatchKeys(row.code).includes(key)))) {
      summary[category].extraHint += 1;
    }
  }

  // extras: in HRIS salaried but not in JULY PAYROLL
  const extras: Array<Record<string, unknown>> = [];
  for (const record of calc.records) {
    const code = upper(record.employeeCode || record.employeeId);
    const found = sage.some((row) => hrisMatchKeys(row.code).some((key) => hrisMatchKeys(code).includes(key)));
    if (!found) {
      extras.push({
        code,
        category: classifyHris(record),
        name: record.fullName,
        hrisGross: round(record.grossPay),
        hrisNet: round(record.netPay),
        employmentType: record.employmentType,
      });
    }
  }

  const topGross = [...diffs].filter((row) => Math.abs(Number(row.grossDiff)) >= 0.5).sort((a, b) => Math.abs(Number(b.grossDiff)) - Math.abs(Number(a.grossDiff)));

  console.log('\n=== JULY PAYROLL.xlsx vs HRIS salaried pack (2026-07) ===\n');
  console.log(`Sage file total rows: ${sage.length}`);
  console.log(`HRIS salaried records: ${calc.records.length}`);
  console.log(`HRIS salaried gross: ${money(calc.summary.grossPay)} | net: ${money(calc.summary.netPay)}`);
  console.log(`Sage file gross: ${money(sage.reduce((s, r) => s + r.gross, 0))} | net: ${money(sage.reduce((s, r) => s + r.net, 0))}`);

  console.log('\nBy category:');
  for (const category of categories) {
    const s = summary[category];
    if (!s.sageHc && !s.hrisHc) continue;
    console.log(
      `  ${category}: Sage HC ${s.sageHc} | HRIS HC ${s.hrisHc} | matched ${s.matched} | missing ${s.missingInHris} | extras~ ${extras.filter((e) => e.category === category).length}`,
    );
    console.log(
      `    Gross Sage ${money(s.sageGross)} | HRIS matched ${money(s.hrisGross)} | diff ${money(s.hrisGross - s.sageGross)} | exact gross ${s.exactGross}/${s.matched}`,
    );
    console.log(
      `    Net   Sage ${money(s.sageNet)} | HRIS matched ${money(s.hrisNet)} | diff ${money(s.hrisNet - s.sageNet)} | exact net ${s.exactNet}/${s.matched}`,
    );
  }

  console.log(`\nMissing in HRIS payroll: ${missing.length}`);
  for (const row of missing.slice(0, 20)) {
    console.log(`  ? ${row.code} [${row.category}] ${row.name} SageGross=${money(Number(row.sageGross))}`);
  }

  console.log(`\nExtra in HRIS salaried (not in JULY PAYROLL): ${extras.length}`);
  const extrasByCat = extras.reduce((map, row) => {
    const key = String(row.category);
    map[key] = (map[key] || 0) + 1;
    return map;
  }, {} as Record<string, number>);
  console.log('  extras by category:', extrasByCat);
  for (const row of extras.slice(0, 20)) {
    console.log(`  + ${row.code} [${row.category}] ${row.name} HRISGross=${money(Number(row.hrisGross))} type=${row.employmentType}`);
  }

  console.log(`\nTop gross diffs (matched): ${topGross.length}`);
  for (const row of topGross.slice(0, 25)) {
    console.log(
      `  ${row.code}->${row.hrisCode} [${row.category}] grossDiff=${money(Number(row.grossDiff))} (Sage ${money(Number(row.sageGross))} vs HRIS ${money(Number(row.hrisGross))}) netDiff=${money(Number(row.netDiff))}`,
    );
  }

  const outPath = path.join(process.cwd(), 'apps/dashboard/data/hris/july-2026-salaried-vs-hris-diff.json');
  writeFileSync(outPath, JSON.stringify({
    period: PERIOD,
    source: XLSX,
    sageCount: sage.length,
    hrisCount: calc.records.length,
    summary,
    missing,
    extras,
    topGrossDiffs: topGross.slice(0, 100),
    allDiffs: diffs,
  }, null, 2));
  console.log(`\nFull detail: ${outPath}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
