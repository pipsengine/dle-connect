'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { ComponentType } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  ChevronRight,
  ClipboardList,
  Contact,
  Download,
  FileText,
  GitBranch,
  IdCard,
  Layers3,
  Network,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Upload,
  UserRound,
  Users,
} from 'lucide-react';
import {
  ApiResponse,
  DirectoryEmployee,
  EmployeeDirectoryPayload,
  formatDateTime,
  formatNumber,
  normalizeDirectoryEmployee,
  resolveWorkforceCategory,
  type WorkforceCategory,
} from '../employee-directory/directory-shared';

export type ProfileTabId =
  | 'personal-information'
  | 'employment-information'
  | 'job-information'
  | 'organization-assignment'
  | 'reporting-line'
  | 'contract-information'
  | 'employment-status'
  | 'emergency-contacts'
  | 'next-of-kin'
  | 'employee-category'
  | 'employee-code-management';

type ProfileException = {
  id: string;
  employeeId: string;
  employeeName: string;
  issue: string;
  severity: 'Low' | 'Medium' | 'High';
  owner: string;
};

type Props = {
  activeTab: ProfileTabId;
  onSelectTab: (tab: ProfileTabId) => void;
};

const tabs: Array<{ id: ProfileTabId; label: string }> = [
  { id: 'personal-information', label: 'Personal Information' },
  { id: 'employment-information', label: 'Employment Information' },
  { id: 'job-information', label: 'Job Information' },
  { id: 'organization-assignment', label: 'Organization Assignment' },
  { id: 'reporting-line', label: 'Reporting Line' },
  { id: 'contract-information', label: 'Contract Information' },
  { id: 'employment-status', label: 'Employment Status' },
  { id: 'emergency-contacts', label: 'Emergency Contacts' },
  { id: 'next-of-kin', label: 'Next of Kin' },
  { id: 'employee-category', label: 'Employee Category' },
  { id: 'employee-code-management', label: 'Employee Code Management' },
];

const workspaceCards: Array<{
  tab: ProfileTabId;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  href: string;
}> = [
  {
    tab: 'personal-information',
    title: 'Personal Information',
    description: 'Manage biodata, demographics, personal identifiers and employee records.',
    icon: UserRound,
    href: '/hris/employees/employee-profile',
  },
  {
    tab: 'employment-information',
    title: 'Employment Information',
    description: 'Manage employment dates, employment status, confirmation, contracts and service records.',
    icon: BadgeCheck,
    href: '/hris/employees/employee-profile',
  },
  {
    tab: 'job-information',
    title: 'Job Information',
    description: 'Manage designation, grade, position, reporting structure and compensation references.',
    icon: BriefcaseBusiness,
    href: '/hris/employees/job-information',
  },
  {
    tab: 'organization-assignment',
    title: 'Organization Assignment',
    description: 'Manage department, unit, business unit, cost centre and location assignments.',
    icon: Building2,
    href: '/hris/employees/department-and-unit-assignment',
  },
  {
    tab: 'reporting-line',
    title: 'Reporting Line',
    description: 'Manage supervisors, managers and approval hierarchy assignments.',
    icon: Network,
    href: '/hris/employees/reporting-line',
  },
  {
    tab: 'employee-category',
    title: 'Employee Category',
    description: 'Manage Permanent, Contract, Lumpsum, NYSC and IT employee classifications.',
    icon: Layers3,
    href: '/hris/employees/add-new-employee',
  },
];

const tabPanels: Record<ProfileTabId, { title: string; description: string; href?: string; items: string[] }> = {
  'personal-information': {
    title: 'Personal Information',
    description: 'Employee biodata and personal profile controls.',
    href: '/hris/employees/employee-profile',
    items: ['Biodata', 'Demographics', 'Identity Records', 'Contact details', 'Addresses', 'Profile photo'],
  },
  'employment-information': {
    title: 'Employment Information',
    description: 'Employment type, status, dates, service information, and payroll readiness.',
    href: '/hris/employees/employee-profile',
    items: ['Employment History', 'Confirmation', 'Service Records', 'Date joined', 'Employment type', 'Employment status'],
  },
  'job-information': {
    title: 'Job Information',
    description: 'Job title, role, position, and job-change workflow management.',
    href: '/hris/employees/job-information',
    items: ['Designation', 'Grade', 'Position', 'Job change requests', 'Workflow approvals'],
  },
  'organization-assignment': {
    title: 'Organization Assignment',
    description: 'Department, unit, location, cost center, and organization assignment.',
    href: '/hris/employees/department-and-unit-assignment',
    items: ['Department', 'Cost Centre', 'Location', 'Unit assignment', 'Business unit alignment'],
  },
  'reporting-line': {
    title: 'Reporting Line',
    description: 'Manager, functional manager, department head, and reporting chain governance.',
    href: '/hris/employees/reporting-line',
    items: ['Supervisor', 'Manager', 'Approval Hierarchy', 'Functional manager', 'Department head'],
  },
  'contract-information': {
    title: 'Contract Information',
    description: 'Contract profile, expiry monitoring, renewal signals, and document linkage.',
    href: '/hris/employees/contract-information',
    items: ['Contract information', 'Contract category', 'Contract status', 'Renewal controls'],
  },
  'employment-status': {
    title: 'Employment Status',
    description: 'Status changes, lifecycle state controls, and approval records.',
    href: '/hris/employees/employee-status',
    items: ['Employment status', 'Status changes', 'Suspension/reactivation', 'Approval audit trail'],
  },
  'emergency-contacts': {
    title: 'Emergency Contacts',
    description: 'Emergency contact capture, completeness checks, and validation.',
    href: '/hris/employees/emergency-contacts',
    items: ['Emergency contacts', 'Primary contact', 'Relationship', 'Completeness monitoring'],
  },
  'next-of-kin': {
    title: 'Next of Kin',
    description: 'Next-of-kin management and employee family contact records.',
    href: '/hris/employees/next-of-kin',
    items: ['Next of kin', 'Relationship', 'Contact information', 'Document support'],
  },
  'employee-category': {
    title: 'Employee Category',
    description: 'Permanent, Lumpsum, Daily Rate, NYSC, IT, intern, contract, and outsourced categories.',
    items: ['Permanent', 'Contract', 'Lumpsum', 'NYSC', 'IT / Intern', 'Category-based eligibility'],
  },
  'employee-code-management': {
    title: 'Employee Code Management',
    description: 'Automatic employee code generation based on employee category.',
    href: '/hris/employees/add-new-employee',
    items: ['Prefix Rules', 'Auto Generation', 'Audit History', 'Uniqueness validation'],
  },
};

const categoryGovernance: Array<{ label: string; prefix: string; key: WorkforceCategory | 'Daily Rate' }> = [
  { label: 'Permanent', prefix: 'P', key: 'Permanent' },
  { label: 'Contract', prefix: 'C', key: 'Contract' },
  { label: 'Lumpsum', prefix: 'L', key: 'Lumpsum' },
  { label: 'NYSC', prefix: 'N', key: 'NYSC' },
  { label: 'IT / Intern', prefix: 'I', key: 'IT Student' },
];

const text = (value: unknown) => String(value || '').trim();

const codeNumber = (code: string) => {
  const match = code.match(/(\d+)/);
  return match ? Number(match[1]) : 0;
};

const buildProfileExceptions = (employees: DirectoryEmployee[]): ProfileException[] => {
  const exceptions: ProfileException[] = [];
  for (const employee of employees) {
    if (!employee.hasManagerAssigned && !text(employee.managerName)) {
      exceptions.push({
        id: `${employee.employeeId}-manager`,
        employeeId: employee.employeeId,
        employeeName: employee.fullName,
        issue: 'Missing Manager',
        severity: 'High',
        owner: 'HR Officer',
      });
    }
    if (!employee.emergencyContactsComplete) {
      exceptions.push({
        id: `${employee.employeeId}-emergency`,
        employeeId: employee.employeeId,
        employeeName: employee.fullName,
        issue: 'Missing Emergency Contact',
        severity: 'Medium',
        owner: 'HR Officer',
      });
    }
    if (!text(employee.costCenter)) {
      exceptions.push({
        id: `${employee.employeeId}-cost-centre`,
        employeeId: employee.employeeId,
        employeeName: employee.fullName,
        issue: 'Missing Cost Centre',
        severity: 'Medium',
        owner: 'HR Admin',
      });
    }
    if (!text(employee.status) || text(employee.status).toLowerCase() === 'unknown') {
      exceptions.push({
        id: `${employee.employeeId}-status`,
        employeeId: employee.employeeId,
        employeeName: employee.fullName,
        issue: 'Missing Employment Status',
        severity: 'High',
        owner: 'HR Officer',
      });
    }
    if (!text(employee.email) && !text(employee.phone)) {
      exceptions.push({
        id: `${employee.employeeId}-contact`,
        employeeId: employee.employeeId,
        employeeName: employee.fullName,
        issue: 'Missing Contact Details',
        severity: 'Low',
        owner: 'HR Officer',
      });
    }
  }
  return exceptions;
};

const pct = (complete: number, total: number) => (total ? Math.round((complete / total) * 100) : 0);

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: 'blue' | 'green' | 'violet' | 'red' }) {
  const tones = {
    blue: 'text-[#2563EB]',
    green: 'text-[#10B981]',
    violet: 'text-[#8B5CF6]',
    red: 'text-[#EF4444]',
  };
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-[#64748B]">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${tones[tone]}`}>{formatNumber(value)}</p>
    </div>
  );
}

function CompletenessCard({ label, value, onView }: { label: string; value: number; onView: () => void }) {
  const tone = value >= 95 ? 'text-[#10B981]' : value >= 85 ? 'text-[#F59E0B]' : 'text-[#EF4444]';
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-[#64748B]">{label}</p>
        <span className={`text-lg font-bold ${tone}`}>{value}%</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-[#2563EB]" style={{ width: `${value}%` }} />
      </div>
      <button type="button" onClick={onView} className="mt-3 text-xs font-semibold text-[#2563EB] hover:text-blue-700">
        View Details
      </button>
    </div>
  );
}

export default function EmployeeProfileManagementHub({ activeTab, onSelectTab }: Props) {
  const [employees, setEmployees] = useState<DirectoryEmployee[]>([]);
  const [directorySource, setDirectorySource] = useState('DLE Enterprise HRIS');
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllExceptions, setShowAllExceptions] = useState(false);

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/hris/employees', { method: 'GET', cache: 'no-store' });
      const payload = (await res.json().catch(() => null)) as ApiResponse<EmployeeDirectoryPayload> | null;
      if (!res.ok || !payload || payload.status !== 'success' || !payload.data) {
        throw new Error(payload?.error || `Employee profile request failed (${res.status})`);
      }
      const data = payload.data;
      setEmployees((Array.isArray(data.employees) ? data.employees : []).map(normalizeDirectoryEmployee));
      setDirectorySource(data.dataSource?.source || data.source || 'DLE Enterprise HRIS');
      setSyncedAt(data.syncedAt || new Date().toISOString());
    } catch (loadError) {
      setEmployees([]);
      setError(loadError instanceof Error ? loadError.message : 'Unable to load employees');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  const total = employees.length;
  const activeCount = employees.filter((e) => text(e.status).toLowerCase().match(/active|confirmed|probation|contract/)).length;
  const documentsLinked = employees.reduce((sum, e) => sum + Number(e.documentCount || 0), 0);
  const profileExceptions = useMemo(() => buildProfileExceptions(employees), [employees]);
  const exceptionCount = profileExceptions.length;

  const completeness = useMemo(() => {
    const personalComplete = employees.filter((e) => text(e.fullName) && (text(e.email) || text(e.phone))).length;
    const employmentComplete = employees.filter((e) => text(e.employmentType) && text(e.status) && text(e.dateJoined)).length;
    const organizationComplete = employees.filter((e) => text(e.department) && text(e.businessUnit) && text(e.location)).length;
    const contactComplete = employees.filter((e) => e.emergencyContactsComplete && (text(e.email) || text(e.phone))).length;
    const reportingComplete = employees.filter((e) => e.hasManagerAssigned || text(e.managerName)).length;
    const documentsComplete = employees.filter((e) => Number(e.documentCount || 0) > 0).length;
    return {
      personal: pct(personalComplete, total),
      employment: pct(employmentComplete, total),
      organization: pct(organizationComplete, total),
      contact: pct(contactComplete, total),
      reporting: pct(reportingComplete, total),
      documents: pct(documentsComplete, total),
    };
  }, [employees, total]);

  const categoryStats = useMemo(() => {
    return categoryGovernance.map((item) => {
      const rows = employees.filter((employee) => resolveWorkforceCategory(employee) === item.key);
      const codes = rows.map((employee) => text(employee.employeeCode || employee.employeeId).toUpperCase()).filter((code) => code.startsWith(item.prefix));
      const lastCode = codes.sort((a, b) => codeNumber(b) - codeNumber(a))[0] || `${item.prefix}00000`;
      return { ...item, count: rows.length, lastCode };
    });
  }, [employees]);

  const topBusinessUnit = useMemo(() => {
    const counts = new Map<string, number>();
    for (const employee of employees) {
      const key = text(employee.businessUnit) || 'Unassigned';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Operations';
  }, [employees]);

  const topCostCentre = useMemo(() => {
    const counts = new Map<string, number>();
    for (const employee of employees) {
      const key = text(employee.costCenter) || 'Unassigned';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).find(([key]) => key !== 'Unassigned');
    return top?.[0] || 'CC10005';
  }, [employees]);

  const panel = tabPanels[activeTab];
  const visibleExceptions = showAllExceptions ? profileExceptions.slice(0, 20) : profileExceptions.slice(0, 5);

  const exportDirectory = () => {
    window.location.href = '/hris/employees/employee-directory';
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className="border-b border-[#E5E7EB] bg-white px-6 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">Employee Profile Management</h1>
            <p className="mt-1 max-w-3xl text-sm text-[#64748B]">
              Manage employee personal, employment, organizational, category, contact, and profile governance information.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-[#10B981]">Source: {directorySource}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">Employees: {formatNumber(total)}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">Updated: {formatDateTime(syncedAt)}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/hris/employees/add-new-employee" className="inline-flex items-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              <Plus className="h-4 w-4" />
              Add Employee
            </Link>
            <Link href="/hris/payroll-management/payroll-computation-workflow" className="inline-flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <GitBranch className="h-4 w-4" />
              Workflow Approvals
            </Link>
            <Link href="/hris/employees/employee-profile" className="inline-flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <ClipboardList className="h-4 w-4" />
              Audit Trail
            </Link>
            <button type="button" onClick={() => void loadEmployees()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
              <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 py-5">
        {error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</div> : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Total Employees" value={total} tone="blue" />
          <SummaryCard label="Active Employees" value={activeCount} tone="green" />
          <SummaryCard label="Profile Exceptions" value={exceptionCount} tone="violet" />
          <SummaryCard label="Documents Linked" value={documentsLinked} tone="red" />
        </div>

        {exceptionCount > 0 ? (
          <div className="mt-5 flex flex-col gap-4 rounded-xl border border-amber-200 bg-amber-50 p-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-[#0F172A]">Profile Readiness</h2>
                <p className="mt-1 text-sm text-[#64748B]">
                  {formatNumber(exceptionCount)} employee profile{exceptionCount === 1 ? '' : 's'} require attention before payroll and workflow processing.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowAllExceptions(true);
                document.getElementById('profile-exceptions')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Review Profile Exceptions
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        <nav className="mt-5 overflow-x-auto rounded-xl border border-[#E5E7EB] bg-white p-2 shadow-sm">
          <div className="flex min-w-max gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectTab(tab.id)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold whitespace-nowrap ${activeTab === tab.id ? 'bg-[#2563EB] text-white' : 'text-slate-700 hover:bg-slate-100'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </nav>

        <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            {activeTab === 'personal-information' ? (
              <section>
                <h2 className="text-2xl font-semibold">Employee Workspaces</h2>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  {workspaceCards.map((workspace) => {
                    const Icon = workspace.icon;
                    return (
                      <article key={workspace.title} className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-[#10B981]">
                            <Icon className="h-5 w-5" />
                          </span>
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-[#10B981]">Ready</span>
                        </div>
                        <h3 className="mt-4 text-lg font-medium">{workspace.title}</h3>
                        <p className="mt-2 text-sm text-[#64748B]">{workspace.description}</p>
                        <Link href={workspace.href} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#2563EB] hover:text-blue-700">
                          Open Workspace
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </article>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <section className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold">{panel.title}</h2>
                  <p className="mt-1 text-sm text-[#64748B]">{panel.description}</p>
                </div>
                {panel.href ? (
                  <Link href={panel.href} className="inline-flex items-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                    Open Detailed Workspace
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                ) : null}
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                {panel.items.map((item) => (
                  <div key={item} className="rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] p-4">
                    <p className="text-sm font-semibold text-[#0F172A]">{item}</p>
                    <p className="mt-1 text-xs text-[#64748B]">RBAC-aware, workflow-ready, audit-logged, and integration-ready.</p>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">Profile Completeness</h2>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <CompletenessCard label="Personal Data" value={completeness.personal} onView={() => onSelectTab('personal-information')} />
                <CompletenessCard label="Employment Data" value={completeness.employment} onView={() => onSelectTab('employment-information')} />
                <CompletenessCard label="Organization Data" value={completeness.organization} onView={() => onSelectTab('organization-assignment')} />
                <CompletenessCard label="Contact Data" value={completeness.contact} onView={() => onSelectTab('emergency-contacts')} />
                <CompletenessCard label="Reporting Structure" value={completeness.reporting} onView={() => onSelectTab('reporting-line')} />
                <CompletenessCard label="Documents" value={completeness.documents} onView={() => onSelectTab('personal-information')} />
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">Employee Category Governance</h2>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {categoryStats.map((item) => (
                  <div key={item.label} className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
                    <p className="text-sm font-semibold text-[#0F172A]">{item.label}</p>
                    <p className="mt-2 text-xs font-medium text-[#64748B]">Prefix: {item.prefix}</p>
                    <p className="mt-1 text-lg font-bold text-[#2563EB]">{item.lastCode}</p>
                    <p className="mt-2 text-xs text-[#64748B]">Employees: {formatNumber(item.count)}</p>
                  </div>
                ))}
              </div>
            </section>

            <section id="profile-exceptions">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-2xl font-semibold">Profile Exceptions</h2>
                {profileExceptions.length > 5 ? (
                  <button type="button" onClick={() => setShowAllExceptions((value) => !value)} className="text-sm font-semibold text-[#2563EB] hover:text-blue-700">
                    {showAllExceptions ? 'Show Fewer' : 'View All Exceptions →'}
                  </button>
                ) : null}
              </div>
              <div className="mt-4 overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[#F8FAFC] text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                    <tr>
                      <th className="px-4 py-3">Employee</th>
                      <th className="px-4 py-3">Issue</th>
                      <th className="px-4 py-3">Severity</th>
                      <th className="px-4 py-3">Owner</th>
                      <th className="px-4 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleExceptions.map((item) => (
                      <tr key={item.id} className="border-t border-[#E5E7EB]">
                        <td className="px-4 py-3">
                          <p className="font-medium text-[#0F172A]">{item.employeeName}</p>
                          <p className="text-xs text-[#64748B]">{item.employeeId}</p>
                        </td>
                        <td className="px-4 py-3">{item.issue}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${item.severity === 'High' ? 'bg-red-50 text-red-700' : item.severity === 'Medium' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>
                            {item.severity}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[#64748B]">{item.owner}</td>
                        <td className="px-4 py-3">
                          <Link href={`/hris/employees/employee-profile/${encodeURIComponent(item.employeeId)}`} className="text-sm font-semibold text-[#2563EB] hover:text-blue-700">
                            Fix
                          </Link>
                        </td>
                      </tr>
                    ))}
                    {visibleExceptions.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-sm font-semibold text-[#64748B]">
                          No profile exceptions detected.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
            <section className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold">Enterprise Context</h2>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-[#F8FAFC] p-3">
                  <p className="text-[11px] font-semibold uppercase text-[#64748B]">Business Unit</p>
                  <p className="mt-1 text-sm font-semibold text-[#0F172A]">{topBusinessUnit}</p>
                </div>
                <div className="rounded-lg bg-[#F8FAFC] p-3">
                  <p className="text-[11px] font-semibold uppercase text-[#64748B]">Cost Centre</p>
                  <p className="mt-1 text-sm font-semibold text-[#0F172A]">{topCostCentre}</p>
                </div>
                <div className="rounded-lg bg-[#F8FAFC] p-3">
                  <p className="text-[11px] font-semibold uppercase text-[#64748B]">Workflow Status</p>
                  <p className="mt-1 text-sm font-semibold text-[#10B981]">{exceptionCount ? 'Review Required' : 'Ready'}</p>
                </div>
                <div className="rounded-lg bg-[#F8FAFC] p-3">
                  <p className="text-[11px] font-semibold uppercase text-[#64748B]">Integration Status</p>
                  <p className="mt-1 text-sm font-semibold text-[#10B981]">Enabled</p>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold">Quick Actions</h2>
              <div className="mt-3 space-y-2">
                <Link href="/hris/employees/add-new-employee" className="flex items-center gap-3 rounded-lg border border-[#E5E7EB] px-3 py-2.5 text-sm font-semibold text-slate-700 hover:border-blue-200 hover:bg-blue-50">
                  <Plus className="h-4 w-4 text-[#2563EB]" />
                  Add Employee
                </Link>
                <Link href="/hris/employees/add-new-employee" className="flex items-center gap-3 rounded-lg border border-[#E5E7EB] px-3 py-2.5 text-sm font-semibold text-slate-700 hover:border-blue-200 hover:bg-blue-50">
                  <Upload className="h-4 w-4 text-[#2563EB]" />
                  Import Employees
                </Link>
                <Link href="/hris/employees/employee-reports" className="flex items-center gap-3 rounded-lg border border-[#E5E7EB] px-3 py-2.5 text-sm font-semibold text-slate-700 hover:border-blue-200 hover:bg-blue-50">
                  <FileText className="h-4 w-4 text-[#2563EB]" />
                  Generate Employee Report
                </Link>
                <Link href="/hris/employees/employee-transfer" className="flex items-center gap-3 rounded-lg border border-[#E5E7EB] px-3 py-2.5 text-sm font-semibold text-slate-700 hover:border-blue-200 hover:bg-blue-50">
                  <ArrowRightLeft className="h-4 w-4 text-[#2563EB]" />
                  Employee Movements
                </Link>
                <button type="button" onClick={exportDirectory} className="flex w-full items-center gap-3 rounded-lg border border-[#E5E7EB] px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:border-blue-200 hover:bg-blue-50">
                  <Download className="h-4 w-4 text-[#2563EB]" />
                  Export Directory
                </button>
                <Link href="/hris/employees/employee-profile" className="flex items-center gap-3 rounded-lg border border-[#E5E7EB] px-3 py-2.5 text-sm font-semibold text-slate-700 hover:border-blue-200 hover:bg-blue-50">
                  <ShieldCheck className="h-4 w-4 text-[#2563EB]" />
                  Audit Profile Changes
                </Link>
              </div>
            </section>

            <section className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold">Governance Controls</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {['RBAC', 'Workflow Approvals', 'Audit Trails'].map((item) => (
                  <span key={item} className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                    {item}
                  </span>
                ))}
              </div>
              <div className="mt-4 space-y-2 text-xs text-[#64748B]">
                <p className="flex items-center gap-2"><Contact className="h-3.5 w-3.5" /> Contact governance and emergency completeness</p>
                <p className="flex items-center gap-2"><IdCard className="h-3.5 w-3.5" /> Category-based employee code generation</p>
                <p className="flex items-center gap-2"><Users className="h-3.5 w-3.5" /> Profile readiness for payroll and ESS</p>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
