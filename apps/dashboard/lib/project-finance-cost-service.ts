/**
 * Finance project labour cost for daily-rate (C-code) staff only.
 * Money comes from the daily-rate payroll pack after excluding staff with
 * no booked timesheet hours and/or zero gross; pay is split by project hours.
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
    /** Sum of project productive hours (additive — each hour belongs to one project). */
    productiveHours: number;
    /** Unique daily-rate (C-code) staff in the payroll pack(s). */
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

const NO_PROJECT_META = {
  code: 'No Project',
  name: 'Unallocated (no project hours)',
  label: 'No Project - Unallocated (no project hours)',
  key: 'NO PROJECT',
} as const;

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

/** Timesheet cycle is 16th→15th; payroll label is the month of the 15th end date. */
export const payrollPeriodFromTimesheetDate = (dateStr: string) => {
  const d = compact(dateStr).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return '';
  const year = Number(d.slice(0, 4));
  const month = Number(d.slice(5, 7));
  const day = Number(d.slice(8, 10));
  if (!year || !month || !day) return '';
  if (day >= 16) {
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
};

const rowPayrollPeriod = (row: ProjectFinanceTimesheetRow) =>
  payrollPeriodFromTimesheetPeriodId(String(row.periodId || ''))
  || payrollPeriodFromTimesheetDate(String(row.timesheetDate || ''));

const hourValue = (row: ProjectFinanceTimesheetRow) => {
  const allocated = Number(row.allocationHours || 0);
  if (allocated > 0) return allocated;
  return Math.max(0, Number(row.productiveHours || 0));
};

/**
 * Resolve which payroll pack(s) to use.
 * Prefer explicit periods (from UI Payroll Period filter). Otherwise use the single
 * dominant timesheet period by hours so a one-day spill (e.g. 16th) does not pull
 * the next month's full daily-rate pack into CONTROL TOTAL.
 */
const resolvePayrollPeriods = (
  rows: ProjectFinanceTimesheetRow[],
  explicitPeriods?: string[],
) => {
  const explicit = (explicitPeriods || [])
    .map((value) => {
      const raw = compact(value);
      return payrollPeriodFromTimesheetPeriodId(raw) || (/^\d{4}-\d{2}$/.test(raw) ? raw : '');
    })
    .filter(Boolean);
  if (explicit.length) return Array.from(new Set(explicit)).sort();

  const hoursByPeriod = new Map<string, number>();
  for (const row of rows) {
    const period = rowPayrollPeriod(row);
    if (!period) continue;
    hoursByPeriod.set(period, roundHours((hoursByPeriod.get(period) || 0) + hourValue(row)));
  }
  const ranked = Array.from(hoursByPeriod.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return ranked[0]?.[0] ? [ranked[0][0]] : [];
};

const projectMeta = (row: ProjectFinanceTimesheetRow) => {
  const code = compact(row.projectCode) || 'No Project';
  const name = compact(row.projectName) || (code === 'No Project' ? NO_PROJECT_META.name : code);
  return { code, name, label: `${code} - ${name}`, key: upper(code) };
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

const recordIdentity = (record: PayrollCalculationRecord) =>
  compact(record.recordKey)
  || compact(record.employeeCode)
  || compact(record.employeeId)
  || normalizePayrollMatchKey(compact(record.fullName))
  || 'UNKNOWN';

export async function buildCCodeProjectFinanceCosts(
  rows: ProjectFinanceTimesheetRow[],
  options?: { payrollPeriods?: string[] },
): Promise<ProjectFinanceCostResult> {
  const cRows = rows.filter(isCCodeTimesheetEmployee);
  const empty: ProjectFinanceCostResult = {
    projects: [],
    controlTotals: {
      productiveHours: 0,
      cCodeEmployees: 0,
      payrollGross: 0,
      allocatedLabourCost: 0,
      wht: 0,
      net: 0,
      balanced: true,
    },
    basis: 'Daily-rate payroll with booked timesheet hours only · one payroll period · zero timesheet / zero gross excluded',
    payrollPeriods: [],
  };
  if (!cRows.length) return empty;

  const payrollPeriods = resolvePayrollPeriods(cRows, options?.payrollPeriods);
  if (!payrollPeriods.length) return empty;

  const payrollByPeriod = new Map<string, PayrollCalculationRecord[]>();
  await Promise.all(
    payrollPeriods.map(async (period) => {
      try {
        const calculation = await calculatePayrollForPeriod(period, { pack: 'daily-rate' });
        // Daily-rate pack is the finance source of truth (already C-code / contract day-rate).
        payrollByPeriod.set(period, calculation.records.slice());
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
  const ensureProject = (meta: { code: string; name: string; label: string; key: string }) => {
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
  let payrollNetTotal = 0;
  let allocatedLabourCost = 0;
  let allocatedWht = 0;
  let allocatedNet = 0;
  const packEmployeeKeys = new Set<string>();

  for (const period of payrollPeriods) {
    const periodRows = cRows.filter((row) => rowPayrollPeriod(row) === period);

    const payrollRecords = payrollByPeriod.get(period) || [];

    type EmpAgg = {
      employeeKey: string;
      matchKeys: string[];
      hoursByProject: Map<string, { meta: ReturnType<typeof projectMeta>; hours: number }>;
      exceptionRows: number;
      pendingApprovals: number;
      matchedPayroll: boolean;
    };
    const byEmployee = new Map<string, EmpAgg>();
    const empByMatchKey = new Map<string, EmpAgg>();

    for (const row of periodRows) {
      const keys = employeeMatchKeys(row);
      const employeeKey = keys[0] || upper(row.employeeNo || row.employeeId || row.employeeName || 'UNKNOWN');
      const current = byEmployee.get(employeeKey) || {
        employeeKey,
        matchKeys: keys,
        hoursByProject: new Map(),
        exceptionRows: 0,
        pendingApprovals: 0,
        matchedPayroll: false,
      };
      for (const key of keys) {
        if (!current.matchKeys.includes(key)) current.matchKeys.push(key);
      }
      const meta = projectMeta(row);
      const hours = hourValue(row);
      // Ignore zero-hour lines so blank project rows do not steal allocation shares.
      if (hours > 0) {
        const existing = current.hoursByProject.get(meta.key) || { meta, hours: 0 };
        existing.hours = roundHours(existing.hours + hours);
        current.hoursByProject.set(meta.key, existing);
      }
      if (row.exceptionType && row.exceptionType !== 'None') current.exceptionRows += 1;
      if (/pending|submitted|supervisor|project_manager|cost_control|gm_operations/i.test(String(row.approvalStatus || row.normalizedStatus || ''))) {
        current.pendingApprovals += 1;
      }
      byEmployee.set(employeeKey, current);
    }

    for (const emp of byEmployee.values()) {
      for (const key of emp.matchKeys) {
        if (!empByMatchKey.has(key)) empByMatchKey.set(key, emp);
      }
    }

    const applyPayrollToShares = (
      employeeKey: string,
      gross: number,
      whtTotal: number,
      netTotal: number,
      shares: Array<{ key: string; hours: number; meta: { code: string; name: string; label: string; key: string } }>,
      exceptionRows: number,
      pendingApprovals: number,
    ) => {
      const grossByProject = allocateAmountByShares(gross, shares);
      const whtByProject = allocateAmountByShares(whtTotal, shares);
      const netByProject = allocateAmountByShares(netTotal, shares);

      for (const share of shares) {
        const project = ensureProject(share.meta);
        const labourCost = roundMoney(grossByProject.get(share.key) || 0);
        const wht = roundMoney(whtByProject.get(share.key) || 0);
        const net = roundMoney(netByProject.get(share.key) || 0);
        if (share.hours > 0) {
          project.productiveHours = roundHours(project.productiveHours + share.hours);
        }
        if (share.hours > 0 || labourCost > 0) {
          project.employeeKeys.add(employeeKey);
        }
        project.labourCost = roundMoney(project.labourCost + labourCost);
        project.wht = roundMoney(project.wht + wht);
        project.net = roundMoney(project.net + net);
        project.exceptionRows += exceptionRows;
        project.pendingApprovals += pendingApprovals;
        allocatedLabourCost = roundMoney(allocatedLabourCost + labourCost);
        allocatedWht = roundMoney(allocatedWht + wht);
        allocatedNet = roundMoney(allocatedNet + net);
      }
    };

    // Source of truth: daily-rate payroll records with positive gross AND booked project hours.
    for (const record of payrollRecords) {
      const gross = roundMoney(Number(record.grossPay || 0));
      // Zero-value payroll rows are never included.
      if (gross <= 0) continue;

      let emp: EmpAgg | undefined;
      for (const key of payrollMatchKeys(record)) {
        emp = empByMatchKey.get(key);
        if (emp) break;
      }

      const shares = emp
        ? Array.from(emp.hoursByProject.values())
          .filter((item) => item.hours > 0)
          .map((item) => ({
            key: item.meta.key,
            hours: item.hours,
            meta: item.meta,
          }))
        : [];

      // No booked timesheet hours in scope → not computed/included (same rule as payroll).
      if (!shares.length) continue;

      const identity = recordIdentity(record);
      packEmployeeKeys.add(identity);
      if (emp) emp.matchedPayroll = true;

      const whtTotal = roundMoney(Number(record.paye || 0) || Math.max(0, gross) * CONTRACT_FLAT_PAYE_RATE);
      const netTotal = roundMoney(
        Number(record.netPay || 0) || Math.max(0, gross - whtTotal),
      );
      payrollGrossTotal = roundMoney(payrollGrossTotal + gross);
      payrollNetTotal = roundMoney(payrollNetTotal + netTotal);

      applyPayrollToShares(
        emp?.employeeKey || identity,
        gross,
        whtTotal,
        netTotal,
        shares,
        emp?.exceptionRows || 0,
        emp?.pendingApprovals || 0,
      );
    }

    // Timesheet hours for C-codes with no payroll match still show on projects (hours only).
    for (const emp of byEmployee.values()) {
      if (emp.matchedPayroll) continue;
      for (const item of emp.hoursByProject.values()) {
        if (item.hours <= 0) continue;
        const project = ensureProject(item.meta);
        project.productiveHours = roundHours(project.productiveHours + item.hours);
        project.employeeKeys.add(emp.employeeKey);
        project.exceptionRows += emp.exceptionRows;
        project.pendingApprovals += emp.pendingApprovals;
      }
    }
  }

  const projectRows = Array.from(projects.values())
    .filter((project) => project.productiveHours > 0 || project.labourCost > 0)
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

  const productiveHoursTotal = roundHours(projectRows.reduce((sum, row) => sum + row.productiveHours, 0));
  return {
    projects: projectRows,
    controlTotals: {
      productiveHours: productiveHoursTotal,
      cCodeEmployees: packEmployeeKeys.size,
      payrollGross: payrollGrossTotal,
      allocatedLabourCost,
      wht: allocatedWht,
      net: allocatedNet,
      balanced:
        Math.abs(payrollGrossTotal - allocatedLabourCost) <= 1
        && Math.abs(payrollNetTotal - allocatedNet) <= 1,
    },
    basis: `Daily-rate payroll ${payrollPeriods.join(', ')} · booked timesheet hours only · matches the Wages pack for that period`,
    payrollPeriods,
  };
}
