/**
 * Finance project labour cost for C-code (daily-rate) staff only.
 * Money comes from payroll gross / WHT; split across projects by timesheet hours
 * so project totals equal the C-code payroll pack.
 */
import { calculatePayrollForPeriod, type PayrollCalculationRecord } from '@/lib/payroll-calculation-service';
import { CONTRACT_FLAT_PAYE_RATE } from '@/lib/payroll-tax-engine';
import { normalizePayrollMatchKey } from '@/lib/sage-people-payroll-store';

const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const roundHours = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 10) / 10;
const compact = (value: unknown) => String(value || '').trim();
const upper = (value: unknown) => compact(value).toUpperCase();

export type ProjectFinanceTimesheetRow = {
  periodId?: string | null;
  timesheetDate?: string | null;
  employeeId?: string | null;
  employeeNo?: string | null;
  employeeName?: string | null;
  projectCode?: string | null;
  projectName?: string | null;
  allocationHours?: number | null;
  productiveHours?: number | null;
  normalizedStatus?: string | null;
  exceptionType?: string | null;
  approvalStatus?: string | null;
};

export type ProjectFinanceCostRow = {
  projectCode: string;
  projectName: string;
  label: string;
  productiveHours: number;
  employees: number;
  labourCost: number;
  wht: number;
  net: number;
  exceptionRows: number;
  pendingApprovals: number;
  drilldownKey: string;
};

export type ProjectFinanceCostResult = {
  projects: ProjectFinanceCostRow[];
  controlTotals: {
    cCodeEmployees: number;
    payrollGross: number;
    allocatedLabourCost: number;
    wht: number;
    net: number;
    balanced: boolean;
  };
  basis: string;
  payrollPeriods: string[];
};

const isCCodeToken = (value: unknown) => /^C\d+/.test(upper(value));

export const isCCodeTimesheetEmployee = (row: Pick<ProjectFinanceTimesheetRow, 'employeeId' | 'employeeNo'>) =>
  isCCodeToken(row.employeeNo) || isCCodeToken(row.employeeId);

const employeeMatchKeys = (row: Pick<ProjectFinanceTimesheetRow, 'employeeId' | 'employeeNo' | 'employeeName'>) =>
  [row.employeeNo, row.employeeId, row.employeeName]
    .map((value) => normalizePayrollMatchKey(compact(value)))
    .filter(Boolean);

const payrollMatchKeys = (record: Pick<PayrollCalculationRecord, 'employeeCode' | 'employeeId' | 'fullName'>) =>
  [record.employeeCode, record.employeeId, record.fullName]
    .map((value) => normalizePayrollMatchKey(compact(value)))
    .filter(Boolean);

const payrollPeriodFromTimesheetPeriodId = (periodId: string) => {
  const match = compact(periodId).match(/^per-(\d{4}-\d{2})$/i);
  return match ? match[1] : '';
};

const payrollPeriodsFromRows = (rows: ProjectFinanceTimesheetRow[]) => {
  const periods = new Set<string>();
  for (const row of rows) {
    const fromPeriodId = payrollPeriodFromTimesheetPeriodId(String(row.periodId || ''));
    if (fromPeriodId) {
      periods.add(fromPeriodId);
      continue;
    }
    const date = compact(row.timesheetDate).slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(date)) periods.add(date);
  }
  return Array.from(periods).sort();
};

const projectMeta = (row: ProjectFinanceTimesheetRow) => {
  const code = compact(row.projectCode) || 'No Project';
  const name = compact(row.projectName) || code;
  return { code, name, label: `${code} - ${name}`, key: upper(code) };
};

const hourValue = (row: ProjectFinanceTimesheetRow) => {
  const allocated = Number(row.allocationHours || 0);
  if (allocated > 0) return allocated;
  return Math.max(0, Number(row.productiveHours || 0));
};

const allocateAmountByShares = (
  total: number,
  shares: Array<{ key: string; hours: number }>,
) => {
  const map = new Map<string, number>();
  const hoursTotal = shares.reduce((sum, item) => sum + item.hours, 0);
  if (total === 0 || hoursTotal <= 0 || !shares.length) {
    if (shares.length) map.set(shares[0].key, roundMoney(total));
    return map;
  }
  let allocated = 0;
  const sorted = [...shares].sort((a, b) => b.hours - a.hours || a.key.localeCompare(b.key));
  sorted.forEach((item, index) => {
    if (index === sorted.length - 1) {
      map.set(item.key, roundMoney(total - allocated));
      return;
    }
    const share = roundMoney(total * (item.hours / hoursTotal));
    map.set(item.key, share);
    allocated = roundMoney(allocated + share);
  });
  return map;
};

export async function buildCCodeProjectFinanceCosts(
  rows: ProjectFinanceTimesheetRow[],
): Promise<ProjectFinanceCostResult> {
  const cRows = rows.filter(isCCodeTimesheetEmployee);
  const empty: ProjectFinanceCostResult = {
    projects: [],
    controlTotals: {
      cCodeEmployees: 0,
      payrollGross: 0,
      allocatedLabourCost: 0,
      wht: 0,
      net: 0,
      balanced: true,
    },
    basis: 'C-code payroll gross allocated by timesheet project hours · WHT = 5% of allocated gross',
    payrollPeriods: [],
  };
  if (!cRows.length) return empty;

  const payrollPeriods = payrollPeriodsFromRows(cRows);
  const payrollByPeriod = new Map<string, PayrollCalculationRecord[]>();
  await Promise.all(
    payrollPeriods.map(async (period) => {
      try {
        const calculation = await calculatePayrollForPeriod(period, { pack: 'daily-rate' });
        payrollByPeriod.set(
          period,
          calculation.records.filter((record) => isCCodeToken(record.employeeCode) || isCCodeToken(record.employeeId)),
        );
      } catch (error) {
        console.warn('[ProjectFinanceCost] Payroll unavailable for', period, error instanceof Error ? error.message : error);
        payrollByPeriod.set(period, []);
      }
    }),
  );

  type ProjectAgg = {
    projectCode: string;
    projectName: string;
    label: string;
    productiveHours: number;
    employeeKeys: Set<string>;
    labourCost: number;
    wht: number;
    net: number;
    exceptionRows: number;
    pendingApprovals: number;
  };
  const projects = new Map<string, ProjectAgg>();
  const ensureProject = (meta: ReturnType<typeof projectMeta>) => {
    const current = projects.get(meta.key);
    if (current) return current;
    const created: ProjectAgg = {
      projectCode: meta.code,
      projectName: meta.name,
      label: meta.label,
      productiveHours: 0,
      employeeKeys: new Set(),
      labourCost: 0,
      wht: 0,
      net: 0,
      exceptionRows: 0,
      pendingApprovals: 0,
    };
    projects.set(meta.key, created);
    return created;
  };

  let payrollGrossTotal = 0;
  let allocatedLabourCost = 0;
  let allocatedWht = 0;
  const employeesSeen = new Set<string>();

  for (const period of payrollPeriods.length ? payrollPeriods : ['']) {
    const periodRows = period
      ? cRows.filter((row) => {
          const fromId = payrollPeriodFromTimesheetPeriodId(String(row.periodId || ''));
          if (fromId) return fromId === period;
          return compact(row.timesheetDate).startsWith(period);
        })
      : cRows;
    if (!periodRows.length) continue;

    const payrollRecords = payrollByPeriod.get(period) || [];
    const payrollByKey = new Map<string, PayrollCalculationRecord>();
    for (const record of payrollRecords) {
      for (const key of payrollMatchKeys(record)) {
        if (!payrollByKey.has(key)) payrollByKey.set(key, record);
      }
    }

    type EmpAgg = {
      employeeKey: string;
      matchKeys: string[];
      hoursByProject: Map<string, { meta: ReturnType<typeof projectMeta>; hours: number }>;
      exceptionRows: number;
      pendingApprovals: number;
    };
    const byEmployee = new Map<string, EmpAgg>();

    for (const row of periodRows) {
      const keys = employeeMatchKeys(row);
      const employeeKey = keys[0] || upper(row.employeeNo || row.employeeId || row.employeeName || 'UNKNOWN');
      employeesSeen.add(employeeKey);
      const current = byEmployee.get(employeeKey) || {
        employeeKey,
        matchKeys: keys,
        hoursByProject: new Map(),
        exceptionRows: 0,
        pendingApprovals: 0,
      };
      for (const key of keys) {
        if (!current.matchKeys.includes(key)) current.matchKeys.push(key);
      }
      const meta = projectMeta(row);
      const hours = hourValue(row);
      const existing = current.hoursByProject.get(meta.key) || { meta, hours: 0 };
      existing.hours = roundHours(existing.hours + hours);
      current.hoursByProject.set(meta.key, existing);
      if (row.exceptionType && row.exceptionType !== 'None') current.exceptionRows += 1;
      if (/pending|submitted|supervisor|project_manager|cost_control|gm_operations/i.test(String(row.approvalStatus || row.normalizedStatus || ''))) {
        current.pendingApprovals += 1;
      }
      byEmployee.set(employeeKey, current);
    }

    for (const emp of byEmployee.values()) {
      let payroll: PayrollCalculationRecord | undefined;
      for (const key of emp.matchKeys) {
        payroll = payrollByKey.get(key);
        if (payroll) break;
      }
      if (!payroll) {
        for (const item of emp.hoursByProject.values()) {
          const project = ensureProject(item.meta);
          project.productiveHours = roundHours(project.productiveHours + item.hours);
          project.employeeKeys.add(emp.employeeKey);
          project.exceptionRows += emp.exceptionRows;
          project.pendingApprovals += emp.pendingApprovals;
        }
        continue;
      }

      const gross = roundMoney(Number(payroll.grossPay || 0));
      const whtTotal = roundMoney(Number(payroll.paye || 0) || Math.max(0, gross) * CONTRACT_FLAT_PAYE_RATE);
      payrollGrossTotal = roundMoney(payrollGrossTotal + gross);

      const shares = Array.from(emp.hoursByProject.values()).map((item) => ({
        key: item.meta.key,
        hours: item.hours,
        meta: item.meta,
      }));
      if (!shares.length) {
        shares.push({
          key: 'NO PROJECT',
          hours: 0,
          meta: { code: 'No Project', name: 'No Project', label: 'No Project - No Project', key: 'NO PROJECT' },
        });
      }

      const grossByProject = allocateAmountByShares(gross, shares);
      const whtByProject = allocateAmountByShares(whtTotal, shares);

      for (const share of shares) {
        const project = ensureProject(share.meta);
        const labourCost = roundMoney(grossByProject.get(share.key) || 0);
        const wht = roundMoney(whtByProject.get(share.key) || 0);
        const net = roundMoney(labourCost - wht);
        project.productiveHours = roundHours(project.productiveHours + share.hours);
        project.employeeKeys.add(emp.employeeKey);
        project.labourCost = roundMoney(project.labourCost + labourCost);
        project.wht = roundMoney(project.wht + wht);
        project.net = roundMoney(project.net + net);
        project.exceptionRows += emp.exceptionRows;
        project.pendingApprovals += emp.pendingApprovals;
        allocatedLabourCost = roundMoney(allocatedLabourCost + labourCost);
        allocatedWht = roundMoney(allocatedWht + wht);
      }
    }
  }

  const projectRows = Array.from(projects.values())
    .map((project) => ({
      projectCode: project.projectCode,
      projectName: project.projectName,
      label: project.label,
      productiveHours: project.productiveHours,
      employees: project.employeeKeys.size,
      labourCost: project.labourCost,
      wht: project.wht,
      net: project.net,
      exceptionRows: project.exceptionRows,
      pendingApprovals: project.pendingApprovals,
      drilldownKey: project.label,
    }))
    .sort((a, b) => b.productiveHours - a.productiveHours || b.labourCost - a.labourCost || a.projectCode.localeCompare(b.projectCode));

  const netTotal = roundMoney(allocatedLabourCost - allocatedWht);
  return {
    projects: projectRows,
    controlTotals: {
      cCodeEmployees: employeesSeen.size,
      payrollGross: payrollGrossTotal,
      allocatedLabourCost,
      wht: allocatedWht,
      net: netTotal,
      balanced: Math.abs(payrollGrossTotal - allocatedLabourCost) <= 1,
    },
    basis: 'C-code payroll gross allocated by timesheet project hours · WHT from payroll PAYE (5% flat)',
    payrollPeriods,
  };
}
