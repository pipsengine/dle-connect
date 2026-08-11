/**
 * Deep compare July 2026 Sage Dayrate Payment Schedule vs HRIS daily-rate pack.
 *
 * Usage:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/compare-july-2026-sage-vs-hris.mts
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadWorkspaceEnv } from '../lib/dle-enterprise-db.ts';
import { calculatePayrollForPeriod } from '../lib/payroll-calculation-service.ts';

loadWorkspaceEnv();

const PERIOD = '2026-07';
const XLSX =
  process.env.SAGE_DAYRATE_SCHEDULE_XLSX ||
  'C:\\Users\\chrisogbaisi\\OneDrive - Dorman Long Engineering Limited\\Desktop\\DLE Connect\\Hris\\Dayrate Payment Schedule\\DAYRATE PAYMENT SCHEDULE .xlsx';

const round = (value: unknown) => Math.round((Number(value) || 0) * 100) / 100;
const money = (value: number) => round(value).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type SageRow = {
  code: string;
  company: 'DLE' | 'DLPC';
  name: string;
  rate: number;
  weekdays: number;
  wkdEarn: number;
  wkdOvt: number;
  sat: number;
  sun: number;
  ph: number;
  night: number;
  meal: number;
  transport: number;
  stock: number;
  site: number;
  tcmMeal: number;
  tcmTrans: number;
  totalEarn: number;
  wht: number;
  gross: number;
  net: number;
};

const readSage = (): SageRow[] => {
  const escaped = XLSX.replace(/\\/g, '\\\\');
  const py = `
from openpyxl import load_workbook
import json, re
path = r'''${escaped}'''
wb = load_workbook(path, data_only=True, read_only=True)
out=[]
seen=set()
for sheet, company in [('DLE','DLE'),('DLPC','DLPC')]:
  rows=list(wb[sheet].iter_rows(values_only=True))
  headers=[str(c or '').strip() for c in rows[0]]
  idx={h:i for i,h in enumerate(headers)}
  for row in rows[1:]:
    code=str(row[idx.get('Emp. Code',0)] or '').strip().upper()
    if not re.fullmatch(r'C\\d+', code) or code in seen: continue
    first=str(row[idx.get('First Name',1)] or '').strip()
    last=str(row[idx.get('Last Name',2)] or '').strip()
    if not first and not last: continue
    def f(col):
      if col not in idx: return 0.0
      try: return float(row[idx[col]] or 0)
      except: return 0.0
    seen.add(code)
    out.append({
      'code':code,'company':company,'name':(first+' '+last).strip(),
      'rate':f('Daily Rate'),'weekdays':f('Total Weekday'),
      'wkdEarn':f('Wkd Earning'),'wkdOvt':f('Wkd Ovt Amt'),'sat':f('Sat Ovt Amt'),'sun':f('Sun Ovt Amt'),
      'ph':f('PH Amt'),'night':f('Night Amt'),'meal':f('Meal Allowance'),'transport':f('Transport'),
      'stock':f('Stock Count'),'site':f('Site Allowance') if 'Site Allowance' in idx else 0.0,
      'tcmMeal':f('TCM Meal') if 'TCM Meal' in idx else 0.0,
      'tcmTrans':f('TCM TRANSPORT') if 'TCM TRANSPORT' in idx else 0.0,
      'totalEarn':f('Total Earnings'),'wht':f('WHT'),'gross':f('Gross Salary'),'net':f('Net Pay'),
    })
wb.close()
print(json.dumps(out))
`;
  const result = spawnSync('python', ['-c', py], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Failed reading Sage Excel');
  return JSON.parse(result.stdout) as SageRow[];
};

const lineAmount = (record: { paidEarningLines?: Array<{ code?: string; name?: string; amount?: number }>; earningLines?: Array<{ code?: string; name?: string; amount?: number }> }, pattern: RegExp) => {
  const lines = record.paidEarningLines || record.earningLines || [];
  return round(lines.filter((line) => pattern.test(String(line.code || '')) || pattern.test(String(line.name || ''))).reduce((sum, line) => sum + Number(line.amount || 0), 0));
};

const main = async () => {
  console.log('Loading Sage Excel + HRIS daily-rate calculation for', PERIOD);
  const sage = readSage();
  const calc = await calculatePayrollForPeriod(PERIOD, { forceRefresh: true, pack: 'daily-rate' });
  const byCode = new Map(calc.records.map((record) => [String(record.employeeCode || '').toUpperCase(), record]));

  const company = {
    DLE: { sageHc: 0, hrisHc: 0, sageGross: 0, hrisGross: 0, sageNet: 0, hrisNet: 0, sageWht: 0, hrisDed: 0 },
    DLPC: { sageHc: 0, hrisHc: 0, sageGross: 0, hrisGross: 0, sageNet: 0, hrisNet: 0, sageWht: 0, hrisDed: 0 },
  };

  const rows: Array<Record<string, unknown>> = [];
  const missingInHris: string[] = [];
  const extraInHris: string[] = [];

  for (const s of sage) {
    const bucket = company[s.company];
    bucket.sageHc += 1;
    bucket.sageGross += s.gross;
    bucket.sageNet += s.net;
    bucket.sageWht += s.wht;
    const h = byCode.get(s.code);
    if (!h) {
      missingInHris.push(s.code);
      rows.push({ code: s.code, company: s.company, name: s.name, issue: 'MISSING_IN_HRIS', sageGross: round(s.gross), hrisGross: 0, grossDiff: round(-s.gross) });
      continue;
    }
    bucket.hrisHc += 1;
    bucket.hrisGross += h.grossPay;
    bucket.hrisNet += h.netPay;
    bucket.hrisDed += Number(h.totalDeductions || h.deductions || 0);

    const hrisWeekday = lineAmount(h, /JCWEEKDAY(?!_NT)/i) + lineAmount(h, /JCWEEKDAY_NT/i);
    const hrisMeal = lineAmount(h, /^MEAL$|MEAL ALLOWANCE/i);
    const hrisOvt = lineAmount(h, /WEEKDAYOVT|OVT/i);
    const hrisSat = lineAmount(h, /SATEARN|SATURDAY/i);
    const hrisSun = lineAmount(h, /SUNDAYEARN|SUNDAY/i);
    const hrisPh = lineAmount(h, /PUBHOL|PUBLIC HOLIDAY/i);
    const hrisNight = lineAmount(h, /NIGHT/i);
    const hrisTransport = lineAmount(h, /TRANSPORT|TCMTRANS/i);
    const hrisStock = lineAmount(h, /STOCK/i);
    const hrisSite = lineAmount(h, /SITE/i);
    const expectedWkd = round(s.weekdays * s.rate);

    rows.push({
      code: s.code,
      company: s.company,
      name: s.name,
      sageGross: round(s.gross),
      hrisGross: round(h.grossPay),
      grossDiff: round(h.grossPay - s.gross),
      sageNet: round(s.net),
      hrisNet: round(h.netPay),
      netDiff: round(h.netPay - s.net),
      sageWht: round(s.wht),
      hrisDed: round(h.totalDeductions || h.deductions || 0),
      dedDiff: round(Number(h.totalDeductions || h.deductions || 0) - s.wht),
      sageWkdEarn: round(s.wkdEarn),
      expectedWkd,
      hrisWeekday,
      wkdBaseDiff: round(hrisWeekday - s.wkdEarn),
      daysTimesRateVsSageWkd: round(expectedWkd - s.wkdEarn),
      sageMeal: round(s.meal),
      hrisMeal,
      mealDiff: round(hrisMeal - s.meal),
      sageOvt: round(s.wkdOvt),
      hrisOvt,
      ovtDiff: round(hrisOvt - s.wkdOvt),
      sageSat: round(s.sat),
      hrisSat,
      satDiff: round(hrisSat - s.sat),
      sageSun: round(s.sun),
      hrisSun,
      sunDiff: round(hrisSun - s.sun),
      sagePh: round(s.ph),
      hrisPh,
      phDiff: round(hrisPh - s.ph),
      sageNight: round(s.night),
      hrisNight,
      nightDiff: round(hrisNight - s.night),
      sageTransport: round(s.transport + s.tcmTrans),
      hrisTransport,
      transportDiff: round(hrisTransport - (s.transport + s.tcmTrans)),
      sageStock: round(s.stock),
      hrisStock,
      stockDiff: round(hrisStock - s.stock),
      sageSite: round(s.site),
      hrisSite,
      siteDiff: round(hrisSite - s.site),
      sageTotalEarn: round(s.totalEarn),
      rate: s.rate,
      weekdays: s.weekdays,
    });
  }

  const sageCodes = new Set(sage.map((row) => row.code));
  for (const record of calc.records) {
    const code = String(record.employeeCode || '').toUpperCase();
    if (!sageCodes.has(code)) extraInHris.push(code);
  }

  const grossDiffs = rows
    .filter((row) => Math.abs(Number(row.grossDiff || 0)) >= 0.5)
    .sort((a, b) => Math.abs(Number(b.grossDiff)) - Math.abs(Number(a.grossDiff)));
  const netDiffs = rows
    .filter((row) => Math.abs(Number(row.netDiff || 0)) >= 0.5)
    .sort((a, b) => Math.abs(Number(b.netDiff)) - Math.abs(Number(a.netDiff)));

  const componentBuckets = [
    ['weekday base', 'wkdBaseDiff'],
    ['meal', 'mealDiff'],
    ['weekday OT', 'ovtDiff'],
    ['saturday', 'satDiff'],
    ['sunday', 'sunDiff'],
    ['public holiday', 'phDiff'],
    ['night', 'nightDiff'],
    ['transport', 'transportDiff'],
    ['stock', 'stockDiff'],
    ['site', 'siteDiff'],
    ['WHT/deductions', 'dedDiff'],
  ] as const;

  const componentSummary = Object.fromEntries(
    componentBuckets.map(([label, key]) => {
      const sum = round(rows.reduce((acc, row) => acc + Number(row[key] || 0), 0));
      const count = rows.filter((row) => Math.abs(Number(row[key] || 0)) >= 0.5).length;
      return [label, { sumDiff: sum, employeesWithDiff: count }];
    }),
  );

  const totals = {
    sage: {
      hc: sage.length,
      gross: round(sage.reduce((sum, row) => sum + row.gross, 0)),
      net: round(sage.reduce((sum, row) => sum + row.net, 0)),
      wht: round(sage.reduce((sum, row) => sum + row.wht, 0)),
    },
    hris: {
      hc: calc.records.length,
      gross: round(calc.summary.grossPay),
      net: round(calc.summary.netPay),
      deductions: round(calc.summary.deductions || calc.summary.totalDeductions || 0),
    },
  };

  const report = {
    period: PERIOD,
    sageSummaryTarget: {
      DLENG: { hc: 86, gross: 33394902.92, net: 31725157.77 },
      DLPC: { hc: 107, gross: 34476702.52, net: 32752867.4 },
      Total: { hc: 193, gross: 67871605.44, net: 64478025.17 },
    },
    totals: {
      ...totals,
      grossDiff: round(totals.hris.gross - totals.sage.gross),
      netDiff: round(totals.hris.net - totals.sage.net),
      hcDiff: totals.hris.hc - totals.sage.hc,
    },
    company: {
      DLE: {
        ...company.DLE,
        sageGross: round(company.DLE.sageGross),
        hrisGross: round(company.DLE.hrisGross),
        grossDiff: round(company.DLE.hrisGross - company.DLE.sageGross),
        sageNet: round(company.DLE.sageNet),
        hrisNet: round(company.DLE.hrisNet),
        netDiff: round(company.DLE.hrisNet - company.DLE.sageNet),
      },
      DLPC: {
        ...company.DLPC,
        sageGross: round(company.DLPC.sageGross),
        hrisGross: round(company.DLPC.hrisGross),
        grossDiff: round(company.DLPC.hrisGross - company.DLPC.sageGross),
        sageNet: round(company.DLPC.sageNet),
        hrisNet: round(company.DLPC.hrisNet),
        netDiff: round(company.DLPC.hrisNet - company.DLPC.sageNet),
      },
    },
    membership: { missingInHris, extraInHris },
    componentSummary,
    topGrossDiffs: grossDiffs.slice(0, 30),
    topNetDiffs: netDiffs.slice(0, 20),
    employeesExactGross: rows.length - grossDiffs.length,
    employeesExactNet: rows.length - netDiffs.length,
  };

  const outPath = path.join(process.cwd(), 'apps/dashboard/data/hris/july-2026-sage-vs-hris-diff.json');
  writeFileSync(outPath, JSON.stringify({ ...report, allRows: rows }, null, 2), 'utf8');

  console.log('\n=== SAGE SUMMARY (attached) vs HRIS DAILY-RATE ===');
  console.log(`Headcount  Sage ${totals.sage.hc} | HRIS ${totals.hris.hc} | diff ${totals.hris.hc - totals.sage.hc}`);
  console.log(`Gross      Sage ${money(totals.sage.gross)} | HRIS ${money(totals.hris.gross)} | diff ${money(totals.hris.gross - totals.sage.gross)}`);
  console.log(`Net        Sage ${money(totals.sage.net)} | HRIS ${money(totals.hris.net)} | diff ${money(totals.hris.net - totals.sage.net)}`);
  console.log('\nCompany split:');
  for (const key of ['DLE', 'DLPC'] as const) {
    const c = report.company[key];
    console.log(
      `  ${key}: HC Sage ${c.sageHc}/HRIS ${c.hrisHc} | Gross diff ${money(c.grossDiff)} | Net diff ${money(c.netDiff)}`,
    );
  }
  console.log('\nComponent contribution to gross/net gap (HRIS - Sage):');
  for (const [label, stats] of Object.entries(componentSummary)) {
    if (Math.abs(stats.sumDiff) < 0.5 && stats.employeesWithDiff === 0) continue;
    console.log(`  ${label}: ${money(stats.sumDiff)} across ${stats.employeesWithDiff} employee(s)`);
  }
  console.log(`\nExact gross matches: ${report.employeesExactGross}/${rows.length}`);
  console.log(`Exact net matches:   ${report.employeesExactNet}/${rows.length}`);
  if (missingInHris.length) console.log('Missing in HRIS:', missingInHris.join(', '));
  if (extraInHris.length) console.log('Extra in HRIS:', extraInHris.join(', '));
  console.log('\nTop gross diffs:');
  for (const row of report.topGrossDiffs.slice(0, 15)) {
    console.log(
      `  ${row.code} [${row.company}] gross ${money(Number(row.grossDiff))} (Sage ${money(Number(row.sageGross))} vs HRIS ${money(Number(row.hrisGross))}) meal ${money(Number(row.mealDiff))} wkd ${money(Number(row.wkdBaseDiff))}`,
    );
  }
  console.log(`\nFull detail written to ${outPath}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
