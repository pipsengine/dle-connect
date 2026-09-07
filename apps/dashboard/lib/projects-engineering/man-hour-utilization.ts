import {
  canonicalProjectCode,
  isIdleTimeProjectCode,
  type TimesheetLine,
} from '@/lib/timesheet-entry-shared';
import {
  isTimesheetPayrollReadyStatus,
  normalizeTimesheetStatus,
  readTimesheetData,
  type TimesheetHeader,
  type TimesheetStatus,
} from '@/lib/timesheet-entry-store';
import { ensurePmDb, sql } from '@/lib/projects-engineering/db';
import type { Project } from '@/lib/projects-engineering/types';
import type {
  ManHourEmployeeSummary,
  ManHourRegisterRow,
  ProjectManHourUtilization,
  UtilizationGate,
} from '@/lib/projects-engineering/man-hour-types';

export type {
  ManHourEmployeeSummary,
  ManHourRegisterRow,
  ManHourWeekBucket,
  ProjectManHourUtilization,
  UtilizationGate,
} from '@/lib/projects-engineering/man-hour-types';

const PM_APPROVED: TimesheetStatus[] = [
  'Project_Manager_Reviewed',
  'Cost_Control_Reviewed',
  'GM_Operations_Reviewed',
  'HR_Acknowledged',
  'Locked',
];

const COST_VALIDATED: TimesheetStatus[] = [
  'Cost_Control_Reviewed',
  'GM_Operations_Reviewed',
  'HR_Acknowledged',
  'Locked',
];

const weekEndingIso = (dateIso: string) => {
  const date = new Date(`${dateIso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateIso;
  const day = date.getUTCDay(); // 0 Sun
  const add = day === 0 ? 0 : 7 - day;
  date.setUTCDate(date.getUTCDate() + add);
  return date.toISOString().slice(0, 10);
};

const gateForStatus = (status: TimesheetStatus): UtilizationGate => {
  if (isTimesheetPayrollReadyStatus(status)) return 'payrollReady';
  if (COST_VALIDATED.includes(status)) return 'costValidated';
  if (PM_APPROVED.includes(status)) return 'pmApproved';
  return 'all';
};

const passesGate = (status: TimesheetStatus, gate: UtilizationGate) => {
  if (gate === 'all') return !['Rejected', 'Returned'].includes(status);
  if (gate === 'pmApproved') return PM_APPROVED.includes(status);
  if (gate === 'costValidated') return COST_VALIDATED.includes(status);
  return isTimesheetPayrollReadyStatus(status);
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export const readManHourBudget = async (projectCode: string): Promise<number> => {
  try {
    const pool = await ensurePmDb();
    await pool.request().query(`
IF OBJECT_ID(N'[pm].[ManHourBudgets]', N'U') IS NULL
CREATE TABLE [pm].[ManHourBudgets](
  [ProjectCode] nvarchar(30) NOT NULL CONSTRAINT [PK_pm_ManHourBudgets] PRIMARY KEY,
  [BudgetedHours] decimal(12,2) NOT NULL CONSTRAINT [DF_pm_ManHourBudgets_Hours] DEFAULT 0,
  [EtcHours] decimal(12,2) NULL,
  [Notes] nvarchar(500) NULL,
  [ModifiedAt] datetime2(3) NOT NULL CONSTRAINT [DF_pm_ManHourBudgets_ModifiedAt] DEFAULT SYSUTCDATETIME(),
  [ModifiedBy] nvarchar(120) NULL
);`);
    const result = await pool
      .request()
      .input('ProjectCode', sql.NVarChar(30), canonicalProjectCode(projectCode))
      .query(`SELECT BudgetedHours, EtcHours FROM pm.ManHourBudgets WHERE ProjectCode=@ProjectCode`);
    const row = result.recordset[0];
    return Number(row?.BudgetedHours || 0);
  } catch {
    return 0;
  }
};

export const upsertManHourBudget = async (
  projectCode: string,
  input: { budgetedHours: number; etcHours?: number | null; notes?: string | null; actor?: string },
) => {
  const pool = await ensurePmDb();
  await pool.request().query(`
IF OBJECT_ID(N'[pm].[ManHourBudgets]', N'U') IS NULL
CREATE TABLE [pm].[ManHourBudgets](
  [ProjectCode] nvarchar(30) NOT NULL CONSTRAINT [PK_pm_ManHourBudgets] PRIMARY KEY,
  [BudgetedHours] decimal(12,2) NOT NULL CONSTRAINT [DF_pm_ManHourBudgets_Hours] DEFAULT 0,
  [EtcHours] decimal(12,2) NULL,
  [Notes] nvarchar(500) NULL,
  [ModifiedAt] datetime2(3) NOT NULL CONSTRAINT [DF_pm_ManHourBudgets_ModifiedAt] DEFAULT SYSUTCDATETIME(),
  [ModifiedBy] nvarchar(120) NULL
);`);
  await pool
    .request()
    .input('ProjectCode', sql.NVarChar(30), canonicalProjectCode(projectCode))
    .input('BudgetedHours', sql.Decimal(12, 2), Number(input.budgetedHours || 0))
    .input('EtcHours', sql.Decimal(12, 2), input.etcHours ?? null)
    .input('Notes', sql.NVarChar(500), input.notes ?? null)
    .input('ModifiedBy', sql.NVarChar(120), input.actor || null)
    .query(`
MERGE pm.ManHourBudgets AS target
USING (SELECT @ProjectCode AS ProjectCode) AS source ON target.ProjectCode=source.ProjectCode
WHEN MATCHED THEN UPDATE SET BudgetedHours=@BudgetedHours, EtcHours=@EtcHours, Notes=@Notes, ModifiedAt=SYSUTCDATETIME(), ModifiedBy=@ModifiedBy
WHEN NOT MATCHED THEN INSERT (ProjectCode,BudgetedHours,EtcHours,Notes,ModifiedBy)
VALUES (@ProjectCode,@BudgetedHours,@EtcHours,@Notes,@ModifiedBy);`);
};

export const buildProjectManHourUtilization = async (
  project: Project,
  options?: { gate?: UtilizationGate; registerLimit?: number },
): Promise<ProjectManHourUtilization> => {
  const gate = options?.gate || 'pmApproved';
  const registerLimit = options?.registerLimit ?? 200;
  const target = canonicalProjectCode(project.code);
  const { headers, lines } = await readTimesheetData({ softFail: true });
  const headerById = new Map<string, TimesheetHeader>();
  for (const header of headers) headerById.set(header.id, header);

  const register: ManHourRegisterRow[] = [];
  let totalHours = 0;
  let productiveHours = 0;
  let idleHours = 0;
  let pmApprovedHours = 0;
  let costValidatedHours = 0;
  let payrollReadyHours = 0;
  const employeeMap = new Map<string, ManHourEmployeeSummary & { daySet: Set<string> }>();
  const weekMap = new Map<string, { hours: number; employees: Set<string> }>();
  const daySet = new Set<string>();
  const labourQueue: ProjectManHourUtilization['labourQueue'] = [];

  for (const line of lines as TimesheetLine[]) {
    const header = headerById.get(line.headerId);
    if (!header) continue;
    const status = normalizeTimesheetStatus(header.status);
    if (['Rejected', 'Returned'].includes(status)) continue;
    const workDate = String(header.timesheetDate || '').slice(0, 10);
    const allocations = line.projectAllocations || [];

    for (const allocation of allocations) {
      const code = canonicalProjectCode(allocation.projectCode);
      if (code !== target) continue;
      const hours = round1(Number(allocation.hours || 0));
      if (hours <= 0) continue;

      totalHours += hours;
      if (isIdleTimeProjectCode(code)) idleHours += hours;
      else productiveHours += hours;

      if (PM_APPROVED.includes(status)) pmApprovedHours += hours;
      if (COST_VALIDATED.includes(status)) costValidatedHours += hours;
      if (isTimesheetPayrollReadyStatus(status)) payrollReadyHours += hours;

      if (!passesGate(status, gate)) continue;

      daySet.add(workDate);
      const empKey = line.employeeId || line.employeeNo || line.employeeName;
      const emp = employeeMap.get(empKey) || {
        employeeId: line.employeeId,
        employeeNo: line.employeeNo,
        employeeName: line.employeeName,
        hours: 0,
        days: 0,
        daySet: new Set<string>(),
      };
      emp.hours = round1(emp.hours + hours);
      emp.daySet.add(workDate);
      emp.days = emp.daySet.size;
      employeeMap.set(empKey, emp);

      const week = weekEndingIso(workDate || new Date().toISOString().slice(0, 10));
      const bucket = weekMap.get(week) || { hours: 0, employees: new Set<string>() };
      bucket.hours = round1(bucket.hours + hours);
      bucket.employees.add(empKey);
      weekMap.set(week, bucket);

      register.push({
        workDate,
        headerId: header.id,
        lineId: line.id,
        employeeId: line.employeeId,
        employeeNo: line.employeeNo,
        employeeName: line.employeeName,
        projectCode: code,
        projectName: allocation.projectName || project.name,
        taskName: allocation.taskName || allocation.activityId || 'General',
        hours,
        headerStatus: status,
        gate: gateForStatus(status),
      });

      // Phase 2 queue: at Project Manager review stage (awaiting Cost Control)
      if (status === 'Project_Manager_Reviewed' || status === 'Supervisor_Reviewed') {
        labourQueue.push({
          lineId: line.id,
          workDate,
          employeeName: line.employeeName,
          employeeNo: line.employeeNo,
          hours,
          taskName: allocation.taskName || 'General',
          headerStatus: status,
          costValidationStatus: 'Pending',
        });
      }
    }
  }

  // Deduplicate labour queue pending only
  const pendingQueue = labourQueue.filter(
    (row) => row.headerStatus === 'Project_Manager_Reviewed' || row.headerStatus === 'Supervisor_Reviewed',
  );

  const gatedHours =
    gate === 'all'
      ? totalHours
      : gate === 'pmApproved'
        ? pmApprovedHours
        : gate === 'costValidated'
          ? costValidatedHours
          : payrollReadyHours;

  const budgetedHours = await readManHourBudget(project.code);
  const remainingHours = Math.max(0, round1(budgetedHours - productiveHours));
  // Phase 4: if no explicit ETC, remaining budgeted hours is the ETC proxy
  const etcHours = remainingHours;
  const eacHours = round1(productiveHours + etcHours);
  const availableProxy = Math.max(gatedHours, budgetedHours || gatedHours, 1);
  const utilizationPct = round1((productiveHours / availableProxy) * 100);

  return {
    projectCode: project.code,
    projectName: project.name,
    generatedAt: new Date().toISOString(),
    gate,
    summary: {
      totalHours: round1(totalHours),
      productiveHours: round1(productiveHours),
      idleHours: round1(idleHours),
      employeeCount: employeeMap.size,
      dayCount: daySet.size,
      averageHoursPerEmployee: employeeMap.size ? round1(gatedHours / employeeMap.size) : 0,
      pmApprovedHours: round1(pmApprovedHours),
      costValidatedHours: round1(costValidatedHours),
      payrollReadyHours: round1(payrollReadyHours),
      budgetedHours: round1(budgetedHours),
      remainingHours,
      consumedPct: budgetedHours ? round1((productiveHours / budgetedHours) * 100) : 0,
      utilizationPct: Math.min(100, utilizationPct),
      etcHours,
      eacHours,
    },
    byEmployee: [...employeeMap.values()]
      .map(({ daySet: _d, ...rest }) => rest)
      .sort((a, b) => b.hours - a.hours),
    byWeek: [...weekMap.entries()]
      .map(([weekEnding, value]) => ({
        weekEnding,
        hours: value.hours,
        employees: value.employees.size,
      }))
      .sort((a, b) => a.weekEnding.localeCompare(b.weekEnding)),
    register: register
      .sort((a, b) => b.workDate.localeCompare(a.workDate) || a.employeeName.localeCompare(b.employeeName))
      .slice(0, registerLimit),
    labourQueue: pendingQueue
      .sort((a, b) => b.workDate.localeCompare(a.workDate))
      .slice(0, 100),
  };
};
