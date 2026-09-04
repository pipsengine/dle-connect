import fs from 'node:fs';
import path from 'node:path';
import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';

export type NigeriaBankRecord = {
  id: string;
  name: string;
  bankCode: string;
  sortCode: string;
  aliases: string[];
  active: boolean;
};

type SeedFile = {
  source?: string;
  asOf?: string;
  banks: Array<{ name: string; bankCode: string; sortCode: string }>;
};

const dbReady = { value: false };

const clean = (value: unknown) => String(value ?? '').replace(/\u00a0/g, ' ').trim();

const slug = (value: string) =>
  value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || 'BANK';

/** Common payroll short names → official HO sort-code list names. */
const ALIAS_MAP: Record<string, string[]> = {
  'GUARANTY TRUST BANK PLC': ['GTBank', 'GTB', 'GT Bank', 'Guaranty Trust Bank'],
  'ACCESS BANK NIGERIA PLC': ['Access Bank', 'Access'],
  'ZENITH BANK PLC': ['Zenith Bank', 'Zenith'],
  'FIRST BANK OF NIGERIA PLC': ['FirstBank', 'First Bank', 'FBN'],
  'UBA PLC.': ['UBA', 'United Bank for Africa'],
  'WEMA BANK PLC': ['Wema Bank', 'Wema'],
  'POLARIS BANK LIMITED': ['Polaris Bank', 'Polaris'],
  'FIDELITY BANK PLC': ['Fidelity Bank', 'Fidelity'],
  'STANBIC-IBTC BANK PLC': ['Stanbic IBTC', 'Stanbic', 'Stanbic-IBTC'],
  'ECOBANK PLC': ['Ecobank', 'Eco Bank'],
  'UNION BANK': ['Union Bank'],
  'UNITY BANK PLC': ['Unity Bank'],
  'STERLING BANK': ['Sterling Bank', 'Sterling'],
  'FCMB': ['First City Monument Bank', 'FCMB'],
  'FIRST CITY MONUMENT BANK': ['FCMB', 'First City Monument Bank'],
  'PROVIDUS BANK': ['Providus'],
  'SUNTRUST BANK': ['SunTrust', 'Suntrust'],
  'TAJBANK': ['Taj Bank', 'TAJ Bank'],
  'TITAN TRUST BANK LTD': ['Titan Trust', 'Titan'],
  'PREMIUMTRUST BANK': ['Premium Trust', 'PremiumTrust'],
  'PARALLEX BANK': ['Parallex'],
  'KEYSTONE BANK': ['Keystone'],
  'STANDARD CHARTERED BANK': ['Standard Chartered', 'StanChart'],
  'NIGERIA INTL BANK LTD (CITIBANK)': ['Citibank', 'Citi'],
  'CORONATION MERCHANT BANK': ['Coronation'],
  'RAND MERCHANT BANK': ['RMB', 'Rand Merchant Bank'],
  'MONIEPOINT MICROFINANCE BANK': ['Moniepoint'],
  'PAYCOM (OPAY)': ['OPay', 'Opay', 'Paycom'],
  'PALMPAY': ['PalmPay'],
  'CARBON': ['Carbon'],
};

const resolveDashboardRoot = () => {
  if (process.env.DLE_DASHBOARD_ROOT) return path.resolve(process.env.DLE_DASHBOARD_ROOT);
  return path.resolve(process.cwd(), process.cwd().endsWith('apps\\dashboard') || process.cwd().endsWith('apps/dashboard') ? '.' : 'apps/dashboard');
};

const seedPathCandidates = () => [
  path.join(resolveDashboardRoot(), 'data', 'hris', 'nigeria-banks-seed.json'),
  path.join(process.cwd(), 'apps', 'dashboard', 'data', 'hris', 'nigeria-banks-seed.json'),
  path.join(process.cwd(), 'data', 'hris', 'nigeria-banks-seed.json'),
];

const readSeedFile = (): SeedFile | null => {
  for (const candidate of seedPathCandidates()) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8')) as SeedFile;
      if (Array.isArray(parsed?.banks) && parsed.banks.length) return parsed;
    } catch {
      // try next candidate
    }
  }
  return null;
};

const withAliases = (name: string): string[] => {
  const key = Object.keys(ALIAS_MAP).find((item) => item.toUpperCase() === name.toUpperCase());
  return key ? ALIAS_MAP[key] : [];
};

const normalizeSeedBanks = (seed: SeedFile): NigeriaBankRecord[] => {
  const seen = new Set<string>();
  const out: NigeriaBankRecord[] = [];
  for (const row of seed.banks) {
    const name = clean(row.name);
    const bankCode = clean(row.bankCode);
    const sortCode = clean(row.sortCode);
    if (!name || !bankCode || !sortCode) continue;
    const id = `${slug(name)}:${bankCode}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name,
      bankCode,
      sortCode,
      aliases: withAliases(name),
      active: true,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
};

const ensureDb = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) return null;
  if (!dbReady.value) {
    await pool.request().query(`
IF SCHEMA_ID(N'hris') IS NULL EXEC(N'CREATE SCHEMA [hris]');
IF OBJECT_ID(N'[hris].[NigeriaBanks]', N'U') IS NULL
CREATE TABLE [hris].[NigeriaBanks] (
  [Id] NVARCHAR(160) NOT NULL CONSTRAINT [PK_NigeriaBanks] PRIMARY KEY,
  [Name] NVARCHAR(200) NOT NULL,
  [BankCode] NVARCHAR(20) NOT NULL,
  [SortCode] NVARCHAR(30) NOT NULL,
  [AliasesJson] NVARCHAR(MAX) NULL,
  [Active] BIT NOT NULL CONSTRAINT [DF_NigeriaBanks_Active] DEFAULT (1),
  [Source] NVARCHAR(200) NULL,
  [AsOfDate] DATE NULL,
  [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_NigeriaBanks_CreatedAt] DEFAULT (SYSUTCDATETIME()),
  [UpdatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_NigeriaBanks_UpdatedAt] DEFAULT (SYSUTCDATETIME())
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_NigeriaBanks_Name' AND object_id = OBJECT_ID(N'[hris].[NigeriaBanks]'))
  CREATE INDEX [IX_NigeriaBanks_Name] ON [hris].[NigeriaBanks]([Name]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_NigeriaBanks_BankCode' AND object_id = OBJECT_ID(N'[hris].[NigeriaBanks]'))
  CREATE INDEX [IX_NigeriaBanks_BankCode] ON [hris].[NigeriaBanks]([BankCode]);
`);
    dbReady.value = true;
  }
  return pool;
};

const seedIntoDb = async (pool: sql.ConnectionPool, seed: SeedFile) => {
  const countResult = await pool.request().query(`SELECT COUNT(1) AS cnt FROM [hris].[NigeriaBanks]`);
  const count = Number(countResult.recordset?.[0]?.cnt || 0);
  if (count > 0) return count;

  const banks = normalizeSeedBanks(seed);
  const source = clean(seed.source) || 'Banks_HO_SortCode_PDF';
  const asOf = clean(seed.asOf) || null;
  const table = new sql.Table('[hris].[NigeriaBanks]');
  table.create = false;
  table.columns.add('Id', sql.NVarChar(160), { nullable: false });
  table.columns.add('Name', sql.NVarChar(200), { nullable: false });
  table.columns.add('BankCode', sql.NVarChar(20), { nullable: false });
  table.columns.add('SortCode', sql.NVarChar(30), { nullable: false });
  table.columns.add('AliasesJson', sql.NVarChar(sql.MAX), { nullable: true });
  table.columns.add('Active', sql.Bit, { nullable: false });
  table.columns.add('Source', sql.NVarChar(200), { nullable: true });
  table.columns.add('AsOfDate', sql.Date, { nullable: true });

  for (const bank of banks) {
    table.rows.add(
      bank.id,
      bank.name,
      bank.bankCode,
      bank.sortCode,
      bank.aliases.length ? JSON.stringify(bank.aliases) : null,
      true,
      source,
      asOf,
    );
  }
  await pool.request().bulk(table);
  return banks.length;
};

const mapDbRow = (row: Record<string, unknown>): NigeriaBankRecord => {
  let aliases: string[] = [];
  try {
    const parsed = row.AliasesJson ? JSON.parse(String(row.AliasesJson)) : [];
    if (Array.isArray(parsed)) aliases = parsed.map(clean).filter(Boolean);
  } catch {
    aliases = [];
  }
  const name = clean(row.Name);
  if (!aliases.length) aliases = withAliases(name);
  return {
    id: clean(row.Id) || `${slug(name)}:${clean(row.BankCode)}`,
    name,
    bankCode: clean(row.BankCode),
    sortCode: clean(row.SortCode),
    aliases,
    active: row.Active === false || row.Active === 0 ? false : true,
  };
};

export const listNigeriaBanks = async (options?: { includeInactive?: boolean }): Promise<NigeriaBankRecord[]> => {
  const seed = readSeedFile();
  const fallback = seed ? normalizeSeedBanks(seed) : [];

  try {
    const pool = await ensureDb();
    if (!pool) return fallback;
    if (seed) await seedIntoDb(pool, seed);

    const result = await pool.request().query(`
SELECT [Id], [Name], [BankCode], [SortCode], [AliasesJson], [Active]
FROM [hris].[NigeriaBanks]
${options?.includeInactive ? '' : 'WHERE [Active] = 1'}
ORDER BY [Name]
`);
    const rows = (result.recordset || []).map((row) => mapDbRow(row as Record<string, unknown>));
    return rows.length ? rows : fallback;
  } catch (error) {
    console.error('Nigeria banks store error:', error);
    return fallback;
  }
};

export const nigeriaBankNames = async (): Promise<string[]> => {
  const banks = await listNigeriaBanks();
  return banks.map((bank) => bank.name);
};

export const findNigeriaBank = async (query: string): Promise<NigeriaBankRecord | null> => {
  const needle = clean(query).toLowerCase();
  if (!needle) return null;
  const banks = await listNigeriaBanks();
  return (
    banks.find((bank) => bank.name.toLowerCase() === needle)
    || banks.find((bank) => bank.aliases.some((alias) => alias.toLowerCase() === needle))
    || banks.find((bank) => bank.bankCode.toLowerCase() === needle)
    || banks.find((bank) => bank.sortCode.toLowerCase() === needle)
    || banks.find((bank) => bank.name.toLowerCase().includes(needle) || bank.aliases.some((alias) => alias.toLowerCase().includes(needle)))
    || null
  );
};
