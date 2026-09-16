import sql from 'mssql';
import { loadWorkspaceEnv } from '@/lib/dle-enterprise-db';

export type SageX3Supplier = {
  sageCode: string;
  name: string;
  currency: string | null;
  paymentTerms: string | null;
  deliveryLocation: string | null;
  email: string | null;
  phone: string | null;
  isActive: boolean;
};

type NamedTable = { schemaName: string; tableName: string };

const boolEnv = (value: string | undefined, fallback: boolean) => {
  if (value == null || value === '') return fallback;
  return value === '1' || value.toLowerCase() === 'true';
};

const trim = (value: unknown) => String(value ?? '').trim();

const pick = (row: Record<string, unknown>, names: string[]) => {
  for (const name of names) {
    const match = Object.keys(row).find((key) => key.toLowerCase() === name.toLowerCase());
    if (!match) continue;
    const text = trim(row[match]);
    if (text) return text;
  }
  return null;
};

const sageX3Config = (): sql.config => {
  loadWorkspaceEnv();
  const server = process.env.SAGE_X3_DB_HOST || '192.168.5.5';
  const database = process.env.SAGE_X3_DB_NAME || 'x3data';
  const user = process.env.SAGE_X3_DB_USER || 'sage';
  const password = process.env.SAGE_X3_DB_PASSWORD || '';
  if (!password) {
    throw new Error(
      'Sage X3 credentials are not configured. Set SAGE_X3_DB_PASSWORD in apps/dashboard/.env (database x3data).',
    );
  }
  return {
    server,
    port: Number(process.env.SAGE_X3_DB_PORT || 1433),
    database,
    user,
    password,
    options: {
      encrypt: boolEnv(process.env.SAGE_X3_DB_ENCRYPT, false),
      trustServerCertificate: boolEnv(process.env.SAGE_X3_DB_TRUST_SERVER_CERTIFICATE, true),
      enableArithAbort: true,
    },
    connectionTimeout: Number(process.env.SAGE_X3_DB_CONNECT_TIMEOUT || 20000),
    requestTimeout: Number(process.env.SAGE_X3_DB_REQUEST_TIMEOUT || 60000),
  };
};

const connectSageX3 = async () => {
  const primary = sageX3Config();
  const attempts: sql.config[] = [
    primary,
    {
      ...primary,
      options: { ...primary.options, encrypt: !primary.options?.encrypt },
    },
  ];
  let lastError: unknown = null;
  for (const config of attempts) {
    try {
      return await new sql.ConnectionPool(config).connect();
    } catch (error) {
      lastError = error;
    }
  }
  const message = lastError instanceof Error ? lastError.message : 'Sage X3 connection failed';
  throw new Error(`Unable to read suppliers from Sage X3 (${primary.database} on ${primary.server}): ${message}`);
};

const listCandidateTables = async (pool: sql.ConnectionPool) => {
  const result = await pool.request().query(`
    SELECT s.name AS schemaName, t.name AS tableName
    FROM sys.tables t
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE t.name LIKE N'%BPSUPPLIER%'
       OR t.name LIKE N'%BPARTNER%'
       OR t.name LIKE N'%BPADDRESS%'
       OR t.name LIKE N'%SUPPLIER%'
    ORDER BY s.name, t.name
  `);
  return result.recordset.map((row) => ({
    schemaName: String(row.schemaName),
    tableName: String(row.tableName),
  })) as NamedTable[];
};

const tableHasColumn = async (pool: sql.ConnectionPool, table: NamedTable, column: string) => {
  const result = await pool
    .request()
    .input('SchemaName', sql.NVarChar(128), table.schemaName)
    .input('TableName', sql.NVarChar(128), table.tableName)
    .input('ColumnName', sql.NVarChar(128), column)
    .query(`
      SELECT 1 AS Ok
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @SchemaName AND TABLE_NAME = @TableName AND COLUMN_NAME = @ColumnName
    `);
  return result.recordset.length > 0;
};

const qn = (table: NamedTable) => `[${table.schemaName}].[${table.tableName}]`;

const pickBestTable = async (pool: sql.ConnectionPool, tables: NamedTable[], pattern: RegExp) => {
  const matches = tables.filter((table) => pattern.test(table.tableName));
  let best: { table: NamedTable; count: number } | null = null;
  for (const table of matches) {
    try {
      const result = await pool.request().query(`SELECT COUNT(1) AS Cnt FROM ${qn(table)}`);
      const count = Number(result.recordset[0]?.Cnt || 0);
      if (!best || count > best.count) best = { table, count };
    } catch {
      // Skip tables the login cannot read.
    }
  }
  return best?.count ? best.table : matches[0] || null;
};

const isEnabledFlag = (value: unknown) => {
  const text = trim(value).toUpperCase();
  if (!text) return true;
  if (text === '1' || text === 'N' || text === 'NO' || text === 'FALSE' || text === '0') return false;
  return true;
};

export const fetchDistinctSageX3Suppliers = async () => {
  const pool = await connectSageX3();
  try {
    const tables = await listCandidateTables(pool);
    const supplierTable = await pickBestTable(pool, tables, /^BPSUPPLIER$/i)
      || await pickBestTable(pool, tables, /BPSUPPLIER/i)
      || await pickBestTable(pool, tables, /SUPPLIER/i);
    if (!supplierTable) {
      throw new Error('No Sage X3 supplier table was found in x3data.');
    }

    const partnerTable = await pickBestTable(pool, tables, /^BPARTNER$/i) || await pickBestTable(pool, tables, /BPARTNER/i);
    const nameTable = await pickBestTable(pool, tables, /^BPSUPPLIERT$/i) || await pickBestTable(pool, tables, /BPSUPPLIERT/i);
    const addressTable = await pickBestTable(pool, tables, /^BPADDRESS$/i) || await pickBestTable(pool, tables, /BPADDRESS/i);

    const supplierCodeCol = (await tableHasColumn(pool, supplierTable, 'BPSNUM')) ? 'BPSNUM' : null;
    if (!supplierCodeCol) {
      throw new Error(`Sage supplier table ${qn(supplierTable)} does not expose BPSNUM.`);
    }

    const supplierSelect = [`s.[${supplierCodeCol}] AS SageCode`];
    if (await tableHasColumn(pool, supplierTable, 'CUR')) supplierSelect.push('s.[CUR] AS Currency');
    if (await tableHasColumn(pool, supplierTable, 'PTE')) supplierSelect.push('s.[PTE] AS PaymentTerms');
    if (await tableHasColumn(pool, supplierTable, 'ENAFLG')) supplierSelect.push('s.[ENAFLG] AS EnabledFlag');

    const joins: string[] = [];
    if (nameTable && (await tableHasColumn(pool, nameTable, 'BPSNUM')) && (await tableHasColumn(pool, nameTable, 'BPSNAM'))) {
      const langFilter = (await tableHasColumn(pool, nameTable, 'LANGUE'))
        ? `AND (nt.[LANGUE] IN (N'ENG', N'EN', N'GBR') OR nt.[LANGUE] IS NULL)`
        : '';
      joins.push(`LEFT JOIN ${qn(nameTable)} nt ON nt.[BPSNUM] = s.[${supplierCodeCol}] ${langFilter}`);
      supplierSelect.push('nt.[BPSNAM] AS TranslatedName');
    }
    if (partnerTable && (await tableHasColumn(pool, partnerTable, 'BPRNUM'))) {
      joins.push(`LEFT JOIN ${qn(partnerTable)} p ON p.[BPRNUM] = s.[${supplierCodeCol}]`);
      if (await tableHasColumn(pool, partnerTable, 'BPRNAM')) supplierSelect.push('p.[BPRNAM] AS PartnerName');
      if (await tableHasColumn(pool, partnerTable, 'BPRSHO')) supplierSelect.push('p.[BPRSHO] AS ShortName');
      if (await tableHasColumn(pool, partnerTable, 'BPRLOG')) supplierSelect.push('p.[BPRLOG] AS Email');
      if (await tableHasColumn(pool, partnerTable, 'WEB')) supplierSelect.push('p.[WEB] AS WebEmail');
      if (await tableHasColumn(pool, partnerTable, 'TEL')) supplierSelect.push('p.[TEL] AS Phone');
      if (await tableHasColumn(pool, partnerTable, 'TEL0')) supplierSelect.push('p.[TEL0] AS Phone0');
      if (await tableHasColumn(pool, partnerTable, 'TEL1')) supplierSelect.push('p.[TEL1] AS Phone1');
      if (await tableHasColumn(pool, partnerTable, 'CRY')) supplierSelect.push('p.[CRY] AS Country');
    }
    if (addressTable && (await tableHasColumn(pool, addressTable, 'BPANUM'))) {
      joins.push(`LEFT JOIN ${qn(addressTable)} a ON a.[BPANUM] = s.[${supplierCodeCol}]`);
      if (await tableHasColumn(pool, addressTable, 'CTY')) supplierSelect.push('a.[CTY] AS City');
      if (await tableHasColumn(pool, addressTable, 'CRYNAM')) supplierSelect.push('a.[CRYNAM] AS CountryName');
      if (await tableHasColumn(pool, addressTable, 'BPAADDLIG')) supplierSelect.push('a.[BPAADDLIG] AS AddressLine');
    }

    const result = await pool.request().query(`
      SELECT ${supplierSelect.join(', ')}
      FROM ${qn(supplierTable)} s
      ${joins.join('\n')}
    `);

    const distinct = new Map<string, SageX3Supplier>();
    for (const raw of result.recordset) {
      const row = raw as Record<string, unknown>;
      const sageCode = pick(row, ['SageCode', 'BPSNUM']) || '';
      if (!sageCode) continue;
      const name = pick(row, ['TranslatedName', 'PartnerName', 'ShortName', 'Name']) || sageCode;
      const existing = distinct.get(sageCode);
      const next: SageX3Supplier = {
        sageCode,
        name,
        currency: pick(row, ['Currency', 'CUR']),
        paymentTerms: pick(row, ['PaymentTerms', 'PTE']),
        deliveryLocation: pick(row, ['City', 'CountryName', 'AddressLine', 'Country', 'CRY']),
        email: pick(row, ['Email', 'WebEmail', 'BPRLOG', 'WEB']),
        phone: pick(row, ['Phone', 'Phone0', 'Phone1', 'TEL', 'TEL0']),
        isActive: isEnabledFlag(row.EnabledFlag ?? row.ENAFLG),
      };
      if (!existing || (existing.name === existing.sageCode && next.name !== next.sageCode)) {
        distinct.set(sageCode, next);
      }
    }
    return {
      table: qn(supplierTable),
      suppliers: [...distinct.values()].sort((a, b) => a.name.localeCompare(b.name)),
    };
  } finally {
    await pool.close();
  }
};
