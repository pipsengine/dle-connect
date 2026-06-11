'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { PageTemplate } from '@/components/layout/page-template';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Users,
  XCircle,
  Clock,
  Briefcase,
  Edit3,
  ChevronRight,
  ArrowRight,
  LayoutGrid,
  CreditCard,
  Info,
} from 'lucide-react';
import type { StructureInsight } from '@/lib/organization-data';

type TimesheetStatus = 'Draft' | 'Submitted' | 'Project_Manager_Reviewed' | 'Cost_Control_Reviewed' | 'HR_Acknowledged' | 'HR_Reviewed' | 'Project_Control_Reviewed' | 'Approved' | 'Locked' | 'Rejected' | 'Returned';
type TimesheetWorkflowStage = 'Supervisor' | 'Project Manager' | 'Cost Control' | 'HR';
const STANDARD_TIMESHEET_HOURS = 9;
const DEFAULT_IDLE_REASON_ID = 'idl-009';
const DEFAULT_IDLE_REASON_NAME = 'Break Time';
const editableTimesheetStatuses: TimesheetStatus[] = ['Draft', 'Returned', 'Rejected'];
const payrollReadyStatuses: TimesheetStatus[] = ['HR_Acknowledged', 'Approved', 'Locked'];
const EMPLOYEE_CARD_PAGE_SIZE = 12;
type TimesheetEntryMode = 'Supervisor Entry';

type WorkflowStage = {
  id: TimesheetStatus;
  label: string;
  order: number;
};

type TimesheetPeriod = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: 'Open' | 'Closed' | 'Locked';
};

type IdleReason = {
  id: string;
  code: string;
  name: string;
  description: string;
};

type TimesheetHeader = {
  id: string;
  periodId: string;
  timesheetDate: string;
  supervisorId: string;
  supervisorName: string;
  workCenterId: string;
  workCenterName: string;
  status: TimesheetStatus;
  submittedAt: string | null;
  submittedBy: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  lastSyncAt: string | null;
  projectManager?: string | null;
  projectManagerProjectCode?: string | null;
  currentApprovalStage?: TimesheetWorkflowStage | null;
  currentApprover?: string | null;
};

type TimesheetLine = {
  id: string;
  headerId: string;
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  biometricId: string;
  attendanceId: string | null;
  clockIn: string | null;
  clockOut: string | null;
  attendanceDuration: number;
  projectAllocations: Array<{
    projectId: string;
    projectCode: string;
    projectName: string;
    taskId?: string;
    taskName?: string;
    hours: number;
    remarks: string | null;
  }>;
  idleAllocations: Array<{
    reasonId: string;
    reasonName: string;
    hours: number;
    remarks: string | null;
  }>;
  usedHours: number;
  idleHours: number;
  totalHours: number;
  variance: number;
  remarks: string | null;
  validationStatus: 'Valid' | 'Error' | 'Warning' | 'Incomplete';
  validationMessage: string | null;
};

type DisplayColumn = {
  code: string;
  label: string;
  kind: 'project' | 'internal' | 'idle' | 'leave';
};

type Project = {
  id: string;
  code: string;
  name: string;
  site: string;
  projectManager: string;
  status: string;
  tasks?: Array<{ id: string; name: string }>;
};

type Payload = {
  generatedAt: string;
  timesheetDate: string;
  period: TimesheetPeriod;
  header: TimesheetHeader | null;
  lines: TimesheetLine[];
  idleReasons: IdleReason[];
  projects: Project[];
  nextProjectCode: string;
  workflowStages: WorkflowStage[];
  biometricDevices: Array<{
    id: string;
    deviceCode: string;
    deviceName: string;
    location: string;
    site: string;
    deviceType: string;
    operationalStatus: string;
    syncHealth: string;
    lastSyncAt: string;
    lastPunchAt: string | null;
    enrolledEmployees: number;
    matchedPunches: number;
    unmatchedPunches: number;
    supervisorOverrides: number;
  }>;
  attendanceWorkCenters: Array<{
    location: string;
    site: string;
    deviceName: string;
  }>;
  workCenters: Array<{
    id: string;
    code: string;
    name: string;
    location: string | null;
    site: string | null;
    status: 'Active' | 'Inactive';
    sourceSystem: string;
  }>;
  departments: Array<{ id: string; code: string; name: string; sourceSystem: string }>;
  locations: Array<{ id: string; code: string; name: string; site: string | null; sourceSystem: string }>;
  projectManagers: Array<{
    employeeId: string;
    employeeCode: string;
    fullName: string;
    jobTitle: string;
    department: string;
    location: string;
    status: string;
  }>;
  permissions: {
    actor: string;
    role: string;
    canEdit: boolean;
    canExport: boolean;
    canApprove: boolean;
    canManagePeriod: boolean;
    canViewCosts: boolean;
    canViewAudit: boolean;
  };
  summary: {
    totalEmployees: number;
    presentEmployees: number;
    absentEmployees: number;
    onLeaveEmployees: number;
    sickEmployees: number;
    notSyncedEmployees: number;
    bookedHours: number;
    usedHours: number;
    idleHours: number;
    productivityPct: number;
    pendingApprovals: number;
  };
  filterOptions: {
    departments: string[];
    projects: string[];
    locations: string[];
    supervisors: string[];
    shifts: string[];
    businessUnits: string[];
    modes: TimesheetEntryMode[];
    statuses: TimesheetStatus[];
  };
  matrixColumns: DisplayColumn[];
  projectCatalog: any[];
  aiInsights: StructureInsight[];
};

const round1 = (value: number) => Math.round(value * 10) / 10;

const todayDateInputValue = () => {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
};

const formatShortTime = (value?: string | null) => {
  if (!value) return 'Awaiting...';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Awaiting...';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatHandshake = (value?: string | null) => {
  if (!value) return 'Awaiting...';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Awaiting...';
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${formatShortTime(value)}`;
};

const metricCardTone: Record<string, { card: string; label: string; value: string; bar: string; sub: string }> = {
  indigo: { card: 'bg-indigo-50 border-indigo-100', label: 'text-indigo-700/70', value: 'text-indigo-950', bar: 'bg-indigo-600', sub: 'text-indigo-700' },
  emerald: { card: 'bg-emerald-50 border-emerald-100', label: 'text-emerald-700/70', value: 'text-emerald-950', bar: 'bg-emerald-600', sub: 'text-emerald-700' },
  red: { card: 'bg-red-50 border-red-100', label: 'text-red-700/70', value: 'text-red-950', bar: 'bg-red-600', sub: 'text-red-700' },
  amber: { card: 'bg-amber-50 border-amber-100', label: 'text-amber-700/70', value: 'text-amber-950', bar: 'bg-amber-500', sub: 'text-amber-700' },
  blue: { card: 'bg-sky-50 border-sky-100', label: 'text-sky-700/70', value: 'text-sky-950', bar: 'bg-sky-600', sub: 'text-sky-700' },
  slate: { card: 'bg-slate-100 border-slate-200', label: 'text-slate-500', value: 'text-slate-950', bar: 'bg-slate-500', sub: 'text-slate-600' },
};

const employeeCardTone = (line: TimesheetLine) => {
  if (!line.clockIn) return 'border-slate-200 bg-slate-100';
  if (line.validationStatus === 'Valid') return 'border-emerald-100 bg-emerald-50';
  if (line.validationStatus === 'Error') return 'border-red-100 bg-red-50';
  if (line.validationStatus === 'Warning') return 'border-amber-100 bg-amber-50';
  return 'border-sky-100 bg-sky-50';
};

const employeeStatusBadgeTone = (line: TimesheetLine) => {
  if (!line.clockIn) return 'border-slate-200 bg-white/70 text-slate-700';
  if (line.validationStatus === 'Valid') return 'border-emerald-200 bg-white/70 text-emerald-800';
  if (line.validationStatus === 'Error') return 'border-red-200 bg-white/70 text-red-800';
  if (line.validationStatus === 'Warning') return 'border-amber-200 bg-white/70 text-amber-800';
  return 'border-sky-200 bg-white/70 text-sky-800';
};

export default function TimesheetEntryClient() {
  const searchParams = useSearchParams();
  const dateParam = searchParams.get('date');
  const supervisorParam = searchParams.get('supervisorId');

  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [viewMode, setViewMode] = useState<'matrix' | 'cards'>('matrix');
  
  const [selectedDate, setSelectedDate] = useState(dateParam || todayDateInputValue());
  const [selectedSupervisor, setSelectedSupervisor] = useState(supervisorParam || '');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedWorkCenter, setSelectedWorkCenter] = useState('');

  const [localLines, setLocalLines] = useState<TimesheetLine[]>([]);
  const [query, setQuery] = useState('');
  const [matrixColumns, setMatrixColumns] = useState<DisplayColumn[]>([]);
  const [employeeCardPage, setEmployeeCardPage] = useState(1);

  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkProject, setBulkProject] = useState('');
  const [bulkHours, setBulkHours] = useState(8);

  const [showProjectModal, setShowProjectModal] = useState(false);
  const [newProjectCode, setNewProjectCode] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectSite, setNewProjectSite] = useState('');
  const [newProjectManager, setNewProjectManager] = useState('');
  const [showWorkCenterManager, setShowWorkCenterManager] = useState(false);
  const [workCenters, setWorkCenters] = useState<Payload['workCenters']>([]);
  const [workCenterDraft, setWorkCenterDraft] = useState('');
  const [editingWorkCenter, setEditingWorkCenter] = useState<Payload['workCenters'][number] | null>(null);

  const load = useCallback(async (date?: string, supervisor?: string, location?: string, workCenter?: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL('/api/hris/time-and-logs/timesheet-entry', window.location.origin);
      if (date) url.searchParams.set('date', date);
      if (supervisor) url.searchParams.set('supervisorId', supervisor);
      if (location) url.searchParams.set('locationName', location);
      if (workCenter) url.searchParams.set('workCenterName', workCenter);
      
      const res = await fetch(url.toString(), { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Unable to load timesheet entry');
      
      const data = json.data as Payload;
      const dbWorkCenters = data.workCenters || [];
      const dbWorkCenterNames = dbWorkCenters.map((item) => item.name);
      const dbLocationNames = (data.locations || []).map((item) => item.name);
      setPayload(data);
      setLocalLines(data.lines);
      setWorkCenters(dbWorkCenters);
      if (data.matrixColumns && matrixColumns.length === 0) {
        setMatrixColumns(data.matrixColumns);
      }
      if (!selectedSupervisor) setSelectedSupervisor(data.permissions.actor);
      setSelectedLocation((current) => {
        if (current && dbLocationNames.includes(current)) return current;
        return dbLocationNames[0] || '';
      });
      setSelectedWorkCenter((current) => {
        if (current && dbWorkCenterNames.includes(current)) return current;
        if (data.header?.workCenterName && dbWorkCenterNames.includes(data.header.workCenterName)) return data.header.workCenterName;
        return dbWorkCenterNames[0] || '';
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load timesheet entry');
    } finally {
      setLoading(false);
    }
  }, [matrixColumns.length, selectedSupervisor]);

  useEffect(() => {
    void load(selectedDate, selectedSupervisor, selectedLocation, selectedWorkCenter);
  }, [load, selectedDate, selectedSupervisor, selectedLocation, selectedWorkCenter]);

  const handleSyncAttendance = useCallback(async () => {
    if (payload?.period.status !== 'Open') {
      setError('This timesheet period is closed. Reopen it before syncing attendance.');
      return;
    }
    if (!selectedWorkCenter) {
      setError('No biometric device work center is available from the time and attendance system.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/hris/time-and-logs/timesheet-entry', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SYNC_ATTENDANCE',
          date: selectedDate,
          supervisorId: selectedSupervisor,
          workCenterName: selectedWorkCenter,
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Sync failed');
      setPayload(json.data);
      setLocalLines(json.data.lines);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSubmitting(false);
    }
  }, [payload?.period.status, selectedDate, selectedSupervisor, selectedWorkCenter]);

  const saveWorkCenter = async () => {
    const nextName = workCenterDraft.trim();
    if (!nextName) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/hris/time-and-logs/timesheet-entry', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'UPSERT_WORK_CENTER',
          date: selectedDate,
          supervisorId: selectedSupervisor,
          workCenterName: selectedWorkCenter,
          workCenter: {
            id: editingWorkCenter?.id,
            code: editingWorkCenter?.code,
            name: nextName,
            location: editingWorkCenter?.location || nextName,
            site: editingWorkCenter?.site || nextName,
            sourceSystem: editingWorkCenter?.sourceSystem || 'HRIS',
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Unable to save work center');
      setPayload(json.data);
      setLocalLines(json.data.lines);
      setWorkCenters(json.data.workCenters || []);
      setSelectedWorkCenter(nextName);
      setWorkCenterDraft('');
      setEditingWorkCenter(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save work center');
    } finally {
      setSubmitting(false);
    }
  };

  const editWorkCenter = (workCenter: Payload['workCenters'][number]) => {
    setEditingWorkCenter(workCenter);
    setWorkCenterDraft(workCenter.name);
  };

  const deleteWorkCenter = async (workCenter: Payload['workCenters'][number]) => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/hris/time-and-logs/timesheet-entry', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'DELETE_WORK_CENTER',
          date: selectedDate,
          supervisorId: selectedSupervisor,
          workCenterName: selectedWorkCenter === workCenter.name ? undefined : selectedWorkCenter,
          workCenter: { id: workCenter.id, name: workCenter.name },
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Unable to delete work center');
      setPayload(json.data);
      setLocalLines(json.data.lines);
      const nextWorkCenters = json.data.workCenters || [];
      setWorkCenters(nextWorkCenters);
      if (selectedWorkCenter === workCenter.name) setSelectedWorkCenter(nextWorkCenters[0]?.name || '');
      if (editingWorkCenter?.id === workCenter.id) {
        setEditingWorkCenter(null);
        setWorkCenterDraft('');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to delete work center');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateLine = (index: number, updates: Partial<TimesheetLine>) => {
    const next = [...localLines];
    const line = { ...next[index], ...updates };
    line.idleAllocations = line.idleAllocations.map((allocation) =>
      allocation.reasonId || allocation.hours <= 0
        ? allocation
        : { ...allocation, reasonId: DEFAULT_IDLE_REASON_ID, reasonName: DEFAULT_IDLE_REASON_NAME },
    );
    
    line.usedHours = round1(line.projectAllocations.reduce((sum, p) => sum + p.hours, 0));
    line.idleHours = round1(line.idleAllocations.reduce((sum, i) => sum + i.hours, 0));
    line.totalHours = round1(line.usedHours + line.idleHours);
    line.variance = round1(line.totalHours - STANDARD_TIMESHEET_HOURS);
    
    if (line.totalHours > STANDARD_TIMESHEET_HOURS + 0.001) {
      line.validationStatus = 'Error';
      line.validationMessage = `Total hours cannot exceed ${STANDARD_TIMESHEET_HOURS} hours per day.`;
    } else if (line.totalHours === STANDARD_TIMESHEET_HOURS) {
      line.validationStatus = 'Valid';
      line.validationMessage = null;
    } else if (line.idleHours > 0 && line.idleAllocations.some(a => a.hours > 0 && !a.reasonId)) {
      line.validationStatus = 'Warning';
      line.validationMessage = 'Idle time requires a valid reason.';
    } else {
      line.validationStatus = 'Incomplete';
      line.validationMessage = `Awaiting full ${STANDARD_TIMESHEET_HOURS}-hour allocation. Current: ${line.totalHours} hrs.`;
    }

    next[index] = line;
    setLocalLines(next);
  };

  const handleCopyPrevious = async () => {
    if (payload?.period.status !== 'Open') {
      setError('This timesheet period is closed. Reopen it before copying allocations.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/hris/time-and-logs/timesheet-entry', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'COPY_PREVIOUS_DAY',
          date: selectedDate,
          supervisorId: selectedSupervisor,
          workCenterName: selectedWorkCenter,
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Copy failed');
      setPayload(json.data);
      setLocalLines(json.data.lines);
      alert('Previous day allocations copied successfully.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Copy failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSave = async (isSubmit = false) => {
    if (payload?.period.status !== 'Open') {
      setError('This timesheet period is closed. Reopen it before saving or submitting timesheets.');
      return;
    }
    if (!payload?.header?.id && !isSubmit) {
      setError('No active timesheet header. Please sync attendance first.');
      return;
    }
    
    setSubmitting(true);
    try {
      const res = await fetch('/api/hris/time-and-logs/timesheet-entry', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: isSubmit ? 'SUBMIT' : 'MATRIX_SAVE',
          headerId: payload?.header?.id,
          lines: localLines,
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Save failed');
      setPayload(json.data);
      setLocalLines(json.data.lines);
      if (isSubmit) alert('Timesheet submitted successfully.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkApply = async () => {
    if (payload?.period.status !== 'Open') {
      setError('This timesheet period is closed. Reopen it before applying bulk allocations.');
      return;
    }
    if (selectedEmployees.length === 0 || !bulkProject) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/hris/time-and-logs/timesheet-entry', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'BULK_APPLY',
          headerId: payload?.header?.id,
          bulkAllocation: {
            employeeIds: selectedEmployees,
            projectCode: bulkProject,
            hours: bulkHours,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Bulk apply failed');
      setPayload(json.data);
      setLocalLines(json.data.lines);
      setShowBulkModal(false);
      setSelectedEmployees([]);
      alert(`Applied ${bulkHours}h to ${selectedEmployees.length} employees.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bulk apply failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecision = async (decision: 'APPROVE' | 'REJECT') => {
    if (!payload?.header?.id) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/hris/time-and-logs/timesheet-entry', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: decision,
          headerId: payload.header.id,
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Action failed');
      setPayload(json.data);
      setLocalLines(json.data.lines);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateProject = async () => {
    const projectCode = newProjectCode.trim();
    const projectManager = newProjectManager.trim();
    const projectManagerExists = (payload?.projectManagers ?? []).some((employee) => `${employee.employeeCode} - ${employee.fullName}`.toLowerCase() === projectManager.toLowerCase());
    if (!projectCode || !newProjectName || !newProjectSite || !projectManager) return;
    if (!projectManagerExists) {
      setError('Select a Project Manager from the employee directory.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/hris/time-and-logs/timesheet-entry', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE_PROJECT',
          project: {
            code: projectCode,
            name: newProjectName,
            site: newProjectSite,
            projectManager,
            status: 'Active',
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Failed to create project');
      setPayload(json.data);
      setShowProjectModal(false);
      setNewProjectCode('');
      setNewProjectName('');
      setNewProjectSite('');
      setNewProjectManager('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create project');
    } finally {
      setSubmitting(false);
    }
  };

  const addProjectColumn = () => {
    const newColCode = `NEW-${Date.now()}`;
    setMatrixColumns([...matrixColumns, { code: newColCode, label: 'Select Project', kind: 'project' }]);
  };

  const updateColumnProject = (colIdx: number, projectCode: string) => {
    const next = [...matrixColumns];
    next[colIdx] = { ...next[colIdx], code: projectCode, label: projectCode };
    setMatrixColumns(next);
  };

  const removeProjectColumn = (colIdx: number) => {
    const colToRemove = matrixColumns[colIdx];
    const nextCols = matrixColumns.filter((_, idx) => idx !== colIdx);
    setMatrixColumns(nextCols);

    const nextLines = localLines.map(line => {
      const nextAllocations = line.projectAllocations.filter(p => p.projectCode !== colToRemove.code);
      const usedHours = round1(nextAllocations.reduce((sum, p) => sum + p.hours, 0));
      const totalHours = round1(usedHours + line.idleHours);
      return {
        ...line,
        projectAllocations: nextAllocations,
        usedHours,
        totalHours,
        variance: round1(totalHours - STANDARD_TIMESHEET_HOURS),
        validationStatus: totalHours === STANDARD_TIMESHEET_HOURS ? 'Valid' : (totalHours > STANDARD_TIMESHEET_HOURS + 0.001 ? 'Error' : 'Incomplete')
      } as TimesheetLine;
    });
    setLocalLines(nextLines);
  };

  const filteredLines = localLines.filter(l => 
    l.employeeName.toLowerCase().includes(query.toLowerCase()) ||
    l.employeeNo.toLowerCase().includes(query.toLowerCase())
  );
  const totalEmployeeCardPages = Math.max(1, Math.ceil(filteredLines.length / EMPLOYEE_CARD_PAGE_SIZE));
  const safeEmployeeCardPage = Math.min(employeeCardPage, totalEmployeeCardPages);
  const paginatedCardLines = filteredLines.slice(
    (safeEmployeeCardPage - 1) * EMPLOYEE_CARD_PAGE_SIZE,
    safeEmployeeCardPage * EMPLOYEE_CARD_PAGE_SIZE,
  );
  const employeeCardStart = filteredLines.length === 0 ? 0 : (safeEmployeeCardPage - 1) * EMPLOYEE_CARD_PAGE_SIZE + 1;
  const employeeCardEnd = Math.min(safeEmployeeCardPage * EMPLOYEE_CARD_PAGE_SIZE, filteredLines.length);

  useEffect(() => {
    setEmployeeCardPage(1);
  }, [query, viewMode, selectedDate, selectedSupervisor, selectedLocation, selectedWorkCenter]);

  useEffect(() => {
    if (employeeCardPage > totalEmployeeCardPages) setEmployeeCardPage(totalEmployeeCardPages);
  }, [employeeCardPage, totalEmployeeCardPages]);

  if (loading && !payload) {
    return (
      <PageTemplate 
        title="Timesheet Entry" 
        description="Loading timesheet data..."
        breadcrumbs={[{ label: 'HRIS', href: '/hris' }, { label: 'Time & Logs', href: '/hris/time-and-logs' }, { label: 'Timesheet Entry' }]}
      >
        <div className="flex h-96 items-center justify-center"><RefreshCcw className="h-8 w-8 animate-spin text-slate-400" /></div>
      </PageTemplate>
    );
  }

  const workCenterOptions = workCenters.map((workCenter) => workCenter.name);
  const locationOptions = Array.from(new Set((payload?.locations.map((location) => location.name) ?? []).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const siteLocationOptions = Array.from(
    new Set((payload?.locations.map((location) => location.name) ?? []).filter((location) => location && location !== 'Unassigned Location')),
  ).sort((a, b) => a.localeCompare(b));
  const projectManagerOptions = payload?.projectManagers ?? [];
  const projectManagerIsSelected = projectManagerOptions.some((employee) => `${employee.employeeCode} - ${employee.fullName}`.toLowerCase() === newProjectManager.trim().toLowerCase());
  const currentStageIdx = payload?.workflowStages.findIndex(s => s.id === payload?.header?.status) ?? 0;
  const periodStatus = payload?.period.status ?? 'Open';
  const periodIsOpen = periodStatus === 'Open';
  const headerStatus = payload?.header?.status ?? 'Draft';
  const isPayrollReady = payrollReadyStatuses.includes(headerStatus);
  const canEditTimesheet = periodIsOpen && editableTimesheetStatuses.includes(headerStatus);
  const activeSiteDevices = payload?.attendanceWorkCenters.filter((workCenter) => workCenter.location === selectedWorkCenter) ?? [];
  const onlineSiteDevices = activeSiteDevices;
  const primarySiteDevice = [...activeSiteDevices].sort((a, b) => {
    return a.deviceName.localeCompare(b.deviceName);
  })[0];
  const lastHandshakeAt = payload?.biometricDevices
    .filter((device) => device.location === selectedWorkCenter)
    .map((device) => device.lastSyncAt)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  const matchedPunches = payload?.summary.presentEmployees ?? 0;
  const exceptionPunches = payload?.summary.absentEmployees ?? 0;
  const biometricTone = onlineSiteDevices.length > 0
    ? 'text-emerald-400'
    : activeSiteDevices.length > 0
      ? 'text-amber-300'
      : 'text-slate-300';
  const biometricLabel = onlineSiteDevices.length > 0
    ? 'Biometric Integrated'
    : activeSiteDevices.length > 0
      ? 'Biometric Attention'
      : 'No Site Device';

  return (
    <PageTemplate
      title="Timesheet Entry"
      description="Record daily work hour allocations across projects and tasks."
      breadcrumbs={[{ label: 'HRIS', href: '/hris' }, { label: 'Time & Logs', href: '/hris/time-and-logs' }, { label: 'Timesheet Entry' }]}
      primaryAction={{ label: canEditTimesheet ? 'Sync Attendance' : periodIsOpen ? 'Read Only' : 'Period Closed', onClick: canEditTimesheet ? handleSyncAttendance : () => undefined, icon: RefreshCcw }}
      secondaryAction={{ label: 'Create Project', onClick: () => setShowProjectModal(true), icon: Plus }}
    >
      <div className="space-y-8">
        {/* Header Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-6 border-b border-slate-100 pb-6">
            <div className="space-y-1">
              <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase">Timesheet Entry</h1>
              <div className="flex items-center gap-3 text-sm font-bold text-slate-500">
                <span className="flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-indigo-700">
                  <Clock className="h-3.5 w-3.5" /> Period: {payload?.period.startDate} to {payload?.period.endDate}
                </span>
                <span className={`rounded-full px-2.5 py-1 border ${periodIsOpen ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>{periodStatus}</span>
                {payload?.header?.currentApprover && (
                  <span className="flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-sky-700">
                    Next: {payload.header.currentApprovalStage} - {payload.header.currentApprover}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-6">
              <Link href="/hris/time-and-logs/timesheet-period" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-white">
                Manage Periods
              </Link>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Supervisor</p>
                <select value={selectedSupervisor} onChange={(e) => setSelectedSupervisor(e.target.value)} className="bg-transparent text-sm font-black text-slate-900 focus:outline-none">
                  <option value={payload?.permissions.actor}>{payload?.permissions.actor}</option>
                  {payload?.filterOptions.supervisors.filter(s => s !== payload?.permissions.actor).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Location</p>
                <select value={selectedLocation} onChange={(e) => setSelectedLocation(e.target.value)} className="bg-transparent text-sm font-black text-slate-900 focus:outline-none">
                  {locationOptions.length === 0 && <option value="">No location</option>}
                  {locationOptions.map((location) => (
                    <option key={location} value={location}>
                      {location}
                    </option>
                  ))}
                </select>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Work Center</p>
                <div className="flex items-center justify-end gap-2">
                  <select value={selectedWorkCenter} onChange={(e) => setSelectedWorkCenter(e.target.value)} className="bg-transparent text-sm font-black text-slate-900 focus:outline-none">
                    {workCenterOptions.length === 0 && <option value="">No work center</option>}
                    {workCenterOptions.map((workCenter) => (
                    <option key={workCenter} value={workCenter}>
                      {workCenter}
                    </option>
                  ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowWorkCenterManager(true)}
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 hover:text-indigo-600"
                    title="Manage work centers"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Working Date</p>
                <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="bg-transparent text-sm font-black text-slate-900 focus:outline-none" />
              </div>
            </div>
          </div>
          <div className="mt-8">
            <div className="relative flex justify-between">
              {payload?.workflowStages.map((stage, idx) => (
                <div key={stage.id} className="relative z-10 flex flex-col items-center gap-2">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-all ${idx <= currentStageIdx ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-400'}`}>
                    {idx < currentStageIdx ? <CheckCircle2 className="h-4 w-4" /> : stage.order}
                  </div>
                  <span className={`text-[10px] font-black uppercase tracking-tighter ${idx <= currentStageIdx ? 'text-indigo-700' : 'text-slate-400'}`}>{stage.label}</span>
                </div>
              ))}
              <div className="absolute top-4 left-0 h-0.5 w-full -translate-y-1/2 bg-slate-100">
                <div className="h-full bg-indigo-600 transition-all duration-500" style={{ width: `${(currentStageIdx / (payload!.workflowStages.length - 1)) * 100}%` }} />
              </div>
            </div>
          </div>
        </div>

        {!periodIsOpen && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-slate-900 p-2 text-white"><Info className="h-4 w-4" /></div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">Timesheet Period Closed</h3>
                  <p className="mt-1 text-xs font-semibold text-slate-500">Attendance sync, copying, allocations, saving, and submission are paused for this period.</p>
                </div>
              </div>
              <Link href="/hris/time-and-logs/timesheet-period" className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white hover:bg-slate-800">
                Manage Period
              </Link>
            </div>
          </div>
        )}

        {periodIsOpen && !canEditTimesheet && payload?.header && (
          <div className={`rounded-2xl border p-5 ${isPayrollReady ? 'border-emerald-200 bg-emerald-50' : 'border-indigo-200 bg-indigo-50'}`}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className={`rounded-xl p-2 text-white ${isPayrollReady ? 'bg-emerald-600' : 'bg-indigo-600'}`}><Info className="h-4 w-4" /></div>
                <div>
                  <h3 className={`text-sm font-black uppercase tracking-widest ${isPayrollReady ? 'text-emerald-900' : 'text-indigo-900'}`}>
                    {isPayrollReady ? 'Payroll Ready Timesheet' : 'Timesheet Under Approval'}
                  </h3>
                  <p className={`mt-1 text-xs font-semibold ${isPayrollReady ? 'text-emerald-700' : 'text-indigo-700'}`}>
                    {isPayrollReady
                      ? 'HR has acknowledged this timesheet for payroll. Editing is locked and any correction must follow a formal return/reversal process.'
                      : 'This timesheet has been submitted for approval. It can only be edited again if it is returned or rejected.'}
                  </p>
                </div>
              </div>
              <Link href="/hris/time-and-logs/timesheet-approval" className={`rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white ${isPayrollReady ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-indigo-700 hover:bg-indigo-800'}`}>
                Approval Workflow
              </Link>
            </div>
          </div>
        )}

        {/* Dashboard Metrics */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {[
            { label: 'Total Crew', value: payload?.summary.totalEmployees, color: 'indigo' },
            { label: 'Present', value: payload?.summary.presentEmployees, color: 'emerald', pct: (payload!.summary.presentEmployees / payload!.summary.totalEmployees) * 100 },
            { label: 'Absent', value: payload?.summary.absentEmployees, color: 'red', pct: (payload!.summary.absentEmployees / payload!.summary.totalEmployees) * 100 },
            { label: 'On Leave', value: payload?.summary.onLeaveEmployees, color: 'amber' },
            { label: 'Productive Hrs', value: payload?.summary.usedHours, color: 'blue', sub: `${payload?.summary.productivityPct}% Productivity` },
            { label: 'Idle Hrs', value: payload?.summary.idleHours, color: 'slate', sub: `${round1(100 - payload!.summary.productivityPct)}% Idle Rate` },
          ].map((m, i) => (
            <div key={i} className={`rounded-2xl border p-4 shadow-sm ${metricCardTone[m.color].card}`}>
              <p className={`text-[10px] font-bold uppercase tracking-widest ${metricCardTone[m.color].label}`}>{m.label}</p>
              <p className={`mt-1 text-2xl font-black ${metricCardTone[m.color].value}`}>{m.value}</p>
              {m.pct !== undefined ? (
                <div className="mt-2 h-1 w-full rounded-full bg-white/70"><div className={`h-full rounded-full ${metricCardTone[m.color].bar}`} style={{ width: `${m.pct}%` }} /></div>
              ) : m.sub ? (
                <p className={`mt-1 text-[10px] font-bold ${metricCardTone[m.color].sub}`}>{m.sub}</p>
              ) : (
                <div className="mt-2 h-1 w-full rounded-full bg-white/70"><div className={`h-full w-full rounded-full ${metricCardTone[m.color].bar}`} /></div>
              )}
            </div>
          ))}
        </div>

        {/* Biometric Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-slate-950 px-5 py-3 text-[11px] text-white shadow-lg">
          <div className="flex flex-wrap items-center gap-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className={`h-4 w-4 ${biometricTone}`} />
              <span className={`font-black uppercase tracking-widest ${biometricTone}`}>{biometricLabel}</span>
            </div>
            <span className="hidden h-5 w-px bg-white/15 sm:block" />
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-bold uppercase tracking-widest text-white/50">Work Center Devices:</span>
              <div className="flex flex-wrap gap-2">
                {activeSiteDevices.length > 0 ? activeSiteDevices.map((device) => (
                  <span key={`${device.location}-${device.site}-${device.deviceName}`} className="flex items-center gap-1.5 rounded-md bg-white/[0.07] px-2 py-1 font-bold text-white ring-1 ring-white/10">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    {device.deviceName}
                  </span>
                )) : (
                  <span className="rounded-md bg-white/[0.07] px-2 py-1 font-bold text-white/60 ring-1 ring-white/10">No reader assigned</span>
                )}
              </div>
            </div>
            <div className="hidden flex-wrap items-center gap-2 lg:flex">
              <span className="rounded-md bg-emerald-500/10 px-2 py-1 font-black text-emerald-300 ring-1 ring-emerald-400/20">{matchedPunches} matched</span>
              <span className="rounded-md bg-amber-500/10 px-2 py-1 font-black text-amber-200 ring-1 ring-amber-300/20">{exceptionPunches} exceptions</span>
              {primarySiteDevice && <span className="rounded-md bg-indigo-500/10 px-2 py-1 font-black text-indigo-200 ring-1 ring-indigo-300/20">{primarySiteDevice.site}</span>}
            </div>
          </div>
          <div className="flex items-center gap-4 text-right">
            <div>
              <p className="text-[9px] font-bold uppercase text-white/45">Last Handshake</p>
              <p className="font-black text-indigo-200">{payload?.header?.lastSyncAt ? formatHandshake(payload.header.lastSyncAt) : formatHandshake(lastHandshakeAt)}</p>
            </div>
            <button onClick={handleSyncAttendance} disabled={submitting || !canEditTimesheet} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50">
              {submitting ? 'Fetching...' : 'Fetch Punches'}
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-1 items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="Search employee..." value={query} onChange={(e) => setQuery(e.target.value)} className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm font-medium focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>
            {selectedEmployees.length > 0 && periodIsOpen && (
              <button 
                onClick={() => setShowBulkModal(true)}
                className="flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-black text-white hover:bg-amber-700 shadow-lg shadow-amber-100 animate-in fade-in slide-in-from-left-2"
              >
                <Users className="h-4 w-4" /> 
                APPLY TO {selectedEmployees.length} SELECTED
              </button>
            )}
            <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              <button onClick={() => setViewMode('matrix')} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${viewMode === 'matrix' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}><LayoutGrid className="h-3.5 w-3.5" />Matrix</button>
              <button onClick={() => setViewMode('cards')} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${viewMode === 'cards' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}><CreditCard className="h-3.5 w-3.5" />Cards</button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleCopyPrevious} disabled={submitting || !canEditTimesheet} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Copy className="h-3.5 w-3.5" />COPY PREVIOUS</button>
            <button onClick={() => handleSave(false)} disabled={submitting || !canEditTimesheet} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50">SAVE DRAFT</button>
            <button onClick={() => handleSave(true)} disabled={submitting || !canEditTimesheet} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-xs font-black text-white hover:bg-indigo-700 disabled:opacity-50">SUBMIT</button>
          </div>
        </div>

        {/* Table or Card View */}
        {viewMode === 'matrix' ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/50">
                    <th className="sticky left-0 z-20 bg-slate-50 px-4 py-5 font-black uppercase tracking-widest text-[10px] text-slate-500 min-w-[220px] shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                      <div className="flex items-center gap-3">
                        <input 
                          type="checkbox" 
                          checked={selectedEmployees.length === filteredLines.length && filteredLines.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedEmployees(filteredLines.map(l => l.employeeId));
                            else setSelectedEmployees([]);
                          }}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>Employee Details</span>
                      </div>
                    </th>
                    <th className="px-4 py-5 font-black uppercase tracking-widest text-[10px] text-slate-500 min-w-[120px]">Log</th>
                    <th className="px-4 py-5 font-black uppercase tracking-widest text-[10px] text-slate-500 text-center min-w-[60px]">Dur</th>
                    {matrixColumns.map((col, colIdx) => (
                      <th key={colIdx} className="px-4 py-5 font-black uppercase tracking-widest text-[10px] text-slate-500 min-w-[160px] border-l border-slate-100">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <select value={col.code} disabled={!canEditTimesheet} onChange={(e) => updateColumnProject(colIdx, e.target.value)} className="bg-transparent font-black text-indigo-600 focus:outline-none text-[11px] disabled:opacity-50">
                              <option value={col.code}>{col.label}</option>
                              {payload?.projects.map(p => <option key={p.id} value={p.code}>{p.code}</option>)}
                            </select>
                            <button onClick={() => removeProjectColumn(colIdx)} disabled={!canEditTimesheet} className="text-slate-300 hover:text-red-500 disabled:opacity-40"><XCircle className="h-3.5 w-3.5" /></button>
                          </div>
                          <span className="truncate text-[9px] font-bold text-slate-400">{payload?.projects.find(p => p.code === col.code)?.name || 'Select...'}</span>
                        </div>
                      </th>
                    ))}
                    <th className="px-4 py-5 border-l border-slate-100"><button onClick={addProjectColumn} disabled={!canEditTimesheet} className="rounded-lg bg-indigo-50 p-2 text-indigo-600 hover:bg-indigo-100 disabled:opacity-40"><Plus className="h-4 w-4" /></button></th>
                    <th className="px-4 py-5 border-l border-slate-100 min-w-[60px] text-center">
                      <button onClick={addProjectColumn} disabled={!canEditTimesheet} className="rounded-lg bg-indigo-50 p-2 text-indigo-600 hover:bg-indigo-100 transition-colors disabled:opacity-40">
                        <Plus className="h-4 w-4" />
                      </button>
                    </th>
                    <th className="px-4 py-5 font-black uppercase tracking-widest text-[10px] text-slate-500 text-center bg-blue-50/30 min-w-[80px]">Used</th>
                    <th className="px-4 py-5 font-black uppercase tracking-widest text-[10px] text-slate-500 min-w-[220px] bg-amber-50/30">Idle Time</th>
                    <th className="px-4 py-5 font-black uppercase tracking-widest text-[10px] text-slate-500 text-center bg-indigo-50/30 min-w-[80px]">Total</th>
                    <th className="px-4 py-5 font-black uppercase tracking-widest text-[10px] text-slate-500 text-center min-w-[60px]">Var</th>
                    <th className="px-4 py-5 font-black uppercase tracking-widest text-[10px] text-slate-500 text-center min-w-[100px]">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLines.map((line) => {
                    const isAbsent = !line.clockIn;
                    const originalIdx = localLines.findIndex(l => l.id === line.id);
                    return (
                      <tr key={line.id} className={`hover:bg-slate-50/80 transition-colors ${isAbsent ? 'opacity-60 bg-slate-50/30' : line.validationStatus === 'Valid' ? 'bg-emerald-50/30' : line.validationStatus === 'Error' ? 'bg-red-50/30' : 'bg-white'}`}>
                        <td className={`sticky left-0 z-10 px-4 py-4 border-r border-slate-100 shadow-[2px_0_5px_rgba(0,0,0,0.03)] ${isAbsent ? 'bg-slate-50' : line.validationStatus === 'Valid' ? 'bg-[#f0fdf4]' : line.validationStatus === 'Error' ? 'bg-[#fef2f2]' : 'bg-white'}`}>
                          <div className="flex items-center gap-3 min-w-max">
                            <input 
                              type="checkbox" 
                              checked={selectedEmployees.includes(line.employeeId)}
                              onChange={(e) => {
                                if (e.target.checked) setSelectedEmployees([...selectedEmployees, line.employeeId]);
                                else setSelectedEmployees(selectedEmployees.filter(id => id !== line.employeeId));
                              }}
                              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                            />
                            {!isAbsent && <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />}
                            <div className="flex flex-col whitespace-nowrap">
                              <span className="text-[9px] font-black text-indigo-600 tracking-widest uppercase">{line.employeeNo}</span>
                              <span className="text-[13px] font-black text-slate-900 tracking-tight">{line.employeeName}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">{isAbsent ? <span className="text-[10px] font-black text-red-600">ABSENT</span> : <div className="flex flex-col gap-0.5 text-[10px] font-black text-slate-700"><span>IN: {line.clockIn}</span><span>OUT: {line.clockOut || '--:--'}</span></div>}</td>
                        <td className="px-4 py-4 text-center text-[11px] font-black text-slate-600 tabular-nums">{line.attendanceDuration}h</td>
                        {matrixColumns.map((col) => (
                          <td key={col.code} className="px-4 py-4 border-l border-slate-100"><input type="number" step="0.5" disabled={isAbsent || !canEditTimesheet} value={line.projectAllocations.find(p => p.projectCode === col.code)?.hours || ''} onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            const allocations = [...line.projectAllocations];
                            const pIdx = allocations.findIndex(p => p.projectCode === col.code);
                            if (pIdx >= 0) allocations[pIdx].hours = val;
                            else allocations.push({ projectId: col.code, projectCode: col.code, projectName: col.label, hours: val, remarks: null });
                            handleUpdateLine(originalIdx, { projectAllocations: allocations });
                          }} className="w-full rounded-lg border border-slate-200 py-1.5 text-center text-xs font-black focus:border-indigo-500" /></td>
                        ))}
                        <td className="px-4 py-4 border-l border-slate-100"></td>
                        <td className="px-4 py-4 text-center font-black text-blue-700 bg-blue-50/20">{line.usedHours}</td>
                        <td className="px-4 py-4 bg-amber-50/20 border-l border-slate-100"><div className="flex flex-col gap-2">{(line.idleAllocations.length === 0 ? [{ reasonId: DEFAULT_IDLE_REASON_ID, reasonName: DEFAULT_IDLE_REASON_NAME, hours: 0, remarks: null }] : line.idleAllocations).map((alloc, iIdx) => (
                          <div key={iIdx} className="flex items-center gap-1.5"><input type="number" step="0.5" placeholder="Hrs" disabled={isAbsent || !canEditTimesheet} value={alloc.hours || ''} onChange={(e) => {
                            const next = [...line.idleAllocations];
                            if (next[iIdx]) next[iIdx].hours = parseFloat(e.target.value) || 0;
                            else next.push({ reasonId: DEFAULT_IDLE_REASON_ID, reasonName: DEFAULT_IDLE_REASON_NAME, hours: parseFloat(e.target.value) || 0, remarks: null });
                            handleUpdateLine(originalIdx, { idleAllocations: next });
                          }} className="w-12 rounded-lg border border-slate-200 py-1 text-center text-[10px] font-black" />
                          <select value={alloc.reasonId || DEFAULT_IDLE_REASON_ID} disabled={!canEditTimesheet} onChange={(e) => {
                            const reason = payload?.idleReasons.find((item) => item.id === e.target.value);
                            const next = [...line.idleAllocations];
                            if (next[iIdx]) next[iIdx] = { ...next[iIdx], reasonId: e.target.value, reasonName: reason?.name || DEFAULT_IDLE_REASON_NAME };
                            handleUpdateLine(originalIdx, { idleAllocations: next });
                          }} className="flex-1 rounded-lg border border-slate-200 py-1 text-[9px] font-bold">
                            {payload?.idleReasons.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </select>
                          {iIdx === line.idleAllocations.length - 1 && !isAbsent && canEditTimesheet && <button onClick={() => handleUpdateLine(originalIdx, { idleAllocations: [...line.idleAllocations, { reasonId: DEFAULT_IDLE_REASON_ID, reasonName: DEFAULT_IDLE_REASON_NAME, hours: 0, remarks: null }] })} className="p-1 text-slate-400 hover:text-indigo-600"><Plus className="h-3 w-3" /></button>}</div>
                        ))}</div></td>
                        <td className="px-4 py-4 text-center bg-indigo-50/20"><span className={`font-black ${line.totalHours === STANDARD_TIMESHEET_HOURS ? 'text-emerald-600' : 'text-indigo-600'}`}>{line.totalHours}</span></td>
                        <td className="px-4 py-4 text-center"><span className={`text-[10px] font-black ${line.variance === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>{line.variance > 0 ? `+${line.variance}` : line.variance}</span></td>
                        <td className="px-4 py-4 text-center"><div className="flex flex-col items-center gap-1 group relative">
                          {line.validationStatus === 'Valid' ? <><CheckCircle2 className="h-5 w-5 text-emerald-500" /><span className="text-[9px] font-black text-emerald-600">COMPLETE</span></> : <><AlertTriangle className={`h-5 w-5 ${line.validationStatus === 'Error' ? 'text-red-500' : 'text-amber-500'}`} /><span className={`text-[9px] font-black ${line.validationStatus === 'Error' ? 'text-red-600' : 'text-amber-600'}`}>{line.validationStatus}</span></>}
                          {line.validationMessage && <div className="absolute bottom-full left-1/2 mb-2 hidden w-48 -translate-x-1/2 rounded-lg bg-slate-900 p-2 text-[10px] text-white group-hover:block z-50">{line.validationMessage}</div>}
                        </div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Employees</p>
                <p className="text-sm font-bold text-slate-700">
                  Showing {employeeCardStart}-{employeeCardEnd} of {filteredLines.length}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEmployeeCardPage((page) => Math.max(1, page - 1))}
                  disabled={safeEmployeeCardPage === 1}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="min-w-20 text-center text-xs font-black text-slate-500">
                  {safeEmployeeCardPage} / {totalEmployeeCardPages}
                </span>
                <button
                  type="button"
                  onClick={() => setEmployeeCardPage((page) => Math.min(totalEmployeeCardPages, page + 1))}
                  disabled={safeEmployeeCardPage === totalEmployeeCardPages}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
            <div className="max-h-[720px] overflow-y-auto pr-2">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {paginatedCardLines.map((line) => {
              const originalIdx = localLines.findIndex(l => l.id === line.id);
              const isAbsent = !line.clockIn;
              return (
                <div key={line.id} className={`rounded-2xl border p-5 shadow-sm ${employeeCardTone(line)}`}>
                  <div className="mb-4 flex items-center justify-between border-b border-white/60 pb-4">
                    <div className="flex items-center gap-3">
                      <input 
                        type="checkbox" 
                        checked={selectedEmployees.includes(line.employeeId)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedEmployees([...selectedEmployees, line.employeeId]);
                          else setSelectedEmployees(selectedEmployees.filter(id => id !== line.employeeId));
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      {!isAbsent && <ShieldCheck className="h-4 w-4 text-emerald-600" />}
                      <div><p className="text-[10px] font-black text-indigo-600 leading-none">{line.employeeNo}</p><h3 className="text-sm font-black text-slate-900 mt-1">{line.employeeName}</h3></div>
                    </div>
                    <div className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${employeeStatusBadgeTone(line)}`}>{isAbsent ? 'ABSENT' : line.validationStatus === 'Valid' ? 'COMPLETE' : line.validationStatus}</div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex justify-between text-[11px] font-bold text-slate-500"><span>Attendance:</span><span>{isAbsent ? 'Absent' : `${line.clockIn}-${line.clockOut || '--'} (${line.attendanceDuration}h)`}</span></div>
                    <div className="space-y-2">
                      <p className="text-[9px] font-black uppercase text-slate-400">Projects</p>
                      {matrixColumns.map(col => (
                        <div key={col.code} className="flex items-center justify-between gap-3">
                          <span className="text-xs font-bold text-slate-600 truncate flex-1">{col.label}</span>
                          <input type="number" step="0.5" disabled={isAbsent || !canEditTimesheet} value={line.projectAllocations.find(p => p.projectCode === col.code)?.hours || ''} onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            const next = [...line.projectAllocations];
                            const pIdx = next.findIndex(p => p.projectCode === col.code);
                            if (pIdx >= 0) next[pIdx].hours = val;
                            else next.push({ projectId: col.code, projectCode: col.code, projectName: col.label, hours: val, remarks: null });
                            handleUpdateLine(originalIdx, { projectAllocations: next });
                          }} className="w-14 rounded-lg border border-slate-200 py-1 text-center text-xs font-black" />
                        </div>
                      ))}
                    </div>
                    <div className="space-y-3">
                      <p className="text-[9px] font-black uppercase text-slate-400">Idle Time</p>
                      {line.idleAllocations.map((alloc, iIdx) => (
                        <div key={iIdx} className="flex items-center gap-2">
                          <select 
                            value={alloc.reasonId || DEFAULT_IDLE_REASON_ID} 
                            disabled={!canEditTimesheet}
                            onChange={(e) => {
                              const reason = payload?.idleReasons.find((item) => item.id === e.target.value);
                              const next = [...line.idleAllocations];
                              next[iIdx] = { ...next[iIdx], reasonId: e.target.value, reasonName: reason?.name || DEFAULT_IDLE_REASON_NAME };
                              handleUpdateLine(originalIdx, { idleAllocations: next });
                            }}
                            className="flex-1 rounded-lg border border-slate-200 py-1.5 text-[10px] font-bold bg-amber-50/30"
                          >
                            {payload?.idleReasons.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </select>
                          <input 
                            type="number" 
                            step="0.5" 
                            disabled={!canEditTimesheet}
                            value={alloc.hours || ''} 
                            onChange={(e) => {
                              const next = [...line.idleAllocations];
                              next[iIdx].hours = parseFloat(e.target.value) || 0;
                              handleUpdateLine(originalIdx, { idleAllocations: next });
                            }}
                            className="w-14 rounded-lg border border-slate-200 py-1.5 text-center text-xs font-black bg-amber-50/30"
                          />
                        </div>
                      ))}
                      {!isAbsent && canEditTimesheet && (
                        <button 
                          onClick={() => handleUpdateLine(originalIdx, { idleAllocations: [...line.idleAllocations, { reasonId: DEFAULT_IDLE_REASON_ID, reasonName: DEFAULT_IDLE_REASON_NAME, hours: 0, remarks: null }] })}
                          className="w-full rounded-lg border border-dashed border-slate-200 py-1.5 text-[10px] font-black text-slate-400 hover:border-indigo-300 hover:text-indigo-600 transition-all"
                        >
                          + ADD IDLE REASON
                        </button>
                      )}
                    </div>
                    <div className="flex justify-between border-t border-slate-100 pt-4 text-center font-black">
                      <div><p className="text-[8px] text-slate-400">USED</p><p className="text-blue-700">{line.usedHours}h</p></div>
                      <div><p className="text-[8px] text-slate-400">IDLE</p><p className="text-amber-700">{line.idleHours}h</p></div>
                      <div><p className="text-[8px] text-slate-400">TOTAL</p><p className={line.totalHours === STANDARD_TIMESHEET_HOURS ? 'text-emerald-600' : 'text-indigo-600'}>{line.totalHours}h</p></div>
                    </div>
                  </div>
                </div>
              );
            })}
              </div>
            </div>
          </div>
        )}

        {/* Approval Decisions Panel */}
        {periodIsOpen && payload?.permissions.canApprove && payload.header?.status !== 'Approved' && payload.header?.status !== 'HR_Acknowledged' && payload.header?.status !== 'Locked' && payload.header?.status !== 'Draft' && (
          <div className="rounded-2xl border-2 border-indigo-200 bg-white p-8 shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-8">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-indigo-600 p-2 text-white"><ShieldCheck className="h-6 w-6" /></div>
                  <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Pending Approval Review</h3>
                </div>
                <p className="text-sm font-medium text-slate-500">You are reviewing the timesheet for <strong className="text-slate-900">{payload.header?.workCenterName}</strong> for <strong className="text-slate-900">{payload.header?.timesheetDate}</strong>.</p>
              </div>
              <div className="flex items-center gap-4">
                <button onClick={() => handleDecision('REJECT')} className="rounded-xl border-2 border-red-100 bg-red-50 px-8 py-3 text-sm font-black text-red-700 hover:bg-red-100 transition-all">REJECT</button>
                <button onClick={() => handleDecision('APPROVE')} className="rounded-xl bg-indigo-600 px-10 py-3 text-sm font-black text-white hover:bg-indigo-700 shadow-xl transition-all">APPROVE</button>
              </div>
            </div>
          </div>
        )}

        {/* AI Insights */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {payload?.aiInsights.map((insight) => (
            <div key={insight.id} className={`rounded-2xl border-2 p-6 transition-all hover:shadow-lg ${insight.severity === 'high' ? 'border-red-100 bg-red-50/20' : 'border-amber-100 bg-amber-50/20'}`}>
              <div className="flex items-start gap-5">
                <div className={`rounded-xl p-3 ${insight.severity === 'high' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}><AlertTriangle className="h-6 w-6" /></div>
                <div className="space-y-2"><h4 className="text-lg font-black text-slate-900 uppercase tracking-tight">{insight.title}</h4><p className="text-sm font-medium leading-relaxed text-slate-600">{insight.recommendation}</p><button className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-700">Investigate <ArrowRight className="h-3.5 w-3.5" /></button></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Project Modal */}
      {showProjectModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="mb-8 flex items-center justify-between"><div className="space-y-1"><h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Register Project</h3><p className="text-sm font-medium text-slate-500">Add a new project code to the company registry.</p></div><button onClick={() => setShowProjectModal(false)} className="rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"><XCircle className="h-8 w-8" /></button></div>
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Project Code</label><input type="text" placeholder="e.g. DL26005" value={newProjectCode} onChange={(e) => setNewProjectCode(e.target.value.toUpperCase())} className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-sm font-black text-slate-900 placeholder:text-slate-300 focus:border-indigo-500 focus:outline-none transition-all" /></div>
                <div><label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Site Location</label><select value={newProjectSite} onChange={(e) => setNewProjectSite(e.target.value)} className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-sm font-black text-slate-900 focus:border-indigo-500 focus:outline-none transition-all"><option value="">Select Site...</option>{siteLocationOptions.map((site) => <option key={site} value={site}>{site}</option>)}</select></div>
              </div>
              <div><label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Project Name</label><input type="text" placeholder="e.g. NLNG Train 7 - Piping Works" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-sm font-black text-slate-900 placeholder:text-slate-300 focus:border-indigo-500 focus:outline-none transition-all" /></div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Project Manager</label>
                <input
                  type="text"
                  list="project-manager-directory-options"
                  placeholder="Search employee directory..."
                  value={newProjectManager}
                  onChange={(e) => setNewProjectManager(e.target.value)}
                  className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-sm font-black text-slate-900 placeholder:text-slate-300 focus:border-indigo-500 focus:outline-none transition-all"
                />
                <datalist id="project-manager-directory-options">
                  {projectManagerOptions.map((employee) => {
                    const label = `${employee.employeeCode} - ${employee.fullName}`;
                    return (
                      <option key={employee.employeeId || employee.employeeCode} value={label}>
                        {employee.jobTitle ? `${employee.jobTitle} | ${employee.department || 'No department'}` : employee.department || employee.status}
                      </option>
                    );
                  })}
                </datalist>
              </div>
              <div className="pt-4 flex gap-3"><button onClick={() => setShowProjectModal(false)} className="flex-1 rounded-2xl border-2 border-slate-100 py-4 text-xs font-black text-slate-400 hover:bg-slate-50 transition-all uppercase tracking-widest">Cancel</button><button onClick={handleCreateProject} disabled={submitting || !newProjectCode.trim() || !newProjectName || !newProjectSite || !projectManagerIsSelected} className="flex-[2] rounded-2xl bg-indigo-600 py-4 text-xs font-black text-white hover:bg-indigo-700 disabled:opacity-50 shadow-xl shadow-indigo-100 transition-all uppercase tracking-widest">{submitting ? 'Creating...' : 'Register Project'}</button></div>
            </div>
          </div>
        </div>
      )}

      {/* Work Center Manager */}
      {showWorkCenterManager && (
        <div className="fixed inset-0 z-[105] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-md">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="mb-6 flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-2xl font-black uppercase tracking-tight text-slate-900">Work Centers</h3>
                <p className="text-sm font-medium text-slate-500">Manage production work centers for timesheet entry.</p>
              </div>
              <button onClick={() => setShowWorkCenterManager(false)} className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"><XCircle className="h-8 w-8" /></button>
            </div>
            <div className="flex gap-3">
              <input value={workCenterDraft} onChange={(e) => setWorkCenterDraft(e.target.value)} placeholder="Work center name" className="min-w-0 flex-1 rounded-xl border-2 border-slate-200 px-4 py-3 text-sm font-black text-slate-900 placeholder:text-slate-300 focus:border-indigo-500 focus:outline-none" />
              <button onClick={saveWorkCenter} disabled={!workCenterDraft.trim()} className="rounded-xl bg-indigo-600 px-5 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-indigo-700 disabled:opacity-50">{editingWorkCenter ? 'Update' : 'Add'}</button>
              {editingWorkCenter && <button onClick={() => { setEditingWorkCenter(null); setWorkCenterDraft(''); }} className="rounded-xl border border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50">Cancel</button>}
            </div>
            <div className="mt-5 max-h-[360px] overflow-y-auto rounded-2xl border border-slate-200">
              {workCenters.map((workCenter) => (
                <div key={workCenter.id} className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0">
                  <button onClick={() => setSelectedWorkCenter(workCenter.name)} className={`min-w-0 flex-1 truncate text-left text-sm font-black ${selectedWorkCenter === workCenter.name ? 'text-indigo-700' : 'text-slate-800'}`}>
                    {workCenter.name}
                    <span className="ml-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">{workCenter.sourceSystem}</span>
                  </button>
                  <div className="flex items-center gap-2">
                    <button onClick={() => editWorkCenter(workCenter)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-indigo-600"><Edit3 className="h-4 w-4" /></button>
                    <button onClick={() => deleteWorkCenter(workCenter)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"><XCircle className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
              {workCenters.length === 0 && <div className="px-4 py-6 text-center text-sm font-bold text-slate-400">No work centers found in the database.</div>}
            </div>
            <div className="mt-5 flex justify-between gap-3">
              <span className="px-1 py-2.5 text-xs font-bold text-slate-400">Stored in HRIS database</span>
              <button onClick={() => setShowWorkCenterManager(false)} className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-black uppercase tracking-widest text-white hover:bg-slate-800">Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Apply Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/70 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="mb-6 flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Bulk Allocation</h3>
                <p className="text-xs font-medium text-slate-500">Applying hours to {selectedEmployees.length} selected employees.</p>
              </div>
              <button onClick={() => setShowBulkModal(false)} className="rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"><XCircle className="h-6 w-6" /></button>
            </div>
            <div className="space-y-5">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Select Project</label>
                <select 
                  value={bulkProject} 
                  onChange={(e) => setBulkProject(e.target.value)}
                  className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-sm font-black text-slate-900 focus:border-indigo-500 focus:outline-none transition-all"
                >
                  <option value="">Select Project...</option>
                  {payload?.projects.map(p => <option key={p.id} value={p.code}>{p.code} - {p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Hours to Apply</label>
                <div className="flex items-center gap-4">
                  <input 
                    type="range" 
                    min="0" 
                    max="8" 
                    step="0.5" 
                    value={bulkHours} 
                    onChange={(e) => setBulkHours(parseFloat(e.target.value))}
                    className="flex-1 h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                  <span className="w-12 text-center text-lg font-black text-indigo-600">{bulkHours}h</span>
                </div>
              </div>
              <div className="pt-4 flex gap-3">
                <button onClick={() => setShowBulkModal(false)} className="flex-1 rounded-2xl border-2 border-slate-100 py-3 text-[10px] font-black text-slate-400 hover:bg-slate-50 transition-all uppercase tracking-widest">Cancel</button>
                <button 
                  onClick={handleBulkApply} 
                  disabled={submitting || !bulkProject || !canEditTimesheet} 
                  className="flex-[2] rounded-2xl bg-amber-600 py-3 text-[10px] font-black text-white hover:bg-amber-700 disabled:opacity-50 shadow-xl shadow-amber-100 transition-all uppercase tracking-widest"
                >
                  {submitting ? 'Applying...' : 'Apply Allocation'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageTemplate>
  );
}
