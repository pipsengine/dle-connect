/**
 * Read-only: list DLE Salaries employees whose September PAYE is not NTA-correct.
 * Does not change payroll or tax code.
 *
 * Correct PAYE (payroll-tax-config.json / Nigeria Tax Act 2025):
 * - Progressive bands after pension (permanent), NHF where applicable, rent relief
 * - Rent relief capped at ₦500,000 (never the lumpsum cliff that exceeds the cap)
 * - Regular monthly earnings annualized; overtime / leave / arrears taxed once
 * - Respect each earning line's taxable flag
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { loadWorkspaceEnv } from '../apps/dashboard/lib/dle-enterprise-db';
import {
  calculatePayrollForPeriod,
  invalidatePayrollCalculationCache,
  type PayrollCalculationRecord,
} from '../apps/dashboard/lib/payroll-calculation-service';
import { isVariableEarningForPaye, splitEarningLinesForPaye } from '../apps/dashboard/lib/payroll-earning-tax-classification';
import { resolvePayCurrency } from '../apps/dashboard/lib/payroll-currency';
import { resolvePayrollCompany } from '../apps/dashboard/lib/payroll-schedule-scope';
import {
  basicFromEarningLines,
  bhtFromEarningLines,
  payeTaxableFromEarningLines,
  resolveSageAlignedAnnualRentRelief,
  type SagePayeEarningLine,
} from '../apps/dashboard/lib/payroll-sage-pay-rules';

loadWorkspaceEnv();

const PERIOD = '2026-09';
const RENT_CAP = 500_000;
const TOLERANCE = 1;
const round = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

const BANDS: Array<{ amount: number | null; rate: number }> = [
  { amount: 800000, rate: 0 },
  { amount: 2200000, rate: 0.15 },
  { amount: 9000000, rate: 0.18 },
  { amount: 13000000, rate: 0.21 },
  { amount: 25000000, rate: 0.23 },
  { amount: null, rate: 0.25 },
];

const taxChargeable = (chargeable: number) => {
  let remaining = Math.max(0, chargeable);
  let tax = 0;
  for (const band of BANDS) {
    if (remaining <= 0) break;
    const slice = band.amount === null ? remaining : Math.min(remaining, Math.max(0, band.amount));
    tax += slice * band.rate;
    remaining = Math.max(0, remaining - slice);
  }
  return round(tax);
};

const compact = (v: unknown) => String(v || '').trim();
const canon = (v: unknown) => compact(v).toUpperCase().replace(/[^A-Z0-9]/g, '');

const payeCategory = (profileId?: string) => {
  if (profileId === 'contract-lumpsum') return 'lumpsum';
  if (String(profileId || '').startsWith('contract-')) return 'contract';
  if (profileId === 'stipend-non-taxable') return 'stipend';
  return 'permanent';
};

const mapLines = (record: PayrollCalculationRecord): SagePayeEarningLine[] =>
  (record.earningLines || []).map((line) => ({
    code: String(line.code || ''),
    name: String(line.name || ''),
    amount: Number(line.amount || 0),
    taxable: line.taxable,
    taxableAmount: line.taxable === false ? 0 : Number(line.amount || 0),
  }));

/** Meal / NJIC stay annualized; only true month-only adds stay variable. */
const isCorrectVariable = (line: SagePayeEarningLine, category: string) => {
  if (category === 'lumpsum') return isVariableEarningForPaye(line, { category: 'permanent' });
  return isVariableEarningForPaye(line, { category });
};

const splitCorrect = (lines: SagePayeEarningLine[], category: string) => {
  const fixed: SagePayeEarningLine[] = [];
  const variable: SagePayeEarningLine[] = [];
  for (const line of lines) {
    if (isCorrectVariable(line, category)) variable.push(line);
    else fixed.push(line);
  }
  return { fixed, variable };
};

const lineLooksMeal = (line: SagePayeEarningLine) =>
  /MEAL/.test(canon(line.code)) || /\bMEAL\b/.test(String(line.name || '').toUpperCase());

const lineLooksUnionEarning = (line: SagePayeEarningLine) => {
  const code = canon(line.code);
  const name = String(line.name || '').toUpperCase();
  return /UNION/.test(code) || /\bUNION\b/.test(name);
};

const ntaPaye = (input: {
  category: string;
  salaryGrade: string;
  lines: SagePayeEarningLine[];
  nhfApplicable: boolean;
  pensionMonthly: number;
  rentRelief: number;
}) => {
  if (input.category === 'stipend') return { paye: 0, fixedTaxable: 0, variableTaxable: 0, rentRelief: 0, chargeable: 0 };
  const { fixed, variable } = splitCorrect(input.lines, input.category);
  const fixedTaxable = payeTaxableFromEarningLines(fixed, input.category, input.salaryGrade, null);
  const variableTaxable = payeTaxableFromEarningLines(variable, input.category, input.salaryGrade, null);
  const monthlyBasic = basicFromEarningLines(fixed);
  const annualPension = input.category === 'permanent' ? round(Math.max(0, input.pensionMonthly) * 12) : 0;
  const annualNhf = input.nhfApplicable ? round(monthlyBasic * 0.025 * 12) : 0;
  const rentRelief = Math.min(RENT_CAP, Math.max(0, input.rentRelief));
  const annualTaxable = round(Math.max(0, fixedTaxable) * 12 + Math.max(0, variableTaxable));
  const chargeable = round(Math.max(0, annualTaxable - annualPension - annualNhf - rentRelief));
  const paye = round(taxChargeable(chargeable) / 12);
  return { paye, fixedTaxable, variableTaxable, rentRelief, chargeable, annualTaxable, annualPension, annualNhf };
};

const money = (n: number) => round(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const main = async () => {
  invalidatePayrollCalculationCache(PERIOD);
  const calculation = await calculatePayrollForPeriod(PERIOD, {
    pack: 'salaried',
    company: 'DLE',
    forceRefresh: true,
  });
  const records = (calculation.records || []).filter((record) => {
    if (record.isDailyRate) return false;
    if (resolvePayrollCompany(record) !== 'DLE') return false;
    if (resolvePayCurrency(record) === 'USD') return false;
    return true;
  });

  const rows = records.map((record) => {
    const category = payeCategory(record.earningProfileId);
    const lines = mapLines(record);
    const currentSplit = splitEarningLinesForPaye(lines, { category });
    const currentFixedTaxable = payeTaxableFromEarningLines(currentSplit.fixed, category, record.salaryGrade, null);
    const currentVariableTaxable = payeTaxableFromEarningLines(currentSplit.variable, category, record.salaryGrade, null);
    const currentRent = resolveSageAlignedAnnualRentRelief({
      category,
      monthlyTaxable: currentFixedTaxable,
      employee: { salaryGrade: record.salaryGrade, jobGrade: record.salaryGrade } as never,
    });
    const expectedRentInput =
      category === 'permanent'
        ? currentRent > 0
          ? Math.min(RENT_CAP, currentRent)
          : RENT_CAP
        : Math.min(RENT_CAP, Math.max(0, currentRent));
    const expected = ntaPaye({
      category,
      salaryGrade: record.salaryGrade || '',
      lines,
      nhfApplicable: Boolean(record.nhfApplicable),
      pensionMonthly: Number(record.pensionEmployee || 0),
      rentRelief: expectedRentInput,
    });
    const currentPaye = round(Number(record.paye || 0));
    const delta = round(expected.paye - currentPaye);
    const mealLines = lines.filter(lineLooksMeal);
    const unionEarn = lines.filter(lineLooksUnionEarning);
    const reasons: string[] = [];
    if (currentRent > RENT_CAP + 0.5) reasons.push(`rent_relief_over_cap (${money(currentRent)} > ${money(RENT_CAP)})`);
    if (category === 'lumpsum') {
      const mealInVariable = currentSplit.variable.filter(lineLooksMeal).filter((l) => Number(l.taxableAmount || l.amount || 0) > 0);
      if (mealInVariable.length) reasons.push('lumpsum_meal_taxed_as_one_off_not_annualized');
    }
    if (Math.abs(delta) >= TOLERANCE && !reasons.length) reasons.push('nta_paye_differs');
    return {
      code: compact(record.employeeCode || record.employeeId),
      name: compact(record.fullName),
      grade: compact(record.salaryGrade),
      profile: compact(record.earningProfileId),
      category,
      department: compact(record.department),
      gross: round(Number(record.grossPay || 0)),
      currentPaye,
      expectedPaye: expected.paye,
      delta,
      currentRent: round(currentRent),
      expectedRent: expected.rentRelief,
      currentFixedTaxable: round(currentFixedTaxable),
      currentVariableTaxable: round(currentVariableTaxable),
      expectedFixedTaxable: expected.fixedTaxable,
      expectedVariableTaxable: expected.variableTaxable,
      pension: round(Number(record.pensionEmployee || 0)),
      meal: mealLines.map((l) => ({
        code: l.code,
        amount: round(Number(l.amount || 0)),
        taxable: l.taxable !== false,
      })),
      unionEarning: unionEarn.map((l) => ({
        code: l.code,
        amount: round(Number(l.amount || 0)),
        taxable: l.taxable !== false,
      })),
      reasons,
      example: /^(L2216|L2374|P0059)$/i.test(compact(record.employeeCode || record.employeeId)),
    };
  });

  const incorrect = rows
    .filter((row) => Math.abs(row.delta) >= TOLERANCE)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const examples = rows.filter((row) => row.example);
  const rentCapVictims = incorrect.filter((row) => row.currentRent > RENT_CAP + 0.5);
  const lumpsumMeal = incorrect.filter((row) => row.reasons.includes('lumpsum_meal_taxed_as_one_off_not_annualized'));

  const summary = {
    period: PERIOD,
    pack: 'DLE Salaries NGN',
    headcount: rows.length,
    incorrectCount: incorrect.length,
    rentReliefOverCap: rentCapVictims.length,
    lumpsumMealNotAnnualized: lumpsumMeal.length,
    currentPayeTotal: round(rows.reduce((s, r) => s + r.currentPaye, 0)),
    expectedPayeTotal: round(rows.reduce((s, r) => s + r.expectedPaye, 0)),
    understatedTotal: round(incorrect.filter((r) => r.delta > 0).reduce((s, r) => s + r.delta, 0)),
    overstatedTotal: round(incorrect.filter((r) => r.delta < 0).reduce((s, r) => s + Math.abs(r.delta), 0)),
  };

  mkdirSync(path.resolve('tmp'), { recursive: true });
  const outPath = path.resolve('tmp/september-paye-audit.json');
  writeFileSync(outPath, JSON.stringify({ summary, examples, incorrect }, null, 2));

  const linesOut: string[] = [];
  const log = (line = '') => linesOut.push(line);
  log(`Period ${PERIOD} · DLE Salaries NGN`);
  log(`Headcount ${summary.headcount} · PAYE incorrect ${summary.incorrectCount}`);
  log(`Current PAYE total ${money(summary.currentPayeTotal)} · NTA-correct total ${money(summary.expectedPayeTotal)}`);
  log(`Understated ${money(summary.understatedTotal)} · Overstated ${money(summary.overstatedTotal)}`);
  log(`Rent relief above ₦500,000 cap: ${summary.rentReliefOverCap}`);
  log(`Lumpsum meal taxed as one-off: ${summary.lumpsumMealNotAnnualized}`);
  log('');
  log('Attached examples');
  for (const row of examples) {
    log(
      `${row.code} ${row.name}  current ${money(row.currentPaye)}  correct ${money(row.expectedPaye)}  delta ${money(row.delta)}  ${row.reasons.join('; ') || 'matches NTA'}`,
    );
  }
  log('');
  log(`ALL employees whose PAYE is not correct (${incorrect.length})`);
  log('code\tname\tcategory\tgrade\tgross\tcurrent_paye\tcorrect_paye\tdelta\treason');
  for (const row of incorrect) {
    log(
      `${row.code}\t${row.name}\t${row.category}\t${row.grade}\t${money(row.gross)}\t${money(row.currentPaye)}\t${money(row.expectedPaye)}\t${money(row.delta)}\t${row.reasons.join('; ')}`,
    );
  }

  const textPath = path.resolve('tmp/september-paye-audit.txt');
  writeFileSync(textPath, linesOut.join('\n'), 'utf8');
  console.log(linesOut.join('\n'));
  console.log(`\nWrote ${outPath}`);
  console.log(`Wrote ${textPath}`);
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    setTimeout(() => process.exit(process.exitCode || 0), 250).unref();
  });
