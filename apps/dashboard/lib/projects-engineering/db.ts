import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';

let schemaReady = false;

const ENSURE_PM_SCHEMA_SQL = `
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'pm') EXEC(N'CREATE SCHEMA pm');

IF OBJECT_ID(N'[pm].[Projects]', N'U') IS NULL
BEGIN
  CREATE TABLE [pm].[Projects](
    [ProjectId] uniqueidentifier NOT NULL CONSTRAINT [PK_pm_Projects] PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [ProjectCode] nvarchar(30) NOT NULL,
    [ProjectName] nvarchar(200) NOT NULL,
    [ProjectType] nvarchar(30) NOT NULL,
    [ClientId] uniqueidentifier NULL,
    [ClientName] nvarchar(200) NULL,
    [BusinessUnit] nvarchar(100) NOT NULL,
    [ProjectManagerEmployeeId] uniqueidentifier NULL,
    [ProjectManagerName] nvarchar(220) NULL,
    [ProjectManagerEmployeeCode] nvarchar(80) NULL,
    [ProjectManagerUsername] nvarchar(120) NULL,
    [RegistryId] nvarchar(80) NULL,
    [ExecutiveSponsorEmployeeId] uniqueidentifier NULL,
    [ContractNumber] nvarchar(80) NULL,
    [ContractValue] decimal(19,4) NOT NULL CONSTRAINT [DF_pm_Projects_ContractValue] DEFAULT 0,
    [Currency] char(3) NOT NULL CONSTRAINT [DF_pm_Projects_Currency] DEFAULT N'NGN',
    [CostCentre] nvarchar(40) NULL,
    [CommercialModel] nvarchar(30) NULL,
    [Location] nvarchar(200) NULL,
    [PlannedStart] date NOT NULL,
    [PlannedFinish] date NOT NULL,
    [ForecastFinish] date NULL,
    [ActualFinish] date NULL,
    [Phase] nvarchar(50) NULL,
    [Status] nvarchar(30) NOT NULL CONSTRAINT [DF_pm_Projects_Status] DEFAULT N'Draft',
    [Health] nvarchar(20) NOT NULL CONSTRAINT [DF_pm_Projects_Health] DEFAULT N'Healthy',
    [PlannedProgress] decimal(7,3) NOT NULL CONSTRAINT [DF_pm_Projects_PlannedProgress] DEFAULT 0,
    [ActualProgress] decimal(7,3) NOT NULL CONSTRAINT [DF_pm_Projects_ActualProgress] DEFAULT 0,
    [SchedulePerformanceIndex] decimal(8,4) NULL,
    [CostPerformanceIndex] decimal(8,4) NULL,
    [Description] nvarchar(max) NULL,
    [SecurityClassification] nvarchar(30) NOT NULL CONSTRAINT [DF_pm_Projects_Security] DEFAULT N'DLE Internal',
    [CreatedBy] uniqueidentifier NOT NULL,
    [CreatedAt] datetime2(3) NOT NULL CONSTRAINT [DF_pm_Projects_CreatedAt] DEFAULT SYSUTCDATETIME(),
    [ModifiedBy] uniqueidentifier NULL,
    [ModifiedAt] datetime2(3) NOT NULL CONSTRAINT [DF_pm_Projects_ModifiedAt] DEFAULT SYSUTCDATETIME(),
    [IsDeleted] bit NOT NULL CONSTRAINT [DF_pm_Projects_IsDeleted] DEFAULT 0,
    [RowVersion] rowversion,
    CONSTRAINT [UQ_pm_Projects_ProjectCode] UNIQUE([ProjectCode])
  );
  CREATE INDEX [IX_pm_Projects_StatusHealth] ON [pm].[Projects]([Status],[Health])
    INCLUDE([ProjectCode],[ProjectName],[PlannedFinish],[ActualProgress],[RegistryId]);
END;

IF COL_LENGTH(N'pm.Projects', N'RegistryId') IS NULL
  ALTER TABLE [pm].[Projects] ADD [RegistryId] nvarchar(80) NULL;
IF COL_LENGTH(N'pm.Projects', N'ProjectManagerName') IS NULL
  ALTER TABLE [pm].[Projects] ADD [ProjectManagerName] nvarchar(220) NULL;
IF COL_LENGTH(N'pm.Projects', N'ProjectManagerEmployeeCode') IS NULL
  ALTER TABLE [pm].[Projects] ADD [ProjectManagerEmployeeCode] nvarchar(80) NULL;
IF COL_LENGTH(N'pm.Projects', N'ProjectManagerUsername') IS NULL
  ALTER TABLE [pm].[Projects] ADD [ProjectManagerUsername] nvarchar(120) NULL;
`;

export async function ensurePmDb() {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) {
    throw new Error(
      'DLE Enterprise database is not configured. Verify DLE_ENTERPRISE_DB_HOST, DLE_ENTERPRISE_DB_NAME, and credentials.',
    );
  }
  if (!schemaReady) {
    await pool.request().query(ENSURE_PM_SCHEMA_SQL);
    schemaReady = true;
  }
  return pool;
}

export async function pmQuery<T = Record<string, unknown>>(
  text: string,
  params: Record<string, unknown> = {},
) {
  const pool = await ensurePmDb();
  const req = pool.request();
  for (const [key, value] of Object.entries(params)) {
    req.input(key, value as never);
  }
  const result = await req.query<T>(text);
  return result.recordset;
}

export { sql };
