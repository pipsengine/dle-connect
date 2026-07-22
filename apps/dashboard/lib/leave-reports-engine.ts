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

const isAnnual = (value: unknown) => /annual\s*leave/i.test(String(value || ''));
const isSickLike = (value: unknown) => /sick|casual|unauthorized|absent/i.test(String(value || ''));

export const resolveLeaveReportId = (value?: string | null): LeaveReportId | null => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  const byId = LEAVE_REPORT_CATALOGUE.find((item) => item.id === raw);
  if (byId) return byId.id;
  const byTitle = LEAVE_REPORT_CATALOGUE.find((item) => item.title.toLowerCase() === raw || item.title.toLowerCase().includes(raw));
  return byTitle?.id || null;
};

export const buildLeaveReportTable = (reportId: LeaveReportId, payload: LeaveReportSourcePayload): LeaveReportTable => {
  const generatedAt = new Date().toISOString();
  const meta = LEAVE_REPORT_CATALOGUE.find((item) => item.id === reportId)!;
  const applications = payload.applications || [];
  const balances = payload.balances || [];
  const annualBalances = balances.filter((item) => isAnnual(item.leaveType));
  const exceptions = payload.allowanceExceptions || [];

  if (reportId === 'utilization') {
    const rows = annualBalances.map((item) => {
      const entitled = Number(item.accruedBalance || 0);
      const used = Number(item.usedBalance || 0);
      const rate = entitled > 0 ? Math.round((used / entitled) * 100) : 0;
      return [item.employeeId, item.fullName, item.department, entitled, used, Number(item.currentBalance || 0), `${rate}%`, item.status];
    });
    return {
      id: reportId,
      title: meta.title,
      description: meta.description,
      generatedAt,
      headers: ['Employee ID', 'Employee', 'Department', 'Leave Entitled', 'Used', 'Balance', 'Utilization %', 'Status'],
      rows,
      summary: [
        { label: 'Employees', value: rows.length },
        { label: 'Utilization rate', value: `${payload.summary?.leaveUtilizationPct ?? 0}%` },
      ],
    };
  }

  if (reportId === 'balance') {
    const rows = annualBalances.map((item) => [
      item.employeeId,
      item.fullName,
      item.department,
      Number(item.accruedBalance || 0),
      Number(item.usedBalance || 0),
      Number(item.pendingBalance || 0),
      Number(item.currentBalance || 0),
      Number(item.carryForwardBalance || 0),
      Number(item.forfeitedBalance || 0),
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
        { label: 'Total balance days', value: annualBalances.reduce((sum, item) => sum + Number(item.currentBalance || 0), 0) },
      ],
    };
  }

  if (reportId === 'liability') {
    const rows = annualBalances
      .filter((item) => Number(item.liabilityValue || 0) > 0 || Number(item.currentBalance || 0) > 0)
      .map((item) => [
        item.employeeId,
        item.fullName,
        item.department,
        Number(item.currentBalance || 0),
        Number(item.accruedBalance || 0),
        Number(item.liabilityValue || 0),
        item.status,
      ]);
    return {
      id: reportId,
      title: meta.title,
      description: meta.description,
      generatedAt,
      headers: ['Employee ID', 'Employee', 'Department', 'Balance Days', 'Entitled', 'Liability (NGN)', 'Status'],
      rows,
      summary: [
        { label: 'Employees', value: rows.length },
        { label: 'Total liability', value: annualBalances.reduce((sum, item) => sum + Number(item.liabilityValue || 0), 0) },
      ],
    };
  }

  if (reportId === 'allowance-eligibility') {
    const rows = applications
      .filter((item) => isAnnual(item.leaveType) && (item.allowanceEligible || Number(item.days || 0) >= 10))
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
      summary: [{ label: 'Eligible / review rows', value: rows.length }],
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
    const rows = annualBalances
      .filter((item) => Number(item.carryForwardBalance || 0) > 0)
      .map((item) => [
        item.employeeId,
        item.fullName,
        item.department,
        Number(item.carryForwardBalance || 0),
        Number(item.currentBalance || 0),
        Number(item.usedBalance || 0),
        '31 March',
        item.status,
      ]);
    return {
      id: reportId,
      title: meta.title,
      description: meta.description,
      generatedAt,
      headers: ['Employee ID', 'Employee', 'Department', 'Carry Forward Days', 'Available Balance', 'Used', 'Expiry', 'Status'],
      rows,
      summary: [
        { label: 'Employees with CF', value: rows.length },
        { label: 'CF days', value: annualBalances.reduce((sum, item) => sum + Number(item.carryForwardBalance || 0), 0) },
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
    const pending = applications.filter((item) => !['Approved', 'Completed', 'Cancelled', 'Rejected', 'Terminated'].includes(item.status)).length;
    return {
      id: reportId,
      title: meta.title,
      description: meta.description,
      generatedAt,
      headers: ['Request ID', 'Employee ID', 'Employee', 'Department', 'Manager', 'Leave Type', 'Start', 'End', 'Days', 'Status', 'Stage', 'Approval Status', 'Compliance'],
      rows,
      summary: [
        { label: 'Pending', value: pending },
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
      summary: [{ label: 'History rows', value: rows.length }],
    };
  }

  if (reportId === 'department') {
    const map = new Map<string, { department: string; requests: number; approved: number; pending: number; days: number; employees: Set<string> }>();
    for (const item of applications) {
      const key = item.department || 'Unassigned';
      const row = map.get(key) || { department: key, requests: 0, approved: 0, pending: 0, days: 0, employees: new Set<string>() };
      row.requests += 1;
      row.days += Number(item.days || 0);
      row.employees.add(item.employeeId);
      if (['Approved', 'Completed'].includes(item.status)) row.approved += 1;
      else if (!['Cancelled', 'Rejected', 'Terminated'].includes(item.status)) row.pending += 1;
      map.set(key, row);
    }
    const rows = Array.from(map.values())
      .sort((a, b) => b.requests - a.requests)
      .map((row) => [row.department, row.employees.size, row.requests, row.approved, row.pending, row.days]);
    return {
      id: reportId,
      title: meta.title,
      description: meta.description,
      generatedAt,
      headers: ['Department', 'Employees', 'Requests', 'Approved', 'Pending', 'Total Days'],
      rows,
      summary: [{ label: 'Departments', value: rows.length }],
    };
  }

  if (reportId === 'absenteeism') {
    const rows = applications
      .filter((item) => isSickLike(item.leaveType) || /absent/i.test(item.status))
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
      summary: [{ label: 'Absenteeism rows', value: rows.length }],
    };
  }

  // trends
  const typeMap = new Map<string, { type: string; count: number; days: number; approved: number }>();
  for (const item of applications) {
    const key = item.leaveType || 'Unknown';
    const row = typeMap.get(key) || { type: key, count: 0, days: 0, approved: 0 };
    row.count += 1;
    row.days += Number(item.days || 0);
    if (['Approved', 'Completed'].includes(item.status)) row.approved += 1;
    typeMap.set(key, row);
  }
  const rows = Array.from(typeMap.values())
    .sort((a, b) => b.count - a.count)
    .map((row) => [row.type, row.count, row.days, row.approved, row.count - row.approved]);
  return {
    id: reportId,
    title: meta.title,
    description: meta.description,
    generatedAt,
    headers: ['Leave Type', 'Requests', 'Total Days', 'Approved', 'Other Status'],
    rows,
    summary: [
      { label: 'Leave types', value: rows.length },
      { label: 'Total requests', value: applications.length },
    ],
  };
};

export const buildAllLeaveReportTables = (payload: LeaveReportSourcePayload) =>
  LEAVE_REPORT_CATALOGUE.map((item) => buildLeaveReportTable(item.id, payload));
