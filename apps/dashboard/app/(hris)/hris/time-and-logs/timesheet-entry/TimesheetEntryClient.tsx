'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useRef, useState, Suspense } from 'react';
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
import {
  applyOvertimeBooking,
  previewOvertimeBooking,
  remainingOvertimePool,
  remainingOvertimeSlots,
  validateTimesheetLine,
  type OvertimeAuthorization,
} from '@/lib/timesheet-overtime-booking';
import { DAILY_BREAK_HOURS, DEFAULT_BREAK_IDLE_REASON_ID, DEFAULT_BREAK_IDLE_REASON_NAME, normalizeIdleAllocations, normalizeProjectAllocations, canonicalProjectCode, consolidateProjectAllocationsToPrimary, resolvePrimaryProjectCode, timesheetDayRulesForDate, attendanceDurationFromClock, reconcileTimesheetLineHours, sumProjectAllocationHours, matrixProductiveHoursCap, upsertMatrixProjectHours, DEFAULT_TIMESHEET_SHIFT_LABEL, resolveTimesheetShift } from '@/lib/timesheet-entry-shared';
import { applyTimesheetLineDefaults } from '@/lib/timesheet-line-defaults';
import { canBookOvertimeOnTimesheet } from '@/lib/timesheet-overtime-config';
import { TimesheetEntryEnterpriseView } from './TimesheetEntryEnterpriseView';

type TimesheetStatus = 'Draft' | 'Submitted' | 'Supervisor_Reviewed' | 'Project_Manager_Reviewed' | 'Cost_Control_Reviewed' | 'HR_Acknowledged' | 'HR_Reviewed' | 'Project_Control_Reviewed' | 'Approved' | 'Locked' | 'Rejected' | 'Returned';
type TimesheetWorkflowStage = 'Supervisor' | 'Project Manager' | 'Cost Control' | 'HR';
const editableTimesheetStatuses: TimesheetStatus[] = ['Draft', 'Returned', 'Rejected'];
const payrollReadyStatuses: TimesheetStatus[] = ['HR_Acknowledged', 'Approved', 'Locked'];
const EMPLOYEE_CARD_PAGE_SIZE = 12;
type TimesheetEntryMode = 'Supervisor Entry';

const readApiJson = async (response: Response) => {
  const text = await response.text();
  if (!text.trim()) throw new Error(`Empty response from server (${response.status})`);
  try {
    return JSON.parse(text);
  } catch {
    const isHtml = /^\s*</.test(text);
    if (isHtml) {
      throw new Error(
        response.status >= 500
          ? 'The timesheet service encountered a server error. Refresh the page and try again.'
          : `Unexpected server response (${response.status}). Refresh the page and try again.`,
      );
    }
    throw new Error(text.slice(0, 240) || `Invalid response from server (${response.status})`);
  }
};

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
  clientName: string;
  site: string;
  projectManager: string;
  status: string;
  tasks?: Array<{ id: string; name: string }>;
};

type Payload = {
  generatedAt: string;
  timesheetDate: string;
  holidayDates: string[];
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
  supervisorEmployees: Array<{
    employeeId: string;
    employeeCode: string;
    fullName: string;
    jobTitle: string;
    department: string;
    location: string;
    managerEmployeeCode: string | null;
    managerName: string | null;
    status: string;
  }>;
  supervisorProfile: {
    employeeId: string;
    employeeCode: string;
    fullName: string;
    jobTitle: string;
    department: string;
    location: string;
    status: string;
  } | null;
  approvedOvertimeAuthorizations: Array<{
    id: string;
    projectCode: string;
    projectName: string;
    workDate: string;
    workCenter: string;
    supervisorCode: string;
    supervisorName: string;
    requestedHours: number;
    requestedHeadcount: number;
    reason: string;
    status: 'Submitted' | 'Project Manager Approved' | 'MD Approved' | 'Rejected' | 'Cancelled';
    currentOwnerRole: string;
    currentOwnerName: string;
  }>;
  overtimeBooking: {
    enabled: boolean;
    devRelaxed: boolean;
    retroCorrection: boolean;
    openBooking: boolean;
  };
  canBookOvertime?: boolean;
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
    projectSites: string[];
    supervisors: string[];
    shifts: string[];
    businessUnits: string[];
    modes: TimesheetEntryMode[];
    statuses: TimesheetStatus[];
    supervisorDirectory: Array<{ value: string; label: string; employeeCode: string; fullName: string; jobTitle?: string; department?: string; employeeCount: number }>;
  };
  matrixColumns: DisplayColumn[];
  projectCatalog: any[];
  aiInsights: StructureInsight[];
};

type SearchableOption = {
  value: string;
  label: string;
  searchText?: string;
};

const round1 = (value: number) => Math.round(value * 10) / 10;

const isSuperAdministratorRole = (role: string) =>
  role === 'Super Administrator' || role === 'Super Admin' || /\bsuper\b.*\badmin/i.test(role);

const todayDateInputValue = () => {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
};

const dateInputValue = (date: Date) => {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
};

const fallbackPeriodForDate = (value: string): TimesheetPeriod => {
  const date = value ? new Date(`${value}T00:00:00`) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const year = safeDate.getFullYear();
  const month = safeDate.getMonth();
  const day = safeDate.getDate();
  const startDate = day >= 16 ? new Date(year, month, 16) : new Date(year, month - 1, 16);
  const endDate = day >= 16 ? new Date(year, month + 1, 15) : new Date(year, month, 15);
  return {
    id: `per-${dateInputValue(endDate).slice(0, 7)}`,
    name: `${endDate.toLocaleDateString([], { month: 'long', year: 'numeric' })} Period`,
    startDate: dateInputValue(startDate),
    endDate: dateInputValue(endDate),
    status: 'Open',
  };
};

const formatPeriodDate = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
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

const workCenterMatchesLocation = (workCenter: Payload['workCenters'][number], location: string) => {
  const selected = location.trim().toLowerCase();
  if (!selected) return true;
  return [workCenter.location, workCenter.site, workCenter.name]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
    .some((value) => value === selected || value.includes(selected) || selected.includes(value));
};

const workCenterNamesForLocation = (workCenters: Payload['workCenters'], location: string) => {
  const matching = workCenters.filter((workCenter) => workCenterMatchesLocation(workCenter, location)).map((workCenter) => workCenter.name);
  return matching.length ? matching : workCenters.map((workCenter) => workCenter.name);
};

type DailyRatePanelRow = {
  employeeId: string;
  payMode: string;
  dayRate: number;
  hourRate: number;
  paidHoursPerDay: number;
  payrollGroup: string;
  location: string;
  workCenter: string;
  timesheetDays: number;
  calculatedPay: number;
};

export default function TimesheetEntryClient({ variant = 'admin' }: { variant?: 'admin' | 'workforce-supervisor' | 'enterprise' }) {
  const isEnterprise = variant === 'enterprise';
  const isWorkforceSupervisor = variant === 'workforce-supervisor' || isEnterprise;
  const searchParams = useSearchParams();
  const dateParam = searchParams.get('date');
  const supervisorParam = searchParams.get('supervisorId');

  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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
  const [showSubmitReview, setShowSubmitReview] = useState(false);
  const [bulkProject, setBulkProject] = useState('');
  const [bulkHours, setBulkHours] = useState(8);

  const [showProjectModal, setShowProjectModal] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [newProjectCode, setNewProjectCode] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectClientName, setNewProjectClientName] = useState('');
  const [newProjectSite, setNewProjectSite] = useState('');
  const [newProjectManager, setNewProjectManager] = useState('');
  const [databaseProjectSites, setDatabaseProjectSites] = useState<string[]>([]);
  const [projectSiteLoading, setProjectSiteLoading] = useState(false);
  const [projectSiteError, setProjectSiteError] = useState<string | null>(null);
  const [showWorkCenterManager, setShowWorkCenterManager] = useState(false);
  const [workCenters, setWorkCenters] = useState<Payload['workCenters']>([]);
  const [workCenterDraft, setWorkCenterDraft] = useState('');
  const [editingWorkCenter, setEditingWorkCenter] = useState<Payload['workCenters'][number] | null>(null);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [selectedShift, setSelectedShift] = useState(DEFAULT_TIMESHEET_SHIFT_LABEL);
  const [rightPanelTab, setRightPanelTab] = useState<'details' | 'history' | 'alerts'>('details');
  const [dailyPayPanel, setDailyPayPanel] = useState<DailyRatePanelRow | null>(null);
  const loadRequestRef = useRef(0);
  const autoSyncKeyRef = useRef<string | null>(null);
  const hasPayloadRef = useRef(false);
  const load = useCallback(async (date?: string, supervisor?: string, location?: string, workCenter?: string) => {
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    const initialLoad = !hasPayloadRef.current;
    setLoading(initialLoad);
    setRefreshing(!initialLoad);
    setError(null);
    setNotice(null);
    try {
      const url = new URL('/api/hris/time-and-logs/timesheet-entry', window.location.origin);
      if (isWorkforceSupervisor) url.searchParams.set('mode', 'supervisor');
      if (date) url.searchParams.set('date', date);
      if (supervisor) url.searchParams.set('supervisorId', supervisor);
      if (location) url.searchParams.set('locationName', location);
      if (workCenter) url.searchParams.set('workCenterName', workCenter);
      
      const res = await fetch(url.toString(), { cache: 'no-store' });
      const json = await readApiJson(res);
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Unable to load timesheet entry');
      if (loadRequestRef.current !== requestId) return;
      
      const data = json.data as Payload;
      const dbWorkCenters = data.workCenters || [];
      const dbLocationNames = data.filterOptions.locations || [];
      hasPayloadRef.current = true;
      setPayload(data);
      setLocalLines(data.lines);
      setWorkCenters(dbWorkCenters);
      if (data.matrixColumns && matrixColumns.length === 0) {
        setMatrixColumns(data.matrixColumns);
      }
      if (!selectedSupervisor) setSelectedSupervisor(data.filterOptions.supervisors[0] || data.permissions.actor);
      setSelectedLocation((current) => {
        if (current && dbLocationNames.includes(current)) return current;
        return dbLocationNames[0] || '';
      });
      setSelectedWorkCenter((current) => {
        const locationName = location || selectedLocation || dbLocationNames[0] || '';
        const dbWorkCenterNames = workCenterNamesForLocation(dbWorkCenters, locationName);
        if (current && dbWorkCenterNames.includes(current)) return current;
        if (data.header?.workCenterName && dbWorkCenterNames.includes(data.header.workCenterName)) return data.header.workCenterName;
        return dbWorkCenterNames[0] || '';
      });
    } catch (e) {
      if (loadRequestRef.current !== requestId) return;
      setError(e instanceof Error ? e.message : 'Unable to load timesheet entry');
    } finally {
      if (loadRequestRef.current === requestId) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [isWorkforceSupervisor, matrixColumns.length, selectedLocation, selectedSupervisor]);

  const loadProjectSites = useCallback(async () => {
    setProjectSiteLoading(true);
    setProjectSiteError(null);
    try {
      const res = await fetch('/api/hris/time-and-logs/project-sites', { cache: 'no-store' });
      const json = await readApiJson(res);
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Unable to load project sites');
      const sites = Array.from(new Set((json.data?.projectSites ?? []).map((site: unknown) => String(site ?? '').trim()).filter(Boolean))) as string[];
      setDatabaseProjectSites(sites.sort((a, b) => a.localeCompare(b)));
    } catch (error) {
      setProjectSiteError(error instanceof Error ? error.message : 'Unable to load project sites');
      setDatabaseProjectSites([]);
    } finally {
      setProjectSiteLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showProjectModal) {
      void loadProjectSites();
    }
  }, [loadProjectSites, showProjectModal]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load(selectedDate, selectedSupervisor, selectedLocation, selectedWorkCenter);
    }, hasPayloadRef.current ? 120 : 0);
    return () => window.clearTimeout(timer);
  }, [load, selectedDate, selectedSupervisor, selectedLocation, selectedWorkCenter]);

  const handleSyncAttendance = useCallback(async (source: 'manual' | 'auto' = 'manual') => {
    const headerStatus = payload?.header?.status ?? 'Draft';
    const retroBooking = payload?.overtimeBooking?.retroCorrection;
    const postedTimesheet = !editableTimesheetStatuses.includes(headerStatus);
    if (retroBooking && postedTimesheet) {
      if (source === 'manual') {
        setError(null);
        setNotice('Attendance sync is locked on posted timesheets. Use the overtime booking bar to add corrections.');
      }
      return;
    }
    if (payload?.period.status !== 'Open') {
      if (source === 'manual') setError('This timesheet period is closed. Reopen it before syncing attendance.');
      return;
    }
    if (!selectedWorkCenter) {
      if (source === 'manual') setError('No biometric device work center is available from the time and attendance system.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/hris/time-and-logs/timesheet-entry', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SYNC_ATTENDANCE',
          mode: isWorkforceSupervisor ? 'supervisor' : undefined,
          date: selectedDate,
          supervisorId: selectedSupervisor,
          locationName: selectedLocation,
          workCenterName: selectedWorkCenter,
        }),
      });
      const json = await readApiJson(res);
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Sync failed');
      setPayload(json.data);
      setLocalLines(json.data.lines);
    } catch (e) {
      if (source === 'manual') setError(e instanceof Error ? e.message : 'Sync failed');
      else setNotice(e instanceof Error ? `Automatic punch fetch is still pending: ${e.message}` : 'Automatic punch fetch is still pending.');
    } finally {
      setSubmitting(false);
    }
  }, [isWorkforceSupervisor, payload?.header?.status, payload?.overtimeBooking?.retroCorrection, payload?.period.status, selectedDate, selectedSupervisor, selectedLocation, selectedWorkCenter]);

  useEffect(() => {
    if (!payload || loading || refreshing || submitting) return;
    const headerStatus = payload.header?.status ?? 'Draft';
    const postedTimesheet = !editableTimesheetStatuses.includes(headerStatus);
    if (payload.overtimeBooking?.retroCorrection && postedTimesheet) return;
    if (payload.period.status !== 'Open') return;
    if (!selectedDate || !selectedSupervisor || !selectedLocation || !selectedWorkCenter) return;

    const syncKey = [selectedDate, selectedSupervisor, selectedLocation, selectedWorkCenter].join('|');
    if (autoSyncKeyRef.current === syncKey) return;
    autoSyncKeyRef.current = syncKey;
    void handleSyncAttendance('auto');
  }, [handleSyncAttendance, loading, payload, refreshing, selectedDate, selectedSupervisor, selectedLocation, selectedWorkCenter, submitting]);

  useEffect(() => {
    if (!selectedLocation || workCenters.length === 0) return;
    const availableWorkCenters = workCenterNamesForLocation(workCenters, selectedLocation);
    if (availableWorkCenters.length === 0 && selectedWorkCenter) {
      setSelectedWorkCenter('');
    } else if (availableWorkCenters.length > 0 && !availableWorkCenters.includes(selectedWorkCenter)) {
      setSelectedWorkCenter(availableWorkCenters[0]);
    }
  }, [selectedLocation, selectedWorkCenter, workCenters]);


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
          mode: isWorkforceSupervisor ? 'supervisor' : undefined,
          date: selectedDate,
          supervisorId: selectedSupervisor,
          locationName: selectedLocation,
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
      const json = await readApiJson(res);
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
          mode: isWorkforceSupervisor ? 'supervisor' : undefined,
          date: selectedDate,
          supervisorId: selectedSupervisor,
          workCenterName: selectedWorkCenter === workCenter.name ? undefined : selectedWorkCenter,
          workCenter: { id: workCenter.id, name: workCenter.name },
        }),
      });
      const json = await readApiJson(res);
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
    const isAbsentLine = !line.clockIn;
    if (isAbsentLine) {
      line.projectAllocations = line.projectAllocations.map((allocation) => ({ ...allocation, hours: 0 }));
    }
    line.projectAllocations = normalizeProjectAllocations(line.projectAllocations || []);
    line.idleAllocations = normalizeIdleAllocations(
      line.idleAllocations.map((allocation) =>
        allocation.reasonId || allocation.hours <= 0
          ? allocation
          : { ...allocation, reasonId: DEFAULT_BREAK_IDLE_REASON_ID, reasonName: DEFAULT_BREAK_IDLE_REASON_NAME },
      ),
    );

    const dayContext = { date: selectedDate, holidayDates: payload?.holidayDates ?? [], shiftLabel: selectedShift };
    const authorizations = (payload?.approvedOvertimeAuthorizations ?? []) as OvertimeAuthorization[];
    const bookingOptions = payload?.overtimeBooking ?? { enabled: false, devRelaxed: false, retroCorrection: false, openBooking: false };
    const validated = validateTimesheetLine(
      line,
      authorizations,
      next.map((item, itemIndex) => (itemIndex === index ? line : item)),
      selectedWorkCenter,
      bookingOptions,
      dayContext,
    );
    let attendanceDuration = line.attendanceDuration;
    const clockDuration = attendanceDurationFromClock(line.clockIn, line.clockOut);
    if (clockDuration !== null && clockDuration > 0) {
      attendanceDuration = clockDuration;
    } else if (
      line.clockIn &&
      (bookingOptions.openBooking || bookingOptions.retroCorrection) &&
      validated.totalHours > attendanceDuration + 0.001
    ) {
      attendanceDuration = round1(validated.totalHours);
    }
    next[index] = {
      ...line,
      projectAllocations: normalizeProjectAllocations(line.projectAllocations),
      attendanceDuration,
      usedHours: validated.usedHours,
      idleHours: validated.idleHours,
      totalHours: validated.totalHours,
      variance: validated.variance,
      validationStatus: validated.validationStatus,
      validationMessage: validated.validationMessage,
    };
    setLocalLines(next);
  };

  const handleBookApprovedOvertime = async (authorizationId: string, otHours: number) => {
    const auth = (payload?.approvedOvertimeAuthorizations ?? []).find((item) => item.id === authorizationId);
    const booking = payload?.overtimeBooking ?? { enabled: false, devRelaxed: false, retroCorrection: false, openBooking: false };
    const header = payload?.header;
    const retro = booking.retroCorrection;
    const headerStatus = header?.status ?? 'Draft';
    const periodIsOpen = payload?.period.status === 'Open';
    const timesheetEditable = periodIsOpen && editableTimesheetStatuses.includes(headerStatus);
    const payrollReady = payrollReadyStatuses.includes(headerStatus);
    const canBook =
      booking.enabled &&
      header &&
      (payload?.canBookOvertime ?? canBookOvertimeOnTimesheet(header, payload?.period, booking));

    if (!auth || !canBook) {
      setError(retro ? 'Overtime booking is not available for this timesheet.' : 'This timesheet must be open for editing before booking overtime.');
      return;
    }
    if (!booking.enabled) {
      setError('Overtime booking is disabled in this environment.');
      return;
    }
    if (!retro && !periodIsOpen) {
      setError('Reopen the timesheet period before booking overtime.');
      return;
    }

    if (!matrixColumns.some((column) => column.code === auth.projectCode)) {
      setMatrixColumns((current) => [
        ...current,
        { code: auth.projectCode, label: auth.projectName || auth.projectCode, kind: 'project' as const },
      ]);
    }

    const targets = selectedEmployees.length
      ? localLines.filter((line) => selectedEmployees.includes(line.employeeId) && line.clockIn)
      : localLines.filter((line) => line.clockIn);
    if (!targets.length) {
      setError('Select present employees to book approved overtime.');
      return;
    }

    const persistViaApi = retro || !timesheetEditable || payrollReady;
    if (persistViaApi) {
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch('/api/hris/time-and-logs/timesheet-entry', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'BOOK_OVERTIME',
            headerId: header.id,
            authorizationId,
            otHours,
            employeeIds: selectedEmployees.length ? selectedEmployees : undefined,
            postToPayroll: retro || payrollReady,
            date: selectedDate,
            supervisorId: selectedSupervisor,
            locationName: selectedLocation,
            workCenterName: selectedWorkCenter,
            mode: isWorkforceSupervisor ? 'supervisor' : undefined,
          }),
        });
        const json = await readApiJson(res);
        if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Overtime booking failed.');
        setPayload(json.data);
        setLocalLines(json.data.lines || []);
        setNotice(
          `Booked ${otHours}h overtime on ${auth.projectCode} for ${targets.length} employee${targets.length === 1 ? '' : 's'}${
            retro || payrollReady ? ' and refreshed payroll feed' : ''
          }.`,
        );
        setSelectedEmployees([]);
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Overtime booking failed.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    let next = [...localLines];
    let bookedCount = 0;
    const denials: string[] = [];
    const partials: string[] = [];
    const dayContext = { date: selectedDate, holidayDates: payload?.holidayDates ?? [], shiftLabel: selectedShift };
    for (const line of targets) {
      const index = next.findIndex((item) => item.id === line.id);
      if (index < 0) continue;
      const preview = previewOvertimeBooking(line, otHours, dayContext);
      if (!preview.canApply) {
        denials.push(`${line.employeeName}: ${preview.denialReason}`);
        next[index] = {
          ...next[index],
          validationStatus: 'Error',
          validationMessage: preview.denialReason,
        };
        continue;
      }
      const beforeUsed = sumProjectAllocationHours(next[index].projectAllocations);
      next[index] = applyOvertimeBooking(
        next[index],
        auth as OvertimeAuthorization,
        otHours,
        next,
        selectedWorkCenter,
        booking,
        dayContext,
        resolvePrimaryProjectCode(matrixColumns.map((col) => col.code), next[index].projectAllocations),
      );
      const afterUsed = sumProjectAllocationHours(next[index].projectAllocations);
      if (Math.abs(afterUsed - beforeUsed) > 0.001) {
        bookedCount += 1;
        if (preview.denialReason) partials.push(`${line.employeeName}: ${preview.denialReason}`);
      } else {
        denials.push(
          `${line.employeeName}: ${preview.denialReason || next[index].validationMessage || 'No overtime headroom on biometric log.'}`,
        );
      }
    }
    setLocalLines(next);
    if (bookedCount === 0) {
      setError(
        denials.length
          ? `Overtime denied — productive hours must equal biometric duration minus 1h break (8h + OT = DUR − 1):\n${denials.join('\n')}`
          : 'Overtime could not be booked for the selected employees.',
      );
      return;
    }
    setNotice(
      `Booked overtime on ${auth.projectCode} for ${bookedCount} employee${bookedCount === 1 ? '' : 's'}. Save draft to persist.` +
        (partials.length ? ` Partial bookings:\n${partials.join('\n')}` : '') +
        (denials.length ? ` Denied:\n${denials.join('\n')}` : ''),
    );
    setSelectedEmployees([]);
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
          mode: isWorkforceSupervisor ? 'supervisor' : undefined,
          date: selectedDate,
          supervisorId: selectedSupervisor,
          locationName: selectedLocation,
          workCenterName: selectedWorkCenter,
        }),
      });
      const json = await readApiJson(res);
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

  const handleSave = async (isSubmit = false, saveAsDraft = false) => {
    setError(null);
    setNotice(null);
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
          action: isSubmit ? 'SUBMIT' : saveAsDraft ? 'SAVE_DRAFT' : 'MATRIX_SAVE',
          mode: isWorkforceSupervisor ? 'supervisor' : undefined,
          locationName: selectedLocation,
          headerId: payload?.header?.id,
          lines: localLines.map(reconcileTimesheetLineHours),
        }),
      });
      const json = await readApiJson(res);
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Save failed');
      setPayload(json.data);
      setLocalLines(json.data.lines);
      if (isSubmit) {
        setShowSubmitReview(false);
        setSelectedEmployees([]);
        setQuery('');
        setBulkProject('');
        setBulkHours(timesheetDayRulesForDate(selectedDate, payload?.holidayDates ?? []).standardProductiveHours);
        setNotice('Timesheet submitted for supervisor review. Capture fields are now locked until the sheet is returned or rejected.');
      } else if (saveAsDraft) {
        setNotice('Draft saved. You can continue editing this timesheet before submission.');
      } else {
        setNotice('Changes saved.');
      }
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
          mode: isWorkforceSupervisor ? 'supervisor' : undefined,
          locationName: selectedLocation,
          headerId: payload?.header?.id,
          bulkAllocation: {
            employeeIds: selectedEmployees,
            projectCode: bulkProject,
            hours: bulkHours,
          },
        }),
      });
      const json = await readApiJson(res);
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
          mode: isWorkforceSupervisor ? 'supervisor' : undefined,
          locationName: selectedLocation,
          headerId: payload.header.id,
        }),
      });
      const json = await readApiJson(res);
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Action failed');
      setPayload(json.data);
      setLocalLines(json.data.lines);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setSubmitting(false);
    }
  };

  const resetProjectForm = () => {
    setEditingProjectId(null);
    setNewProjectCode('');
    setNewProjectName('');
    setNewProjectClientName('');
    setNewProjectSite('');
    setNewProjectManager('');
  };

  const openCreateProjectModal = () => {
    resetProjectForm();
    setShowProjectModal(true);
  };

  const openEditProjectModal = (project: Project) => {
    setEditingProjectId(project.id);
    setNewProjectCode(project.code);
    setNewProjectName(project.name);
    setNewProjectClientName(project.clientName || '');
    setNewProjectSite(project.site);
    setNewProjectManager(project.projectManager);
    setShowProjectModal(true);
  };

  const closeProjectModal = () => {
    setShowProjectModal(false);
    resetProjectForm();
  };

  const handleSaveProject = async () => {
    const projectCode = newProjectCode.trim();
    const projectName = newProjectName.trim();
    const clientName = newProjectClientName.trim();
    const projectManager = newProjectManager.trim();
    const projectManagerExists = (payload?.projectManagers ?? []).some((employee) => `${employee.employeeCode} - ${employee.fullName}`.toLowerCase() === projectManager.toLowerCase());
    if (!projectCode || !projectName || !clientName || !newProjectSite || !projectManager) return;
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
          action: editingProjectId ? 'UPSERT_PROJECT' : 'CREATE_PROJECT',
          mode: isWorkforceSupervisor ? 'supervisor' : undefined,
          date: selectedDate,
          supervisorId: selectedSupervisor,
          locationName: selectedLocation,
          workCenterName: selectedWorkCenter,
          project: {
            id: editingProjectId || undefined,
            code: projectCode,
            name: projectName,
            clientName,
            site: newProjectSite,
            projectManager,
            status: 'Active',
          },
        }),
      });
      const json = await readApiJson(res);
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Failed to save project');
      setPayload(json.data);
      closeProjectModal();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save project');
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

  const moveProjectColumn = (colIdx: number, direction: -1 | 1) => {
    const target = colIdx + direction;
    if (target < 0 || target >= matrixColumns.length) return;
    const next = [...matrixColumns];
    const [item] = next.splice(colIdx, 1);
    next.splice(target, 0, item);
    setMatrixColumns(next);
  };

  const handleAutoDistribute = () => {
    if (!payload || payload.period.status !== 'Open' || !editableTimesheetStatuses.includes(payload.header?.status ?? 'Draft') || matrixColumns.length === 0) return;
    const dayRules = timesheetDayRulesForDate(selectedDate, payload.holidayDates ?? []);
    const dayContext = { date: selectedDate, holidayDates: payload.holidayDates ?? [], shiftLabel: selectedShift };
    const next = localLines.map((line) => {
      if (!line.clockIn) return line;
      const projectAllocations = matrixColumns.map((col, index) => ({
        projectId: col.code,
        projectCode: col.code,
        projectName: col.label || col.code,
        hours: index === 0 ? dayRules.standardProductiveHours : 0,
        remarks: null,
      }));
      const usedHours = round1(projectAllocations.reduce((sum, item) => sum + item.hours, 0));
      const idleAllocations = [{ reasonId: DEFAULT_BREAK_IDLE_REASON_ID, reasonName: DEFAULT_BREAK_IDLE_REASON_NAME, hours: DAILY_BREAK_HOURS, remarks: null }];
      const idleHours = DAILY_BREAK_HOURS;
      const totalHours = round1(usedHours + idleHours);
      const draft = applyTimesheetLineDefaults(
        {
          ...line,
          projectAllocations,
          idleAllocations,
          usedHours,
          idleHours,
          totalHours,
          variance: round1(totalHours - dayRules.grossHours),
          validationStatus: 'Incomplete',
          validationMessage: null,
        } as TimesheetLine,
        dayContext,
        matrixColumns.map((col) => col.code),
      );
      return draft;
    });
    setLocalLines(next);
    setNotice(`Standard ${dayRules.standardProductiveHours}h booked on the first project column. Split hours across columns manually as needed.`);
  };

  const handleClearAllProjects = () => {
    if (!payload || payload.period.status !== 'Open' || !editableTimesheetStatuses.includes(payload.header?.status ?? 'Draft')) return;
    const dayRules = timesheetDayRulesForDate(selectedDate, payload.holidayDates ?? []);
    const next = localLines.map((line) => {
      const projectAllocations = line.projectAllocations.map((item) => ({ ...item, hours: 0 }));
      const usedHours = 0;
      const totalHours = round1(usedHours + line.idleHours);
      return {
        ...line,
        projectAllocations,
        usedHours,
        totalHours,
        variance: round1(totalHours - dayRules.grossHours),
        validationStatus: 'Incomplete',
        validationMessage: `Awaiting full ${dayRules.grossHours}-hour allocation including ${DAILY_BREAK_HOURS}h break.`,
      } as TimesheetLine;
    });
    setLocalLines(next);
    setNotice('Project allocations cleared for all employees.');
  };

  const removeProjectColumn = (colIdx: number) => {
    const colToRemove = matrixColumns[colIdx];
    const dayRules = timesheetDayRulesForDate(selectedDate, payload?.holidayDates ?? []);
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
        variance: round1(totalHours - dayRules.grossHours),
        validationStatus: usedHours > dayRules.standardProductiveHours + 0.001 || totalHours > dayRules.grossHours + 0.001 ? 'Error' : (totalHours === dayRules.grossHours && usedHours === dayRules.standardProductiveHours ? 'Valid' : 'Incomplete')
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

  useEffect(() => {
    if (!isEnterprise || localLines.length === 0) return;
    setSelectedLineId((current) => current && localLines.some((line) => line.id === current) ? current : localLines[0]?.id || null);
  }, [isEnterprise, localLines]);

  const isSuperAdministrator = isSuperAdministratorRole(payload?.permissions.role ?? '');

  useEffect(() => {
    if (!isEnterprise || !isSuperAdministrator) {
      setDailyPayPanel(null);
      return;
    }
    const line = localLines.find((item) => item.id === selectedLineId) || localLines[0];
    if (!line || !/^C/i.test(line.employeeNo)) {
      setDailyPayPanel(null);
      return;
    }
    void fetch('/api/hris/payroll/daily-rate-pay', { headers: { 'x-hris-role': 'Payroll Officer' }, cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => {
        const row = json.data?.records?.find((item: { employeeId: string }) => item.employeeId === line.employeeNo) || null;
        if (!row) {
          setDailyPayPanel({
            employeeId: line.employeeNo,
            payMode: 'Daily',
            dayRate: 0,
            hourRate: 0,
            paidHoursPerDay: 8,
            payrollGroup: 'DLE',
            location: selectedLocation,
            workCenter: selectedWorkCenter,
            timesheetDays: 0,
            calculatedPay: 0,
          });
          return;
        }
        setDailyPayPanel({
          employeeId: row.employeeId,
          payMode: row.payMode || 'Daily',
          dayRate: Number(row.dayRate || row.ratePerDay || 0),
          hourRate: Number(row.hourRate || row.ratePerHour || 0),
          paidHoursPerDay: Number(row.paidHoursPerDay || row.hoursPerDay || 8),
          payrollGroup: row.payrollGroup || 'DLE',
          location: row.location || selectedLocation,
          workCenter: row.workCenter || selectedWorkCenter,
          timesheetDays: Number(row.timesheetDays || row.daysWorked || 0),
          calculatedPay: Number(row.calculatedPay || row.periodPay || 0),
        });
      })
      .catch(() => setDailyPayPanel(null));
  }, [isEnterprise, isSuperAdministrator, localLines, selectedLineId, selectedLocation, selectedWorkCenter]);

  if (loading && !payload) {
    if (isEnterprise) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC]">
          <RefreshCcw className="h-8 w-8 animate-spin text-[#94A3B8]" />
        </div>
      );
    }
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

  const workCenterOptions = workCenterNamesForLocation(workCenters, selectedLocation);
  const locationOptions = Array.from(new Set((payload?.filterOptions.locations ?? []).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const siteLocationOptions = (databaseProjectSites.length ? databaseProjectSites : payload?.filterOptions.projectSites ?? [])
    .filter((location) => location && location !== 'Unassigned Location')
    .sort((a, b) => a.localeCompare(b));
  const projectManagerOptions = payload?.projectManagers ?? [];
  const projectManagerIsSelected = projectManagerOptions.some((employee) => `${employee.employeeCode} - ${employee.fullName}`.toLowerCase() === newProjectManager.trim().toLowerCase());
  const workflowStages = payload?.workflowStages ?? [];
  const currentStageIdx = Math.max(0, workflowStages.findIndex(s => s.id === payload?.header?.status));
  const workflowProgressPct = workflowStages.length > 1 ? (currentStageIdx / (workflowStages.length - 1)) * 100 : 0;
  const summary = payload?.summary ?? {
    totalEmployees: 0,
    presentEmployees: 0,
    absentEmployees: 0,
    onLeaveEmployees: 0,
    sickEmployees: 0,
    notSyncedEmployees: 0,
    bookedHours: 0,
    usedHours: 0,
    idleHours: 0,
    productivityPct: 0,
    pendingApprovals: 0,
  };
  const pctOfCrew = (value: number) => (summary.totalEmployees > 0 ? (value / summary.totalEmployees) * 100 : 0);
  const periodStatus = payload?.period.status ?? 'Open';
  const displayPeriod = payload?.period.startDate && payload.period.endDate ? payload.period : fallbackPeriodForDate(selectedDate);
  const dayRules = timesheetDayRulesForDate(selectedDate, payload?.holidayDates ?? []);
  const grossTimesheetHours = dayRules.grossHours;
  const standardTimesheetHours = dayRules.standardProductiveHours;
  const periodLabel = `${formatPeriodDate(displayPeriod.startDate)} to ${formatPeriodDate(displayPeriod.endDate)}`;
  const periodIsOpen = periodStatus === 'Open';
  const headerStatus = payload?.header?.status ?? 'Draft';
  const isPayrollReady = payrollReadyStatuses.includes(headerStatus);
  const overtimeBooking = payload?.overtimeBooking ?? { enabled: false, devRelaxed: false, retroCorrection: false, openBooking: false };
  const approvedOvertimeAuthorizations = overtimeBooking.enabled ? (payload?.approvedOvertimeAuthorizations ?? []) : [];
  const canEditTimesheet = periodIsOpen && editableTimesheetStatuses.includes(headerStatus);
  const canBookOvertime =
    payload?.canBookOvertime ??
    canBookOvertimeOnTimesheet(payload?.header, payload?.period, overtimeBooking);
  const showCaptureMatrix = canEditTimesheet || canBookOvertime;
  const payrollLockMessage = /payroll-ready|cannot be edited/i;
  const displayError = error && canBookOvertime && payrollLockMessage.test(error) ? null : error;
  const displayNotice =
    notice ||
    (error && canBookOvertime && payrollLockMessage.test(error)
      ? 'Timesheet is posted to payroll. Use the overtime booking bar below to add 1h, 2h, 3h corrections, then re-run payroll.'
      : null);
  const activeSiteDevices = payload?.attendanceWorkCenters.filter((workCenter) => workCenter.location === selectedLocation || workCenter.site === selectedLocation) ?? [];
  const onlineSiteDevices = activeSiteDevices;
  const primarySiteDevice = [...activeSiteDevices].sort((a, b) => {
    return a.deviceName.localeCompare(b.deviceName);
  })[0];
  const lastHandshakeAt = payload?.biometricDevices
    .filter((device) => device.location === selectedLocation || device.site === selectedLocation)
    .map((device) => device.lastSyncAt)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  const matchedPunches = payload?.summary.presentEmployees ?? 0;
  const exceptionPunches = payload?.summary.absentEmployees ?? 0;
  const supervisorDirectory = payload?.filterOptions.supervisorDirectory ?? [];
  const supervisorDirectoryItem = supervisorDirectory.find((item) => item.value === selectedSupervisor);
  const supervisorLabel = supervisorDirectoryItem?.label || selectedSupervisor || payload?.permissions.actor || 'Select supervisor';
  const supervisorProfile = payload?.supervisorProfile ?? null;
  const supervisorJobTitle = supervisorProfile?.jobTitle || supervisorDirectoryItem?.jobTitle || '';
  const supervisorDepartment = supervisorProfile?.department || supervisorDirectoryItem?.department || '';
  const supervisorEmployees = payload?.supervisorEmployees ?? [];
  const reviewLineCount = localLines.length;
  const reviewValidCount = localLines.filter((line) => line.validationStatus === 'Valid').length;
  const reviewWarningCount = localLines.filter((line) => line.validationStatus === 'Warning' || line.validationStatus === 'Incomplete').length;
  const reviewErrorCount = localLines.filter((line) => line.validationStatus === 'Error').length;
  const reviewAbsentCount = localLines.filter((line) => !line.clockIn).length;
  const reviewProjectHours = round1(localLines.reduce((sum, line) => sum + line.usedHours, 0));
  const reviewIdleHours = round1(localLines.reduce((sum, line) => sum + line.idleHours, 0));
  const reviewTotalHours = round1(localLines.reduce((sum, line) => sum + line.totalHours, 0));
  const reviewProjectCodes = Array.from(new Set(localLines.flatMap((line) => line.projectAllocations.map((item) => item.projectCode).filter(Boolean)))).sort();
  const canOpenSubmitReview = canEditTimesheet && reviewLineCount > 0 && reviewErrorCount === 0;
  const canManageTimesheetSetup = Boolean(payload?.permissions.canManagePeriod);
  const pageTitle = isWorkforceSupervisor ? 'Workforce Timesheet Entry' : 'Timesheet Entry';
  const pageDescription = isWorkforceSupervisor
    ? 'Record daily crew work hours for your assigned employees.'
    : 'Record daily work hour allocations across projects and tasks.';
  const pageBreadcrumbs = isWorkforceSupervisor
    ? [{ label: 'HRIS', href: '/hris' }, { label: 'Workforce Management', href: '/hris/workforce-management' }, { label: 'Timesheet Entry' }]
    : [{ label: 'HRIS', href: '/hris' }, { label: 'Time & Logs', href: '/hris/time-and-logs' }, { label: 'Timesheet Entry' }];
  const primaryPageAction = isWorkforceSupervisor
    ? (canEditTimesheet ? { label: 'Sync Attendance', onClick: () => handleSyncAttendance('manual'), icon: RefreshCcw } : undefined)
    : { label: canEditTimesheet ? 'Sync Attendance' : periodIsOpen ? 'Read Only' : 'Period Closed', onClick: canEditTimesheet ? () => handleSyncAttendance('manual') : () => undefined, icon: RefreshCcw };
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

  const bookedHoursTotal = round1(localLines.reduce((sum, line) => sum + line.totalHours, 0));
  const capacityHours = round1(summary.presentEmployees * grossTimesheetHours);
  const remainingHours = round1(Math.max(0, capacityHours - bookedHoursTotal));
  const exceptionCount = localLines.filter((line) => line.validationStatus === 'Error' || line.validationStatus === 'Warning').length;
  const submittedCount = localLines.filter((line) => line.validationStatus === 'Valid').length;
  const footerTotals = {
    duration: round1(localLines.reduce((sum, line) => sum + line.attendanceDuration, 0)),
    projectTotals: matrixColumns.map((col) => round1(localLines.reduce((sum, line) => sum + (line.projectAllocations.find((p) => p.projectCode === col.code)?.hours || 0), 0))),
    used: round1(localLines.reduce((sum, line) => sum + line.usedHours, 0)),
    idle: round1(localLines.reduce((sum, line) => sum + line.idleHours, 0)),
    total: bookedHoursTotal,
    variance: round1(localLines.reduce((sum, line) => sum + line.variance, 0)),
  };
  const readinessScore = summary.totalEmployees > 0 ? Math.round((submittedCount / summary.totalEmployees) * 100) : 0;

  return (
    <>
      {isEnterprise ? (
        <TimesheetEntryEnterpriseView
          periodLabel={periodLabel}
          periodIsOpen={periodIsOpen}
          selectedDate={selectedDate}
          selectedShift={selectedShift}
          shiftOptions={payload?.filterOptions.shifts ?? []}
          supervisorLabel={supervisorLabel}
          supervisorOptions={(payload?.filterOptions.supervisors || []).map((value) => {
            const item = supervisorDirectory.find((entry) => entry.value === value);
            return {
              value,
              label: item?.label || value,
              searchText: `${value} ${item?.label || ''} ${item?.employeeCode || ''} ${item?.fullName || ''}`,
            };
          })}
          locationOptions={locationOptions}
          workCenterOptions={workCenterOptions}
          selectedSupervisor={selectedSupervisor}
          selectedLocation={selectedLocation}
          selectedWorkCenter={selectedWorkCenter}
          onSupervisorChange={(value) => {
            setSelectedSupervisor(value);
            setSelectedEmployees([]);
            setQuery('');
          }}
          onLocationChange={(value) => {
            setSelectedLocation(value);
            setSelectedEmployees([]);
            setQuery('');
          }}
          onWorkCenterChange={(value) => {
            setSelectedWorkCenter(value);
            setSelectedEmployees([]);
            setQuery('');
          }}
          onDateChange={setSelectedDate}
          onShiftChange={(value) => {
            const shift = resolveTimesheetShift(value);
            setSelectedShift(shift.label);
            setNotice(
              shift.kind === 'Night'
                ? 'Night shift selected: book 8h for 18:00–02:00. Hours after 02:00 until clock-out are overtime.'
                : 'Day shift selected: book 8h for the standard day. Hours after 17:00 until clock-out are overtime.',
            );
          }}
          shiftHint={resolveTimesheetShift(selectedShift).description}
          canManagePeriod={canManageTimesheetSetup}
          canEditTimesheet={canEditTimesheet}
          canBookOvertime={canBookOvertime}
          showCaptureMatrix={showCaptureMatrix}
          submitting={submitting}
          refreshing={refreshing}
          error={displayError}
          notice={displayNotice}
          query={query}
          onQueryChange={setQuery}
          filteredLines={filteredLines}
          localLines={localLines}
          matrixColumns={matrixColumns}
          projects={payload?.projects ?? []}
          payloadProjects={payload?.projects ?? []}
          idleReasons={payload?.idleReasons ?? []}
          selectedEmployees={selectedEmployees}
          onToggleAllEmployees={(checked) => {
            if (checked) setSelectedEmployees(filteredLines.map((line) => line.employeeId));
            else setSelectedEmployees([]);
          }}
          onToggleEmployee={(employeeId, checked) => {
            if (checked) setSelectedEmployees([...selectedEmployees, employeeId]);
            else setSelectedEmployees(selectedEmployees.filter((id) => id !== employeeId));
          }}
          onSelectEmployees={setSelectedEmployees}
          selectedLineId={selectedLineId}
          onSelectLine={setSelectedLineId}
          onUpdateLine={(index, updates) => handleUpdateLine(index, updates as Partial<TimesheetLine>)}
          onAddProjectColumn={addProjectColumn}
          onMoveProjectColumn={moveProjectColumn}
          onRemoveProjectColumn={removeProjectColumn}
          onSelectColumnProject={updateColumnProject}
          onAutoDistribute={handleAutoDistribute}
          onClearAllProjects={handleClearAllProjects}
          onOpenProjectSettings={() => setShowProjectModal(true)}
          onSyncAttendance={() => handleSyncAttendance('manual')}
          onCopyPrevious={handleCopyPrevious}
          onSaveDraft={() => handleSave(false, true)}
          onOpenSubmitReview={() => setShowSubmitReview(true)}
          onBulkOpen={() => setShowBulkModal(true)}
          canOpenSubmitReview={canOpenSubmitReview}
          showEmployeeDetailsPanel={isSuperAdministrator}
          approvedOvertimeAuthorizations={approvedOvertimeAuthorizations}
          onBookApprovedOvertime={handleBookApprovedOvertime}
          summary={{
            totalEmployees: summary.totalEmployees,
            bookedHours: bookedHoursTotal,
            usedHours: summary.usedHours,
            idleHours: summary.idleHours,
            productivityPct: summary.productivityPct,
          }}
          exceptionCount={exceptionCount}
          submittedCount={submittedCount}
          remainingHours={remainingHours}
          capacityHours={capacityHours}
          rightPanelTab={rightPanelTab}
          onRightPanelTabChange={setRightPanelTab}
          dailyPay={dailyPayPanel}
          readiness={{
            score: readinessScore,
            readyDays: submittedCount,
            issuesFound: exceptionCount,
            blockingIssues: reviewErrorCount,
          }}
          onSaveTimesheetSetup={() => handleSave(false, true)}
          defaultIdleReasonId={DEFAULT_BREAK_IDLE_REASON_ID}
          defaultIdleReasonName={DEFAULT_BREAK_IDLE_REASON_NAME}
          grossTimesheetHours={grossTimesheetHours}
          standardTimesheetHours={standardTimesheetHours}
          footerTotals={footerTotals}
        />
      ) : (
    <PageTemplate
      title={pageTitle}
      description={pageDescription}
      breadcrumbs={pageBreadcrumbs}
      primaryAction={primaryPageAction}
      secondaryAction={canManageTimesheetSetup ? { label: 'Create Project', onClick: openCreateProjectModal, icon: Plus } : undefined}
    >
      <div className="space-y-8">
        {/* Header Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-6 border-b border-slate-100 pb-6">
            <div className="space-y-1">
              <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase">{pageTitle}</h1>
              <div className="flex items-center gap-3 text-sm font-bold text-slate-500">
                <span className="flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-indigo-700">
                  <Clock className="h-3.5 w-3.5" /> Period: {periodLabel}
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
              {canManageTimesheetSetup ? (
                <Link href="/hris/time-and-logs/timesheet-period" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-white">
                  Manage Periods
                </Link>
              ) : null}
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Supervisor</p>
                <SearchablePicker
                  value={selectedSupervisor}
                  options={(payload?.filterOptions.supervisors || []).map((s) => {
                    const item = supervisorDirectory.find((entry) => entry.value === s);
                    return { value: s, label: item?.label || s, searchText: `${s} ${item?.label || ''} ${item?.employeeCode || ''} ${item?.fullName || ''}` };
                  })}
                  placeholder="Search supervisor"
                  className="max-w-[280px]"
                  onChange={(value) => {
                    setSelectedSupervisor(value);
                    setSelectedEmployees([]);
                    setQuery('');
                  }}
                />
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Location</p>
                <SearchablePicker
                  value={selectedLocation}
                  options={locationOptions.map((location) => ({ value: location, label: location }))}
                  placeholder={locationOptions.length === 0 ? 'No location' : 'Search location'}
                  className="max-w-[220px]"
                  onChange={(value) => {
                    setSelectedLocation(value);
                    setSelectedEmployees([]);
                    setQuery('');
                  }}
                />
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Work Center</p>
                <div className="flex items-center justify-end gap-2">
                  {workCenterOptions.length > 0 ? (
                    <SearchablePicker
                      value={selectedWorkCenter}
                      options={workCenterOptions.map((workCenter) => ({ value: workCenter, label: workCenter }))}
                      placeholder="Search work center"
                      className="max-w-[220px]"
                      onChange={(value) => {
                        setSelectedWorkCenter(value);
                        setSelectedEmployees([]);
                        setQuery('');
                      }}
                    />
                  ) : (
                    <span className="block max-w-[180px] truncate text-sm font-black text-slate-900">
                      No work center
                    </span>
                  )}
                  {canManageTimesheetSetup ? (
                    <button
                      type="button"
                      onClick={() => setShowWorkCenterManager(true)}
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 hover:text-indigo-600"
                      title="Manage work centers"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
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
              {workflowStages.map((stage, idx) => (
                <div key={stage.id} className="relative z-10 flex flex-col items-center gap-2">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-all ${idx <= currentStageIdx ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-400'}`}>
                    {idx < currentStageIdx ? <CheckCircle2 className="h-4 w-4" /> : stage.order}
                  </div>
                  <span className={`text-[10px] font-black uppercase tracking-tighter ${idx <= currentStageIdx ? 'text-indigo-700' : 'text-slate-400'}`}>{stage.label}</span>
                </div>
              ))}
              <div className="absolute top-4 left-0 h-0.5 w-full -translate-y-1/2 bg-slate-100">
                <div className="h-full bg-indigo-600 transition-all duration-500" style={{ width: `${workflowProgressPct}%` }} />
              </div>
            </div>
          </div>
        </div>

        {(error || notice) && (
          <div className={`rounded-xl border px-4 py-3 text-sm font-bold ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            {error || notice}
          </div>
        )}

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
              {canManageTimesheetSetup ? (
                <Link href="/hris/time-and-logs/timesheet-period" className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white hover:bg-slate-800">
                  Manage Period
                </Link>
              ) : null}
            </div>
          </div>
        )}

        {canBookOvertime && !canEditTimesheet && payload?.header ? (
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-sky-600 p-2 text-white"><Info className="h-4 w-4" /></div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-sky-900">Overtime Correction Mode</h3>
                <p className="mt-1 text-xs font-semibold text-sky-800">
                  This timesheet is approved or posted to payroll. Use the overtime bar to book 1h, 2h, 3h, etc. for selected employees — changes save immediately and refresh the payroll feed for reprocessing.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {periodIsOpen && !canEditTimesheet && !canBookOvertime && payload?.header && (
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
                      : 'This timesheet has been submitted for approval. Capture fields are locked and can only be edited again if it is returned or rejected.'}
                  </p>
                </div>
              </div>
              {!isWorkforceSupervisor ? (
                <Link href="/hris/time-and-logs/timesheet-approval" className={`rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white ${isPayrollReady ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-indigo-700 hover:bg-indigo-800'}`}>
                  Approval Workflow
                </Link>
              ) : null}
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-sky-700/70">Selected Supervisor</p>
              <h3 className="mt-1 text-lg font-black text-slate-950">{supervisorLabel}</h3>
              {supervisorJobTitle && (
                <p className="mt-1 text-sm font-black text-sky-800">{supervisorJobTitle}</p>
              )}
              <p className="mt-1 text-xs font-semibold text-slate-600">
                {supervisorEmployees.length ? `${supervisorEmployees.length} employee${supervisorEmployees.length === 1 ? '' : 's'} assigned for ${selectedLocation || 'all locations'}${selectedWorkCenter ? ` / ${selectedWorkCenter}` : ''}.` : 'No employees match this supervisor, location, and work center selection.'}
              </p>
            </div>
            <span className="rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-black text-sky-800">{supervisorEmployees.length} assigned</span>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 xl:grid-cols-3">
            {supervisorProfile ? (
              <div className="rounded-xl border border-sky-200 bg-white p-3 ring-1 ring-sky-100">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-sky-700">Supervisor Detail</p>
                  <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-black text-sky-800">{supervisorProfile.status || 'Unknown'}</span>
                </div>
                <div className="mt-2 text-xs font-black text-slate-950">{supervisorProfile.employeeCode} - {supervisorProfile.fullName}</div>
                <div className="mt-1 text-[11px] font-semibold text-slate-600">{supervisorProfile.jobTitle || 'Unassigned role'} / {supervisorProfile.department || 'Unassigned department'}</div>
                <div className="mt-1 text-[11px] font-semibold text-slate-500">{supervisorProfile.location || 'No location'}</div>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-white p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Supervisor Detail</p>
                <div className="mt-2 text-xs font-black text-slate-950">{supervisorLabel}</div>
                <div className="mt-1 text-[11px] font-semibold text-slate-600">{supervisorJobTitle || 'Unassigned role'}{supervisorDepartment ? ` / ${supervisorDepartment}` : ''}</div>
                {!supervisorJobTitle && <div className="mt-1 text-[11px] font-semibold text-slate-500">Supervisor profile is not linked to an employee record yet.</div>}
              </div>
            )}
            <div className="xl:col-span-2">
              {supervisorEmployees.length ? (
                <div className="grid max-h-[260px] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {supervisorEmployees.map((employee) => (
                <div key={employee.employeeCode} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="text-xs font-black text-slate-950">{employee.employeeCode} - {employee.fullName}</div>
                  <div className="mt-1 text-[11px] font-semibold text-slate-600">{employee.jobTitle || 'Unassigned role'} / {employee.department || 'Unassigned department'}</div>
                  <div className="mt-1 text-[11px] font-semibold text-slate-500">{employee.location || 'No location'} / {employee.status || 'Unknown status'}</div>
                </div>
              ))}
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs font-bold text-slate-500">
                  No assigned employees found for the selected filters.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Dashboard Metrics */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {[
            { label: 'Total Crew', value: summary.totalEmployees, color: 'indigo' },
            { label: 'Present', value: summary.presentEmployees, color: 'emerald', pct: pctOfCrew(summary.presentEmployees) },
            { label: 'Absent', value: summary.absentEmployees, color: 'red', pct: pctOfCrew(summary.absentEmployees) },
            { label: 'On Leave', value: summary.onLeaveEmployees, color: 'amber' },
            { label: 'Productive Hrs', value: summary.usedHours, color: 'blue', sub: `${summary.productivityPct}% Productivity` },
            { label: 'Idle Hrs', value: summary.idleHours, color: 'slate', sub: `${round1(100 - summary.productivityPct)}% Idle Rate` },
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
            <button onClick={() => handleSyncAttendance('manual')} disabled={submitting || !canEditTimesheet} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50">
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
            {selectedEmployees.length > 0 && periodIsOpen && showCaptureMatrix && (
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
            <Link href="/hris/time-and-logs/timesheet-approval" className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-50">SUBMITTED STATUS</Link>
            <Link href="/hris/time-and-logs/timesheet-reports" className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-50">REPORTS</Link>
            <button onClick={handleCopyPrevious} disabled={submitting || !canEditTimesheet} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Copy className="h-3.5 w-3.5" />COPY PREVIOUS</button>
            <button onClick={() => handleSave(false, true)} disabled={submitting || !canEditTimesheet} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50">SAVE DRAFT</button>
            <button onClick={() => setShowSubmitReview(true)} disabled={submitting || !canOpenSubmitReview} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-xs font-black text-white hover:bg-indigo-700 disabled:opacity-50"><ShieldCheck className="h-3.5 w-3.5" />REVIEW & SUBMIT</button>
          </div>
        </div>

        {!showCaptureMatrix && payload?.header ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Submitted Timesheet Summary</p>
                <h3 className="mt-1 text-base font-black text-slate-950">{payload.header.workCenterName} / {payload.header.timesheetDate}</h3>
              </div>
              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-800">{headerStatus.replace(/_/g, ' ')}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-white">
                    {['Employee', 'Log', 'Duration', 'Productive Hrs', 'Idle / Break Hrs', 'Total Hrs', 'Variance', 'Status'].map((header) => (
                      <th key={header} className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLines.map((line, rowIndex) => (
                    <tr key={line.id} className={line.validationStatus === 'Valid' ? 'bg-emerald-50/30' : 'bg-white'}>
                      <td className="px-4 py-4">
                        <div className="flex items-start gap-3">
                          <span className="min-w-7 rounded-md bg-slate-100 px-2 py-1 text-center text-[10px] font-black text-slate-600">{rowIndex + 1}</span>
                          <div>
                            <div className="text-[9px] font-black uppercase tracking-widest text-indigo-600">{line.employeeNo}</div>
                            <div className="mt-1 text-[13px] font-black text-slate-900">{line.employeeName}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-[11px] font-black text-slate-700">{line.clockIn ? `${line.clockIn} - ${line.clockOut || '--:--'}` : 'Absent'}</td>
                      <td className="px-4 py-4 text-center text-xs font-black text-slate-700">{line.attendanceDuration}h</td>
                      <td className="px-4 py-4 text-center text-xs font-black text-blue-700">{line.usedHours}h</td>
                      <td className="px-4 py-4 text-center text-xs font-black text-amber-700">{line.idleHours}h</td>
                      <td className="px-4 py-4 text-center text-xs font-black text-emerald-700">{line.totalHours}h</td>
                      <td className="px-4 py-4 text-center text-xs font-black text-slate-700">{line.variance > 0 ? `+${line.variance}` : line.variance}</td>
                      <td className="px-4 py-4 text-center">
                        <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${line.validationStatus === 'Valid' ? 'bg-emerald-100 text-emerald-700' : line.validationStatus === 'Error' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          {line.validationStatus === 'Valid' ? 'Complete' : line.validationStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : viewMode === 'matrix' ? (
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
                  {filteredLines.map((line, rowIndex) => {
                    const isAbsent = !line.clockIn;
                    const originalIdx = localLines.findIndex(l => l.id === line.id);
                    return (
                      <tr key={line.id} className={`hover:bg-slate-50/80 transition-colors ${isAbsent ? 'bg-slate-50/30' : line.validationStatus === 'Valid' ? 'bg-emerald-50/30' : line.validationStatus === 'Error' ? 'bg-red-50/30' : 'bg-white'}`}>
                        <td className={`sticky left-0 z-10 px-4 py-4 border-r border-slate-100 shadow-[2px_0_5px_rgba(0,0,0,0.03)] ${isAbsent ? 'bg-slate-50' : line.validationStatus === 'Valid' ? 'bg-[#f0fdf4]' : line.validationStatus === 'Error' ? 'bg-[#fef2f2]' : 'bg-white'}`}>
                          <div className="flex items-center gap-3 min-w-max">
                            <span className="min-w-7 rounded-md bg-slate-100 px-2 py-1 text-center text-[10px] font-black text-slate-600">{rowIndex + 1}</span>
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
                          <td key={col.code} className="px-4 py-4 border-l border-slate-100"><input type="number" step="0.5" disabled={!canEditTimesheet || isAbsent} value={isAbsent ? 0 : line.projectAllocations.find(p => p.projectCode === col.code)?.hours || ''} onChange={(e) => {
                            const idleHours = line.idleHours || DAILY_BREAK_HOURS;
                            const maxTotal = matrixProductiveHoursCap(line, line.usedHours, standardTimesheetHours, idleHours);
                            const projectAllocations = upsertMatrixProjectHours(
                              line.projectAllocations,
                              col.code,
                              col.label,
                              parseFloat(e.target.value) || 0,
                              maxTotal,
                            );
                            handleUpdateLine(originalIdx, { projectAllocations });
                          }} className={`w-full rounded-lg border border-slate-200 py-1.5 text-center text-xs font-black focus:border-indigo-500 ${isAbsent ? 'bg-slate-100 text-slate-400' : ''}`} /></td>
                        ))}
                        <td className="px-4 py-4 border-l border-slate-100"></td>
                        <td className="px-4 py-4 text-center font-black text-blue-700 bg-blue-50/20">{line.usedHours}</td>
                        <td className="px-4 py-4 bg-amber-50/20 border-l border-slate-100"><div className="flex flex-col gap-2">{(line.idleAllocations.length === 0 ? [{ reasonId: DEFAULT_BREAK_IDLE_REASON_ID, reasonName: DEFAULT_BREAK_IDLE_REASON_NAME, hours: 0, remarks: null }] : line.idleAllocations).map((alloc, iIdx) => (
                          <div key={iIdx} className="flex items-center gap-1.5"><input type="number" step="0.5" placeholder="Hrs" disabled={!canEditTimesheet} value={alloc.hours || ''} onChange={(e) => {
                            const next = [...line.idleAllocations];
                            if (next[iIdx]) next[iIdx].hours = parseFloat(e.target.value) || 0;
                            else next.push({ reasonId: DEFAULT_BREAK_IDLE_REASON_ID, reasonName: DEFAULT_BREAK_IDLE_REASON_NAME, hours: parseFloat(e.target.value) || 0, remarks: null });
                            handleUpdateLine(originalIdx, { idleAllocations: next });
                          }} className="w-12 rounded-lg border border-slate-200 py-1 text-center text-[10px] font-black" />
                          <select value={alloc.reasonId || DEFAULT_BREAK_IDLE_REASON_ID} disabled={!canEditTimesheet} onChange={(e) => {
                            const reason = payload?.idleReasons.find((item) => item.id === e.target.value);
                            const next = [...line.idleAllocations];
                            if (next[iIdx]) next[iIdx] = { ...next[iIdx], reasonId: e.target.value, reasonName: reason?.name || DEFAULT_BREAK_IDLE_REASON_NAME };
                            handleUpdateLine(originalIdx, { idleAllocations: next });
                          }} className="flex-1 rounded-lg border border-slate-200 py-1 text-[9px] font-bold">
                            {payload?.idleReasons.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </select>
                          {iIdx === line.idleAllocations.length - 1 && canEditTimesheet && <button onClick={() => handleUpdateLine(originalIdx, { idleAllocations: [...line.idleAllocations, { reasonId: DEFAULT_BREAK_IDLE_REASON_ID, reasonName: DEFAULT_BREAK_IDLE_REASON_NAME, hours: 0, remarks: null }] })} className="p-1 text-slate-400 hover:text-indigo-600"><Plus className="h-3 w-3" /></button>}</div>
                        ))}</div></td>
                        <td className="px-4 py-4 text-center bg-indigo-50/20"><span className={`font-black ${line.totalHours === grossTimesheetHours ? 'text-emerald-600' : 'text-indigo-600'}`}>{line.totalHours}</span></td>
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
            {paginatedCardLines.map((line, rowIndex) => {
              const originalIdx = localLines.findIndex(l => l.id === line.id);
              const isAbsent = !line.clockIn;
              const displayNumber = employeeCardStart + rowIndex;
              return (
                <div key={line.id} className={`rounded-2xl border p-5 shadow-sm ${employeeCardTone(line)}`}>
                  <div className="mb-4 flex items-center justify-between border-b border-white/60 pb-4">
                    <div className="flex items-center gap-3">
                      <span className="min-w-7 rounded-md bg-white/70 px-2 py-1 text-center text-[10px] font-black text-slate-600 ring-1 ring-slate-200">{displayNumber}</span>
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
                          <input type="number" step="0.5" disabled={!canEditTimesheet || isAbsent} value={isAbsent ? 0 : line.projectAllocations.find(p => p.projectCode === col.code)?.hours || ''} onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            const next = [...line.projectAllocations];
                            const pIdx = next.findIndex(p => p.projectCode === col.code);
                            if (pIdx >= 0) next[pIdx].hours = val;
                            else next.push({ projectId: col.code, projectCode: col.code, projectName: col.label, hours: val, remarks: null });
                            handleUpdateLine(originalIdx, { projectAllocations: next });
                          }} className={`w-14 rounded-lg border border-slate-200 py-1 text-center text-xs font-black ${isAbsent ? 'bg-slate-100 text-slate-400' : ''}`} />
                        </div>
                      ))}
                    </div>
                    <div className="space-y-3">
                      <p className="text-[9px] font-black uppercase text-slate-400">Idle Time</p>
                      {line.idleAllocations.map((alloc, iIdx) => (
                        <div key={iIdx} className="flex items-center gap-2">
                          <select 
                            value={alloc.reasonId || DEFAULT_BREAK_IDLE_REASON_ID} 
                            disabled={!canEditTimesheet}
                            onChange={(e) => {
                              const reason = payload?.idleReasons.find((item) => item.id === e.target.value);
                              const next = [...line.idleAllocations];
                              next[iIdx] = { ...next[iIdx], reasonId: e.target.value, reasonName: reason?.name || DEFAULT_BREAK_IDLE_REASON_NAME };
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
                      {canEditTimesheet && (
                        <button 
                          onClick={() => handleUpdateLine(originalIdx, { idleAllocations: [...line.idleAllocations, { reasonId: DEFAULT_BREAK_IDLE_REASON_ID, reasonName: DEFAULT_BREAK_IDLE_REASON_NAME, hours: 0, remarks: null }] })}
                          className="w-full rounded-lg border border-dashed border-slate-200 py-1.5 text-[10px] font-black text-slate-400 hover:border-indigo-300 hover:text-indigo-600 transition-all"
                        >
                          + ADD IDLE REASON
                        </button>
                      )}
                    </div>
                    <div className="flex justify-between border-t border-slate-100 pt-4 text-center font-black">
                      <div><p className="text-[8px] text-slate-400">USED</p><p className="text-blue-700">{line.usedHours}h</p></div>
                      <div><p className="text-[8px] text-slate-400">IDLE</p><p className="text-amber-700">{line.idleHours}h</p></div>
                      <div><p className="text-[8px] text-slate-400">TOTAL</p><p className={line.totalHours === grossTimesheetHours ? 'text-emerald-600' : 'text-indigo-600'}>{line.totalHours}h</p></div>
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
      </PageTemplate>
      )}

      {showSubmitReview && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-md">
          <div className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 p-6">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Supervisor Review</p>
                <h3 className="mt-1 text-xl font-black text-slate-950">{selectedDate} / {selectedWorkCenter || 'No work center'}</h3>
                <p className="mt-1 text-sm font-semibold text-slate-500">{supervisorLabel}</p>
              </div>
              <button onClick={() => setShowSubmitReview(false)} className="rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700">
                <XCircle className="h-6 w-6" />
              </button>
            </div>
            <div className="max-h-[72vh] overflow-y-auto p-6">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                {[
                  ['Crew', reviewLineCount],
                  ['Complete', reviewValidCount],
                  ['Warnings', reviewWarningCount],
                  ['Errors', reviewErrorCount],
                  ['Absent', reviewAbsentCount],
                  ['Projects', reviewProjectCodes.length],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-2xl font-black text-slate-950">{value}</div>
                    <div className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Project Hours</p>
                  <p className="mt-1 text-xl font-black text-blue-900">{reviewProjectHours}h</p>
                </div>
                <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Idle Hours</p>
                  <p className="mt-1 text-xl font-black text-amber-900">{reviewIdleHours}h</p>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Total Hours</p>
                  <p className="mt-1 text-xl font-black text-emerald-900">{reviewTotalHours}h</p>
                </div>
              </div>
              <div className="mt-5 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-500">Line Review</p>
                  <p className="text-xs font-bold text-slate-400">{reviewProjectCodes.length ? reviewProjectCodes.join(', ') : 'No project allocation'}</p>
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                      <tr>
                        <th className="px-4 py-3">Employee</th>
                        <th className="px-4 py-3">Log</th>
                        <th className="px-4 py-3 text-right">Used</th>
                        <th className="px-4 py-3 text-right">Idle</th>
                        <th className="px-4 py-3 text-right">Total</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {localLines.map((line) => (
                        <tr key={line.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <div className="font-black text-slate-900">{line.employeeName}</div>
                            <div className="text-xs font-bold text-slate-500">{line.employeeNo}</div>
                          </td>
                          <td className="px-4 py-3 text-xs font-bold text-slate-600">{line.clockIn ? `${line.clockIn} - ${line.clockOut || '--:--'}` : 'Absent'}</td>
                          <td className="px-4 py-3 text-right font-black text-blue-700">{line.usedHours}</td>
                          <td className="px-4 py-3 text-right font-black text-amber-700">{line.idleHours}</td>
                          <td className="px-4 py-3 text-right font-black text-slate-900">{line.totalHours}</td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${line.validationStatus === 'Valid' ? 'bg-emerald-100 text-emerald-700' : line.validationStatus === 'Error' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{line.validationStatus}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 p-5">
              <p className="text-xs font-semibold text-slate-500">Submitting places this timesheet in supervisor review. You can keep correcting it until it is approved and released to the project manager.</p>
              <div className="flex items-center gap-3">
                <button onClick={() => setShowSubmitReview(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50">Back to Edit</button>
                <button onClick={() => handleSave(true)} disabled={submitting || !canEditTimesheet || reviewErrorCount > 0 || reviewLineCount === 0} className="rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-black uppercase tracking-widest text-white hover:bg-indigo-700 disabled:opacity-50">
                  {submitting ? 'Submitting...' : 'Submit Timesheet'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Project Modal */}
      {canManageTimesheetSetup && showProjectModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="mb-8 flex items-center justify-between"><div className="space-y-1"><h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">{editingProjectId ? 'Edit Project' : 'Register Project'}</h3><p className="text-sm font-medium text-slate-500">{editingProjectId ? 'Update project details in the company registry.' : 'Add a new project code to the company registry.'}</p></div><button onClick={closeProjectModal} className="rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"><XCircle className="h-8 w-8" /></button></div>
            <div className="space-y-6">
              {(payload?.projects?.length ?? 0) > 0 && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Project Registry</label>
                    {editingProjectId && <button onClick={resetProjectForm} className="text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-800">New Project</button>}
                  </div>
                  <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200">
                    {payload?.projects.map((project) => (
                      <div key={project.id} className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0">
                        <button onClick={() => openEditProjectModal(project)} className="min-w-0 flex-1 text-left">
                          <div className="truncate text-sm font-black text-slate-900">{project.code} - {project.name}</div>
                          <div className="truncate text-[11px] font-bold text-slate-500">{project.clientName || 'No client'} | {project.site || 'No site'} | {project.projectManager || 'No manager'}</div>
                        </button>
                        <button onClick={() => openEditProjectModal(project)} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600" title="Edit project">
                          <Edit3 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div><label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Project Code</label><input type="text" placeholder="e.g. DL26005" value={newProjectCode} onChange={(e) => setNewProjectCode(e.target.value.toUpperCase())} disabled={!!editingProjectId} className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-sm font-black text-slate-900 placeholder:text-slate-300 focus:border-indigo-500 focus:outline-none transition-all disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500" /></div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Site Location</label>
                  <select
                    value={newProjectSite}
                    onChange={(e) => setNewProjectSite(e.target.value)}
                    disabled={projectSiteLoading || !!projectSiteError || siteLocationOptions.length === 0}
                    className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-sm font-black text-slate-900 transition-all focus:border-indigo-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    <option value="">{projectSiteLoading ? 'Loading sites...' : projectSiteError ? 'Unable to load sites' : 'Select Site...'}</option>
                    {siteLocationOptions.map((site) => <option key={site} value={site}>{site}</option>)}
                  </select>
                  {projectSiteError && (
                    <p className="mt-1 text-[10px] font-bold text-rose-500">Site locations could not be read from DLE Enterprise.</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div><label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Project Name</label><input type="text" placeholder="e.g. NLNG Train 7 - Piping Works" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-sm font-black text-slate-900 placeholder:text-slate-300 focus:border-indigo-500 focus:outline-none transition-all" /></div>
                <div><label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Client Name</label><input type="text" placeholder="e.g. NLNG" value={newProjectClientName} onChange={(e) => setNewProjectClientName(e.target.value)} className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-sm font-black text-slate-900 placeholder:text-slate-300 focus:border-indigo-500 focus:outline-none transition-all" /></div>
              </div>
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
              <div className="pt-4 flex gap-3"><button onClick={closeProjectModal} className="flex-1 rounded-2xl border-2 border-slate-100 py-4 text-xs font-black text-slate-400 hover:bg-slate-50 transition-all uppercase tracking-widest">Cancel</button><button onClick={handleSaveProject} disabled={submitting || projectSiteLoading || !!projectSiteError || !newProjectCode.trim() || !newProjectName.trim() || !newProjectClientName.trim() || !newProjectSite || !projectManagerIsSelected} className="flex-[2] rounded-2xl bg-indigo-600 py-4 text-xs font-black text-white hover:bg-indigo-700 disabled:opacity-50 shadow-xl shadow-indigo-100 transition-all uppercase tracking-widest">{submitting ? 'Saving...' : editingProjectId ? 'Update Project' : 'Register Project'}</button></div>
            </div>
          </div>
        </div>
      )}

      {/* Work Center Manager */}
      {canManageTimesheetSetup && showWorkCenterManager && (
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
    </>
  );
}

function SearchablePicker({
  value,
  options,
  placeholder,
  onChange,
  className = '',
}: {
  value: string;
  options: SearchableOption[];
  placeholder: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value);
  const visibleOptions = options
    .filter((option) => {
      const query = searchText.trim().toLowerCase();
      if (!query) return true;
      return `${option.label} ${option.value} ${option.searchText || ''}`.toLowerCase().includes(query);
    })
    .slice(0, 80);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  return (
    <div ref={wrapperRef} className={`relative inline-block text-left ${className}`}>
      <button
        type="button"
        onClick={() => {
          setOpen((current) => !current);
          setSearchText('');
        }}
        className="flex min-h-8 w-full min-w-[160px] items-center justify-end gap-2 rounded-lg bg-transparent px-2 py-1 text-right text-sm font-black text-slate-900 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
      >
        <span className="truncate">{selected?.label || value || placeholder}</span>
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(340px,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-2 text-left shadow-2xl">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder={placeholder}
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-bold text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          <div className="mt-2 max-h-72 overflow-y-auto">
            {visibleOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                  setSearchText('');
                }}
                className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-bold hover:bg-indigo-50 ${option.value === value ? 'bg-slate-100 text-slate-950' : 'text-slate-700'}`}
              >
                <span className="block truncate">{option.label}</span>
              </button>
            ))}
            {!visibleOptions.length ? (
              <div className="px-3 py-4 text-sm font-bold text-slate-500">No match found.</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

