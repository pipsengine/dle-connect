import sql from 'mssql';
import { connectSageX3 } from '@/lib/sage-x3-suppliers';

export type SageX3Product = {
  itemCode: string;
  description: string;
  description2: string | null;
  category: string | null;
  uom: string | null;
  stockManagement: 'Managed' | 'Unmanaged';
  status: string;
  isPurchased: boolean;
  isActive: boolean;
};

type NamedTable = { schemaName: string; tableName: string };

const trim = (value: unknown) => String(value ?? '').trim();
const safeIdent = (value: string) => (/^[A-Za-z0-9_]+$/.test(value) ? value : '');
const qn = (table: NamedTable) => `[${table.schemaName}].[${table.tableName}]`;

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

const resolveColumn = async (pool: sql.ConnectionPool, table: NamedTable, names: string[]) => {
  for (const name of names) {
    if (await tableHasColumn(pool, table, name)) return name;
  }
  return null;
};

const pickBestTable = async (pool: sql.ConnectionPool, pattern: RegExp) => {
  const preferredSchema = (process.env.SAGE_X3_FOLDER || 'DLEX3DATA').toUpperCase();
  const found = await pool.request().query(`
    SELECT s.name AS schemaName, t.name AS tableName
    FROM sys.tables t
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE t.name LIKE N'%ITMMASTER%'
  `);
  const tables = (found.recordset as Array<{ schemaName: string; tableName: string }>)
    .filter((table) => pattern.test(table.tableName));
  let best: { table: NamedTable; score: number } | null = null;
  for (const table of tables) {
    try {
      const result = await pool.request().query(`SELECT COUNT(1) AS Cnt FROM ${qn(table)}`);
      const count = Number(result.recordset[0]?.Cnt || 0);
      const score = count + (table.schemaName.toUpperCase() === preferredSchema ? 1_000_000 : 0);
      if (!best || score > best.score) best = { table, score };
    } catch {
      // Skip tables this login cannot read.
    }
  }
  return best?.table || null;
};

const stockManagement = (value: unknown): 'Managed' | 'Unmanaged' => {
  const text = trim(value).toLowerCase();
  if (text === '2' || text === 'managed') return 'Managed';
  return 'Unmanaged';
};

const statusLabel = (value: unknown) => {
  const text = trim(value);
  const labels: Record<string, string> = {
    '1': 'Active',
    '2': 'In development',
    '3': 'On shortage',
    '4': 'Not renewed',
    '5': 'Obsolete',
    '6': 'Not usable',
  };
  return labels[text] || text || 'Active';
};

const yesFlag = (value: unknown) => {
  const text = trim(value).toUpperCase();
  if (!text) return true;
  return text === '2' || text === 'Y' || text === 'YES' || text === 'TRUE';
};

export const fetchSageX3Products = async () => {
  const pool = await connectSageX3();
  try {
    const table = await pickBestTable(pool, /^ITMMASTER$/i) || await pickBestTable(pool, /ITMMASTER/i);
    if (!table) throw new Error('No Sage X3 product table (ITMMASTER) was found.');
    const codeCol = safeIdent((await resolveColumn(pool, table, ['ITMREF_0', 'ITMREF'])) || '');
    if (!codeCol) throw new Error(`Sage product table ${qn(table)} does not expose ITMREF.`);
    const descriptionCol = safeIdent((await resolveColumn(pool, table, ['ITMDES1_0', 'ITMDES1'])) || '');
    const description2Col = safeIdent((await resolveColumn(pool, table, ['ITMDES2_0', 'ITMDES2'])) || '');
    const categoryCol = safeIdent((await resolveColumn(pool, table, ['TCLCOD_0', 'TCLCOD'])) || '');
    const purchaseUomCol = safeIdent((await resolveColumn(pool, table, ['PUU_0', 'PUUSTU_0', 'PUU', 'PUUSTU'])) || '');
    const stockUomCol = safeIdent((await resolveColumn(pool, table, ['STU_0', 'STU'])) || '');
    const stockCol = safeIdent((await resolveColumn(pool, table, ['STOMGTCOD_0', 'STOMGTCOD'])) || '');
    const statusCol = safeIdent((await resolveColumn(pool, table, ['ITMSTA_0', 'ITMSTA'])) || '');
    const purchasedCol = safeIdent((await resolveColumn(pool, table, ['PURFLG_0', 'PURFLG'])) || '');
    const select = [`LTRIM(RTRIM(i.[${codeCol}])) AS ItemCode`];
    if (descriptionCol) select.push(`i.[${descriptionCol}] AS Description`);
    if (description2Col) select.push(`i.[${description2Col}] AS Description2`);
    if (categoryCol) select.push(`i.[${categoryCol}] AS Category`);
    if (purchaseUomCol) select.push(`i.[${purchaseUomCol}] AS PurchaseUom`);
    if (stockUomCol) select.push(`i.[${stockUomCol}] AS StockUom`);
    if (stockCol) select.push(`i.[${stockCol}] AS StockManagement`);
    if (statusCol) select.push(`i.[${statusCol}] AS ItemStatus`);
    if (purchasedCol) select.push(`i.[${purchasedCol}] AS PurchasedFlag`);
    const result = await pool.request().query(`
      SELECT ${select.join(', ')}
      FROM ${qn(table)} i
      WHERE NULLIF(LTRIM(RTRIM(i.[${codeCol}])), N'') IS NOT NULL
    `);
    const products: SageX3Product[] = [];
    const seen = new Set<string>();
    for (const raw of result.recordset as Array<Record<string, unknown>>) {
      const itemCode = trim(raw.ItemCode).slice(0, 80);
      if (!itemCode || seen.has(itemCode.toUpperCase())) continue;
      seen.add(itemCode.toUpperCase());
      const status = statusLabel(raw.ItemStatus);
      products.push({
        itemCode,
        description: trim(raw.Description).slice(0, 300) || itemCode,
        description2: trim(raw.Description2).slice(0, 300) || null,
        category: trim(raw.Category).slice(0, 80) || null,
        uom: (trim(raw.PurchaseUom) || trim(raw.StockUom) || 'EA').slice(0, 20),
        stockManagement: stockManagement(raw.StockManagement),
        status,
        isPurchased: yesFlag(raw.PurchasedFlag),
        isActive: status !== 'Obsolete' && status !== 'Not usable',
      });
    }
    products.sort((a, b) => a.itemCode.localeCompare(b.itemCode));
    return { products, table: qn(table) };
  } finally {
    await pool.close();
  }
};
