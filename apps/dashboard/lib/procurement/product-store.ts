import sql from 'mssql';
import { ensureProcurementDb } from '@/lib/procurement-store';

export type ProcurementProduct = {
  productId: string;
  itemCode: string;
  description: string;
  description2: string | null;
  category: string | null;
  uom: string;
  stockManagement: 'Managed' | 'Unmanaged';
  status: string | null;
  isPurchased: boolean;
  isActive: boolean;
  source: string;
  syncedAt: string | null;
};

const clean = (value: unknown, max = 300) => String(value ?? '').trim().slice(0, max);
const autoSync = { done: false };

const mapProduct = (row: Record<string, unknown>): ProcurementProduct => ({
  productId: clean(row.ProductId, 40),
  itemCode: clean(row.ItemCode, 80),
  description: clean(row.Description, 300),
  description2: clean(row.Description2, 300) || null,
  category: clean(row.Category, 80) || null,
  uom: clean(row.Uom, 20) || 'EA',
  stockManagement: clean(row.StockManagement, 20) === 'Managed' ? 'Managed' : 'Unmanaged',
  status: clean(row.Status, 40) || null,
  isPurchased: row.IsPurchased === true || row.IsPurchased === 1,
  isActive: row.IsActive === true || row.IsActive === 1,
  source: clean(row.Source, 20) || 'SAGE',
  syncedAt: row.SyncedAt ? new Date(String(row.SyncedAt)).toISOString() : null,
});

const productWhere = (request: sql.Request, filters?: {
  q?: string;
  management?: string;
  activeOnly?: boolean;
  purchasedOnly?: boolean;
}) => {
  const where = ['1=1'];
  const q = clean(filters?.q, 80);
  if (q) {
    request.input('Q', sql.NVarChar(80), `%${q}%`);
    where.push('([ItemCode] LIKE @Q OR [Description] LIKE @Q OR [Description2] LIKE @Q OR [Category] LIKE @Q)');
  }
  const management = clean(filters?.management, 20);
  if (management === 'Managed' || management === 'Unmanaged') {
    request.input('Management', sql.NVarChar(20), management);
    where.push('[StockManagement]=@Management');
  }
  if (filters?.activeOnly) where.push('[IsActive]=1');
  if (filters?.purchasedOnly) where.push('[IsPurchased]=1');
  return where.join(' AND ');
};

export const listProcurementProducts = async (filters?: {
  q?: string;
  management?: string;
  activeOnly?: boolean;
  purchasedOnly?: boolean;
  limit?: number;
  page?: number;
  pageSize?: number;
}) => {
  const pool = await ensureProcurementDb();
  const total = await pool.request().query(`SELECT COUNT(1) AS Cnt, DB_NAME() AS DatabaseName FROM [procurement].[Products]`);
  if (!autoSync.done && Number(total.recordset[0]?.Cnt || 0) === 0) {
    autoSync.done = true;
    try {
      await syncSageProducts('system');
    } catch (error) {
      autoSync.done = false;
      throw error;
    }
  }
  const paged = filters?.page != null && Number.isFinite(filters.page);
  const pageSize = Math.min(Math.max(Number(filters?.pageSize || 25), 1), 100);
  const page = Math.max(Number(filters?.page || 1), 1);
  const listRequest = pool.request();
  const countRequest = pool.request();
  const where = productWhere(listRequest, filters);
  productWhere(countRequest, filters);
  const limit = Math.min(Math.max(Number(filters?.limit || 200), 1), 10000);
  const listSql = paged
    ? `
      SELECT *
      FROM [procurement].[Products]
      WHERE ${where}
      ORDER BY [ItemCode]
      OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
    `
    : `
      SELECT TOP (@Limit) *
      FROM [procurement].[Products]
      WHERE ${where}
      ORDER BY [ItemCode]
    `;
  if (paged) {
    listRequest.input('Offset', sql.Int, (page - 1) * pageSize);
    listRequest.input('PageSize', sql.Int, pageSize);
  } else {
    listRequest.input('Limit', sql.Int, limit);
  }
  const [rows, counts, filtered] = await Promise.all([
    listRequest.query(listSql),
    pool.request().query(`
      SELECT
        SUM(CASE WHEN [StockManagement]=N'Managed' AND [IsActive]=1 THEN 1 ELSE 0 END) AS ManagedCount,
        SUM(CASE WHEN [StockManagement]=N'Unmanaged' AND [IsActive]=1 THEN 1 ELSE 0 END) AS UnmanagedCount,
        SUM(CASE WHEN [IsActive]=1 THEN 1 ELSE 0 END) AS ActiveCount,
        SUM(CASE WHEN [StockManagement]=N'Managed' AND [IsActive]=1 AND [IsPurchased]=1 THEN 1 ELSE 0 END) AS ManagedPurchased,
        SUM(CASE WHEN [StockManagement]=N'Unmanaged' AND [IsActive]=1 AND [IsPurchased]=1 THEN 1 ELSE 0 END) AS UnmanagedPurchased,
        SUM(CASE WHEN [IsActive]=1 AND [IsPurchased]=1 THEN 1 ELSE 0 END) AS ActivePurchased,
        COUNT(DISTINCT CASE WHEN [Category] IS NOT NULL AND [Category]<>N'' THEN [Category] END) AS CategoryCount,
        COUNT(1) AS TotalCount,
        MAX([SyncedAt]) AS SyncedAt,
        DB_NAME() AS DatabaseName
      FROM [procurement].[Products]
    `),
    countRequest.query(`
      SELECT
        COUNT(1) AS FilteredCount,
        SUM(CASE WHEN [IsPurchased]=1 THEN 1 ELSE 0 END) AS PurchasedCount,
        SUM(CASE WHEN [IsActive]=1 THEN 1 ELSE 0 END) AS ActiveCount,
        COUNT(DISTINCT CASE WHEN [Category] IS NOT NULL AND [Category]<>N'' THEN [Category] END) AS CategoryCount
      FROM [procurement].[Products]
      WHERE ${where}
    `),
  ]);
  const summary = counts.recordset[0] || {};
  const match = filtered.recordset[0] || {};
  return {
    products: (rows.recordset as Record<string, unknown>[]).map(mapProduct),
    counts: {
      managed: Number(summary.ManagedCount || 0),
      unmanaged: Number(summary.UnmanagedCount || 0),
      active: Number(summary.ActiveCount || 0),
      total: Number(summary.TotalCount || 0),
      managedPurchased: Number(summary.ManagedPurchased || 0),
      unmanagedPurchased: Number(summary.UnmanagedPurchased || 0),
      activePurchased: Number(summary.ActivePurchased || 0),
      categories: Number(summary.CategoryCount || 0),
    },
    filtered: {
      total: Number(match.FilteredCount || 0),
      purchased: Number(match.PurchasedCount || 0),
      active: Number(match.ActiveCount || 0),
      categories: Number(match.CategoryCount || 0),
    },
    page: paged ? page : 1,
    pageSize: paged ? pageSize : limit,
    database: clean(summary.DatabaseName || total.recordset[0]?.DatabaseName, 128) || 'DLE_Enterprise',
    syncedAt: summary.SyncedAt ? new Date(String(summary.SyncedAt)).toISOString() : null,
  };
};

export const syncSageProducts = async (actor = 'system') => {
  const { fetchSageX3Products } = await import('@/lib/sage-x3-products');
  const fetched = await fetchSageX3Products();
  const pool = await ensureProcurementDb();
  const batchId = `sync-${Date.now()}`;
  const size = 80;
  let upserted = 0;
  for (let offset = 0; offset < fetched.products.length; offset += size) {
    const slice = fetched.products.slice(offset, offset + size);
    const request = pool.request().input('Batch', sql.NVarChar(40), batchId).input('Actor', sql.NVarChar(120), clean(actor, 120));
    const values = slice.map((product, index) => {
      request.input(`Code_${index}`, sql.NVarChar(80), product.itemCode);
      request.input(`Desc_${index}`, sql.NVarChar(300), product.description);
      request.input(`Desc2_${index}`, sql.NVarChar(300), product.description2);
      request.input(`Cat_${index}`, sql.NVarChar(80), product.category);
      request.input(`Uom_${index}`, sql.NVarChar(20), product.uom);
      request.input(`Mgmt_${index}`, sql.NVarChar(20), product.stockManagement);
      request.input(`Status_${index}`, sql.NVarChar(40), product.status);
      request.input(`Purchased_${index}`, sql.Bit, product.isPurchased);
      request.input(`Active_${index}`, sql.Bit, product.isActive);
      return `(@Code_${index}, @Desc_${index}, @Desc2_${index}, @Cat_${index}, @Uom_${index}, @Mgmt_${index}, @Status_${index}, @Purchased_${index}, @Active_${index})`;
    });
    await request.query(`
      MERGE [procurement].[Products] AS target
      USING (VALUES ${values.join(',')}) AS source (
        [ItemCode], [Description], [Description2], [Category], [Uom], [StockManagement], [Status], [IsPurchased], [IsActive]
      )
      ON target.[ItemCode] = source.[ItemCode]
      WHEN MATCHED THEN UPDATE SET
        [Description]=source.[Description],
        [Description2]=source.[Description2],
        [Category]=source.[Category],
        [Uom]=source.[Uom],
        [StockManagement]=source.[StockManagement],
        [Status]=source.[Status],
        [IsPurchased]=source.[IsPurchased],
        [IsActive]=source.[IsActive],
        [Source]=N'SAGE',
        [SyncBatch]=@Batch,
        [SyncedAt]=SYSUTCDATETIME(),
        [UpdatedAt]=SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT (
        [ProductId], [ItemCode], [Description], [Description2], [Category], [Uom], [StockManagement], [Status],
        [IsPurchased], [IsActive], [Source], [SyncBatch], [SyncedAt]
      ) VALUES (
        LEFT(REPLACE(CONVERT(NVARCHAR(36), NEWID()), N'-', N''), 40),
        source.[ItemCode], source.[Description], source.[Description2], source.[Category], source.[Uom],
        source.[StockManagement], source.[Status], source.[IsPurchased], source.[IsActive], N'SAGE', @Batch, SYSUTCDATETIME()
      );
    `);
    upserted += slice.length;
  }
  if (fetched.products.length) {
    await pool.request().input('Batch', sql.NVarChar(40), batchId).query(`
      UPDATE [procurement].[Products]
      SET [IsActive]=0, [UpdatedAt]=SYSUTCDATETIME()
      WHERE [Source]=N'SAGE' AND ([SyncBatch] IS NULL OR [SyncBatch]<>@Batch)
    `);
  }
  return {
    upserted,
    table: fetched.table,
    managed: fetched.products.filter((product) => product.stockManagement === 'Managed').length,
    unmanaged: fetched.products.filter((product) => product.stockManagement === 'Unmanaged').length,
  };
};
