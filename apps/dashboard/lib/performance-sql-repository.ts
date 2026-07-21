import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import type { PerformanceDomainState } from '@/lib/performance-domain-types';
import type { PerformanceNavPreferences } from '@/lib/performance-management-types';
import {
  DOMAIN_DOCUMENT_KEY,
  MIGRATION_KEY,
  ensurePerformanceSqlSchema,
  performanceJsonFallbackAllowed,
  performanceSqlRequired,
} from '@/lib/performance-sql-schema';

export type PerformanceSqlSourceMeta = {
  databaseAvailable: boolean;
  source: 'DLE_Enterprise SQL' | 'Local JSON fallback';
  warning: string | null;
  updatedAt: string | null;
  migrationStatus: string | null;
  recordCounts: Record<string, number>;
};

const compact = (value: unknown) => String(value || '').trim();

const resolveDomainCandidates = () => {
  const cwd = process.cwd();
  return [
    path.join(cwd, 'apps', 'dashboard', 'data', 'performance', 'domain.json'),
    path.join(cwd, 'data', 'performance', 'domain.json'),
  ];
};

const hashText = (value: string) => createHash('sha256').update(value).digest('hex');

const countState = (state: PerformanceDomainState): Record<string, number> => ({
  cycles: state.cycles.length,
  eligibility: state.eligibility.length,
  companyObjectives: state.companyObjectives.length,
  goals: state.goals.length,
  checkIns: state.checkIns.length,
  assessments: state.assessments.length,
  raters: state.raters.length,
  calibration: state.calibration.length,
  results: state.results.length,
  appeals: state.appeals.length,
  pips: state.pips.length,
  developmentPlans: state.developmentPlans.length,
  recognitions: state.recognitions.length,
  probation: state.probation.length,
  tasks: state.tasks.length,
  audit: state.audit.length,
  delegations: (state.delegations || []).length,
  scheduledReports: (state.scheduledReports || []).length,
});

const withPool = async <T,>(fn: (pool: sql.ConnectionPool) => Promise<T>): Promise<T> => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) {
    throw new Error('DLE Enterprise SQL pool is unavailable. Check DLE_ENTERPRISE_DB_* configuration and connectivity.');
  }
  await ensurePerformanceSqlSchema(pool);
  return fn(pool);
};

export const tryGetPerformanceSqlPool = async () => {
  try {
    const pool = await getDleEnterpriseDbPool();
    if (!pool) return null;
    await ensurePerformanceSqlSchema(pool);
    return pool;
  } catch (error) {
    if (performanceSqlRequired() && !performanceJsonFallbackAllowed()) throw error;
    return null;
  }
};

const syncProjectionTables = async (tx: sql.Transaction, state: PerformanceDomainState) => {
  const request = () => new sql.Request(tx);
  await request().query(`
    DELETE FROM [hris].[PerformanceCycleEligibility];
    DELETE FROM [hris].[PerformanceCycles];
    DELETE FROM [hris].[PerformanceGoals];
    DELETE FROM [hris].[PerformanceResults];
    DELETE FROM [hris].[PerformanceAssessments];
    DELETE FROM [hris].[PerformanceTasks];
    DELETE FROM [hris].[PerformanceAuditTrail];
  `);

  for (const cycle of state.cycles) {
    await request()
      .input('CycleId', sql.NVarChar(80), cycle.id)
      .input('Name', sql.NVarChar(200), cycle.name)
      .input('Type', sql.NVarChar(80), cycle.type)
      .input('Year', sql.Int, cycle.year)
      .input('Status', sql.NVarChar(60), cycle.status)
      .input('StartDate', sql.Date, cycle.startDate)
      .input('EndDate', sql.Date, cycle.endDate)
      .input('EligibilityCount', sql.Int, cycle.eligibilityCount || 0)
      .input('Version', sql.Int, cycle.version || 1)
      .input('PublishedAt', sql.DateTime2(3), cycle.publishedAt ? new Date(cycle.publishedAt) : null)
      .input('CreatedBy', sql.NVarChar(160), cycle.createdBy || 'System')
      .input('CreatedAt', sql.DateTime2(3), new Date(cycle.createdAt || Date.now()))
      .input('UpdatedAt', sql.DateTime2(3), new Date(cycle.updatedAt || Date.now()))
      .input('CycleJson', sql.NVarChar(sql.MAX), JSON.stringify(cycle))
      .query(`
        INSERT INTO [hris].[PerformanceCycles]
          (CycleId, Name, Type, Year, Status, StartDate, EndDate, EligibilityCount, Version, PublishedAt, CreatedBy, CreatedAt, UpdatedAt, CycleJson)
        VALUES
          (@CycleId, @Name, @Type, @Year, @Status, @StartDate, @EndDate, @EligibilityCount, @Version, @PublishedAt, @CreatedBy, @CreatedAt, @UpdatedAt, @CycleJson)
      `);
  }

  for (const row of state.eligibility) {
    await request()
      .input('EligibilityId', sql.NVarChar(80), row.id)
      .input('CycleId', sql.NVarChar(80), row.cycleId)
      .input('EmployeeId', sql.NVarChar(80), row.employeeId)
      .input('EmployeeCode', sql.NVarChar(80), row.employeeCode)
      .input('FullName', sql.NVarChar(220), row.fullName)
      .input('Department', sql.NVarChar(180), row.department || null)
      .input('JobTitle', sql.NVarChar(180), row.jobTitle || null)
      .input('ManagerId', sql.NVarChar(80), row.managerId || null)
      .input('ManagerName', sql.NVarChar(220), row.managerName || null)
      .input('Included', sql.Bit, row.included ? 1 : 0)
      .input('Reason', sql.NVarChar(400), row.reason || null)
      .input('SnapshotAt', sql.DateTime2(3), new Date(row.snapshotAt || Date.now()))
      .query(`
        INSERT INTO [hris].[PerformanceCycleEligibility]
          (EligibilityId, CycleId, EmployeeId, EmployeeCode, FullName, Department, JobTitle, ManagerId, ManagerName, Included, Reason, SnapshotAt)
        VALUES
          (@EligibilityId, @CycleId, @EmployeeId, @EmployeeCode, @FullName, @Department, @JobTitle, @ManagerId, @ManagerName, @Included, @Reason, @SnapshotAt)
      `);
  }

  for (const goal of state.goals) {
    await request()
      .input('GoalId', sql.NVarChar(80), goal.id)
      .input('CycleId', sql.NVarChar(80), goal.cycleId)
      .input('EmployeeId', sql.NVarChar(80), goal.employeeId)
      .input('EmployeeCode', sql.NVarChar(80), goal.employeeCode || null)
      .input('EmployeeName', sql.NVarChar(220), goal.employeeName)
      .input('ManagerId', sql.NVarChar(80), goal.managerId || null)
      .input('Status', sql.NVarChar(60), goal.status)
      .input('ProgressPercent', sql.Decimal(9, 4), Number(goal.progressPercent || 0))
      .input('Weight', sql.Decimal(9, 4), Number(goal.weight || 100))
      .input('Version', sql.Int, goal.version || 1)
      .input('UpdatedAt', sql.DateTime2(3), new Date(goal.updatedAt || Date.now()))
      .input('GoalJson', sql.NVarChar(sql.MAX), JSON.stringify(goal))
      .query(`
        INSERT INTO [hris].[PerformanceGoals]
          (GoalId, CycleId, EmployeeId, EmployeeCode, EmployeeName, ManagerId, Status, ProgressPercent, Weight, Version, UpdatedAt, GoalJson)
        VALUES
          (@GoalId, @CycleId, @EmployeeId, @EmployeeCode, @EmployeeName, @ManagerId, @Status, @ProgressPercent, @Weight, @Version, @UpdatedAt, @GoalJson)
      `);
  }

  for (const result of state.results) {
    await request()
      .input('ResultId', sql.NVarChar(80), result.id)
      .input('CycleId', sql.NVarChar(80), result.cycleId)
      .input('EmployeeId', sql.NVarChar(80), result.employeeId)
      .input('EmployeeName', sql.NVarChar(220), result.employeeName)
      .input('FinalScore', sql.Decimal(19, 4), Number(result.finalScore || 0))
      .input('RatingBand', sql.NVarChar(80), result.ratingBand)
      .input('Status', sql.NVarChar(60), result.status)
      .input('Version', sql.Int, result.version || 1)
      .input('PublishedAt', sql.DateTime2(3), result.publishedAt ? new Date(result.publishedAt) : null)
      .input('AcknowledgedAt', sql.DateTime2(3), result.acknowledgedAt ? new Date(result.acknowledgedAt) : null)
      .input('ResultJson', sql.NVarChar(sql.MAX), JSON.stringify(result))
      .query(`
        INSERT INTO [hris].[PerformanceResults]
          (ResultId, CycleId, EmployeeId, EmployeeName, FinalScore, RatingBand, Status, Version, PublishedAt, AcknowledgedAt, ResultJson)
        VALUES
          (@ResultId, @CycleId, @EmployeeId, @EmployeeName, @FinalScore, @RatingBand, @Status, @Version, @PublishedAt, @AcknowledgedAt, @ResultJson)
      `);
  }

  for (const assessment of state.assessments) {
    await request()
      .input('AssessmentId', sql.NVarChar(80), assessment.id)
      .input('CycleId', sql.NVarChar(80), assessment.cycleId)
      .input('EmployeeId', sql.NVarChar(80), assessment.employeeId)
      .input('EmployeeName', sql.NVarChar(220), assessment.employeeName)
      .input('AssessmentType', sql.NVarChar(40), assessment.type)
      .input('Status', sql.NVarChar(60), assessment.status)
      .input('Version', sql.Int, assessment.version || 1)
      .input('SubmittedAt', sql.DateTime2(3), assessment.submittedAt ? new Date(assessment.submittedAt) : null)
      .input('UpdatedAt', sql.DateTime2(3), new Date(assessment.updatedAt || Date.now()))
      .input('AssessmentJson', sql.NVarChar(sql.MAX), JSON.stringify(assessment))
      .query(`
        INSERT INTO [hris].[PerformanceAssessments]
          (AssessmentId, CycleId, EmployeeId, EmployeeName, AssessmentType, Status, Version, SubmittedAt, UpdatedAt, AssessmentJson)
        VALUES
          (@AssessmentId, @CycleId, @EmployeeId, @EmployeeName, @AssessmentType, @Status, @Version, @SubmittedAt, @UpdatedAt, @AssessmentJson)
      `);
  }

  for (const task of state.tasks.slice(0, 2000)) {
    await request()
      .input('TaskId', sql.NVarChar(80), task.id)
      .input('CycleId', sql.NVarChar(80), task.cycleId || null)
      .input('EmployeeId', sql.NVarChar(80), task.employeeId)
      .input('AssigneeId', sql.NVarChar(80), task.assigneeId)
      .input('Status', sql.NVarChar(40), task.status)
      .input('DueDate', sql.Date, task.dueDate || null)
      .input('Title', sql.NVarChar(400), task.title)
      .input('CreatedAt', sql.DateTime2(3), new Date(task.createdAt || Date.now()))
      .input('TaskJson', sql.NVarChar(sql.MAX), JSON.stringify(task))
      .query(`
        INSERT INTO [hris].[PerformanceTasks]
          (TaskId, CycleId, EmployeeId, AssigneeId, Status, DueDate, Title, CreatedAt, TaskJson)
        VALUES
          (@TaskId, @CycleId, @EmployeeId, @AssigneeId, @Status, @DueDate, @Title, @CreatedAt, @TaskJson)
      `);
  }

  for (const event of state.audit.slice(0, 5000)) {
    await request()
      .input('AuditId', sql.NVarChar(80), event.id)
      .input('EventAt', sql.DateTime2(3), new Date(event.at || Date.now()))
      .input('Actor', sql.NVarChar(160), event.actor)
      .input('ActorRole', sql.NVarChar(80), event.actorRole)
      .input('Action', sql.NVarChar(200), event.action)
      .input('EntityType', sql.NVarChar(80), event.entityType)
      .input('EntityId', sql.NVarChar(80), event.entityId)
      .input('BeforeValue', sql.NVarChar(1000), event.before || null)
      .input('AfterValue', sql.NVarChar(1000), event.after || null)
      .input('Reason', sql.NVarChar(1000), event.reason || null)
      .input('CorrelationId', sql.NVarChar(80), event.correlationId || null)
      .query(`
        INSERT INTO [hris].[PerformanceAuditTrail]
          (AuditId, EventAt, Actor, ActorRole, Action, EntityType, EntityId, BeforeValue, AfterValue, Reason, CorrelationId)
        VALUES
          (@AuditId, @EventAt, @Actor, @ActorRole, @Action, @EntityType, @EntityId, @BeforeValue, @AfterValue, @Reason, @CorrelationId)
      `);
  }
};

export const readPerformanceDomainFromSql = async (): Promise<{ state: PerformanceDomainState | null; meta: PerformanceSqlSourceMeta } | null> => {
  const pool = await tryGetPerformanceSqlPool();
  if (!pool) return null;

  const doc = await pool.request()
    .input('DocumentKey', sql.NVarChar(80), DOMAIN_DOCUMENT_KEY)
    .query(`SELECT DomainJson, UpdatedAt, SourceHash FROM [hris].[PerformanceDomainDocuments] WHERE DocumentKey = @DocumentKey`);

  const migration = await pool.request()
    .input('MigrationKey', sql.NVarChar(80), MIGRATION_KEY)
    .query(`SELECT Status FROM [hris].[PerformanceMigrations] WHERE MigrationKey = @MigrationKey`);

  if (!doc.recordset[0]?.DomainJson) {
    return {
      state: null,
      meta: {
        databaseAvailable: true,
        source: 'DLE_Enterprise SQL',
        warning: 'Performance domain document is empty in SQL. Import required.',
        updatedAt: null,
        migrationStatus: migration.recordset[0]?.Status ? String(migration.recordset[0].Status) : 'Missing',
        recordCounts: {},
      },
    };
  }

  const state = JSON.parse(String(doc.recordset[0].DomainJson)) as PerformanceDomainState;
  return {
    state,
    meta: {
      databaseAvailable: true,
      source: 'DLE_Enterprise SQL',
      warning: null,
      updatedAt: doc.recordset[0].UpdatedAt instanceof Date
        ? doc.recordset[0].UpdatedAt.toISOString()
        : String(doc.recordset[0].UpdatedAt || ''),
      migrationStatus: migration.recordset[0]?.Status ? String(migration.recordset[0].Status) : null,
      recordCounts: countState(state),
    },
  };
};

export const writePerformanceDomainToSql = async (
  state: PerformanceDomainState,
  actor = 'System',
): Promise<PerformanceSqlSourceMeta> => {
  return withPool(async (pool) => {
    const payload = JSON.stringify(state);
    const sourceHash = hashText(payload);
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const request = new sql.Request(tx);
      await request
        .input('DocumentKey', sql.NVarChar(80), DOMAIN_DOCUMENT_KEY)
        .input('SchemaVersion', sql.Int, Number(state.version || 1))
        .input('DomainJson', sql.NVarChar(sql.MAX), payload)
        .input('SourceHash', sql.NVarChar(128), sourceHash)
        .input('UpdatedBy', sql.NVarChar(160), actor)
        .query(`
          MERGE [hris].[PerformanceDomainDocuments] AS target
          USING (SELECT @DocumentKey AS DocumentKey) AS source
          ON target.DocumentKey = source.DocumentKey
          WHEN MATCHED THEN UPDATE SET
            SchemaVersion = @SchemaVersion,
            DomainJson = @DomainJson,
            SourceHash = @SourceHash,
            UpdatedAt = SYSUTCDATETIME(),
            UpdatedBy = @UpdatedBy
          WHEN NOT MATCHED THEN INSERT (DocumentKey, SchemaVersion, DomainJson, SourceHash, UpdatedBy)
            VALUES (@DocumentKey, @SchemaVersion, @DomainJson, @SourceHash, @UpdatedBy);
        `);

      await syncProjectionTables(tx, state);
      await tx.commit();
      return {
        databaseAvailable: true,
        source: 'DLE_Enterprise SQL',
        warning: null,
        updatedAt: new Date().toISOString(),
        migrationStatus: 'Applied',
        recordCounts: countState(state),
      };
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  });
};

export const importPerformanceDomainJsonToSql = async (actor = 'System') => {
  return withPool(async (pool) => {
    const existing = await pool.request()
      .input('MigrationKey', sql.NVarChar(80), MIGRATION_KEY)
      .query(`SELECT Status, SourceHash, CompletedAt, RowCountsJson FROM [hris].[PerformanceMigrations] WHERE MigrationKey = @MigrationKey`);

    if (String(existing.recordset[0]?.Status || '') === 'Completed') {
      return {
        imported: false,
        reason: 'Migration already completed',
        status: 'Completed',
        completedAt: existing.recordset[0]?.CompletedAt || null,
        sourceHash: existing.recordset[0]?.SourceHash || null,
        counts: existing.recordset[0]?.RowCountsJson
          ? JSON.parse(String(existing.recordset[0].RowCountsJson))
          : null,
      };
    }

    let sourcePath = '';
    let raw = '';
    for (const candidate of resolveDomainCandidates()) {
      try {
        await access(candidate);
        raw = await readFile(candidate, 'utf8');
        sourcePath = candidate;
        break;
      } catch {
        /* try next */
      }
    }
    if (!raw) throw new Error('No performance domain.json found to import.');

    const state = JSON.parse(raw) as PerformanceDomainState;
    if (!state || typeof state !== 'object' || !Array.isArray(state.cycles)) {
      throw new Error('Invalid performance domain JSON structure.');
    }

    const allowSynthetic = process.env.PERFORMANCE_ALLOW_SYNTHETIC_IMPORT === 'true';
    const employeeCodes = new Set<string>();
    try {
      const employees = await pool.request().query(`
        SELECT TOP 5000
          LOWER(LTRIM(RTRIM(CAST(EmployeeCode AS NVARCHAR(80))))) AS EmployeeCode
        FROM [hris].[Employees]
        WHERE EmployeeCode IS NOT NULL
      `);
      for (const row of employees.recordset || []) {
        if (row.EmployeeCode) employeeCodes.add(String(row.EmployeeCode));
      }
    } catch {
      /* Employees table may be unavailable in some environments */
    }

    const collectSynthetic = (rows: Array<{ employeeId?: string; employeeCode?: string }>) =>
      rows.filter((row) => {
        const id = compact(row.employeeId);
        const code = compact(row.employeeCode);
        const looksSynthetic = /^EMP-/i.test(id) || /^EMP-/i.test(code);
        if (!looksSynthetic) return false;
        const resolved = employeeCodes.has(id.toLowerCase()) || employeeCodes.has(code.toLowerCase());
        return !resolved;
      });

    const unresolvedSynthetic = [
      ...collectSynthetic(state.goals || []),
      ...collectSynthetic(state.eligibility || []),
      ...collectSynthetic(state.results || []),
      ...collectSynthetic(state.assessments || []),
    ];

    if (unresolvedSynthetic.length && employeeCodes.size > 0 && !allowSynthetic) {
      throw new Error(
        `Rejected ${unresolvedSynthetic.length} unresolved synthetic EMP-* employee references. `
        + 'Resolve them to [hris].[Employees] or set PERFORMANCE_ALLOW_SYNTHETIC_IMPORT=true for historical import.',
      );
    }

    const notes = unresolvedSynthetic.length
      ? `Imported with ${unresolvedSynthetic.length} synthetic EMP-* references retained as historical snapshots.`
      : 'Imported production/local JSON domain state.';

    const sourceHash = hashText(raw);
    const counts = countState(state);
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const lock = await new sql.Request(tx)
        .input('Resource', sql.NVarChar(255), 'performance-domain-import')
        .input('LockTimeout', sql.Int, 15000)
        .query(`
          DECLARE @result INT;
          EXEC @result = sp_getapplock
            @Resource = @Resource,
            @LockMode = N'Exclusive',
            @LockOwner = N'Transaction',
            @LockTimeout = @LockTimeout;
          SELECT @result AS LockResult;
        `);
      const lockResult = Number(lock.recordset?.[0]?.LockResult ?? -1);
      if (lockResult < 0) {
        throw new Error(`Unable to acquire performance import application lock (result ${lockResult}).`);
      }

      // Re-check ledger under lock for idempotency.
      const lockedExisting = await new sql.Request(tx)
        .input('MigrationKey', sql.NVarChar(80), MIGRATION_KEY)
        .query(`SELECT Status FROM [hris].[PerformanceMigrations] WHERE MigrationKey = @MigrationKey`);
      if (String(lockedExisting.recordset[0]?.Status || '') === 'Completed') {
        await tx.rollback();
        return {
          imported: false,
          reason: 'Migration already completed',
          status: 'Completed',
        };
      }

      await new sql.Request(tx)
        .input('MigrationKey', sql.NVarChar(80), MIGRATION_KEY)
        .input('SourcePath', sql.NVarChar(400), sourcePath)
        .input('SourceHash', sql.NVarChar(128), sourceHash)
        .input('SourceVersion', sql.Int, Number(state.version || 1))
        .input('RowCountsJson', sql.NVarChar(sql.MAX), JSON.stringify(counts))
        .input('CompletedBy', sql.NVarChar(160), actor)
        .input('Notes', sql.NVarChar(1000), notes)
        .query(`
          MERGE [hris].[PerformanceMigrations] AS target
          USING (SELECT @MigrationKey AS MigrationKey) AS source
          ON target.MigrationKey = source.MigrationKey
          WHEN MATCHED THEN UPDATE SET
            SourcePath = @SourcePath,
            SourceHash = @SourceHash,
            SourceVersion = @SourceVersion,
            RowCountsJson = @RowCountsJson,
            Status = N'Completed',
            CompletedAt = SYSUTCDATETIME(),
            CompletedBy = @CompletedBy,
            Notes = @Notes
          WHEN NOT MATCHED THEN INSERT
            (MigrationKey, SourcePath, SourceHash, SourceVersion, RowCountsJson, Status, CompletedAt, CompletedBy, Notes)
            VALUES
            (@MigrationKey, @SourcePath, @SourceHash, @SourceVersion, @RowCountsJson, N'Completed', SYSUTCDATETIME(), @CompletedBy, @Notes);
        `);

      await new sql.Request(tx)
        .input('DocumentKey', sql.NVarChar(80), DOMAIN_DOCUMENT_KEY)
        .input('SchemaVersion', sql.Int, Number(state.version || 1))
        .input('DomainJson', sql.NVarChar(sql.MAX), JSON.stringify(state))
        .input('SourceHash', sql.NVarChar(128), sourceHash)
        .input('UpdatedBy', sql.NVarChar(160), actor)
        .query(`
          MERGE [hris].[PerformanceDomainDocuments] AS target
          USING (SELECT @DocumentKey AS DocumentKey) AS source
          ON target.DocumentKey = source.DocumentKey
          WHEN MATCHED THEN UPDATE SET
            SchemaVersion = @SchemaVersion,
            DomainJson = @DomainJson,
            SourceHash = @SourceHash,
            UpdatedAt = SYSUTCDATETIME(),
            UpdatedBy = @UpdatedBy
          WHEN NOT MATCHED THEN INSERT (DocumentKey, SchemaVersion, DomainJson, SourceHash, UpdatedBy)
            VALUES (@DocumentKey, @SchemaVersion, @DomainJson, @SourceHash, @UpdatedBy);
        `);

      await syncProjectionTables(tx, state);
      await tx.commit();
      return { imported: true, reason: 'Import completed', status: 'Completed', sourcePath, sourceHash, counts, notes };
    } catch (error) {
      try {
        await tx.rollback();
      } catch {
        /* already rolled back */
      }
      throw error;
    }
  });
};

export const readPerformanceNavPreferencesFromSql = async (userKey: string): Promise<PerformanceNavPreferences | null> => {
  const pool = await tryGetPerformanceSqlPool();
  if (!pool) return null;
  const result = await pool.request()
    .input('UserKey', sql.NVarChar(120), userKey)
    .query(`SELECT PreferencesJson FROM [hris].[PerformanceNavPreferences] WHERE UserKey = @UserKey`);
  if (!result.recordset[0]?.PreferencesJson) return null;
  return JSON.parse(String(result.recordset[0].PreferencesJson)) as PerformanceNavPreferences;
};

export const writePerformanceNavPreferencesToSql = async (userKey: string, preferences: PerformanceNavPreferences) => {
  const pool = await tryGetPerformanceSqlPool();
  if (!pool) return false;
  await pool.request()
    .input('UserKey', sql.NVarChar(120), userKey)
    .input('PreferencesJson', sql.NVarChar(sql.MAX), JSON.stringify(preferences))
    .query(`
      MERGE [hris].[PerformanceNavPreferences] AS target
      USING (SELECT @UserKey AS UserKey) AS source
      ON target.UserKey = source.UserKey
      WHEN MATCHED THEN UPDATE SET PreferencesJson = @PreferencesJson, UpdatedAt = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT (UserKey, PreferencesJson) VALUES (@UserKey, @PreferencesJson);
    `);
  return true;
};

export type AnalyticsSnapshotRow = {
  snapshotId: string;
  cycleId: string | null;
  generatedAt: string;
  employees: number;
  reviewsCompleted: number;
  pendingReviews: number;
  goalCompletionPct: number;
  highPerformers: number;
  pipEmployees: number;
};

export const insertAnalyticsSnapshot = async (row: Omit<AnalyticsSnapshotRow, 'snapshotId' | 'generatedAt'> & { snapshotId?: string; generatedAt?: string; snapshotJson?: unknown }) => {
  const pool = await tryGetPerformanceSqlPool();
  if (!pool) return null;
  const snapshotId = row.snapshotId || `snap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const generatedAt = row.generatedAt || new Date().toISOString();
  await pool.request()
    .input('SnapshotId', sql.NVarChar(80), snapshotId)
    .input('CycleId', sql.NVarChar(80), row.cycleId)
    .input('GeneratedAt', sql.DateTime2(3), new Date(generatedAt))
    .input('Employees', sql.Int, row.employees)
    .input('ReviewsCompleted', sql.Int, row.reviewsCompleted)
    .input('PendingReviews', sql.Int, row.pendingReviews)
    .input('GoalCompletionPct', sql.Decimal(9, 4), row.goalCompletionPct)
    .input('HighPerformers', sql.Int, row.highPerformers)
    .input('PipEmployees', sql.Int, row.pipEmployees)
    .input('SnapshotJson', sql.NVarChar(sql.MAX), row.snapshotJson ? JSON.stringify(row.snapshotJson) : null)
    .query(`
      INSERT INTO [hris].[PerformanceAnalyticsSnapshots]
        (SnapshotId, CycleId, GeneratedAt, Employees, ReviewsCompleted, PendingReviews, GoalCompletionPct, HighPerformers, PipEmployees, SnapshotJson)
      VALUES
        (@SnapshotId, @CycleId, @GeneratedAt, @Employees, @ReviewsCompleted, @PendingReviews, @GoalCompletionPct, @HighPerformers, @PipEmployees, @SnapshotJson)
    `);
  return { ...row, snapshotId, generatedAt };
};

export const listAnalyticsSnapshots = async (cycleId?: string | null, limit = 12): Promise<AnalyticsSnapshotRow[]> => {
  const pool = await tryGetPerformanceSqlPool();
  if (!pool) return [];
  const request = pool.request().input('Limit', sql.Int, limit);
  let query = `
    SELECT TOP (@Limit) SnapshotId, CycleId, GeneratedAt, Employees, ReviewsCompleted, PendingReviews, GoalCompletionPct, HighPerformers, PipEmployees
    FROM [hris].[PerformanceAnalyticsSnapshots]
  `;
  if (cycleId) {
    request.input('CycleId', sql.NVarChar(80), cycleId);
    query += ` WHERE CycleId = @CycleId`;
  }
  query += ` ORDER BY GeneratedAt DESC`;
  const result = await request.query(query);
  return result.recordset.map((row: any) => ({
    snapshotId: String(row.SnapshotId),
    cycleId: row.CycleId ? String(row.CycleId) : null,
    generatedAt: row.GeneratedAt instanceof Date ? row.GeneratedAt.toISOString() : String(row.GeneratedAt),
    employees: Number(row.Employees || 0),
    reviewsCompleted: Number(row.ReviewsCompleted || 0),
    pendingReviews: Number(row.PendingReviews || 0),
    goalCompletionPct: Number(row.GoalCompletionPct || 0),
    highPerformers: Number(row.HighPerformers || 0),
    pipEmployees: Number(row.PipEmployees || 0),
  }));
};

export const enqueuePerformanceOutbox = async (kind: string, payload: Record<string, unknown>) => {
  const pool = await tryGetPerformanceSqlPool();
  if (!pool) return null;
  const outboxId = `out-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await pool.request()
    .input('OutboxId', sql.NVarChar(80), outboxId)
    .input('Kind', sql.NVarChar(80), kind)
    .input('PayloadJson', sql.NVarChar(sql.MAX), JSON.stringify(payload))
    .query(`
      INSERT INTO [hris].[PerformanceOutbox] (OutboxId, Kind, PayloadJson, Status)
      VALUES (@OutboxId, @Kind, @PayloadJson, N'Pending')
    `);
  return outboxId;
};

export const claimProbationAlert = async (probationId: string, thresholdDays: number, taskId?: string) => {
  const pool = await tryGetPerformanceSqlPool();
  if (!pool) return { created: true };
  try {
    await pool.request()
      .input('ProbationId', sql.NVarChar(80), probationId)
      .input('ThresholdDays', sql.Int, thresholdDays)
      .input('TaskId', sql.NVarChar(80), taskId || null)
      .query(`
        INSERT INTO [hris].[PerformanceProbationAlerts] (ProbationId, ThresholdDays, TaskId)
        VALUES (@ProbationId, @ThresholdDays, @TaskId)
      `);
    return { created: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/primary key|duplicate|UNIQUE/i.test(message)) return { created: false };
    throw error;
  }
};

export const listPendingPerformanceOutbox = async (limit = 50) => {
  const pool = await tryGetPerformanceSqlPool();
  if (!pool) return [];
  const result = await pool.request()
    .input('Limit', sql.Int, limit)
    .query(`
      SELECT TOP (@Limit) OutboxId, Kind, PayloadJson, CreatedAt
      FROM [hris].[PerformanceOutbox]
      WHERE Status = N'Pending'
      ORDER BY CreatedAt ASC
    `);
  return result.recordset.map((row: any) => ({
    outboxId: String(row.OutboxId),
    kind: String(row.Kind),
    payload: JSON.parse(String(row.PayloadJson || '{}')),
    createdAt: row.CreatedAt instanceof Date ? row.CreatedAt.toISOString() : String(row.CreatedAt),
  }));
};

export const markPerformanceOutbox = async (outboxId: string, status: 'Processed' | 'Failed', errorMessage?: string) => {
  const pool = await tryGetPerformanceSqlPool();
  if (!pool) return;
  await pool.request()
    .input('OutboxId', sql.NVarChar(80), outboxId)
    .input('Status', sql.NVarChar(40), status)
    .input('ErrorMessage', sql.NVarChar(1000), errorMessage || null)
    .query(`
      UPDATE [hris].[PerformanceOutbox]
      SET Status = @Status,
          ProcessedAt = SYSUTCDATETIME(),
          ErrorMessage = @ErrorMessage
      WHERE OutboxId = @OutboxId
    `);
};

export const getPerformanceSqlHealth = async (): Promise<PerformanceSqlSourceMeta> => {
  try {
    const loaded = await readPerformanceDomainFromSql();
    if (!loaded) {
      return {
        databaseAvailable: false,
        source: 'Local JSON fallback',
        warning: 'DLE Enterprise SQL is unavailable for Performance Management.',
        updatedAt: null,
        migrationStatus: null,
        recordCounts: {},
      };
    }
    if (!loaded.state) {
      return loaded.meta;
    }
    return loaded.meta;
  } catch (error) {
    return {
      databaseAvailable: false,
      source: 'Local JSON fallback',
      warning: error instanceof Error ? error.message : 'Unable to read Performance SQL store.',
      updatedAt: null,
      migrationStatus: null,
      recordCounts: {},
    };
  }
};

export const compactEmployeeKey = compact;
