import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import type { PayrollCalculationRecord, PayrollCalculationResult } from '@/lib/payroll-calculation-service';
import {
  normalizePayrollRunPack,
  payrollRunPackShortLabel,
  type PayrollRunPack,
} from '@/lib/payroll-employee-classification';
import { ensurePayrollSqlSchema, payrollJsonMirrorEnabled, payrollSqlRequired } from '@/lib/payroll-sql-schema';
import type { UnifiedPayrollRun } from '@/lib/payroll-run-store';

export type PayrollJournalLine = {
  lineNo: number;
  accountCode: string;
  accountName: string;
  description: string;
  debit: number;
  credit: number;
  costCentre: string;
  department: string;
  component: string;
};

export type PayrollJournalMappingItem = {
  component: string;
  accountCode: string;
  accountName: string;
  side: 'debit' | 'credit';
  configured: boolean;
  description?: string;
};

export type PayrollJournalMappingInput = {
  component: string;
  accountCode: string;
  accountName: string;
  side?: 'debit' | 'credit';
};

export type PayrollJournalPrerequisite = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type PayrollJournalBatchStatus = 'Draft' | 'Posted' | 'Reversed';

export type PayrollJournalBatch = {
  batchId: string;
  period: string;
  periodLabel: string;
  pack: PayrollRunPack;
  packLabel: string;
  runId: string;
  status: PayrollJournalBatchStatus;
  lines: PayrollJournalLine[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
  employeeCount: number;
  grossPay: number;
  deductions: number;
  netPay: number;
  postedAt: string | null;
  postedBy: string | null;
  reversedAt: string | null;
  reversedBy: string | null;
  reverseReason: string | null;
  exportFileName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PayrollJournalWorkspace = {
  period: string;
  pack: PayrollRunPack;
  packLabel: string;
  mapping: PayrollJournalMappingItem[];
  mappingComplete: boolean;
  prerequisites: PayrollJournalPrerequisite[];
  canPost: boolean;
  blockedReason: string | null;
  draft: {
    lines: PayrollJournalLine[];
    totalDebit: number;
    totalCredit: number;
    balanced: boolean;
    employeeCount: number;
    grossPay: number;
    deductions: number;
    netPay: number;
  };
  activeBatch: PayrollJournalBatch | null;
  history: PayrollJournalBatch[];
};

type JournalStoreState = { batches: PayrollJournalBatch[] };
type MappingStoreState = {
  items: PayrollJournalMappingInput[];
  updatedAt: string | null;
  updatedBy: string | null;
};

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const DATA_DIR = path.join(resolveDashboardRoot(), 'data', 'hris');
const JSON_PATH = path.join(DATA_DIR, 'payroll-journals.json');
const MAPPING_JSON_PATH = path.join(DATA_DIR, 'payroll-journal-gl-mappings.json');
const nowIso = () => new Date().toISOString();
const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const compact = (value: unknown) => String(value || '').trim();

/** Component catalogue only — no GL codes. Finance maps live accounts in the UI. */
export const PAYROLL_JOURNAL_MAPPING_CATALOGUE: Array<{
  component: string;
  side: 'debit' | 'credit';
  description: string;
}> = [
  { component: 'Gross Pay / Staff Cost', side: 'debit', description: 'Staff cost / gross payroll expense' },
  { component: 'Employer Pension Expense', side: 'debit', description: 'Employer pension expense' },
  { component: 'Employer Statutory Expense', side: 'debit', description: 'NSITF / ITF / employer statutory expense' },
  { component: 'PAYE Payable', side: 'credit', description: 'PAYE tax payable' },
  { component: 'Employee Pension Payable', side: 'credit', description: 'Employee pension payable' },
  { component: 'NHF Payable', side: 'credit', description: 'NHF payable' },
  { component: 'Other Deductions Payable', side: 'credit', description: 'Loans and other payroll deductions payable' },
  { component: 'Employer Pension Payable', side: 'credit', description: 'Employer pension liability' },
  { component: 'Employer Statutory Payable', side: 'credit', description: 'Employer statutory liability' },
  { component: 'Net Salaries Payable', side: 'credit', description: 'Net salaries / bank control' },
];

let schemaReady = false;

const ensureJournalSchema = async (pool: sql.ConnectionPool) => {
  await ensurePayrollSqlSchema(pool);
  if (schemaReady) return;
  await pool.request().query(`
IF OBJECT_ID(N'[hris].[PayrollJournals]', N'U') IS NULL
CREATE TABLE [hris].[PayrollJournals] (
  [batch_id] NVARCHAR(80) NOT NULL PRIMARY KEY,
  [period_code] CHAR(7) NOT NULL,
  [pack] NVARCHAR(20) NOT NULL,
  [run_id] NVARCHAR(80) NOT NULL,
  [status] NVARCHAR(20) NOT NULL,
  [batch_json] NVARCHAR(MAX) NOT NULL,
  [posted_at] DATETIME2(3) NULL,
  [created_at] DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  [updated_at] DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_PayrollJournals_PeriodPack' AND object_id = OBJECT_ID(N'[hris].[PayrollJournals]'))
  CREATE INDEX [IX_PayrollJournals_PeriodPack] ON [hris].[PayrollJournals] ([period_code], [pack], [status]);

IF OBJECT_ID(N'[hris].[PayrollJournalGlMappings]', N'U') IS NULL
CREATE TABLE [hris].[PayrollJournalGlMappings] (
  [component] NVARCHAR(120) NOT NULL PRIMARY KEY,
  [account_code] NVARCHAR(40) NOT NULL,
  [account_name] NVARCHAR(200) NOT NULL,
  [side] NVARCHAR(10) NOT NULL,
  [updated_at] DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  [updated_by] NVARCHAR(120) NULL
);
`);
  schemaReady = true;
};

const emptyState = (): JournalStoreState => ({ batches: [] });

const readJsonState = async (): Promise<JournalStoreState> => {
  try {
    await access(JSON_PATH);
    const raw = await readFile(JSON_PATH, 'utf8');
    const parsed = JSON.parse(raw) as JournalStoreState;
    return { batches: Array.isArray(parsed.batches) ? parsed.batches : [] };
  } catch {
    return emptyState();
  }
};

const writeJsonState = async (state: JournalStoreState) => {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(JSON_PATH, JSON.stringify(state, null, 2), 'utf8');
};

const readSqlBatches = async (): Promise<PayrollJournalBatch[]> => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) return [];
  await ensureJournalSchema(pool);
  const result = await pool.request().query(`SELECT [batch_json] FROM [hris].[PayrollJournals]`);
  return (result.recordset || [])
    .map((row: { batch_json?: string }) => {
      try {
        return JSON.parse(String(row.batch_json || '{}')) as PayrollJournalBatch;
      } catch {
        return null;
      }
    })
    .filter((item): item is PayrollJournalBatch => Boolean(item?.batchId));
};

const persistBatchSql = async (batch: PayrollJournalBatch) => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) {
    if (payrollSqlRequired()) throw new Error('DLE_Enterprise database is not available for payroll journal posting.');
    return;
  }
  await ensureJournalSchema(pool);
  await pool.request()
    .input('batch_id', sql.NVarChar(80), batch.batchId)
    .input('period_code', sql.Char(7), batch.period)
    .input('pack', sql.NVarChar(20), batch.pack)
    .input('run_id', sql.NVarChar(80), batch.runId)
    .input('status', sql.NVarChar(20), batch.status)
    .input('batch_json', sql.NVarChar(sql.MAX), JSON.stringify(batch))
    .input('posted_at', sql.DateTime2(3), batch.postedAt ? new Date(batch.postedAt) : null)
    .query(`
MERGE [hris].[PayrollJournals] AS target
USING (SELECT @batch_id AS batch_id) AS source
ON target.batch_id = source.batch_id
WHEN MATCHED THEN UPDATE SET
  period_code = @period_code,
  pack = @pack,
  run_id = @run_id,
  status = @status,
  batch_json = @batch_json,
  posted_at = @posted_at,
  updated_at = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT (batch_id, period_code, pack, run_id, status, batch_json, posted_at)
VALUES (@batch_id, @period_code, @pack, @run_id, @status, @batch_json, @posted_at);
`);
};

const listJournalBatches = async (): Promise<PayrollJournalBatch[]> => {
  try {
    const sqlBatches = await readSqlBatches();
    if (sqlBatches.length) return sqlBatches;
  } catch {
    // fall through to JSON
  }
  return (await readJsonState()).batches;
};

const saveJournalBatch = async (batch: PayrollJournalBatch) => {
  await persistBatchSql(batch);
  if (payrollJsonMirrorEnabled() || !(await getDleEnterpriseDbPool())) {
    const state = await readJsonState();
    const next = {
      batches: [batch, ...state.batches.filter((item) => item.batchId !== batch.batchId)],
    };
    await writeJsonState(next);
  } else {
    // Keep JSON warm as soft cache when SQL is primary.
    try {
      const state = await readJsonState();
      await writeJsonState({
        batches: [batch, ...state.batches.filter((item) => item.batchId !== batch.batchId)],
      });
    } catch {
      // ignore mirror failures
    }
  }
  return batch;
};

export const emptyPayrollJournalMappings = (): PayrollJournalMappingItem[] =>
  PAYROLL_JOURNAL_MAPPING_CATALOGUE.map((item) => ({
    component: item.component,
    accountCode: '',
    accountName: '',
    side: item.side,
    configured: false,
    description: item.description,
  }));

/** @deprecated Use loadPayrollJournalMappings — kept as catalogue shell with no codes. */
export const defaultPayrollJournalMappings = (): PayrollJournalMappingItem[] => emptyPayrollJournalMappings();

const emptyMappingState = (): MappingStoreState => ({ items: [], updatedAt: null, updatedBy: null });

const readMappingJson = async (): Promise<MappingStoreState> => {
  try {
    await access(MAPPING_JSON_PATH);
    const raw = await readFile(MAPPING_JSON_PATH, 'utf8');
    const parsed = JSON.parse(raw) as MappingStoreState;
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      updatedAt: parsed.updatedAt || null,
      updatedBy: parsed.updatedBy || null,
    };
  } catch {
    return emptyMappingState();
  }
};

const writeMappingJson = async (state: MappingStoreState) => {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(MAPPING_JSON_PATH, JSON.stringify(state, null, 2), 'utf8');
};

const readMappingSql = async (): Promise<PayrollJournalMappingInput[]> => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) return [];
  await ensureJournalSchema(pool);
  const result = await pool.request().query(`
SELECT [component], [account_code], [account_name], [side]
FROM [hris].[PayrollJournalGlMappings]
`);
  return (result.recordset || []).map((row: {
    component?: string;
    account_code?: string;
    account_name?: string;
    side?: string;
  }) => ({
    component: compact(row.component),
    accountCode: compact(row.account_code),
    accountName: compact(row.account_name),
    side: row.side === 'debit' ? 'debit' as const : 'credit' as const,
  })).filter((item) => item.component);
};

const persistMappingSql = async (items: PayrollJournalMappingItem[], actor: string) => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) {
    if (payrollSqlRequired()) throw new Error('DLE_Enterprise database is not available for payroll journal GL mapping.');
    return;
  }
  await ensureJournalSchema(pool);
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx).query(`DELETE FROM [hris].[PayrollJournalGlMappings]`);
    for (const item of items) {
      if (!item.accountCode || !item.accountName) continue;
      await new sql.Request(tx)
        .input('component', sql.NVarChar(120), item.component)
        .input('account_code', sql.NVarChar(40), item.accountCode)
        .input('account_name', sql.NVarChar(200), item.accountName)
        .input('side', sql.NVarChar(10), item.side)
        .input('updated_by', sql.NVarChar(120), actor)
        .query(`
INSERT INTO [hris].[PayrollJournalGlMappings]
  ([component], [account_code], [account_name], [side], [updated_at], [updated_by])
VALUES
  (@component, @account_code, @account_name, @side, SYSUTCDATETIME(), @updated_by);
`);
    }
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }
};

const mergeCatalogueWithStored = (stored: PayrollJournalMappingInput[]): PayrollJournalMappingItem[] => {
  const byComponent = new Map(
    stored
      .filter((item) => compact(item.component))
      .map((item) => [compact(item.component), item] as const),
  );
  return PAYROLL_JOURNAL_MAPPING_CATALOGUE.map((catalogue) => {
    const saved = byComponent.get(catalogue.component);
    const accountCode = compact(saved?.accountCode);
    const accountName = compact(saved?.accountName);
    return {
      component: catalogue.component,
      accountCode,
      accountName,
      side: catalogue.side,
      configured: Boolean(accountCode && accountName),
      description: catalogue.description,
    };
  });
};

export const loadPayrollJournalMappings = async (): Promise<PayrollJournalMappingItem[]> => {
  try {
    const sqlItems = await readMappingSql();
    if (sqlItems.length) return mergeCatalogueWithStored(sqlItems);
  } catch {
    // fall through to JSON
  }
  const jsonState = await readMappingJson();
  return mergeCatalogueWithStored(jsonState.items);
};

export const savePayrollJournalMappings = async (input: {
  mappings: PayrollJournalMappingInput[];
  actor: string;
}) => {
  const actor = compact(input.actor) || 'system';
  const byComponent = new Map(
    (input.mappings || [])
      .map((item) => [compact(item.component), item] as const)
      .filter(([component]) => Boolean(component)),
  );

  const unknown = [...byComponent.keys()].filter(
    (component) => !PAYROLL_JOURNAL_MAPPING_CATALOGUE.some((item) => item.component === component),
  );
  if (unknown.length) {
    throw new Error(`Unknown payroll journal components: ${unknown.join(', ')}`);
  }

  const next = PAYROLL_JOURNAL_MAPPING_CATALOGUE.map((catalogue) => {
    const incoming = byComponent.get(catalogue.component);
    const accountCode = compact(incoming?.accountCode);
    const accountName = compact(incoming?.accountName);
    if ((accountCode && !accountName) || (!accountCode && accountName)) {
      throw new Error(`Both account code and account name are required for ${catalogue.component}.`);
    }
    return {
      component: catalogue.component,
      accountCode,
      accountName,
      side: catalogue.side,
      configured: Boolean(accountCode && accountName),
      description: catalogue.description,
    };
  });

  await persistMappingSql(next, actor);
  const stamp = nowIso();
  const jsonState: MappingStoreState = {
    items: next.map((item) => ({
      component: item.component,
      accountCode: item.accountCode,
      accountName: item.accountName,
      side: item.side,
    })),
    updatedAt: stamp,
    updatedBy: actor,
  };
  if (payrollJsonMirrorEnabled() || !(await getDleEnterpriseDbPool())) {
    await writeMappingJson(jsonState);
  } else {
    try {
      await writeMappingJson(jsonState);
    } catch {
      // soft mirror
    }
  }

  return {
    mapping: next,
    mappingComplete: next.every((item) => item.configured),
    updatedAt: stamp,
    updatedBy: actor,
  };
};

const sum = (records: PayrollCalculationRecord[], pick: (row: PayrollCalculationRecord) => number) =>
  roundMoney(records.reduce((total, row) => total + (Number(pick(row)) || 0), 0));

const nhfTotal = (records: PayrollCalculationRecord[]) =>
  roundMoney(records.reduce((total, row) => {
    const fromLines = (row.deductionLines || [])
      .filter((line) => String(line.code || '').toUpperCase() === 'NHF')
      .reduce((lineTotal, line) => lineTotal + (Number(line.amount) || 0), 0);
    return total + fromLines;
  }, 0));

const buildLinesFromTotals = (input: {
  period: string;
  pack: PayrollRunPack;
  records: PayrollCalculationRecord[];
  mappings: PayrollJournalMappingItem[];
}) => {
  const byComponent = Object.fromEntries(input.mappings.map((item) => [item.component, item]));
  const records = input.records || [];
  const gross = sum(records, (row) => row.grossPay);
  const paye = sum(records, (row) => row.paye);
  const pensionEe = sum(records, (row) => row.pensionEmployee || row.pension);
  const pensionEr = sum(records, (row) => row.pensionEmployer);
  const nhf = nhfTotal(records);
  const loan = sum(records, (row) => row.loanRecovery);
  const other = sum(records, (row) => row.otherDeductions);
  const statutoryEe = Math.max(0, roundMoney(sum(records, (row) => row.statutoryEmployee) - nhf));
  const otherDeductions = roundMoney(loan + other + statutoryEe);
  const statutoryEr = sum(records, (row) => row.statutoryEmployer);
  const net = sum(records, (row) => row.netPay);
  const department = payrollRunPackShortLabel(input.pack);
  const costCentre = 'PAYROLL';

  const pushLine = (
    lines: PayrollJournalLine[],
    component: string,
    amount: number,
    description: string,
  ) => {
    const mapped = byComponent[component];
    if (!mapped?.configured || !amount) return;
    lines.push({
      lineNo: lines.length + 1,
      accountCode: mapped.accountCode,
      accountName: mapped.accountName,
      description,
      debit: mapped.side === 'debit' ? roundMoney(amount) : 0,
      credit: mapped.side === 'credit' ? roundMoney(amount) : 0,
      costCentre,
      department,
      component,
    });
  };

  const lines: PayrollJournalLine[] = [];
  pushLine(lines, 'Gross Pay / Staff Cost', gross, `Payroll gross — ${input.period} · ${payrollRunPackShortLabel(input.pack)}`);
  pushLine(lines, 'Employer Pension Expense', pensionEr, `Employer pension — ${input.period}`);
  pushLine(lines, 'Employer Statutory Expense', statutoryEr, `Employer statutory funds — ${input.period}`);
  pushLine(lines, 'PAYE Payable', paye, `PAYE remittance — ${input.period}`);
  pushLine(lines, 'Employee Pension Payable', pensionEe, `Employee pension — ${input.period}`);
  pushLine(lines, 'NHF Payable', nhf, `NHF remittance — ${input.period}`);
  pushLine(lines, 'Other Deductions Payable', otherDeductions, `Loans / other deductions — ${input.period}`);
  pushLine(lines, 'Employer Pension Payable', pensionEr, `Employer pension liability — ${input.period}`);
  pushLine(lines, 'Employer Statutory Payable', statutoryEr, `Employer statutory liability — ${input.period}`);
  pushLine(lines, 'Net Salaries Payable', net, `Net salaries / bank control — ${input.period}`);

  // Balance residual rounding onto net salaries payable credit or staff cost debit.
  const totalDebit = roundMoney(lines.reduce((total, line) => total + line.debit, 0));
  const totalCredit = roundMoney(lines.reduce((total, line) => total + line.credit, 0));
  const delta = roundMoney(totalDebit - totalCredit);
  if (Math.abs(delta) >= 0.01) {
    const netLine = lines.find((line) => line.component === 'Net Salaries Payable');
    if (netLine && delta > 0) {
      netLine.credit = roundMoney(netLine.credit + delta);
    } else if (netLine && delta < 0) {
      netLine.credit = roundMoney(Math.max(0, netLine.credit + delta));
      if (netLine.credit === 0 && Math.abs(delta) >= 0.01) {
        const grossLine = lines.find((line) => line.component === 'Gross Pay / Staff Cost');
        if (grossLine) grossLine.debit = roundMoney(grossLine.debit - delta);
      }
    }
  }

  const balancedDebit = roundMoney(lines.reduce((total, line) => total + line.debit, 0));
  const balancedCredit = roundMoney(lines.reduce((total, line) => total + line.credit, 0));
  return {
    lines: lines.map((line, index) => ({ ...line, lineNo: index + 1 })),
    totalDebit: balancedDebit,
    totalCredit: balancedCredit,
    balanced: Math.abs(balancedDebit - balancedCredit) < 0.01 && lines.length > 0,
    employeeCount: records.length,
    grossPay: gross,
    deductions: roundMoney(paye + pensionEe + nhf + otherDeductions),
    netPay: net,
  };
};

export const evaluatePayrollJournalPrerequisites = (input: {
  run: Pick<UnifiedPayrollRun, 'status' | 'releasedAt' | 'bankScheduleGeneratedAt' | 'statutorySchedulesGeneratedAt' | 'postedAt'> | null | undefined;
  mappingComplete: boolean;
  balanced: boolean;
  hasLines: boolean;
  alreadyPosted: boolean;
}) => {
  const released = Boolean(input.run?.releasedAt) || ['Released', 'Locked', 'Published', 'Posted', 'Closed'].includes(String(input.run?.status || ''));
  const bank = Boolean(input.run?.bankScheduleGeneratedAt);
  const statutory = Boolean(input.run?.statutorySchedulesGeneratedAt);
  const prerequisites: PayrollJournalPrerequisite[] = [
    {
      id: 'released',
      label: 'Payroll released',
      passed: released,
      detail: released ? 'Payroll run has been released for finance outputs.' : 'Release payroll before posting the journal.',
    },
    {
      id: 'bank-schedule',
      label: 'Bank schedule generated',
      passed: bank,
      detail: bank ? 'Bank payment schedule is available.' : 'Generate the bank schedule before journal posting.',
    },
    {
      id: 'statutory',
      label: 'Statutory schedules generated',
      passed: statutory,
      detail: statutory ? 'PAYE / pension / statutory schedules are available.' : 'Generate statutory schedules before journal posting.',
    },
    {
      id: 'mapping',
      label: 'GL mapping complete',
      passed: input.mappingComplete,
      detail: input.mappingComplete
        ? 'All payroll components are mapped to ledger accounts.'
        : 'Map every payroll component to a live GL account code and name, then save.',
    },
    {
      id: 'balanced',
      label: 'Journal balanced',
      passed: input.balanced && input.hasLines,
      detail: input.hasLines
        ? (input.balanced ? 'Debits equal credits.' : 'Journal draft is not balanced.')
        : 'No journal lines available for this pack.',
    },
    {
      id: 'not-posted',
      label: 'Not already posted',
      passed: !input.alreadyPosted,
      detail: input.alreadyPosted ? 'An active posted journal already exists for this pack. Reverse it before re-posting.' : 'No active posted journal for this pack.',
    },
  ];
  const failed = prerequisites.find((item) => !item.passed);
  return {
    prerequisites,
    canPost: prerequisites.every((item) => item.passed),
    blockedReason: failed?.detail || null,
  };
};

export const buildPayrollJournalDraft = async (
  calculation: Pick<PayrollCalculationResult, 'period' | 'periodLabel' | 'records' | 'summary'>,
  pack: PayrollRunPack,
  mappings?: PayrollJournalMappingItem[],
) => {
  const liveMappings = mappings || await loadPayrollJournalMappings();
  const draft = buildLinesFromTotals({
    period: calculation.period,
    pack,
    records: calculation.records || [],
    mappings: liveMappings,
  });
  return {
    ...draft,
    periodLabel: calculation.periodLabel,
    mapping: liveMappings,
    mappingComplete: liveMappings.every((item) => item.configured),
  };
};

export const listPayrollJournalHistory = async (period: string, pack?: PayrollRunPack | null) => {
  const batches = await listJournalBatches();
  return batches
    .filter((batch) => batch.period === period && (!pack || batch.pack === pack))
    .sort((a, b) => String(b.postedAt || b.createdAt).localeCompare(String(a.postedAt || a.createdAt)));
};

const resolvePackFromRun = (run: Pick<UnifiedPayrollRun, 'pack' | 'id'>) =>
  normalizePayrollRunPack(run.pack) || (String(run.id).includes('daily-rate') ? 'daily-rate' : 'salaried');

export const getActivePostedJournal = async (period: string, pack: PayrollRunPack) => {
  const history = await listPayrollJournalHistory(period, pack);
  return history.find((batch) => batch.status === 'Posted') || null;
};

export const buildPayrollJournalWorkspace = async (input: {
  calculation: PayrollCalculationResult;
  run: UnifiedPayrollRun | null;
  pack: PayrollRunPack;
}): Promise<PayrollJournalWorkspace> => {
  const pack = normalizePayrollRunPack(input.pack) || 'salaried';
  const mapping = await loadPayrollJournalMappings();
  const mappingComplete = mapping.every((item) => item.configured);
  const draftCore = await buildPayrollJournalDraft(input.calculation, pack, mapping);
  const history = await listPayrollJournalHistory(input.calculation.period, pack);
  const activeBatch = history.find((batch) => batch.status === 'Posted') || null;
  const gates = evaluatePayrollJournalPrerequisites({
    run: input.run,
    mappingComplete,
    balanced: draftCore.balanced,
    hasLines: draftCore.lines.length > 0,
    alreadyPosted: Boolean(activeBatch),
  });

  return {
    period: input.calculation.period,
    pack,
    packLabel: payrollRunPackShortLabel(pack),
    mapping,
    mappingComplete,
    prerequisites: gates.prerequisites,
    canPost: gates.canPost,
    blockedReason: gates.blockedReason,
    draft: {
      lines: draftCore.lines,
      totalDebit: draftCore.totalDebit,
      totalCredit: draftCore.totalCredit,
      balanced: draftCore.balanced,
      employeeCount: draftCore.employeeCount,
      grossPay: draftCore.grossPay,
      deductions: draftCore.deductions,
      netPay: draftCore.netPay,
    },
    activeBatch,
    history,
  };
};

export const postPayrollJournalBatch = async (input: {
  calculation: PayrollCalculationResult;
  run: UnifiedPayrollRun;
  actor: string;
  pack?: PayrollRunPack | null;
}) => {
  const pack = normalizePayrollRunPack(input.pack) || resolvePackFromRun(input.run);
  const workspace = await buildPayrollJournalWorkspace({
    calculation: input.calculation,
    run: input.run,
    pack,
  });
  if (!workspace.canPost) {
    throw new Error(workspace.blockedReason || 'Payroll journal cannot be posted.');
  }

  const stamp = nowIso();
  const batchId = `PJ-${input.calculation.period}-${pack}-${stamp.replace(/[-:.TZ]/g, '').slice(0, 14)}`;
  const exportFileName = `sage-payroll-journal-${input.calculation.period}-${pack}.csv`;
  const batch: PayrollJournalBatch = {
    batchId,
    period: input.calculation.period,
    periodLabel: input.calculation.periodLabel,
    pack,
    packLabel: payrollRunPackShortLabel(pack),
    runId: input.run.id,
    status: 'Posted',
    lines: workspace.draft.lines,
    totalDebit: workspace.draft.totalDebit,
    totalCredit: workspace.draft.totalCredit,
    balanced: workspace.draft.balanced,
    employeeCount: workspace.draft.employeeCount,
    grossPay: workspace.draft.grossPay,
    deductions: workspace.draft.deductions,
    netPay: workspace.draft.netPay,
    postedAt: stamp,
    postedBy: input.actor,
    reversedAt: null,
    reversedBy: null,
    reverseReason: null,
    exportFileName,
    createdAt: stamp,
    updatedAt: stamp,
  };
  await saveJournalBatch(batch);
  return batch;
};

export const reversePayrollJournalBatch = async (input: {
  period: string;
  pack: PayrollRunPack;
  actor: string;
  reason: string;
}) => {
  const reason = String(input.reason || '').trim();
  if (reason.length < 3) throw new Error('Reversing a payroll journal requires a reason.');
  const active = await getActivePostedJournal(input.period, input.pack);
  if (!active) throw new Error('No posted payroll journal exists to reverse for this pack.');
  const stamp = nowIso();
  const reversed: PayrollJournalBatch = {
    ...active,
    status: 'Reversed',
    reversedAt: stamp,
    reversedBy: input.actor,
    reverseReason: reason,
    updatedAt: stamp,
  };
  await saveJournalBatch(reversed);
  return reversed;
};

export const buildSageJournalCsv = (batch: Pick<PayrollJournalBatch, 'period' | 'pack' | 'packLabel' | 'batchId' | 'lines' | 'postedAt' | 'postedBy'>) => {
  const header = [
    'BatchId',
    'Period',
    'Pack',
    'LineNo',
    'AccountCode',
    'AccountName',
    'Description',
    'Debit',
    'Credit',
    'CostCentre',
    'Department',
    'Component',
    'PostedAt',
    'PostedBy',
  ];
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const rows = batch.lines.map((line) => [
    batch.batchId,
    batch.period,
    batch.packLabel || batch.pack,
    line.lineNo,
    line.accountCode,
    line.accountName,
    line.description,
    line.debit.toFixed(2),
    line.credit.toFixed(2),
    line.costCentre,
    line.department,
    line.component,
    batch.postedAt || '',
    batch.postedBy || '',
  ].map(escape).join(','));
  return [header.join(','), ...rows].join('\n');
};

export const buildSageJournalExportRows = (batch: PayrollJournalBatch) => ({
  columns: ['Account Code', 'Account Name', 'Description', 'Debit', 'Credit', 'Cost Centre', 'Department', 'Component', 'Batch', 'Period', 'Pack'],
  rows: batch.lines.map((line) => [
    line.accountCode,
    line.accountName,
    line.description,
    line.debit,
    line.credit,
    line.costCentre,
    line.department,
    line.component,
    batch.batchId,
    batch.period,
    batch.packLabel,
  ]),
});
