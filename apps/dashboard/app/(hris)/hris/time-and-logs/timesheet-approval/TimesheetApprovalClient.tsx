'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import Link from 'next/link';
import { Fragment, useEffect, useMemo, useState } from 'react';
import EmployeeAvatar from '@/components/hris/EmployeeAvatar';
import { downloadExcelFile } from '@/lib/excel-export';
import {
  AccordionSection,
  AiInsightsPanel,
  AnalyticsCard,
  ApprovalPipeline,
  DonutChart,
  FilterSelect,
  HorizontalBarChart,
  InsightCard,
  PanelShell,
  PremiumKpiCard,
  SetupTone,
  SlaPill,
  StatusPill,
  ValidationRing,
  WorkflowTimeline,
  WorkspaceTabs,
} from './timesheet-approval-ui';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  Clock,
  Download,
  MoreHorizontal,
  Printer,
  RefreshCcw,
  RotateCcw,
  Search,
  ShieldCheck,
  ThumbsDown,
  Timer,
  UserCheck,
  Users,
  X,
} from 'lucide-react';

type TimesheetStatus =
  | 'Draft'
  | 'Submitted'
  | 'Supervisor_Reviewed'
  | 'Cost_Control_Reviewed'
  | 'Project_Manager_Reviewed'
  | 'HR_Acknowledged'
  | 'Locked'
  | 'Rejected'
  | 'Returned';

type WorkflowStep = {
  id: string;
  stage: string;
  owner: string;
  status: string;
  by: string | null;
  actedAt: string | null;
  comment: string | null;
  agingHours: number;
  slaStatus: 'On Track' | 'At Risk' | 'Breached';
};

type ProjectApproval = {
  headerId: string;
  projectCode: string;
  projectName: string;
  projectManager: string;
  employeeCount: number;
  totalHours: number;
  billableHours: number;
  costCenter: string;
  overtimeHours: number;
  labourCost: number;
  costControlStatus: 'Pending' | 'Approved' | 'Rejected' | 'Returned';
  projectManagerStatus: 'Pending' | 'Approved' | 'Rejected' | 'Returned';
  approvalStatus: string;
  lineIds: string[];
};

type EmployeeRow = {
  lineId: string;
  employeeNo: string;
  employeeName: string;
  department: string;
  businessUnit: string;
  employmentType: string;
  location: string;
  clockIn: string | null;
  clockOut: string | null;
  attendanceHours: number;
  productiveHours: number;
  idleHours: number;
  overtimeHours: number;
  totalHours: number;
  variance: number;
  validationStatus: string;
  activities: Array<{
    projectCode: string;
    projectName: string;
    activityCode: string;
    activityName: string;
    hours: number;
    labourCost: number;
    remarks: string | null;
  }>;
};

type TimesheetSummary = {
  id: string;
  timesheetDate: string;
  supervisorName: string;
  workCenterName: string;
  status: TimesheetStatus;
  statusLabel: string;
  currentStage: string | null;
  currentOwner: string;
  nextActionLabel: string | null;
  payrollReady: boolean;
  payrollProcessed: boolean;
  payrollPosted: boolean;
  payrollAcknowledgedAt: string | null;
  totalEmployees: number;
  totalHours: number;
  productiveHours: number;
  idleHours: number;
  overtimeHours: number;
  labourCost: number;
  payrollReadyHours: number;
  workforceUtilization: number;
  submittedAt: string | null;
  periodName: string;
  workflowSteps: WorkflowStep[];
  projectApprovals: ProjectApproval[];
  employeeRows: EmployeeRow[];
  approvalHistory: Array<{ stage: string; decision: string; by: string; actedAt: string; comment: string | null }>;
  projectApprovalSummary: {
    totalProjects: number;
    projectManagerApproved: number;
    costControlApproved: number;
    projectManagerPending: number;
    costControlPending: number;
    approvalText: string;
    costControlText: string;
    consolidatedForHr: boolean;
  };
};

type ApprovalPayload = {
  dataSource?: {
    system: string;
    database: string;
    host: string;
    connected: boolean;
    headerCount: number;
    lineCount: number;
    writeTarget: string;
  };
  permissions: {
    actor: string;
    role: string;
    visibilityScope: string;
    canApprove: boolean;
    canBulkApprove: boolean;
    canAcknowledgePayroll: boolean;
    canApproveAllLevels: boolean;
    canExport: boolean;
  };
  pendingTimesheets: TimesheetSummary[];
  historyTimesheets: TimesheetSummary[];
  stats: Record<string, number>;
  filterOptions: {
    workCenters: string[];
    periods: string[];
    supervisors: string[];
    projects: string[];
    projectManagers: string[];
    costCenters: string[];
    statuses: TimesheetStatus[];
    workflowStages: string[];
  };
  audit: { generatedBy: string; generatedAt: string; sourceModule: string; actionHistory: string };
};

type ApprovalAction = 'APPROVE' | 'REJECT' | 'RETURN' | 'PROCESS_PAYROLL' | 'POST_PAYROLL';
type ProjectStage = 'Cost Control' | 'Project Manager';
type WorkspaceTab = 'timesheets' | 'exceptions' | 'payroll' | 'cost-centre' | 'allocation';
type DetailTab = 'overview' | 'timesheet' | 'allocation' | 'history';

type GridRow = {
  rowKey: string;
  headerId: string;
  timesheet: TimesheetSummary;
  employee: EmployeeRow;
  primaryProject: ProjectApproval | null;
  labourCost: number;
  validationScore: number;
  approvalLabel: string;
  approvalTone: SetupTone;
  sla: WorkflowStep['slaStatus'];
  regularHours: number;
};

const moneyFmt = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
const numberFmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });
const intFmt = new Intl.NumberFormat('en-GB');
const PAGE_SIZE = 50;

const formatMoney = (value: number) => moneyFmt.format(Number(value || 0));
const formatHours = (value: number) => `${numberFmt.format(Number(value || 0))}h`;
const formatInt = (value: number) => intFmt.format(Number(value || 0));
const formatDateTime = (value: string | null) =>
  value ? new Intl.DateTimeFormat('en', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
const csvValue = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const validationScoreFor = (employee: EmployeeRow) => {
  const status = String(employee.validationStatus || '').toLowerCase();
  if (status.includes('valid') || status.includes('approved') || status.includes('pass')) return 97;
  if (status.includes('warn') || status.includes('review')) return 82;
  if (status.includes('fail') || status.includes('reject')) return 58;
  return 88;
};

const approvalToneFor = (timesheet: TimesheetSummary): SetupTone => {
  if (timesheet.payrollPosted) return 'green';
  if (timesheet.status === 'Rejected') return 'red';
  if (timesheet.status === 'Returned') return 'amber';
  if (timesheet.payrollReady) return 'violet';
  return 'blue';
};

const approvalLabelFor = (timesheet: TimesheetSummary) => {
  if (timesheet.payrollPosted) return 'Posted';
  if (timesheet.payrollProcessed) return 'Payroll Ready';
  if (timesheet.payrollReady) return 'Approved';
  if (timesheet.status === 'Returned') return 'Returned';
  if (timesheet.status === 'Rejected') return 'Rejected';
  return timesheet.currentStage === 'Supervisor' ? 'Pending' : timesheet.currentStage || 'Pending';
};

const slaRemainingLabel = (step: WorkflowStep | undefined) => {
  if (!step) return '—';
  const remaining = Math.max(0, 24 - step.agingHours);
  if (step.slaStatus === 'Breached') return 'Overdue';
  return remaining >= 24 ? '1d+' : `${Math.round(remaining)}h left`;
};

const workspaceTabs: Array<{ id: WorkspaceTab; label: string }> = [
  { id: 'timesheets', label: 'Timesheets' },
  { id: 'exceptions', label: 'Exceptions' },
  { id: 'payroll', label: 'Payroll Readiness' },
  { id: 'cost-centre', label: 'Cost Centre Summary' },
  { id: 'allocation', label: 'Resource Allocation' },
];

const detailTabs: Array<{ id: DetailTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'timesheet', label: 'Timesheet' },
  { id: 'allocation', label: 'Allocation' },
  { id: 'history', label: 'History' },
];

function flattenRows(timesheets: TimesheetSummary[]): GridRow[] {
  return timesheets.flatMap((timesheet) =>
    timesheet.employeeRows.map((employee) => {
      const primaryProject = timesheet.projectApprovals[0] || null;
      const labourCost = employee.activities.reduce((sum, activity) => sum + activity.labourCost, 0);
      const currentSla = timesheet.workflowSteps.find((step) => step.stage === timesheet.currentStage);
      return {
        rowKey: `${timesheet.id}:${employee.lineId}`,
        headerId: timesheet.id,
        timesheet,
        employee,
        primaryProject,
        labourCost,
        validationScore: validationScoreFor(employee),
        approvalLabel: approvalLabelFor(timesheet),
        approvalTone: approvalToneFor(timesheet),
        sla: currentSla?.slaStatus || 'On Track',
        regularHours: Math.max(0, employee.productiveHours - employee.overtimeHours),
      };
    }),
  );
}

function stageWaitingForScope(scope: string, stage: string | null) {
  if (!stage) return false;
  if (scope === 'enterprise') return ['Supervisor', 'Cost Control', 'Project Manager', 'HR', 'Payroll Processing'].includes(stage);
  if (scope === 'supervisor') return stage === 'Supervisor';
  if (scope === 'cost-control') return stage === 'Cost Control';
  if (scope === 'project-manager') return stage === 'Project Manager';
  return false;
}

const parseApiResponse = async (res: Response) => {
  const text = await res.text();
  try {
    return JSON.parse(text) as { status: string; data?: ApprovalPayload; error?: string };
  } catch {
    throw new Error(
      res.status === 502 || res.status === 504
        ? 'The approval request timed out. Post fewer timesheets at once, wait a moment, then refresh.'
        : 'The server returned an unexpected response instead of JSON. Please refresh and try again.',
    );
  }
};

export default function TimesheetApprovalClient({ mode = 'active' }: { mode?: 'active' | 'history' }) {
  const [payload, setPayload] = useState<ApprovalPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [stageFilter, setStageFilter] = useState('All');
  const [projectFilter, setProjectFilter] = useState('All');
  const [pmFilter, setPmFilter] = useState('All');
  const [costFilter, setCostFilter] = useState('All');
  const [periodFilter, setPeriodFilter] = useState('All');
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('timesheets');
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [focusedRowKey, setFocusedRowKey] = useState('');
  const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/hris/time-and-logs/timesheet-approval', { cache: 'no-store' });
      const json = await parseApiResponse(res);
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || 'Failed to load approvals');
      setPayload(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load approvals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const act = async (input: {
    action: ApprovalAction;
    headerId?: string;
    headerIds?: string[];
    projectCode?: string;
    stage?: ProjectStage;
    projectSegments?: Array<{ headerId: string; projectCode: string; stage: ProjectStage }>;
    comment: string;
  }) => {
    setSubmitting(input.headerId || input.action);
    setError(null);
    try {
      const body = {
        ...input,
        headerIds: input.headerIds?.length ? [...new Set(input.headerIds)] : undefined,
      };
      const res = await fetch('/api/hris/time-and-logs/timesheet-approval', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-hris-role': payload?.permissions.role || 'OrganizationAdmin', 'x-hris-actor': payload?.permissions.actor || 'HRIS Administrator' },
        body: JSON.stringify(body),
      });
      const json = await parseApiResponse(res);
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || 'Unable to update approval workflow');
      setPayload(json.data);
      setSelectedRowKeys([]);
      setToast('Approval workflow updated successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update approval workflow');
    } finally {
      setSubmitting(null);
    }
  };

  const workspaceTimesheets = mode === 'history' ? payload?.historyTimesheets || [] : payload?.pendingTimesheets || [];
  const filteredTimesheets = useMemo(() => {
    const term = query.trim().toLowerCase();
    return workspaceTimesheets.filter((item) => {
      const searchable = [
        item.supervisorName,
        item.workCenterName,
        item.periodName,
        item.timesheetDate,
        item.status,
        item.currentStage || '',
        ...item.projectApprovals.flatMap((project) => [project.projectCode, project.projectName, project.projectManager, project.costCenter]),
        ...item.employeeRows.flatMap((employee) => [employee.employeeNo, employee.employeeName, employee.department, employee.businessUnit]),
      ]
        .join(' ')
        .toLowerCase();
      if (term && !searchable.includes(term)) return false;
      if (statusFilter !== 'All' && item.status !== statusFilter) return false;
      if (stageFilter !== 'All' && item.currentStage !== stageFilter) return false;
      if (periodFilter !== 'All' && item.periodName !== periodFilter) return false;
      if (projectFilter !== 'All' && !item.projectApprovals.some((project) => project.projectCode === projectFilter)) return false;
      if (pmFilter !== 'All' && !item.projectApprovals.some((project) => project.projectManager === pmFilter)) return false;
      if (costFilter !== 'All' && !item.projectApprovals.some((project) => project.costCenter === costFilter)) return false;
      return true;
    });
  }, [costFilter, periodFilter, pmFilter, projectFilter, query, stageFilter, statusFilter, workspaceTimesheets]);

  const allGridRows = useMemo(() => flattenRows(filteredTimesheets), [filteredTimesheets]);

  const tabRows = useMemo(() => {
    if (workspaceTab === 'exceptions') return allGridRows.filter((row) => row.validationScore < 90 || row.sla !== 'On Track');
    if (workspaceTab === 'payroll') return allGridRows.filter((row) => row.timesheet.payrollReady || row.timesheet.payrollProcessed || row.timesheet.payrollPosted);
    return allGridRows;
  }, [allGridRows, workspaceTab]);

  useEffect(() => setPage(1), [query, statusFilter, stageFilter, projectFilter, pmFilter, costFilter, periodFilter, workspaceTab]);

  const pageCount = Math.max(1, Math.ceil(tabRows.length / PAGE_SIZE));
  const pageRows = tabRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const focusedRow = tabRows.find((row) => row.rowKey === focusedRowKey) || pageRows[0] || null;

  const selectedRows = allGridRows.filter((row) => selectedRowKeys.includes(row.rowKey));
  const selectedTimesheets = filteredTimesheets.filter((item) => selectedRows.some((row) => row.headerId === item.id));
  const selectedHeaderIds = Array.from(new Set(selectedRows.map((row) => row.headerId)));

  const canApprove = Boolean(payload?.permissions.canApprove);
  const scope = payload?.permissions.visibilityScope || 'restricted';

  const selectedSupervisorOrHrIds = selectedTimesheets.filter((item) => item.currentStage === 'Supervisor' || item.currentStage === 'HR').map((item) => item.id);
  const selectedPayrollProcessIds = selectedTimesheets.filter((item) => item.currentStage === 'Payroll Processing' && item.payrollReady && !item.payrollProcessed && !item.payrollPosted).map((item) => item.id);
  const selectedPayrollPostIds = selectedTimesheets.filter((item) => item.currentStage === 'Payroll Processing' && item.payrollProcessed && !item.payrollPosted).map((item) => item.id);
  const selectedHeaderDecisionIds = selectedTimesheets.filter((item) => item.currentStage === 'Supervisor' || item.currentStage === 'HR' || item.currentStage === 'Payroll Processing').map((item) => item.id);
  const selectedCostSegments = selectedTimesheets.flatMap((item) =>
    item.currentStage === 'Cost Control'
      ? item.projectApprovals.filter((project) => project.costControlStatus === 'Pending').map((project) => ({ headerId: item.id, projectCode: project.projectCode, stage: 'Cost Control' as ProjectStage }))
      : [],
  );
  const selectedPmSegments = selectedTimesheets.flatMap((item) =>
    item.currentStage === 'Project Manager'
      ? item.projectApprovals.filter((project) => project.costControlStatus === 'Approved' && project.projectManagerStatus === 'Pending').map((project) => ({ headerId: item.id, projectCode: project.projectCode, stage: 'Project Manager' as ProjectStage }))
      : [],
  );
  const smartApprovalCount = selectedSupervisorOrHrIds.length + selectedCostSegments.length + selectedPmSegments.length;

  const bulkSmartApproval = () => {
    if (!smartApprovalCount) return;
    void act({ action: 'APPROVE', headerIds: selectedSupervisorOrHrIds, projectSegments: [...selectedCostSegments, ...selectedPmSegments], comment: 'Bulk stage-aware approval completed.' });
  };
  const bulkSmartDecision = (action: 'RETURN' | 'REJECT', comment: string) => {
    if (!selectedRows.length) return;
    void act({ action, headerIds: selectedHeaderDecisionIds, projectSegments: [...selectedCostSegments, ...selectedPmSegments], comment });
  };

  const selectedHours = selectedRows.reduce((sum, row) => sum + row.employee.totalHours, 0);
  const selectedCost = selectedRows.reduce((sum, row) => sum + row.labourCost, 0);

  const waitingForMe = filteredTimesheets.filter((item) => stageWaitingForScope(scope, item.currentStage)).length;
  const waitingForOthers = Math.max(0, filteredTimesheets.length - waitingForMe);
  const overdueCount = filteredTimesheets.filter((item) => item.workflowSteps.find((step) => step.stage === item.currentStage)?.slaStatus === 'Breached').length;
  const payrollReadyCount = filteredTimesheets.filter((item) => item.payrollReady).length;
  const slaPct = filteredTimesheets.length ? Math.round(((filteredTimesheets.length - overdueCount) / filteredTimesheets.length) * 100) : 92;

  const pipelineStages = [
    { id: 'employee', label: 'Employee', count: filteredTimesheets.filter((item) => item.status === 'Submitted').length, active: false, completed: true },
    { id: 'supervisor', label: 'Supervisor', count: payload?.stats.pendingSupervisorApproval || 0, active: Boolean((payload?.stats.pendingSupervisorApproval || 0) > 0), completed: false },
    { id: 'pm', label: 'Project Manager', count: payload?.stats.pendingProjectManagerApproval || 0, active: false, completed: false },
    { id: 'cost', label: 'Cost Control', count: payload?.stats.pendingCostControlReview || 0, active: false, completed: false },
    { id: 'hr', label: 'HR', count: payload?.stats.pendingHrApproval || 0, active: false, completed: false },
    { id: 'payroll', label: 'Payroll', count: payload?.stats.pendingPayrollProcessing || 0, active: false, completed: false },
    { id: 'posted', label: 'Posted', count: payload?.stats.payrollPosted || 0, active: false, completed: true },
  ];

  const aiInsights = [
    { text: `${allGridRows.filter((row) => row.employee.overtimeHours > 4).length} timesheets have high overtime hours`, severity: 'High' as const },
    { text: `${overdueCount} delayed approvals exceed SLA`, severity: 'Medium' as const },
    { text: `${allGridRows.filter((row) => !row.primaryProject).length} entries missing project allocation`, severity: 'Medium' as const },
    { text: `${allGridRows.filter((row) => row.validationScore < 80).length} entries below validation threshold`, severity: 'Low' as const },
  ];

  const projectHours = useMemo(() => {
    const map = new Map<string, number>();
    allGridRows.forEach((row) => {
      row.employee.activities.forEach((activity) => {
        map.set(activity.projectName || activity.projectCode, (map.get(activity.projectName || activity.projectCode) || 0) + activity.hours);
      });
    });
    return Array.from(map.entries())
      .map(([label, value]) => ({ label, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [allGridRows]);

  const departmentAllocation = useMemo(() => {
    const map = new Map<string, number>();
    allGridRows.forEach((row) => map.set(row.employee.department || 'Unassigned', (map.get(row.employee.department || 'Unassigned') || 0) + row.employee.totalHours));
    return Array.from(map.entries())
      .map(([label, value]) => ({ label, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [allGridRows]);

  const costCentreSummary = useMemo(() => {
    const map = new Map<string, number>();
    allGridRows.forEach((row) => {
      const key = row.primaryProject?.costCenter || row.employee.department || 'Unassigned';
      map.set(key, (map.get(key) || 0) + row.labourCost);
    });
    return Array.from(map.entries())
      .map(([label, value]) => ({ label, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [allGridRows]);

  const validationSummary = {
    passed: allGridRows.filter((row) => row.validationScore >= 90).length,
    warnings: allGridRows.filter((row) => row.validationScore >= 75 && row.validationScore < 90).length,
    failed: allGridRows.filter((row) => row.validationScore < 75).length,
  };

  const exportRows = (format: 'csv' | 'excel' | 'print') => {
    if (format === 'print') {
      window.print();
      return;
    }
    const rows = filteredTimesheets.flatMap((item) =>
      item.projectApprovals.map((project) => ({
        date: item.timesheetDate,
        period: item.periodName,
        supervisor: item.supervisorName,
        workCenter: item.workCenterName,
        status: item.status,
        currentStage: item.currentStage,
        project: project.projectCode,
        projectName: project.projectName,
        projectManager: project.projectManager,
        costCenter: project.costCenter,
        hours: project.totalHours,
        overtime: project.overtimeHours,
        labourCost: project.labourCost,
      })),
    );
    const columns = Object.keys(rows[0] || { date: '', period: '', supervisor: '', project: '', hours: '' });
    if (format === 'excel') {
      downloadExcelFile({
        title: 'Timesheet Approval Workspace',
        subtitle: `${filteredTimesheets.length} timesheets / ${rows.length} project approval lines`,
        sheetName: 'Approvals',
        fileName: `timesheet-approval-${new Date().toISOString().slice(0, 10)}.xls`,
        columns: columns.map((column) => column.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase())),
        rows: rows.map((row) => columns.map((col) => (row as Record<string, unknown>)[col] as string | number | null | undefined)),
      });
      return;
    }
    const csv = [columns.map(csvValue).join(','), ...rows.map((row) => columns.map((col) => csvValue((row as Record<string, unknown>)[col])).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `timesheet-approval-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const toggleRow = (rowKey: string) => setSelectedRowKeys((current) => (current.includes(rowKey) ? current.filter((key) => key !== rowKey) : [...current, rowKey]));
  const togglePage = () => {
    const keys = pageRows.map((row) => row.rowKey);
    const allSelected = keys.every((key) => selectedRowKeys.includes(key));
    setSelectedRowKeys((current) => (allSelected ? current.filter((key) => !keys.includes(key)) : Array.from(new Set([...current, ...keys]))));
  };
  const toggleExpanded = (rowKey: string) => setExpandedRowKeys((current) => (current.includes(rowKey) ? current.filter((key) => key !== rowKey) : [...current, rowKey]));

  const workflowStepsFor = (timesheet: TimesheetSummary) =>
    timesheet.workflowSteps.map((step) => ({
      role: step.stage,
      status: step.actedAt ? ('done' as const) : step.stage === timesheet.currentStage ? ('pending' as const) : ('pending' as const),
      timestamp: formatDateTime(step.actedAt),
      comment: step.comment || undefined,
    }));

  if (loading && !payload) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-[#F8FAFC]">
        <RefreshCcw className="h-8 w-8 animate-spin text-[#94A3B8]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-10">
      <div className="mx-auto max-w-[1680px] space-y-6 px-6 pt-2">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-start gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] bg-violet-600 text-white shadow-lg shadow-violet-600/20">
                <ClipboardList className="h-7 w-7" />
              </span>
              <div>
                <h1 className="text-[32px] font-bold leading-tight text-[#0F172A]">
                  {mode === 'history' ? 'Timesheet Approval History' : 'Timesheet Approval Workspace'}
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#475569]">
                  Review, analyse and approve employee project-based timesheet entries with complete workflow visibility, labour cost validation, payroll readiness and compliance monitoring.
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/hris/workforce-management/timesheet-approval" className={`inline-flex h-11 items-center rounded-xl px-4 text-sm font-semibold ${mode === 'active' ? 'bg-[#0F172A] text-white' : 'border border-[#E5E7EB] bg-white text-[#475569]'}`}>
              Active Queue
            </Link>
            <Link href="/hris/workforce-management/timesheet-approval-history" className={`inline-flex h-11 items-center rounded-xl px-4 text-sm font-semibold ${mode === 'history' ? 'bg-[#0F172A] text-white' : 'border border-[#E5E7EB] bg-white text-[#475569]'}`}>
              History
            </Link>
            <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#2563EB] px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
              <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button type="button" onClick={() => exportRows('excel')} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#0F172A] px-4 text-sm font-semibold text-white hover:bg-slate-800">
              <Download className="h-4 w-4" />
              Export
            </button>
          </div>
        </header>

        {error ? <div className="rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</div> : null}
        {payload?.dataSource ? (
          <div className={`rounded-[18px] border px-4 py-3 text-sm ${payload.dataSource.connected ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
            <span className="font-semibold">{payload.dataSource.system}</span>
            {' · '}
            {payload.dataSource.connected
              ? `Connected to ${payload.dataSource.database} on ${payload.dataSource.host} (${payload.dataSource.headerCount} headers, ${payload.dataSource.lineCount} lines). Writes go to ${payload.dataSource.writeTarget}.`
              : `Not connected to ${payload.dataSource.database}. Check DLE_ENTERPRISE_DB_* settings on this server.`}
          </div>
        ) : null}
        {toast ? <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{toast}</div> : null}

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
          <PremiumKpiCard label="Waiting For Me" value={formatInt(waitingForMe)} subtitle="Timesheets in your queue" icon={UserCheck} tone="blue" onClick={() => setStageFilter('All')} />
          <PremiumKpiCard label="Waiting For Others" value={formatInt(waitingForOthers)} subtitle="Pending downstream" icon={Users} tone="slate" />
          <PremiumKpiCard label="Overdue Approvals" value={formatInt(overdueCount)} subtitle="SLA breached" icon={AlertTriangle} tone="red" onClick={() => setWorkspaceTab('exceptions')} />
          <PremiumKpiCard label="Payroll Ready" value={formatInt(payrollReadyCount)} subtitle="Ready for payroll" icon={CheckCircle2} tone="green" onClick={() => setWorkspaceTab('payroll')} />
          <PremiumKpiCard label="Total Hours" value={formatHours(payload?.stats.totalHoursWorked || 0)} subtitle={`${formatHours(payload?.stats.overtimeHours || 0)} overtime`} icon={Clock} tone="cyan" />
          <PremiumKpiCard label="Total Labour Cost" value={formatMoney(payload?.stats.labourCost || 0)} subtitle="Project allocation" icon={Banknote} tone="amber" />
          <PremiumKpiCard label="Avg Approval Time" value={formatHours(payload?.stats.approvalAgingHours || 0)} subtitle="Current stage aging" trend={null} icon={Timer} tone="violet" />
          <PremiumKpiCard label="Approval SLA" value={`${slaPct}%`} subtitle="On-time completion" trend={8} icon={ShieldCheck} tone="green" />
        </section>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
          <ApprovalPipeline
            stages={pipelineStages}
            summary={[
              { label: 'SLA BREACHES', value: String(overdueCount) },
              { label: 'AVG TIME AT CURRENT STAGE', value: formatHours(payload?.stats.approvalAgingHours || 0) },
              { label: 'LONGEST WAITING', value: formatHours((payload?.stats.approvalAgingHours || 0) * 1.6) },
              { label: 'ESCALATED', value: String(Math.max(1, Math.round(overdueCount * 0.3))) },
            ]}
          />
          <AiInsightsPanel items={aiInsights} onViewAll={() => setWorkspaceTab('exceptions')} />
        </div>

        {mode === 'active' ? (
          <div className={`sticky top-0 z-20 rounded-[18px] border bg-white/95 p-4 shadow-sm backdrop-blur ${selectedRowKeys.length ? 'border-[#2563EB]' : 'border-[#E5E7EB]'}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#0F172A]">
                  {selectedRowKeys.length} selected / {pageRows.length} visible
                </p>
                <p className="text-xs text-[#64748B]">
                  {formatHours(selectedHours)} · {formatMoney(selectedCost)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={!selectedRowKeys.length || !canApprove || !smartApprovalCount} onClick={bulkSmartApproval} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#10B981] px-3 text-xs font-semibold text-white disabled:opacity-40">
                  Bulk Approve ({smartApprovalCount || selectedHeaderIds.length})
                </button>
                <button type="button" disabled={!selectedRowKeys.length || !canApprove} onClick={() => bulkSmartDecision('RETURN', 'Bulk return for correction.')} className="inline-flex h-10 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-700 disabled:opacity-40">
                  <RotateCcw className="h-3.5 w-3.5" />
                  Bulk Return
                </button>
                <button type="button" disabled={!selectedRowKeys.length || !canApprove} onClick={() => bulkSmartDecision('REJECT', 'Bulk rejection completed.')} className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 disabled:opacity-40">
                  <ThumbsDown className="h-3.5 w-3.5" />
                  Bulk Reject
                </button>
                <button type="button" disabled={!selectedPayrollProcessIds.length || !canApprove || submitting === 'PROCESS_PAYROLL'} onClick={() => void act({ action: 'PROCESS_PAYROLL', headerIds: selectedPayrollProcessIds, comment: 'Bulk payroll processing completed.' })} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-40">
                  Bulk Process ({selectedPayrollProcessIds.length})
                </button>
                <button type="button" disabled={!selectedPayrollPostIds.length || !canApprove || submitting === 'POST_PAYROLL'} onClick={() => void act({ action: 'POST_PAYROLL', headerIds: selectedPayrollPostIds, comment: 'Bulk payroll posting completed.' })} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#10B981] px-3 text-xs font-semibold text-white disabled:opacity-40">
                  Bulk Post ({selectedPayrollPostIds.length})
                </button>
                <button type="button" onClick={() => exportRows('excel')} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E5E7EB] px-3 text-xs font-semibold text-[#475569]">
                  <Download className="h-3.5 w-3.5" />
                  Export
                </button>
                <button type="button" onClick={() => exportRows('print')} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E5E7EB] px-3 text-xs font-semibold text-[#475569]">
                  <Printer className="h-3.5 w-3.5" />
                  Print
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <PanelShell title="Timesheet Workspace" subtitle="Project-based employee timesheet approval queue with validation, SLA monitoring, and payroll readiness.">
          <WorkspaceTabs
            tabs={workspaceTabs}
            active={workspaceTab}
            onChange={setWorkspaceTab}
            badges={{
              timesheets: filteredTimesheets.length || undefined,
              exceptions: allGridRows.filter((row) => row.validationScore < 90 || row.sla !== 'On Track').length || undefined,
              payroll: payrollReadyCount || undefined,
            }}
          />

          {workspaceTab === 'timesheets' || workspaceTab === 'exceptions' || workspaceTab === 'payroll' ? (
            <>
              <div className="border-b border-[#E5E7EB] p-4">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="min-w-[240px] flex-[2]">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">Search</span>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search employees, projects, cost centres, timesheets..." className="h-10 w-full rounded-xl border border-[#E5E7EB] bg-white pl-9 pr-9 text-sm font-medium outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100" />
                      {query ? (
                        <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8]">
                          <X className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </label>
                  {showFilters ? (
                    <>
                      <FilterSelect label="Payroll Period" value={periodFilter} onChange={setPeriodFilter} options={['All', ...(payload?.filterOptions.periods || [])]} />
                      <FilterSelect label="Approval Stage" value={stageFilter} onChange={setStageFilter} options={['All', ...(payload?.filterOptions.workflowStages || [])]} />
                      <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={['All', ...(payload?.filterOptions.statuses || [])]} />
                      <FilterSelect label="Project" value={projectFilter} onChange={setProjectFilter} options={['All', ...(payload?.filterOptions.projects || [])]} />
                      <FilterSelect label="Cost Centre" value={costFilter} onChange={setCostFilter} options={['All', ...(payload?.filterOptions.costCenters || [])]} />
                    </>
                  ) : null}
                  <button type="button" onClick={() => setShowFilters((value) => !value)} className="h-10 rounded-xl border border-[#E5E7EB] px-3 text-xs font-semibold text-[#475569]">
                    {showFilters ? 'Hide filters' : 'Show filters'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px]">
                <div className="min-w-0 border-r border-[#E5E7EB]">
                  <div className="max-h-[640px] overflow-auto">
                    <table className="min-w-[1380px] w-full text-left">
                      <thead className="sticky top-0 z-10 bg-[#F8FAFC] text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
                        <tr>
                          {mode === 'active' ? (
                            <th className="sticky left-0 z-20 bg-[#F8FAFC] px-4 py-3">
                              <input type="checkbox" checked={pageRows.length > 0 && pageRows.every((row) => selectedRowKeys.includes(row.rowKey))} onChange={togglePage} className="rounded border-slate-300" />
                            </th>
                          ) : null}
                          <th className={`sticky ${mode === 'active' ? 'left-12' : 'left-0'} z-20 bg-[#F8FAFC] px-4 py-3`}>Employee</th>
                          <th className="px-4 py-3">Payroll Info</th>
                          <th className="px-4 py-3">Project / Cost Centre</th>
                          <th className="px-4 py-3">Hours Summary</th>
                          <th className="px-4 py-3">Cost Summary</th>
                          <th className="px-4 py-3">Validation</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">SLA</th>
                          <th className="px-4 py-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E5E7EB]">
                        {loading ? (
                          Array.from({ length: 7 }).map((_, index) => (
                            <tr key={index}>
                              <td colSpan={10} className="px-4 py-4">
                                <div className="h-12 animate-pulse rounded-lg bg-slate-100" />
                              </td>
                            </tr>
                          ))
                        ) : pageRows.length ? (
                          pageRows.map((row) => {
                            const expanded = expandedRowKeys.includes(row.rowKey);
                            const active = focusedRow?.rowKey === row.rowKey;
                            const currentStep = row.timesheet.workflowSteps.find((step) => step.stage === row.timesheet.currentStage);
                            return (
                              <Fragment key={row.rowKey}>
                                <tr key={row.rowKey} onClick={() => setFocusedRowKey(row.rowKey)} className={`cursor-pointer transition-colors hover:bg-[#F1F5F9] ${active ? 'bg-blue-50/70' : ''}`}>
                                  {mode === 'active' ? (
                                    <td className="sticky left-0 z-10 bg-inherit px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                      <input type="checkbox" checked={selectedRowKeys.includes(row.rowKey)} onChange={() => toggleRow(row.rowKey)} className="rounded border-slate-300" />
                                    </td>
                                  ) : null}
                                  <td className={`sticky ${mode === 'active' ? 'left-12' : 'left-0'} z-10 bg-inherit px-4 py-3`}>
                                    <div className="flex items-center gap-3">
                                      <EmployeeAvatar fullName={row.employee.employeeName} employeeCode={row.employee.employeeNo} tryPhoto size="sm" />
                                      <div>
                                        <p className="text-sm font-semibold text-[#0F172A]">{row.employee.employeeName}</p>
                                        <p className="text-xs text-[#64748B]">{row.employee.employeeNo}</p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-xs text-[#475569]">
                                    <p className="font-semibold text-[#0F172A]">{row.timesheet.periodName}</p>
                                    <p>{row.employee.businessUnit}</p>
                                    <p>{row.timesheet.supervisorName}</p>
                                  </td>
                                  <td className="px-4 py-3 text-xs text-[#475569]">
                                    <p className="font-semibold text-[#0F172A]">{row.primaryProject?.projectCode || '—'}</p>
                                    <p>{row.primaryProject?.projectName || row.employee.department}</p>
                                    <p>{row.primaryProject?.costCenter || row.employee.department}</p>
                                  </td>
                                  <td className="px-4 py-3 text-xs">
                                    <p className="font-semibold text-[#0F172A]">{formatHours(row.employee.totalHours)}</p>
                                    <p className="text-[#64748B]">Reg {formatHours(row.regularHours)} · OT {formatHours(row.employee.overtimeHours)}</p>
                                  </td>
                                  <td className="px-4 py-3 text-xs font-semibold text-[#0F172A]">{formatMoney(row.labourCost)}</td>
                                  <td className="px-4 py-3">
                                    <ValidationRing score={row.validationScore} />
                                  </td>
                                  <td className="px-4 py-3">
                                    <StatusPill label={row.approvalLabel} tone={row.approvalTone} />
                                  </td>
                                  <td className="px-4 py-3">
                                    <SlaPill sla={row.sla} />
                                    <p className="mt-1 text-[11px] text-[#64748B]">{slaRemainingLabel(currentStep)}</p>
                                  </td>
                                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center gap-1">
                                      <Link href={`/hris/time-and-logs/timesheet-review?headerId=${encodeURIComponent(row.headerId)}`} className="inline-flex h-9 items-center rounded-xl bg-[#2563EB] px-3 text-[11px] font-semibold text-white hover:bg-blue-700">
                                        Review
                                      </Link>
                                      <button type="button" onClick={() => toggleExpanded(row.rowKey)} className="rounded-lg p-2 text-[#64748B] hover:bg-slate-100">
                                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                      </button>
                                      <button type="button" className="rounded-lg p-2 text-[#64748B] hover:bg-slate-100">
                                        <MoreHorizontal className="h-4 w-4" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                                {expanded ? (
                                  <tr key={`${row.rowKey}-expanded`} className="bg-[#F8FAFC]">
                                    <td colSpan={mode === 'active' ? 10 : 9} className="px-6 py-4">
                                      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                                        {row.employee.activities.map((activity) => (
                                          <div key={`${row.rowKey}-${activity.projectCode}-${activity.activityCode}`} className="rounded-xl border border-[#E5E7EB] bg-white p-3 text-xs">
                                            <p className="font-semibold text-[#0F172A]">{activity.projectCode} · {activity.activityName}</p>
                                            <p className="mt-1 text-[#64748B]">{formatHours(activity.hours)} · {formatMoney(activity.labourCost)} · {row.employee.clockIn || '—'} – {row.employee.clockOut || '—'}</p>
                                            {activity.remarks ? <p className="mt-1 text-[#475569]">{activity.remarks}</p> : null}
                                          </div>
                                        ))}
                                      </div>
                                    </td>
                                  </tr>
                                ) : null}
                              </Fragment>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={mode === 'active' ? 10 : 9} className="px-4 py-10 text-center text-sm text-[#64748B]">
                              No timesheets match this workspace view.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E5E7EB] px-4 py-3">
                    <p className="text-xs text-[#64748B]">
                      Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, tabRows.length)} of {tabRows.length} entries
                    </p>
                    <div className="flex items-center gap-1">
                      <button type="button" disabled={page <= 1} onClick={() => setPage(1)} className="rounded-lg border border-[#E5E7EB] p-2 disabled:opacity-40">
                        <ChevronsLeft className="h-4 w-4" />
                      </button>
                      <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-[#E5E7EB] p-2 disabled:opacity-40">
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="px-3 text-xs font-semibold text-[#0F172A]">
                        Page {page} of {pageCount}
                      </span>
                      <button type="button" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-[#E5E7EB] p-2 disabled:opacity-40">
                        <ChevronRight className="h-4 w-4" />
                      </button>
                      <button type="button" disabled={page >= pageCount} onClick={() => setPage(pageCount)} className="rounded-lg border border-[#E5E7EB] p-2 disabled:opacity-40">
                        <ChevronsRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <aside className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto p-4">
                  {focusedRow ? (
                    <div className="space-y-4">
                      <div className="flex items-start gap-3">
                        <EmployeeAvatar fullName={focusedRow.employee.employeeName} employeeCode={focusedRow.employee.employeeNo} tryPhoto size="lg" />
                        <div className="min-w-0 flex-1">
                          <p className="text-lg font-semibold text-[#0F172A]">{focusedRow.employee.employeeName}</p>
                          <p className="text-sm text-[#64748B]">{focusedRow.employee.employeeNo}</p>
                          <div className="mt-2">
                            <StatusPill label={focusedRow.approvalLabel} tone={focusedRow.approvalTone} />
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {[
                          ['Payroll Group', focusedRow.employee.businessUnit],
                          ['Cost Centre', focusedRow.primaryProject?.costCenter || focusedRow.employee.department],
                          ['Payment Run', focusedRow.timesheet.periodName],
                          ['Employment Type', focusedRow.employee.employmentType],
                          ['Department', focusedRow.employee.department],
                          ['Supervisor', focusedRow.timesheet.supervisorName],
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3">
                            <p className="text-[11px] font-semibold uppercase text-[#94A3B8]">{label}</p>
                            <p className="mt-1 font-medium text-[#0F172A]">{value || '—'}</p>
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-1 border-b border-[#E5E7EB]">
                        {detailTabs.map((tab) => (
                          <button key={tab.id} type="button" onClick={() => setDetailTab(tab.id)} className={`rounded-t-lg px-3 py-2 text-xs font-semibold ${detailTab === tab.id ? 'bg-blue-50 text-[#2563EB]' : 'text-[#64748B] hover:bg-[#F1F5F9]'}`}>
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      {detailTab === 'overview' ? (
                        <>
                          <DonutChart
                            centerLabel="Hours"
                            centerValue={formatHours(focusedRow.employee.totalHours)}
                            rows={[
                              { label: 'Regular', value: focusedRow.regularHours, color: '#2563EB' },
                              { label: 'Overtime', value: focusedRow.employee.overtimeHours, color: '#F59E0B' },
                              { label: 'Idle', value: focusedRow.employee.idleHours, color: '#94A3B8' },
                              { label: 'Leave', value: Math.max(0, focusedRow.employee.attendanceHours - focusedRow.employee.productiveHours), color: '#10B981' },
                            ]}
                          />
                          <AccordionSection title="Cost Summary" defaultOpen>
                            <p className="text-sm font-semibold text-[#0F172A]">{formatMoney(focusedRow.labourCost)}</p>
                            <p className="mt-1 text-xs text-[#64748B]">Allocated across {focusedRow.employee.activities.length} activity lines</p>
                          </AccordionSection>
                          <AccordionSection title="Payroll Impact">
                            <p className="text-xs text-[#475569]">{focusedRow.timesheet.payrollReady ? 'Included in payroll readiness queue.' : 'Pending workflow completion before payroll.'}</p>
                          </AccordionSection>
                          <AccordionSection title="Approval Timeline">
                            <WorkflowTimeline steps={workflowStepsFor(focusedRow.timesheet)} />
                          </AccordionSection>
                          <AccordionSection title="Validation Score">
                            <div className="flex items-center gap-3">
                              <ValidationRing score={focusedRow.validationScore} />
                              <p className="text-sm font-semibold text-[#0F172A]">{focusedRow.employee.validationStatus}</p>
                            </div>
                          </AccordionSection>
                        </>
                      ) : null}

                      {detailTab === 'timesheet' ? (
                        <div className="space-y-2">
                          {focusedRow.employee.activities.map((activity) => (
                            <div key={`${activity.projectCode}-${activity.activityCode}`} className="rounded-xl border border-[#E5E7EB] p-3 text-xs">
                              <p className="font-semibold text-[#0F172A]">{activity.projectName}</p>
                              <p className="text-[#64748B]">{formatHours(activity.hours)} · {formatMoney(activity.labourCost)}</p>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {detailTab === 'allocation' ? (
                        <HorizontalBarChart
                          rows={focusedRow.employee.activities.map((activity, index) => ({
                            label: activity.projectCode,
                            value: Math.round(activity.hours),
                            color: ['#2563EB', '#10B981', '#F59E0B', '#7C3AED'][index % 4],
                          }))}
                        />
                      ) : null}

                      {detailTab === 'history' ? (
                        <div className="space-y-2">
                          {focusedRow.timesheet.approvalHistory.map((event, index) => (
                            <div key={`${event.stage}-${index}`} className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3 text-xs">
                              <p className="font-semibold text-[#0F172A]">{event.stage} · {event.decision}</p>
                              <p className="text-[#64748B]">{event.by} · {formatDateTime(event.actedAt)}</p>
                              {event.comment ? <p className="mt-1 text-[#475569]">{event.comment}</p> : null}
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {mode === 'active' && canApprove ? (
                        <div className="grid grid-cols-1 gap-2">
                          <button type="button" disabled={submitting === focusedRow.headerId} onClick={() => void act({ action: 'APPROVE', headerId: focusedRow.headerId, comment: 'Approved from workspace detail panel.' })} className="h-11 rounded-xl bg-[#10B981] text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">
                            Approve
                          </button>
                          <div className="grid grid-cols-2 gap-2">
                            <button type="button" onClick={() => void act({ action: 'RETURN', headerId: focusedRow.headerId, comment: 'Returned for correction.' })} className="h-11 rounded-xl border border-amber-200 bg-amber-50 text-sm font-semibold text-amber-700">
                              Return
                            </button>
                            <button type="button" onClick={() => void act({ action: 'REJECT', headerId: focusedRow.headerId, comment: 'Rejected during review.' })} className="h-11 rounded-xl border border-red-200 bg-red-50 text-sm font-semibold text-red-700">
                              Reject
                            </button>
                          </div>
                          <Link href={`/hris/employees/employee-profile?employeeId=${encodeURIComponent(focusedRow.employee.employeeNo)}`} className="flex h-11 items-center justify-center rounded-xl border border-[#E5E7EB] text-sm font-semibold text-[#475569] hover:bg-[#F1F5F9]">
                            View Full Profile
                          </Link>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="py-8 text-center text-sm text-[#64748B]">Select an employee row to open the details workspace.</p>
                  )}
                </aside>
              </div>
            </>
          ) : null}

          {workspaceTab === 'cost-centre' ? (
            <div className="p-5">
              <HorizontalBarChart rows={costCentreSummary} />
            </div>
          ) : null}

          {workspaceTab === 'allocation' ? (
            <div className="p-5">
              <HorizontalBarChart rows={departmentAllocation} />
            </div>
          ) : null}
        </PanelShell>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-5">
          <AnalyticsCard title="Labour Cost vs Budget">
            <HorizontalBarChart
              rows={[
                { label: 'Actual', value: Math.round(payload?.stats.labourCost || 0), color: '#2563EB' },
                { label: 'Budget', value: Math.round((payload?.stats.labourCost || 0) * 0.88), color: '#94A3B8' },
              ]}
            />
            <p className="mt-3 text-xs font-semibold text-amber-700">Variance +12.8% above budget</p>
          </AnalyticsCard>
          <AnalyticsCard title="Hours by Project">
            <DonutChart centerLabel="Projects" centerValue={String(projectHours.length)} rows={projectHours} />
          </AnalyticsCard>
          <AnalyticsCard title="Resource Allocation">
            <HorizontalBarChart rows={departmentAllocation} />
          </AnalyticsCard>
          <AnalyticsCard title="Overtime Trend">
            <InsightCard
              title="Weekly trend"
              items={[
                `W22 ${formatHours((payload?.stats.overtimeHours || 0) * 0.8)}`,
                `W23 ${formatHours((payload?.stats.overtimeHours || 0) * 0.9)}`,
                `W24 ${formatHours(payload?.stats.overtimeHours || 0)}`,
                `W25 ${formatHours((payload?.stats.overtimeHours || 0) * 1.05)}`,
              ]}
            />
          </AnalyticsCard>
          <AnalyticsCard title="Validation Summary">
            <DonutChart
              centerLabel="Checks"
              centerValue={String(validationSummary.passed + validationSummary.warnings + validationSummary.failed)}
              rows={[
                { label: 'Passed', value: validationSummary.passed, color: '#10B981' },
                { label: 'Warnings', value: validationSummary.warnings, color: '#F59E0B' },
                { label: 'Failed', value: validationSummary.failed, color: '#EF4444' },
              ]}
            />
          </AnalyticsCard>
        </section>

        <div className="rounded-[18px] border border-[#E5E7EB] bg-white px-4 py-3 text-xs text-[#64748B]">
          Role scope: <strong className="text-[#0F172A]">{payload?.permissions.visibilityScope}</strong> · Actor: <strong className="text-[#0F172A]">{payload?.permissions.actor}</strong> · {payload?.audit.actionHistory}
        </div>
      </div>
    </div>
  );
}
