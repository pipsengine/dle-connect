const moneyFmt = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
const formatLeaveAllowanceAmount = (amount: number) => (amount > 0 ? moneyFmt.format(amount) : '—');

/** Client-safe report input shape (no server/DB imports). */
export type LeaveReportSourcePayload = {
  applications?: Array<{
    id: string;
    employeeId: string;
    fullName: string;
    department: string;
    managerName?: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    days: number;
    status: string;
    stage: string;
    approvalStatus?: string;
    policyComplianceStatus?: string;
    actingOfficer?: string;
    exceptions?: string[];
    allowanceStatus?: string;
    allowanceEligible?: boolean;
    allowancePaid?: boolean;
  }>;
  balances?: Array<{
    employeeId: string;
    fullName: string;
    department: string;
    leaveType: string;
    currentBalance: number;
    accruedBalance: number;
    usedBalance: number;
    pendingBalance: number;
    forfeitedBalance: number;
    carryForwardBalance: number;
    liabilityValue: number;
    status: string;
    exceptions?: string[];
  }>;
  allowanceExceptions?: Array<{
    id: string;
    severity: 'Critical' | 'Review' | 'Pending';
    employeeId: string;
    fullName: string;
    department: string;
    leaveYear: number;
    payrollPeriod: string;
    requestDays: number;
    approvedAnnualLeaveDays: number;
    allowanceAmount: number;
    allowanceStatus: string;
    eventStatus: string;
    linkedRequestId?: string;
    recommendation: string;
  }>;
  summary?: {
    leaveUtilizationPct?: number;
  };
};

export type LeaveReportId =
  | 'utilization'
  | 'balance'
  | 'liability'
  | 'allowance-eligibility'
  | 'allowance-exceptions'
  | 'carry-forward'
  | 'approval'
  | 'history'
  | 'department'
  | 'absenteeism'
  | 'trends';

export type LeaveReportDefinition = {
  id: LeaveReportId;
  title: string;
  description: string;
  sectionHints: string[];
};

export const LEAVE_REPORT_CATALOGUE: LeaveReportDefinition[] = [
  { id: 'utilization', title: 'Leave Utilization Report', description: 'Annual leave used against entitled days by employee and department.', sectionHints: ['leave-reports', 'leave-utilization'] },
  { id: 'balance', title: 'Leave Balance Report', description: 'Entitled, used, pending, and available annual leave balances.', sectionHints: ['leave-reports'] },
  { id: 'liability', title: 'Leave Liability Report', description: 'Estimated payroll liability on outstanding annual leave balances.', sectionHints: ['leave-reports', 'leave-liability'] },
  { id: 'allowance-eligibility', title: 'Leave Allowance Eligibility Report', description: 'Annual leave requests eligible for leave allowance payroll posting.', sectionHints: ['leave-reports', 'leave-allowance-exceptions'] },
  { id: 'allowance-exceptions', title: 'Leave Allowance Exceptions Report', description: 'Policy exceptions, reversed postings, and pending allowance payroll items.', sectionHints: ['leave-reports', 'leave-allowance-exceptions'] },
  { id: 'carry-forward', title: 'Carry Forward Expiry Report', description: 'Carry-forward balances requiring consumption or forfeiture review.', sectionHints: ['leave-reports'] },
  { id: 'approval', title: 'Leave Approval Report', description: 'Pending and completed approval workload across leave workflows.', sectionHints: ['leave-reports', 'approval-reports'] },
  { id: 'history', title: 'Employee Leave History', description: 'Historical leave applications with status, stage, and compliance.', sectionHints: ['leave-reports'] },
  { id: 'department', title: 'Department Leave Report', description: 'Department-level leave volume, approvals, and coverage signals.', sectionHints: ['leave-reports'] },
  { id: 'absenteeism', title: 'Absenteeism Report', description: 'Sick and unplanned leave patterns by employee and department.', sectionHints: ['leave-reports', 'leave-trends'] },
  { id: 'trends', title: 'Leave Trend Analysis', description: 'Leave demand mix by type and status for planning signals.', sectionHints: ['leave-trends'] },
];

export type LeaveReportTable = {
  id: LeaveReportId;
  title: string;
  description: string;
  generatedAt: string;
  headers: string[];
  rows: Array<Array<string | number>>;
  /** Rows that should render with exception/critical formatting in Excel. */
  exceptionRowIndexes?: number[];
  summary?: Array<{ label: string; value: string | number }>;
};

/** Dorman Long annual leave CF policy (days). Keep in sync with dormantLongPolicy.carryForwardCap. */
export const LEAVE_CARRY_FORWARD_CAP = 7;
/** Leave allowance threshold (working days of current-year Annual Leave). */
export const LEAVE_ALLOWANCE_MINIMUM_DAYS = 10;

const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

export const isAnnualLeaveType = (value: unknown) => /annual\s*leave/i.test(String(value || ''));
const isSickLike = (value: unknown) => /sick|unauthorized|absent/i.test(String(value || ''));

const statusKey = (status: string) => String(status || '').trim().toLowerCase();

/** Open approval-queue statuses (aligned with leave-management-store). */
export const isOpenLeaveApprovalStatus = (status: string) =>
  ['draft', 'submitted', 'under review', 'line manager review', 'hr review', 'finance review', 'pending'].includes(statusKey(status));

const isApprovedLeaveStatus = (status: string) => ['approved', 'completed'].includes(statusKey(status));
const isClosedLeaveStatus = (status: string) =>
  ['cancelled', 'rejected', 'terminated', 'withdrawn'].includes(statusKey(status));

export type NormalizedAnnualBalance = {
  employeeId: string;
  fullName: string;
  department: string;
  leaveType: string;
  status: string;
  entitled: number;
  used: number;
  pending: number;
  balance: number;
  carryForward: number;
  forfeited: number;
  liabilityValue: number;
  utilizationPct: number;
  exceptions?: string[];
};

/**
 * Normalize annual leave balance fields for reports/analytics.
 * Balance = Entitled − Used − Pending (available days).
 * Carry Forward is capped at policy max and never holds the full available balance.
 */
export const normalizeAnnualLeaveBalance = (item: NonNullable<LeaveReportSourcePayload['balances']>[number]): NormalizedAnnualBalance => {
  const entitled = round2(Number(item.accruedBalance || 0));
  const used = round2(Number(item.usedBalance || 0));
  const pending = round2(Number(item.pendingBalance || 0));
  const storedCurrent = round2(Number(item.currentBalance || 0));
  const rawCf = round2(Number(item.carryForwardBalance || 0));
  const rawForfeited = round2(Number(item.forfeitedBalance || 0));
  const storedLiability = round2(Number(item.liabilityValue || 0));
  const computedAvailable = Math.max(0, round2(entitled - used - pending));

  // Corrupt pattern from earlier CF/year-end bugs: Balance=0 while CF holds Entitled−Used.
  const balanceCorrupt = storedCurrent <= 0 && computedAvailable > 0;
  const cfHoldsAvailable = rawCf > LEAVE_CARRY_FORWARD_CAP
    || (balanceCorrupt && Math.abs(rawCf - computedAvailable) <= 0.51);

  const balance = balanceCorrupt ? computedAvailable : (storedCurrent > 0 ? storedCurrent : computedAvailable);
  const carryForward = cfHoldsAvailable ? 0 : Math.min(LEAVE_CARRY_FORWARD_CAP, Math.max(0, rawCf));

  let forfeited = Math.max(0, rawForfeited);
  if (cfHoldsAvailable && (forfeited >= entitled || forfeited > LEAVE_CARRY_FORWARD_CAP)) {
    forfeited = 0;
  } else if (forfeited > LEAVE_CARRY_FORWARD_CAP && entitled > 0 && forfeited >= entitled) {
    forfeited = 0;
  }

  let liabilityValue = storedLiability;
  if (storedCurrent > 0 && Math.abs(storedCurrent - balance) > 0.01 && storedLiability > 0) {
    liabilityValue = round2(storedLiability * (balance / storedCurrent));
  }

  const utilizationPct = entitled > 0 ? Math.round((used / entitled) * 100) : 0;

  return {
    employeeId: item.employeeId,
    fullName: item.fullName,
    department: item.department,
    leaveType: item.leaveType,
    status: item.status,
    entitled,
    used,
    pending,
    balance,
    carryForward,
    forfeited,
    liabilityValue,
    utilizationPct,
    exceptions: item.exceptions,
  };
};

export const normalizeAnnualLeaveBalances = (balances: LeaveReportSourcePayload['balances'] = []) =>
  balances.filter((item) => isAnnualLeaveType(item.leaveType)).map(normalizeAnnualLeaveBalance);

export const computeLeaveUtilizationPct = (rows: NormalizedAnnualBalance[]) => {
  const entitled = rows.reduce((sum, item) => sum + item.entitled, 0);
  const used = rows.reduce((sum, item) => sum + item.used, 0);
  return entitled > 0 ? Math.round((used / entitled) * 100) : 0;
};

export const resolveLeaveReportId = (value?: string | null): LeaveReportId | null => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  const byId = LEAVE_REPORT_CATALOGUE.find((item) => item.id === raw);
  if (byId) return byId.id;
  const byTitle = LEAVE_REPORT_CATALOGUE.find((item) => item.title.toLowerCase() === raw || item.title.toLowerCase().includes(raw));
  return byTitle?.id || null;
};

const carryForwardExpiryLabel = () => `${new Date().getFullYear()}-03-31`;

export const buildLeaveReportTable = (reportId: LeaveReportId, payload: LeaveReportSourcePayload): LeaveReportTable => {
  const generatedAt = new Date().toISOString();
  const meta = LEAVE_REPORT_CATALOGUE.find((item) => item.id === reportId)!;
  const applications = payload.applications || [];
  const annualBalances = normalizeAnnualLeaveBalances(payload.balances);
  const exceptions = payload.allowanceExceptions || [];
  const utilizationPct = payload.summary?.leaveUtilizationPct ?? computeLeaveUtilizationPct(annualBalances);

  if (reportId === 'utilization') {
    const rows = annualBalances.map((item) => [
      item.employeeId,
      item.fullName,
      item.department,
      item.entitled,
      item.used,
      item.pending,
      item.balance,
      item.carryForward,
      `${item.utilizationPct}%`,
      item.status,
    ]);
    return {
      id: reportId,
      title: meta.title,
      description: meta.description,
      generatedAt,
      headers: ['Employee ID', 'Employee', 'Department', 'Leave Entitled', 'Used', 'Pending', 'Balance', 'Carry Forward', 'Utilization %', 'Status'],
      rows,
      summary: [
        { label: 'Employees', value: rows.length },
        { label: 'Total entitled', value: round2(annualBalances.reduce((sum, item) => sum + item.entitled, 0)) },
        { label: 'Total used', value: round2(annualBalances.reduce((sum, item) => sum + item.used, 0)) },
        { label: 'Utilization rate', value: `${utilizationPct}%` },
      ],
    };
  }

  if (reportId === 'balance') {
    const rows = annualBalances.map((item) => [
      item.employeeId,
      item.fullName,
      item.department,
      item.entitled,
      item.used,
      item.pending,
      item.balance,
      item.carryForward,
      item.forfeited,
      item.status,
    ]);
    return {
      id: reportId,
      title: meta.title,
      description: meta.description,
      generatedAt,
      headers: ['Employee ID', 'Employee', 'Department', 'Leave Entitled', 'Used', 'Pending', 'Balance', 'Carry Forward', 'Forfeited', 'Status'],
      rows,
      summary: [
        { label: 'Employees', value: rows.length },
        { label: 'Total entitled', value: round2(annualBalances.reduce((sum, item) => sum + item.entitled, 0)) },
        { label: 'Total used', value: round2(annualBalances.reduce((sum, item) => sum + item.used, 0)) },
        { label: 'Total balance days', value: round2(annualBalances.reduce((sum, item) => sum + item.balance, 0)) },
      ],
    };
  }

  if (reportId === 'liability') {
    const rows = annualBalances
      .filter((item) => item.liabilityValue > 0 || item.balance > 0)
      .map((item) => [
        item.employeeId,
        item.fullName,
        item.department,
        item.balance,
        item.entitled,
        item.used,
        item.liabilityValue,
        item.status,
      ]);
    return {
      id: reportId,
      title: meta.title,
      description: meta.description,
      generatedAt,
      headers: ['Employee ID', 'Employee', 'Department', 'Balance Days', 'Entitled', 'Used', 'Liability (NGN)', 'Status'],
      rows,
      summary: [
        { label: 'Employees', value: rows.length },
        { label: 'Balance days', value: round2(annualBalances.reduce((sum, item) => sum + item.balance, 0)) },
        { label: 'Total liability', value: round2(annualBalances.reduce((sum, item) => sum + item.liabilityValue, 0)) },
      ],
    };
  }

  if (reportId === 'allowance-eligibility') {
    const rows = applications
      .filter((item) => {
        if (!isAnnualLeaveType(item.leaveType)) return false;
        if (isClosedLeaveStatus(item.status)) return false;
        return item.allowanceEligible === true || Number(item.days || 0) >= LEAVE_ALLOWANCE_MINIMUM_DAYS;
      })
      .map((item) => [
        item.id,
        item.employeeId,
        item.fullName,
        item.department,
        item.startDate,
        item.endDate,
        Number(item.days || 0),
        item.status,
        item.allowanceStatus || (item.allowanceEligible ? 'Eligible' : 'Review'),
        item.allowancePaid ? 'Paid' : 'Not paid',
      ]);
    return {
      id: reportId,
      title: meta.title,
      description: meta.description,
      generatedAt,
      headers: ['Request ID', 'Employee ID', 'Employee', 'Department', 'Start', 'End', 'Days', 'Status', 'Allowance Status', 'Paid'],
      rows,
      summary: [
        { label: 'Eligible / review rows', value: rows.length },
        { label: `Threshold (${LEAVE_ALLOWANCE_MINIMUM_DAYS}+ days)`, value: LEAVE_ALLOWANCE_MINIMUM_DAYS },
      ],
    };
  }

  if (reportId === 'allowance-exceptions') {
    const exceptionRowIndexes: number[] = [];
    const rows = exceptions.map((item, index) => {
      if (item.severity === 'Critical' || item.severity === 'Review') exceptionRowIndexes.push(index);
      return [
        item.severity,
        item.employeeId,
        item.fullName,
        item.department,
        item.leaveYear,
        item.payrollPeriod,
        Number(item.requestDays || 0),
        Number(item.approvedAnnualLeaveDays || 0),
        formatLeaveAllowanceAmount(item.allowanceAmount),
        item.allowanceStatus,
        item.eventStatus,
        item.linkedRequestId || '',
        item.recommendation,
      ];
    });
    return {
      id: reportId,
      title: meta.title,
      description: meta.description,
      generatedAt,
      headers: [
        'Severity',
        'Employee ID',
        'Employee',
        'Department',
        'Leave Year',
        'Payroll Period',
        'Request Days',
        'Approved Annual Days',
        'Allowance Amount',
        'Allowance Status',
        'Event Status',
        'Linked Request',
        'Recommendation',
      ],
      rows,
      exceptionRowIndexes,
      summary: [
        { label: 'Exceptions', value: exceptions.filter((item) => item.severity === 'Critical').length },
        { label: 'Pending payroll', value: exceptions.filter((item) => item.severity === 'Pending').length },
        { label: 'Total rows', value: rows.length },
      ],
    };
  }

  if (reportId === 'carry-forward') {
    const cfRows = annualBalances.filter((item) => item.carryForward > 0);
    const expiry = carryForwardExpiryLabel();
    const rows = cfRows.map((item) => [
      item.employeeId,
      item.fullName,
      item.department,
      item.carryForward,
      item.balance,
      item.used,
      item.forfeited,
      expiry,
      item.status,
    ]);
    return {
      id: reportId,
      title: meta.title,
      description: meta.description,
      generatedAt,
      headers: ['Employee ID', 'Employee', 'Department', 'Carry Forward Days', 'Available Balance', 'Used', 'Forfeited', 'Expiry', 'Status'],
      rows,
      summary: [
        { label: 'Employees with CF', value: rows.length },
        { label: 'CF days (max 7 each)', value: round2(cfRows.reduce((sum, item) => sum + item.carryForward, 0)) },
        { label: 'Expiry', value: expiry },
      ],
    };
  }

  if (reportId === 'approval') {
    const rows = applications.map((item) => [
      item.id,
      item.employeeId,
      item.fullName,
      item.department,
      item.managerName || '',
      item.leaveType,
      item.startDate,
      item.endDate,
      Number(item.days || 0),
      item.status,
      item.stage,
      item.approvalStatus || '',
      item.policyComplianceStatus || '',
    ]);
    const pending = applications.filter((item) => isOpenLeaveApprovalStatus(item.status)).length;
    const approved = applications.filter((item) => isApprovedLeaveStatus(item.status)).length;
    return {
      id: reportId,
      title: meta.title,
      description: meta.description,
      generatedAt,
      headers: ['Request ID', 'Employee ID', 'Employee', 'Department', 'Manager', 'Leave Type', 'Start', 'End', 'Days', 'Status', 'Stage', 'Approval Status', 'Compliance'],
      rows,
      summary: [
        { label: 'Pending approvals', value: pending },
        { label: 'Approved / completed', value: approved },
        { label: 'Total requests', value: rows.length },
      ],
    };
  }

  if (reportId === 'history') {
    const rows = applications.map((item) => [
      item.id,
      item.employeeId,
      item.fullName,
      item.department,
      item.leaveType,
      item.startDate,
      item.endDate,
      Number(item.days || 0),
      item.status,
      item.stage,
      item.actingOfficer || '',
      item.allowanceStatus || '',
      item.exceptions?.join('; ') || '',
    ]);
    return {
      id: reportId,
      title: meta.title,
      description: meta.description,
      generatedAt,
      headers: ['Request ID', 'Employee ID', 'Employee', 'Department', 'Leave Type', 'Start', 'End', 'Days', 'Status', 'Stage', 'Reliever', 'Allowance', 'Exceptions'],
      rows,
      summary: [
        { label: 'History rows', value: rows.length },
        { label: 'Approved days', value: round2(applications.filter((item) => isApprovedLeaveStatus(item.status)).reduce((sum, item) => sum + Number(item.days || 0), 0)) },
      ],
    };
  }

  if (reportId === 'department') {
    const map = new Map<string, {
      department: string;
      requests: number;
      approved: number;
      pending: number;
      approvedDays: number;
      pendingDays: number;
      employees: Set<string>;
    }>();
    for (const item of applications) {
      if (isClosedLeaveStatus(item.status)) continue;
      const key = item.department || 'Unassigned';
      const row = map.get(key) || {
        department: key,
        requests: 0,
        approved: 0,
        pending: 0,
        approvedDays: 0,
        pendingDays: 0,
        employees: new Set<string>(),
      };
      row.requests += 1;
      row.employees.add(item.employeeId);
      const days = Number(item.days || 0);
      if (isApprovedLeaveStatus(item.status)) {
        row.approved += 1;
        row.approvedDays += days;
      } else if (isOpenLeaveApprovalStatus(item.status)) {
        row.pending += 1;
        row.pendingDays += days;
      }
      map.set(key, row);
    }
    const rows = Array.from(map.values())
      .sort((a, b) => b.requests - a.requests)
      .map((row) => [
        row.department,
        row.employees.size,
        row.requests,
        row.approved,
        row.pending,
        round2(row.approvedDays),
        round2(row.pendingDays),
      ]);
    return {
      id: reportId,
      title: meta.title,
      description: meta.description,
      generatedAt,
      headers: ['Department', 'Employees', 'Requests', 'Approved', 'Pending', 'Approved Days', 'Pending Days'],
      rows,
      summary: [
        { label: 'Departments', value: rows.length },
        { label: 'Approved days', value: round2(Array.from(map.values()).reduce((sum, row) => sum + row.approvedDays, 0)) },
      ],
    };
  }

  if (reportId === 'absenteeism') {
    const rows = applications
      .filter((item) => {
        if (!isSickLike(item.leaveType) && !/absent/i.test(item.status)) return false;
        return isApprovedLeaveStatus(item.status) || isOpenLeaveApprovalStatus(item.status);
      })
      .map((item) => [
        item.id,
        item.employeeId,
        item.fullName,
        item.department,
        item.leaveType,
        item.startDate,
        item.endDate,
        Number(item.days || 0),
        item.status,
        item.stage,
      ]);
    return {
      id: reportId,
      title: meta.title,
      description: meta.description,
      generatedAt,
      headers: ['Request ID', 'Employee ID', 'Employee', 'Department', 'Leave Type', 'Start', 'End', 'Days', 'Status', 'Stage'],
      rows,
      summary: [
        { label: 'Absenteeism rows', value: rows.length },
        { label: 'Days', value: round2(rows.reduce((sum, row) => sum + Number(row[7] || 0), 0)) },
      ],
    };
  }

  // trends
  const typeMap = new Map<string, { type: string; count: number; days: number; approved: number; pending: number; approvedDays: number }>();
  for (const item of applications) {
    if (isClosedLeaveStatus(item.status)) continue;
    const key = item.leaveType || 'Unknown';
    const row = typeMap.get(key) || { type: key, count: 0, days: 0, approved: 0, pending: 0, approvedDays: 0 };
    row.count += 1;
    row.days += Number(item.days || 0);
    if (isApprovedLeaveStatus(item.status)) {
      row.approved += 1;
      row.approvedDays += Number(item.days || 0);
    } else if (isOpenLeaveApprovalStatus(item.status)) {
      row.pending += 1;
    }
    typeMap.set(key, row);
  }
  const rows = Array.from(typeMap.values())
    .sort((a, b) => b.count - a.count)
    .map((row) => [
      row.type,
      row.count,
      round2(row.days),
      row.approved,
      round2(row.approvedDays),
      row.pending,
      row.count > 0 ? `${Math.round((row.approved / row.count) * 100)}%` : '0%',
    ]);
  return {
    id: 'trends',
    title: meta.title,
    description: meta.description,
    generatedAt,
    headers: ['Leave Type', 'Requests', 'Total Days', 'Approved', 'Approved Days', 'Pending', 'Approval Rate'],
    rows,
    summary: [
      { label: 'Leave types', value: rows.length },
      { label: 'Active requests', value: Array.from(typeMap.values()).reduce((sum, row) => sum + row.count, 0) },
      { label: 'Annual utilization', value: `${utilizationPct}%` },
    ],
  };
};

export const buildAllLeaveReportTables = (payload: LeaveReportSourcePayload) =>
  LEAVE_REPORT_CATALOGUE.map((item) => buildLeaveReportTable(item.id, payload));
