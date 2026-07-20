'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  OvertimeManagementEnterpriseView,
  inputClass,
  readOnlyClass,
} from './OvertimeManagementEnterpriseView';
import { OvertimeFormField } from './overtime-management-ui';

type ComboOption = { value: string; label: string; sublabel?: string };

function ComboSelect({
  options,
  value,
  onSelect,
  placeholder,
  emptyText = 'No matches found.',
}: {
  options: ComboOption[];
  value: string;
  onSelect: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selected = options.find((option) => option.value === value) || null;

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter((option) => `${option.label} ${option.sublabel || ''} ${option.value}`.toLowerCase().includes(q))
    : options;

  return (
    <div ref={containerRef} className="relative">
      <input
        value={open ? query : selected?.label || ''}
        onChange={(event) => {
          setQuery(event.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          setQuery('');
          setOpen(true);
        }}
        placeholder={placeholder}
        className={inputClass}
        role="combobox"
        aria-expanded={open}
        autoComplete="off"
      />
      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-[60] max-h-60 overflow-auto rounded-xl border border-[#E5E7EB] bg-white py-1 shadow-[0_12px_32px_rgba(15,23,42,0.16)]">
          {filtered.length ? (
            filtered.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onSelect(option.value);
                  setQuery('');
                  setOpen(false);
                }}
                className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-[#EFF6FF] ${option.value === value ? 'bg-[#EFF6FF]' : ''}`}
              >
                <span className="font-semibold text-[#0F172A]">{option.label}</span>
                {option.sublabel ? <span className="text-xs text-[#64748B]">{option.sublabel}</span> : null}
              </button>
            ))
          ) : (
            <p className="px-3 py-3 text-sm font-medium text-[#94A3B8]">{emptyText}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

type Role =
  | 'Employee'
  | 'Supervisor'
  | 'HR Officer'
  | 'HR Manager'
  | 'Payroll Officer'
  | 'Payroll Manager'
  | 'Finance Controller'
  | 'Executive Management'
  | 'Administrator'
  | 'Super Administrator';
type Status = 'Draft' | 'Submitted' | 'Supervisor Approved' | 'HR Approved' | 'Payroll Ready' | 'Payroll Posted' | 'Returned' | 'Rejected' | 'Blocked';
type DayType = 'Weekday' | 'Saturday' | 'Sunday' | 'Public Holiday';
type Action = 'submit' | 'approve-supervisor' | 'approve-hr' | 'mark-payroll-ready' | 'post-payroll' | 'return' | 'reject' | 'reopen';

type OvertimeRecord = {
  id: string;
  sourceLineId: string;
  headerId: string;
  periodId: string;
  date: string;
  employeeId: string;
  employeeName: string;
  department: string;
  jobTitle: string;
  location: string;
  supervisor: string;
  workCenter: string;
  employmentType: string;
  salaryGrade: string;
  dayType: DayType;
  workedHours: number;
  standardHours: number;
  overtimeHours: number;
  payableHours: number;
  multiplier: number;
  hourlyRate: number;
  grossPay: number;
  earningCode: string;
  earningName: string;
  timesheetStatus: string;
  payrollReady: boolean;
  status: Status;
  currentOwner: string;
  severity: 'Low' | 'Medium' | 'High';
  issues: string[];
  projectCodes: string[];
  lastActionAt: string | null;
  workflow: Array<{ stage: 'Employee' | 'Supervisor' | 'HR' | 'Payroll'; status: 'Pending' | 'Completed' | 'Returned' | 'Rejected' | 'Blocked'; owner: string; actedAt: string | null }>;
  auditTrail: Array<{ id: string; at: string; actor: string; role: Role; action: string; oldStatus: Status | null; newStatus: Status; comment: string | null }>;
};

type AuthorizationStatus = 'Submitted' | 'Project Manager Approved' | 'GM Operations Approved' | 'HR Approved' | 'MD Approved' | 'Rejected' | 'Cancelled';

type AuthorizationEmployeeLine = {
  id: string;
  employeeCode: string;
  employeeName: string;
  jobTitle: string;
  department: string;
  overtimeHours: number;
  dayType: string;
};

type OvertimeAuthorizationRequest = {
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
  status: AuthorizationStatus;
  currentOwnerRole: string;
  currentOwnerName: string;
  projectManagerName: string;
  projectManagerEmail: string | null;
  gmOperationsName: string;
  gmOperationsEmail: string | null;
  hrApproverName: string;
  hrApproverEmail: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  employees: AuthorizationEmployeeLine[];
};

type SupervisorEmployee = { code: string; name: string; jobTitle: string; department: string };

type Payload = {
  generatedAt: string;
  source: string;
  role: Role;
  dataSource: { source: string; databaseAvailable: boolean; warning: string | null; employeeCount: number };
  permissions: { canSubmit: boolean; canSupervisorApprove: boolean; canHrApprove: boolean; canPayroll: boolean; canExport: boolean; canViewMoney: boolean; canAudit: boolean };
  summary: {
    records: number;
    submitted: number;
    supervisorApproved: number;
    hrApproved: number;
    payrollReady: number;
    payrollPosted: number;
    returned: number;
    rejected: number;
    blocked: number;
    payableHours: number;
    grossPay: number;
    pendingApprovals: number;
  };
  filterOptions: { statuses: Status[]; departments: string[]; locations: string[]; dayTypes: DayType[] };
  authorizationSetup: {
    projects: Array<{ id: string; code: string; name: string; projectManager: string; projectManagerEmail?: string | null }>;
    workCenters: Array<{ id: string; code: string; name: string; location?: string | null; site?: string | null }>;
    supervisors: Array<{ id: string; code: string; name: string; email?: string | null; jobTitle?: string; department?: string; employees: SupervisorEmployee[] }>;
    mdApprover: { id: string; code: string; name: string; email?: string | null; jobTitle?: string; department?: string } | null;
    gmOperations: { id: string; code: string; name: string; email?: string | null; jobTitle?: string; department?: string } | null;
    hrApprover: { id: string; code: string; name: string; email?: string | null; jobTitle?: string; department?: string } | null;
  };
  records: OvertimeRecord[];
  authorizationRequests: OvertimeAuthorizationRequest[];
};

type ApiResponse<T> = { status: 'success' | 'error'; data?: T; error?: string };

const roles: Role[] = ['Employee', 'Supervisor', 'HR Officer', 'HR Manager', 'Payroll Officer', 'Payroll Manager', 'Finance Controller', 'Executive Management', 'Administrator', 'Super Administrator'];
const moneyFmt = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
const numberFmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });
const number = (value: number | null | undefined) => numberFmt.format(value || 0);
const money = (value: number | null | undefined, canView = true) => (!canView ? 'Restricted' : moneyFmt.format(value || 0));

const actionLabels: Record<Action, string> = {
  submit: 'Submit',
  'approve-supervisor': 'Supervisor Approve',
  'approve-hr': 'HR Approve',
  'mark-payroll-ready': 'Mark Payroll Ready',
  'post-payroll': 'Post Payroll',
  return: 'Return',
  reject: 'Reject',
  reopen: 'Reopen',
};

function allowedActions(record: OvertimeRecord, payload: Payload | null): Action[] {
  if (!payload) return [];
  const actions: Action[] = [];
  if (['Draft', 'Returned'].includes(record.status) && payload.permissions.canSubmit) actions.push('submit');
  if (record.status === 'Submitted' && payload.permissions.canSupervisorApprove) actions.push('approve-supervisor');
  if (record.status === 'Supervisor Approved' && payload.permissions.canHrApprove) actions.push('approve-hr');
  if (record.status === 'HR Approved' && payload.permissions.canPayroll) actions.push('mark-payroll-ready');
  if (record.status === 'Payroll Ready' && payload.permissions.canPayroll) actions.push('post-payroll');
  if (['Returned', 'Rejected', 'Blocked'].includes(record.status) && payload.permissions.canHrApprove) actions.push('reopen');
  if (!['Payroll Posted', 'Rejected'].includes(record.status) && (payload.permissions.canSupervisorApprove || payload.permissions.canHrApprove || payload.permissions.canPayroll)) actions.push('return', 'reject');
  return actions;
}

export default function OvertimeManagementClient({ initialNow }: { initialNow: string }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [role, setRole] = useState<Role>('HR Manager');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'All' | Status>('All');
  const [department, setDepartment] = useState('All');
  const [location, setLocation] = useState('All');
  const [dayType, setDayType] = useState<'All' | DayType>('All');
  const [selectedId, setSelectedId] = useState('');
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [comment, setComment] = useState('');
  const [showRequest, setShowRequest] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [selectedAuthIds, setSelectedAuthIds] = useState<Set<string>>(new Set());
  const [employeeLines, setEmployeeLines] = useState<Array<AuthorizationEmployeeLine & { selected: boolean }>>([]);
  const [requestForm, setRequestForm] = useState({
    employeeId: '',
    date: new Date(initialNow).toISOString().slice(0, 10),
    dayType: 'Weekday' as DayType,
    workedHours: '10',
    payableHours: '',
    projectCode: '',
    reason: '',
  });
  const [authorizationForm, setAuthorizationForm] = useState({
    projectCode: '',
    projectName: '',
    workDate: new Date(initialNow).toISOString().slice(0, 10),
    workCenter: '',
    supervisorCode: '',
    supervisorName: '',
    requestedHours: '1',
    requestedHeadcount: '1',
    overtimeType: 'Weekday',
    costCenter: 'Managing Director',
    projectManagerName: '',
    projectManagerEmail: '',
    gmOperationsName: '',
    gmOperationsEmail: '',
    hrApproverName: '',
    hrApproverEmail: '',
    reason: '',
    details: 'High workload on project delivery week tasks.',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/hris/workforce-management/overtime-management', { headers: { 'x-hris-role': role }, cache: 'no-store' });
      const json = (await res.json()) as ApiResponse<Payload>;
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || `Overtime management failed (${res.status})`);
      const data = json.data;
      setPayload(data);
      setSelectedId((current) => current || data.records[0]?.id || '');
    } catch (event) {
      setError(event instanceof Error ? event.message : 'Unable to load overtime management.');
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/current-user?context=hris', { cache: 'no-store' });
        const json = await res.json();
        const resolved = roles.find((item) => item.toLowerCase() === String(json?.data?.rbacRole || '').toLowerCase());
        if (!cancelled && resolved) setRole(resolved);
      } catch {
        // Keep the default role if the profile lookup fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (payload?.records || []).filter((record) => {
      if (status !== 'All' && record.status !== status) return false;
      if (department !== 'All' && record.department !== department) return false;
      if (location !== 'All' && record.location !== location) return false;
      if (dayType !== 'All' && record.dayType !== dayType) return false;
      if (!q) return true;
      return [record.employeeId, record.employeeName, record.department, record.location, record.supervisor, record.workCenter, record.status, record.projectCodes.join(' ')].some((value) => String(value || '').toLowerCase().includes(q));
    });
  }, [payload?.records, query, status, department, location, dayType]);

  const selected = payload?.records.find((record) => record.id === selectedId) || filtered[0] || null;
  const canViewMoney = Boolean(payload?.permissions.canViewMoney);
  const authorizationRequests = payload?.authorizationRequests || [];
  const approvedAuthorizations = authorizationRequests.filter((item) => ['HR Approved', 'MD Approved'].includes(item.status));
  const setup = payload?.authorizationSetup;

  const runAction = async (recordId: string, action: Action) => {
    setBusy(`${recordId}-${action}`);
    setToast('');
    setError('');
    try {
      const res = await fetch('/api/hris/workforce-management/overtime-management', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hris-role': role },
        body: JSON.stringify({ id: recordId, action, actor: role, comment }),
      });
      const json = (await res.json()) as ApiResponse<Payload>;
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || `${actionLabels[action]} failed`);
      setPayload(json.data);
      setToast(`${actionLabels[action]} completed.`);
      setComment('');
    } catch (event) {
      setError(event instanceof Error ? event.message : `${actionLabels[action]} failed.`);
    } finally {
      setBusy('');
    }
  };

  const runBulk = async (action: Action) => {
    const ids = Array.from(selectedRows);
    if (!ids.length) return;
    for (const id of ids) await runAction(id, action);
    setSelectedRows(new Set());
  };

  const toggleRow = (id: string) => {
    setSelectedRows((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportCsv = () => {
    window.location.href = '/api/hris/workforce-management/overtime-management?format=csv';
  };

  const createRequest = async () => {
    setBusy('create-request');
    setToast('');
    setError('');
    try {
      const res = await fetch('/api/hris/workforce-management/overtime-management', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hris-role': role },
        body: JSON.stringify({
          action: 'create-request',
          actor: role,
          employeeId: requestForm.employeeId,
          date: requestForm.date,
          dayType: requestForm.dayType,
          workedHours: Number(requestForm.workedHours || 0),
          payableHours: requestForm.payableHours ? Number(requestForm.payableHours) : undefined,
          projectCode: requestForm.projectCode,
          reason: requestForm.reason,
        }),
      });
      const json = (await res.json()) as ApiResponse<Payload>;
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || 'Unable to create overtime request.');
      setPayload(json.data);
      setSelectedId(json.data.records[0]?.id || '');
      setToast('Overtime request created.');
      setShowRequest(false);
      setRequestForm((current) => ({ ...current, employeeId: '', workedHours: '10', payableHours: '', projectCode: '', reason: '' }));
    } catch (event) {
      setError(event instanceof Error ? event.message : 'Unable to create overtime request.');
    } finally {
      setBusy('');
    }
  };

  const bookedLines = employeeLines.filter((line) => line.selected && Number(line.overtimeHours) > 0);

  const createAuthorization = async () => {
    if (!authorizationForm.supervisorCode) {
      setError('Select a supervisor before submitting the overtime authorization.');
      return;
    }
    if (!bookedLines.length) {
      setError('Book overtime for at least one employee assigned to the supervisor.');
      return;
    }
    setBusy('create-authorization');
    setToast('');
    setError('');
    try {
      const res = await fetch('/api/hris/workforce-management/overtime-management', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hris-role': role },
        body: JSON.stringify({
          action: 'create-authorization',
          actor: authorizationForm.supervisorName || role,
          ...authorizationForm,
          requestedHours: bookedLines.reduce((sum, line) => sum + Number(line.overtimeHours || 0), 0),
          requestedHeadcount: bookedLines.length,
          employees: bookedLines.map((line) => ({
            employeeCode: line.employeeCode,
            employeeName: line.employeeName,
            jobTitle: line.jobTitle,
            department: line.department,
            overtimeHours: Number(line.overtimeHours || 0),
            dayType: authorizationForm.overtimeType,
          })),
        }),
      });
      const json = (await res.json()) as ApiResponse<Payload>;
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || 'Unable to submit overtime authorization.');
      setPayload(json.data);
      setToast(`Overtime authorization for ${bookedLines.length} employee(s) submitted to the Project Manager.`);
      setAuthOpen(false);
      setEmployeeLines([]);
      setAuthorizationForm((current) => ({ ...current, projectCode: '', projectName: '', workCenter: '', supervisorCode: '', supervisorName: '', requestedHours: '1', requestedHeadcount: '1', reason: '', details: '' }));
    } catch (event) {
      setError(event instanceof Error ? event.message : 'Unable to submit overtime authorization.');
    } finally {
      setBusy('');
    }
  };

  const bulkAuthorization = async (decision: 'approve' | 'reject') => {
    const ids = Array.from(selectedAuthIds);
    if (!ids.length) return;
    setBusy(`bulk-${decision}-authorization`);
    setToast('');
    setError('');
    try {
      const res = await fetch('/api/hris/workforce-management/overtime-management', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hris-role': role },
        body: JSON.stringify({ action: `bulk-${decision}-authorization`, ids, actor: role, comment }),
      });
      const json = (await res.json()) as ApiResponse<Payload>;
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || `Unable to ${decision} selected authorizations.`);
      setPayload(json.data);
      setToast(`${ids.length} overtime authorization(s) ${decision === 'approve' ? 'approved' : 'rejected'}.`);
      setSelectedAuthIds(new Set());
      setComment('');
    } catch (event) {
      setError(event instanceof Error ? event.message : `Unable to ${decision} selected authorizations.`);
    } finally {
      setBusy('');
    }
  };

  const toggleAuthRow = (id: string) => {
    setSelectedAuthIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllAuthRows = (checked: boolean) => {
    if (!checked) {
      setSelectedAuthIds(new Set());
      return;
    }
    const actionableIds = authorizationRequests
      .filter((item) => !['HR Approved', 'MD Approved', 'Rejected', 'Cancelled'].includes(item.status))
      .map((item) => item.id);
    setSelectedAuthIds(new Set(actionableIds));
  };

  useEffect(() => {
    const gm = setup?.gmOperations;
    const hr = setup?.hrApprover;
    if (!gm && !hr) return;
    setAuthorizationForm((current) => ({
      ...current,
      gmOperationsName: current.gmOperationsName || gm?.name || '',
      gmOperationsEmail: current.gmOperationsEmail || gm?.email || '',
      hrApproverName: current.hrApproverName || hr?.name || '',
      hrApproverEmail: current.hrApproverEmail || hr?.email || '',
    }));
  }, [setup?.gmOperations, setup?.hrApprover]);

  const onProjectChange = (projectCode: string) => {
    const project = setup?.projects.find((item) => item.code === projectCode);
    setAuthorizationForm((current) => ({
      ...current,
      projectCode,
      projectName: project?.name || '',
      projectManagerName: project?.projectManager || '',
      projectManagerEmail: project?.projectManagerEmail || '',
    }));
  };

  const onWorkCenterChange = (workCenterName: string) => {
    setAuthorizationForm((current) => ({ ...current, workCenter: workCenterName }));
  };

  const onSupervisorChange = (supervisorCode: string) => {
    const supervisor = setup?.supervisors.find((item) => item.code === supervisorCode || item.name === supervisorCode);
    setAuthorizationForm((current) => ({
      ...current,
      supervisorCode: supervisor?.code || supervisorCode,
      supervisorName: supervisor?.name || '',
    }));
    setEmployeeLines(
      (supervisor?.employees || []).map((employee) => ({
        id: employee.code,
        employeeCode: employee.code,
        employeeName: employee.name,
        jobTitle: employee.jobTitle,
        department: employee.department,
        overtimeHours: 2,
        dayType: authorizationForm.overtimeType,
        selected: false,
      })),
    );
  };

  const toggleEmployeeLine = (code: string) => {
    setEmployeeLines((current) => current.map((line) => (line.employeeCode === code ? { ...line, selected: !line.selected } : line)));
  };

  const setEmployeeHours = (code: string, hours: number) => {
    setEmployeeLines((current) => current.map((line) => (line.employeeCode === code ? { ...line, overtimeHours: hours, selected: hours > 0 ? true : line.selected } : line)));
  };

  const toggleAllEmployeeLines = (selected: boolean) => {
    setEmployeeLines((current) => current.map((line) => ({ ...line, selected })));
  };

  const actOnAuthorization = async (id: string, decision: 'approve' | 'reject') => {
    setBusy(`${id}-${decision}`);
    setToast('');
    setError('');
    try {
      const res = await fetch('/api/hris/workforce-management/overtime-management', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hris-role': role },
        body: JSON.stringify({ id, action: `${decision}-authorization`, actor: role, comment }),
      });
      const json = (await res.json()) as ApiResponse<Payload>;
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || `Unable to ${decision} authorization.`);
      setPayload(json.data);
      setToast(`Overtime authorization ${decision === 'approve' ? 'approved' : 'rejected'}.`);
      setComment('');
    } catch (event) {
      setError(event instanceof Error ? event.message : `Unable to ${decision} authorization.`);
    } finally {
      setBusy('');
    }
  };

  const authorizationFormPanel = (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <OvertimeFormField label="Project">
          <ComboSelect
            value={authorizationForm.projectCode}
            onSelect={onProjectChange}
            placeholder="Search/select project"
            emptyText="No active projects found."
            options={(setup?.projects || []).map((project) => ({ value: project.code, label: project.name, sublabel: project.code }))}
          />
        </OvertimeFormField>
        <OvertimeFormField label="Project Manager">
          <input value={authorizationForm.projectManagerName} readOnly placeholder="Auto from project" className={readOnlyClass} />
        </OvertimeFormField>
        <OvertimeFormField label="Work Date">
          <input type="date" value={authorizationForm.workDate} onChange={(event) => setAuthorizationForm((current) => ({ ...current, workDate: event.target.value }))} className={inputClass} />
        </OvertimeFormField>
        <OvertimeFormField label="Work Center">
          <ComboSelect
            value={authorizationForm.workCenter}
            onSelect={onWorkCenterChange}
            placeholder="Search/select work center"
            emptyText="No active work centers found."
            options={(setup?.workCenters || []).map((workCenter) => ({
              value: workCenter.name,
              label: workCenter.name,
              sublabel: [workCenter.code, workCenter.site || workCenter.location].filter(Boolean).join(' / '),
            }))}
          />
        </OvertimeFormField>
        <OvertimeFormField label="Supervisor">
          <ComboSelect
            value={authorizationForm.supervisorCode}
            onSelect={onSupervisorChange}
            placeholder="Search/select supervisor"
            emptyText="No supervisors found."
            options={(setup?.supervisors || []).map((supervisor) => ({
              value: supervisor.code,
              label: supervisor.name,
              sublabel: [supervisor.code, supervisor.jobTitle].filter(Boolean).join(' · '),
            }))}
          />
        </OvertimeFormField>
        <OvertimeFormField label="Overtime Type">
          <select value={authorizationForm.overtimeType} onChange={(event) => setAuthorizationForm((current) => ({ ...current, overtimeType: event.target.value }))} className={inputClass}>
            {['Weekday', 'Saturday', 'Sunday', 'Public Holiday'].map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </OvertimeFormField>
        <OvertimeFormField label="Reason / Justification">
          <input value={authorizationForm.reason} onChange={(event) => setAuthorizationForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Auto from project" className={inputClass} />
        </OvertimeFormField>
        <OvertimeFormField label="GM Operations (Approver)">
          <input value={authorizationForm.gmOperationsName} readOnly placeholder="Auto from directory" className={readOnlyClass} />
        </OvertimeFormField>
        <OvertimeFormField label="HR Verifier (Approver)">
          <input value={authorizationForm.hrApproverName} readOnly placeholder="Auto from directory" className={readOnlyClass} />
        </OvertimeFormField>
      </div>

      {/* Approval chain summary */}
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2 text-[11px] font-semibold text-[#475569]">
        <span className="text-[#94A3B8]">Approval chain:</span>
        {[
          `Supervisor (${authorizationForm.supervisorName || 'Select'})`,
          `Project Manager (${authorizationForm.projectManagerName || 'Auto'})`,
          `GM Operations (${authorizationForm.gmOperationsName || 'Auto'})`,
          `HR Verify (${authorizationForm.hrApproverName || 'Auto'})`,
        ].map((stage, index) => (
          <span key={stage} className="inline-flex items-center gap-2">
            {index > 0 ? <span className="text-[#CBD5E1]">→</span> : null}
            <span className="rounded-full border border-[#E2E8F0] bg-white px-2.5 py-1">{stage}</span>
          </span>
        ))}
      </div>

      {/* Supervisor's assigned employees — book overtime per employee */}
      <div className="mt-5 overflow-hidden rounded-[16px] border border-[#E5E7EB]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EDF2F7] bg-[#F8FAFC] px-4 py-3">
          <div>
            <h3 className="text-sm font-bold text-[#0F172A]">Book Overtime for Assigned Employees</h3>
            <p className="text-xs text-[#64748B]">
              {authorizationForm.supervisorCode
                ? `${employeeLines.length} employee(s) report to ${authorizationForm.supervisorName || authorizationForm.supervisorCode}. Select and set OT hours per employee.`
                : 'Select a supervisor above to load their assigned employees.'}
            </p>
          </div>
          {employeeLines.length ? (
            <div className="flex items-center gap-2 text-xs font-semibold">
              <button type="button" onClick={() => toggleAllEmployeeLines(true)} className="rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1 text-[#2563EB] hover:bg-[#EFF6FF]">Select all</button>
              <button type="button" onClick={() => toggleAllEmployeeLines(false)} className="rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1 text-[#64748B] hover:bg-[#F1F5F9]">Clear</button>
              <span className="rounded-full bg-[#DBEAFE] px-2.5 py-1 text-[#1D4ED8]">{bookedLines.length} booked · {bookedLines.reduce((sum, line) => sum + Number(line.overtimeHours || 0), 0)}h</span>
            </div>
          ) : null}
        </div>
        <div className="max-h-[280px] overflow-auto">
          {employeeLines.length ? (
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-white text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">
                <tr>
                  <th className="px-4 py-2">Book</th>
                  <th className="px-4 py-2">Employee</th>
                  <th className="px-4 py-2">Role / Department</th>
                  <th className="px-4 py-2 w-40">OT Hours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDF2F7]">
                {employeeLines.map((line) => (
                  <tr key={line.employeeCode} className={line.selected ? 'bg-[#EFF6FF]' : ''}>
                    <td className="px-4 py-2">
                      <input type="checkbox" checked={line.selected} onChange={() => toggleEmployeeLine(line.employeeCode)} className="rounded border-[#CBD5E1]" />
                    </td>
                    <td className="px-4 py-2">
                      <div className="font-semibold text-[#0F172A]">{line.employeeName}</div>
                      <div className="text-xs text-[#64748B]">{line.employeeCode}</div>
                    </td>
                    <td className="px-4 py-2 text-xs text-[#64748B]">{[line.jobTitle, line.department].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={line.overtimeHours}
                        onChange={(event) => setEmployeeHours(line.employeeCode, Number(event.target.value))}
                        className="h-9 w-28 rounded-lg border border-[#E5E7EB] px-2 text-sm font-semibold text-[#0F172A] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="px-4 py-8 text-center text-sm font-medium text-[#64748B]">
              {authorizationForm.supervisorCode
                ? 'No employees are currently assigned to this supervisor. Assign employees in Supervisor Assignments first.'
                : 'No supervisor selected yet.'}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4">
        <OvertimeFormField label="Details / Reason for Overtime">
          <textarea
            value={authorizationForm.details}
            onChange={(event) => setAuthorizationForm((current) => ({ ...current, details: event.target.value }))}
            rows={3}
            className="w-full rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-medium text-[#0F172A] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
          />
        </OvertimeFormField>
      </div>
    </>
  );

  const newRequestPanel = showRequest ? (
    <section className="rounded-[18px] border border-[#A7F3D0] bg-[#ECFDF5]/60 p-5">
      <h2 className="text-lg font-semibold text-[#0F172A]">New Overtime Request</h2>
      <p className="mt-1 text-xs text-[#64748B]">Create exceptional overtime not yet captured from a payroll-ready timesheet.</p>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
        <OvertimeFormField label="Employee code">
          <input value={requestForm.employeeId} onChange={(event) => setRequestForm((current) => ({ ...current, employeeId: event.target.value }))} placeholder="e.g. C2422" className={inputClass} />
        </OvertimeFormField>
        <OvertimeFormField label="Date">
          <input type="date" value={requestForm.date} onChange={(event) => setRequestForm((current) => ({ ...current, date: event.target.value }))} className={inputClass} />
        </OvertimeFormField>
        <OvertimeFormField label="Day type">
          <select value={requestForm.dayType} onChange={(event) => setRequestForm((current) => ({ ...current, dayType: event.target.value as DayType }))} className={inputClass}>
            {(payload?.filterOptions.dayTypes || ['Weekday', 'Saturday', 'Sunday', 'Public Holiday']).map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </OvertimeFormField>
        <OvertimeFormField label="Worked hours">
          <input type="number" min="0" step="0.5" value={requestForm.workedHours} onChange={(event) => setRequestForm((current) => ({ ...current, workedHours: event.target.value }))} className={inputClass} />
        </OvertimeFormField>
        <OvertimeFormField label="Payable hours">
          <input type="number" min="0" step="0.5" value={requestForm.payableHours} onChange={(event) => setRequestForm((current) => ({ ...current, payableHours: event.target.value }))} placeholder="Auto" className={inputClass} />
        </OvertimeFormField>
        <OvertimeFormField label="Project code">
          <input value={requestForm.projectCode} onChange={(event) => setRequestForm((current) => ({ ...current, projectCode: event.target.value }))} placeholder="Optional" className={inputClass} />
        </OvertimeFormField>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="min-w-[280px] flex-1">
          <OvertimeFormField label="Reason / justification">
            <input value={requestForm.reason} onChange={(event) => setRequestForm((current) => ({ ...current, reason: event.target.value }))} className={inputClass} />
          </OvertimeFormField>
        </div>
        <button type="button" onClick={() => void createRequest()} disabled={busy === 'create-request'} className="inline-flex h-11 items-center rounded-xl bg-[#10B981] px-5 text-sm font-semibold text-white hover:bg-[#059669] disabled:opacity-60">
          Create Request
        </button>
      </div>
    </section>
  ) : null;

  return (
    <OvertimeManagementEnterpriseView
      initialNow={initialNow}
      loading={loading}
      error={error}
      toast={toast}
      payloadGeneratedAt={payload?.generatedAt}
      databaseAvailable={payload?.dataSource.databaseAvailable}
      role={role}
      roles={roles}
      onRoleChange={(value) => setRole(value as Role)}
      onRefresh={() => void load()}
      onExport={exportCsv}
      canExport={Boolean(payload?.permissions.canExport)}
      showRequest={showRequest}
      onToggleRequest={() => setAuthOpen(true)}
      summary={payload?.summary || { records: 0, pendingApprovals: 0, submitted: 0, supervisorApproved: 0, payrollReady: 0, payrollPosted: 0, blocked: 0, returned: 0, rejected: 0, payableHours: 0, grossPay: 0 }}
      canViewMoney={canViewMoney}
      authorizationRequests={authorizationRequests}
      approvedAuthorizationCount={approvedAuthorizations.length}
      authorizationForm={authorizationFormPanel}
      authorizationModalOpen={authOpen}
      onOpenAuthorization={() => setAuthOpen(true)}
      onCloseAuthorization={() => setAuthOpen(false)}
      onSubmitAuthorization={() => void createAuthorization()}
      authorizationBusy={busy === 'create-authorization'}
      onApproveAuthorization={(id) => void actOnAuthorization(id, 'approve')}
      onRejectAuthorization={(id) => void actOnAuthorization(id, 'reject')}
      authorizationActionBusy={Boolean(busy)}
      selectedAuthIds={selectedAuthIds}
      onToggleAuthRow={toggleAuthRow}
      onToggleSelectAllAuthRows={toggleSelectAllAuthRows}
      onBulkAuthorization={(decision) => void bulkAuthorization(decision)}
      bulkAuthorizationBusy={busy.startsWith('bulk-')}
      query={query}
      onQueryChange={setQuery}
      status={status}
      onStatusChange={(value) => setStatus(value as 'All' | Status)}
      department={department}
      onDepartmentChange={setDepartment}
      location={location}
      onLocationChange={setLocation}
      dayType={dayType}
      onDayTypeChange={(value) => setDayType(value as 'All' | DayType)}
      statusOptions={payload?.filterOptions.statuses || []}
      departmentOptions={payload?.filterOptions.departments || []}
      locationOptions={payload?.filterOptions.locations || []}
      dayTypeOptions={payload?.filterOptions.dayTypes || []}
      selectedRowsCount={selectedRows.size}
      filteredCount={filtered.length}
      onBulkAction={(action) => void runBulk(action as Action)}
      bulkBusy={Boolean(busy)}
      records={filtered}
      selectedId={selectedId}
      onSelectRecord={setSelectedId}
      selected={selected}
      selectedRows={selectedRows}
      onToggleRow={toggleRow}
      comment={comment}
      onCommentChange={setComment}
      allowedActions={selected ? allowedActions(selected, payload).map(String) : []}
      actionLabels={actionLabels}
      onRunAction={(action) => selected && void runAction(selected.id, action as Action)}
      actionBusy={busy}
      money={(value) => money(value, canViewMoney)}
      number={number}
      newRequestPanel={newRequestPanel}
    />
  );
}
