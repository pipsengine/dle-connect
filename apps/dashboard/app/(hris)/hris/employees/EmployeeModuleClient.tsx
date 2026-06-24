'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import EmployeeDirectoryHub from './employee-directory/EmployeeDirectoryHub';
import EmployeeProfileManagementHub, {
  type ProfileTabId,
} from './profile-management/EmployeeProfileManagementHub';
import {
  ArrowRightLeft,
  BadgeCheck,
  BarChart3,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardList,
  Contact,
  FileArchive,
  FileText,
  GitBranch,
  History,
  IdCard,
  Layers3,
  LogOut,
  Network,
  RefreshCcw,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-react';

type Tone = 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'cyan' | 'slate';
type SectionId = 'employee-directory' | 'employee-profile-management' | 'employee-lifecycle' | 'employee-documents' | 'employee-movements' | 'employee-exit-management' | 'employee-reports';

type Employee = {
  employeeId: string;
  employeeCode?: string;
  fullName: string;
  department: string;
  businessUnit: string;
  location: string;
  jobTitle: string;
  employmentType: string;
  status: string;
  salaryGrade?: string;
  jobGrade?: string;
  dateJoined?: string;
  managerName?: string;
  documentCount?: number;
  emergencyContactsComplete?: boolean;
  hasManagerAssigned?: boolean;
};

type EmployeesPayload = {
  source: string;
  syncedAt: string;
  dataSource?: { source: string; databaseAvailable: boolean; warning: string | null; employeeCount: number };
  employees: Employee[];
};

type ApiResponse<T> = { status: 'success' | 'error'; data?: T; error?: string };
type TabConfig = { id: string; label: string; description: string; items: string[]; legacyHref?: string };
type SectionConfig = { id: SectionId; label: string; title: string; description: string; icon: any; tone: Tone; tabs: TabConfig[] };

const toneStyles: Record<Tone, { card: string; icon: string; chip: string; button: string; bar: string; text: string }> = {
  blue: { card: 'bg-blue-50 border-blue-200', icon: 'bg-blue-600 text-white', chip: 'bg-blue-100 text-blue-800', button: 'bg-blue-600 hover:bg-blue-700 text-white', bar: 'bg-blue-600', text: 'text-blue-700' },
  green: { card: 'bg-emerald-50 border-emerald-200', icon: 'bg-emerald-600 text-white', chip: 'bg-emerald-100 text-emerald-800', button: 'bg-emerald-600 hover:bg-emerald-700 text-white', bar: 'bg-emerald-600', text: 'text-emerald-700' },
  amber: { card: 'bg-amber-50 border-amber-200', icon: 'bg-amber-500 text-white', chip: 'bg-amber-100 text-amber-800', button: 'bg-amber-500 hover:bg-amber-600 text-white', bar: 'bg-amber-500', text: 'text-amber-700' },
  red: { card: 'bg-red-50 border-red-200', icon: 'bg-red-600 text-white', chip: 'bg-red-100 text-red-800', button: 'bg-red-600 hover:bg-red-700 text-white', bar: 'bg-red-600', text: 'text-red-700' },
  violet: { card: 'bg-violet-50 border-violet-200', icon: 'bg-violet-600 text-white', chip: 'bg-violet-100 text-violet-800', button: 'bg-violet-600 hover:bg-violet-700 text-white', bar: 'bg-violet-600', text: 'text-violet-700' },
  cyan: { card: 'bg-cyan-50 border-cyan-200', icon: 'bg-cyan-600 text-white', chip: 'bg-cyan-100 text-cyan-800', button: 'bg-cyan-600 hover:bg-cyan-700 text-white', bar: 'bg-cyan-600', text: 'text-cyan-700' },
  slate: { card: 'bg-slate-50 border-slate-200', icon: 'bg-slate-800 text-white', chip: 'bg-slate-100 text-slate-800', button: 'bg-slate-900 hover:bg-slate-800 text-white', bar: 'bg-slate-700', text: 'text-slate-700' },
};

const sections: SectionConfig[] = [
  {
    id: 'employee-directory',
    label: 'Directory',
    title: 'Employee Directory',
    description: 'Centralized workforce registry for employee discovery, category visibility, reporting lines, and HRIS intelligence.',
    icon: Users,
    tone: 'blue',
    tabs: [{ id: 'directory', label: 'Directory', description: 'Searchable employee registry with source, category, status, department, and manager context.', legacyHref: '/hris/employees/employee-directory', items: ['Searchable employee profiles', 'Department directories', 'Reporting lines', 'Organization visibility', 'Access-permission aware directory'] }],
  },
  {
    id: 'employee-profile-management',
    label: 'Profile Management',
    title: 'Employee Profile Management',
    description: 'Master employee profile governance with personal, employment, job, organization, contact, category, and code controls.',
    icon: UserRound,
    tone: 'green',
    tabs: [
      { id: 'personal-information', label: 'Personal Information', description: 'Employee biodata and personal profile controls.', legacyHref: '/hris/employees/employee-profile', items: ['Personal information', 'Contact details', 'Addresses', 'Profile photo', 'Audit-controlled updates'] },
      { id: 'employment-information', label: 'Employment Information', description: 'Employment type, status, dates, service information, and payroll readiness.', legacyHref: '/hris/employees/employee-profile', items: ['Employment information', 'Date joined', 'Employment type', 'Employment status', 'Service information'] },
      { id: 'job-information', label: 'Job Information', description: 'Job title, role, position, and job-change workflow management.', legacyHref: '/hris/employees/job-information', items: ['Job information', 'Position data', 'Job change requests', 'Workflow approvals'] },
      { id: 'organization-assignment', label: 'Organization Assignment', description: 'Department, unit, location, cost center, and organization assignment.', legacyHref: '/hris/employees/department-and-unit-assignment', items: ['Department assignment', 'Unit assignment', 'Location assignment', 'Cost center alignment'] },
      { id: 'reporting-line', label: 'Reporting Line', description: 'Manager, functional manager, department head, and reporting chain governance.', legacyHref: '/hris/employees/reporting-line', items: ['Reporting line', 'Line manager', 'Functional manager', 'Department head', 'Approval routing'] },
      { id: 'contract-information', label: 'Contract Information', description: 'Contract profile, expiry monitoring, renewal signals, and document linkage.', legacyHref: '/hris/employees/contract-information', items: ['Contract information', 'Contract category', 'Contract status', 'Renewal controls'] },
      { id: 'employment-status', label: 'Employment Status', description: 'Status changes, lifecycle state controls, and approval records.', legacyHref: '/hris/employees/employee-status', items: ['Employment status', 'Status changes', 'Suspension/reactivation', 'Approval audit trail'] },
      { id: 'emergency-contacts', label: 'Emergency Contacts', description: 'Emergency contact capture, completeness checks, and validation.', legacyHref: '/hris/employees/emergency-contacts', items: ['Emergency contacts', 'Primary contact', 'Relationship', 'Completeness monitoring'] },
      { id: 'next-of-kin', label: 'Next of Kin', description: 'Next-of-kin management and employee family contact records.', legacyHref: '/hris/employees/next-of-kin', items: ['Next of kin', 'Relationship', 'Contact information', 'Document support'] },
      { id: 'employee-category', label: 'Employee Category', description: 'Permanent, Lumpsum, Daily Rate, NYSC, IT, intern, contract, and outsourced categories.', items: ['Permanent', 'Lumpsum', 'Daily Rate', 'Contract', 'NYSC', 'IT / Intern', 'Category-based eligibility'] },
      { id: 'employee-code-management', label: 'Employee Code Management', description: 'Automatic employee code generation based on employee category.', legacyHref: '/hris/employees/add-new-employee', items: ['Permanent code prefix P', 'Lumpsum code prefix L', 'Daily Rate code prefix C', 'NYSC code prefix N', 'IT / Intern code prefix I', 'Uniqueness validation'] },
    ],
  },
  {
    id: 'employee-lifecycle',
    label: 'Lifecycle',
    title: 'Employee Lifecycle',
    description: 'Employment history, career timeline, service record, and work history in one lifecycle workspace.',
    icon: History,
    tone: 'cyan',
    tabs: [
      { id: 'employment-history', label: 'Employment History', description: 'Effective-dated history of employment events and approvals.', legacyHref: '/hris/employees/employment-history', items: ['Employment History', 'Effective dates', 'Approval status', 'Payroll-impacting events'] },
      { id: 'career-timeline', label: 'Career Timeline', description: 'Timeline of employee milestones, source events, and audit trail.', legacyHref: '/hris/employees/employee-timeline', items: ['Career Timeline', 'Employee milestones', 'Source events', 'Audit visibility'] },
      { id: 'service-record', label: 'Service Record', description: 'Service length, confirmation, contract, promotion, and status records.', items: ['Service Record', 'Years of service', 'Confirmation history', 'Contract periods'] },
      { id: 'work-history', label: 'Work History', description: 'Role, assignment, department, project, and reporting history.', items: ['Work History', 'Role history', 'Department history', 'Project assignment history'] },
    ],
  },
  {
    id: 'employee-documents',
    label: 'Documents',
    title: 'Employee Documents',
    description: 'Document management for personal documents, employment documents, certifications, contracts, generated letters, and attachments.',
    icon: FileArchive,
    tone: 'violet',
    tabs: [
      { id: 'personal-documents', label: 'Personal Documents', description: 'Identity, address, medical, and personal supporting documents.', legacyHref: '/hris/employees/employee-documents', items: ['Personal documents', 'Identity documents', 'Address evidence', 'Medical records'] },
      { id: 'employment-documents', label: 'Employment Documents', description: 'Appointment, confirmation, promotion, transfer, disciplinary, and HR documents.', legacyHref: '/hris/employees/employee-documents', items: ['Employment documents', 'Appointment letters', 'Confirmation letters', 'Disciplinary notices'] },
      { id: 'certifications', label: 'Certifications', description: 'Professional certificates, training certificates, renewals, and expiry alerts.', legacyHref: '/hris/employees/employee-documents', items: ['Certifications', 'Training certificates', 'Expiry monitoring', 'Verification status'] },
      { id: 'contracts', label: 'Contracts', description: 'Contract documents, amendments, renewals, and version control.', legacyHref: '/hris/employees/contract-information', items: ['Contracts', 'Contract amendments', 'Renewal documents', 'Version control'] },
      { id: 'generated-letters', label: 'Generated Letters', description: 'System-generated letters and employee service requests.', items: ['Generated letters', 'Employment letters', 'Promotion letters', 'Transfer letters'] },
      { id: 'supporting-attachments', label: 'Supporting Attachments', description: 'Workflow attachments and supporting evidence.', legacyHref: '/hris/employees/employee-documents', items: ['Supporting attachments', 'Workflow evidence', 'Approval documents'] },
    ],
  },
  {
    id: 'employee-movements',
    label: 'Movements',
    title: 'Employee Movements',
    description: 'Transfers, promotions, confirmations, salary changes, grade changes, and movement history with approval workflows.',
    icon: ArrowRightLeft,
    tone: 'amber',
    tabs: [
      { id: 'transfers', label: 'Transfers', description: 'Employee transfers across department, unit, location, role, or project.', legacyHref: '/hris/employees/employee-transfer', items: ['Transfers', 'Department transfer', 'Location transfer', 'Workflow approval'] },
      { id: 'promotions', label: 'Promotions', description: 'Promotion eligibility, requests, approvals, and history.', legacyHref: '/hris/employees/employee-promotion', items: ['Promotions', 'Promotion readiness', 'Approval workflows', 'Promotion history'] },
      { id: 'confirmations', label: 'Confirmations', description: 'Probation confirmation, due dates, approvals, and confirmation records.', legacyHref: '/hris/employees/employee-confirmation', items: ['Confirmations', 'Probation monitoring', 'Confirmation approvals'] },
      { id: 'salary-changes', label: 'Salary Changes', description: 'Salary adjustments and compensation-change workflow integration.', items: ['Salary changes', 'Compensation approval', 'Payroll integration'] },
      { id: 'grade-changes', label: 'Grade Changes', description: 'Grade movement, grade eligibility, and effective-dated approval records.', items: ['Grade changes', 'Grade eligibility', 'Effective dates'] },
      { id: 'movement-history', label: 'Movement History', description: 'Complete history of movement events and approvals.', legacyHref: '/hris/employees/employment-history', items: ['Movement history', 'Approval audit trail', 'Effective-date tracking'] },
    ],
  },
  {
    id: 'employee-exit-management',
    label: 'Exit Management',
    title: 'Employee Exit Management',
    description: 'Resignations, terminations, retirements, clearance, final settlement, interviews, and exit status tracking.',
    icon: LogOut,
    tone: 'red',
    tabs: [
      { id: 'resignations', label: 'Resignations', description: 'Employee resignation submissions, notice period, and approval workflows.', items: ['Resignations', 'Notice period', 'Approval workflow'] },
      { id: 'terminations', label: 'Terminations', description: 'Termination processing, controls, documentation, and audit.', items: ['Terminations', 'Termination reason', 'Approval controls'] },
      { id: 'retirements', label: 'Retirements', description: 'Retirement monitoring, processing, and benefit coordination.', items: ['Retirements', 'Retirement due date', 'Benefit coordination'] },
      { id: 'exit-clearance', label: 'Exit Clearance', description: 'HR, Finance, IT, Admin, Asset, and Payroll clearance tracking.', legacyHref: '/hris/employees/employee-exit-status', items: ['Exit clearance', 'Asset return', 'Access deactivation', 'Payroll closure'] },
      { id: 'final-settlements', label: 'Final Settlements', description: 'Final payroll, deductions, benefits, and settlement status.', legacyHref: '/hris/employees/employee-exit-status', items: ['Final settlements', 'Final payroll', 'Benefit closure'] },
      { id: 'exit-interviews', label: 'Exit Interviews', description: 'Exit interview capture and feedback analytics.', items: ['Exit interviews', 'Feedback capture', 'Reason analytics'] },
      { id: 'exit-status-tracking', label: 'Exit Status Tracking', description: 'Exit status, clearance progress, and overdue actions.', legacyHref: '/hris/employees/employee-exit-status', items: ['Exit status tracking', 'Clearance status', 'Overdue actions'] },
    ],
  },
  {
    id: 'employee-reports',
    label: 'Reports',
    title: 'Employee Reports',
    description: 'Employee reporting, analytics, exports, audit reports, and future-ready HRIS insights.',
    icon: BarChart3,
    tone: 'slate',
    tabs: [
      { id: 'workforce-reports', label: 'Workforce Reports', description: 'Headcount, category, department, location, status, and service reports.', items: ['Workforce reports', 'Headcount reports', 'Category reports', 'Location reports'] },
      { id: 'profile-completeness', label: 'Profile Completeness', description: 'Missing manager, emergency contact, document, and HR profile-field reports.', legacyHref: '/hris/employees/employee-directory', items: ['Profile completeness', 'Missing managers', 'Emergency contacts', 'Document gaps'] },
      { id: 'movement-reports', label: 'Movement Reports', description: 'Transfer, promotion, confirmation, grade, salary, and approval reports.', items: ['Movement reports', 'Promotion reports', 'Transfer reports', 'Grade reports'] },
      { id: 'exit-reports', label: 'Exit Reports', description: 'Exit pipeline, clearance, final settlement, and turnover reports.', legacyHref: '/hris/employees/employee-exit-status', items: ['Exit reports', 'Clearance reports', 'Final settlement reports'] },
      { id: 'audit-reports', label: 'Audit Reports', description: 'Audit trails, approval logs, document access, and employee record changes.', items: ['Audit reports', 'Approval logs', 'Employee record logs'] },
    ],
  },
];

const aliases: Record<string, SectionId> = {
  reports: 'employee-reports',
  profile: 'employee-profile-management',
  'profile-management': 'employee-profile-management',
  lifecycle: 'employee-lifecycle',
  movements: 'employee-movements',
  documents: 'employee-documents',
  exit: 'employee-exit-management',
};
const sectionById = (id?: string) => sections.find((s) => s.id === (aliases[id || ''] || id)) || sections[0];
const defaultTabForSection = (sectionId: SectionId): string => {
  if (sectionId === 'employee-profile-management') return 'personal-information';
  return sections.find((s) => s.id === sectionId)?.tabs[0]?.id || 'directory';
};
const compact = (value: unknown) => String(value || '').trim();
const numberFmt = new Intl.NumberFormat('en-GB');
const number = (value: number | undefined | null) => numberFmt.format(Number(value || 0));

const categoryPrefix = [
  ['Permanent', 'P'],
  ['Lumpsum', 'L'],
  ['Daily Rate', 'C'],
  ['NYSC', 'N'],
  ['IT / Intern', 'I'],
];

const enterpriseCapabilities = ['RBAC', 'Workflow approvals', 'Audit trails', 'Document management', 'Notifications', 'Reporting', 'Payroll integration', 'ESS integration', 'ERP readiness', 'Sage readiness'];

export default function EmployeeModuleClient({ initialSection = 'employee-directory' }: { initialSection?: string }) {
  const [sectionId, setSectionId] = useState<SectionId>(sectionById(initialSection).id);
  const [activeTabs, setActiveTabs] = useState<Record<string, string>>({});
  const [payload, setPayload] = useState<EmployeesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const section = sectionById(sectionId);
  const activeTabId = activeTabs[section.id] || defaultTabForSection(section.id);
  const activeTab = section.tabs.find((tab) => tab.id === activeTabId) || section.tabs[0];
  const profileTabIds: ProfileTabId[] = [
    'personal-information',
    'employment-information',
    'job-information',
    'organization-assignment',
    'reporting-line',
    'contract-information',
    'employment-status',
    'emergency-contacts',
    'next-of-kin',
    'employee-category',
    'employee-code-management',
  ];
  const profileActiveTab: ProfileTabId = profileTabIds.includes(activeTabId as ProfileTabId)
    ? (activeTabId as ProfileTabId)
    : 'personal-information';

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/hris/employees', { cache: 'no-store' });
      const json = (await res.json()) as ApiResponse<EmployeesPayload>;
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || 'Unable to load employees');
      setPayload(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load employees');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const employees = useMemo(() => payload?.employees || [], [payload?.employees]);

  const summary = useMemo(() => {
    const active = employees.filter((e) => compact(e.status).toLowerCase().match(/active|confirmed|probation|contract/)).length;
    const missingManagers = employees.filter((e) => !e.hasManagerAssigned && !compact(e.managerName)).length;
    const missingEmergency = employees.filter((e) => !e.emergencyContactsComplete).length;
    const documents = employees.reduce((sum, e) => sum + Number(e.documentCount || 0), 0);
    return { total: employees.length, active, missingManagers, missingEmergency, documents };
  }, [employees]);

  if (section.id === 'employee-directory') {
    return <EmployeeDirectoryHub initialNow={new Date().toISOString()} />;
  }

  if (section.id === 'employee-profile-management') {
    return (
      <EmployeeProfileManagementHub
        activeTab={profileActiveTab}
        onSelectTab={(tab) => setActiveTabs((prev) => ({ ...prev, 'employee-profile-management': tab }))}
      />
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-900 text-white"><Users className="h-6 w-6" /></span>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950">Employees</h1>
              <p className="mt-1 max-w-5xl text-sm font-semibold text-slate-600">Scalable employee architecture with page-and-tab navigation for profile management, lifecycle, documents, movements, exits, reports, and integrations.</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-extrabold text-blue-800">Source: {payload?.dataSource?.source || payload?.source || 'Loading'}</span>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-800">Employees: {number(payload?.dataSource?.employeeCount || summary.total)}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-700">Synced: {payload?.syncedAt ? new Date(payload.syncedAt).toLocaleString('en-GB') : 'Loading'}</span>
          </div>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 text-xs font-extrabold text-white disabled:cursor-wait disabled:opacity-60">
          <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error ? <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</div> : null}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total Employees" value={number(summary.total)} detail="All employee records in current source" icon={Users} tone="blue" />
        <MetricCard label="Active Employees" value={number(summary.active)} detail="Active, confirmed, probation, or contract" icon={BadgeCheck} tone="green" />
        <MetricCard label="Profile Exceptions" value={number(summary.missingManagers + summary.missingEmergency)} detail="Managers and emergency contacts" icon={ShieldCheck} tone={(summary.missingManagers + summary.missingEmergency) ? 'amber' : 'green'} />
        <MetricCard label="Documents" value={number(summary.documents)} detail="Employee document references" icon={FileText} tone="violet" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[250px_1fr]">
        <aside className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm xl:sticky xl:top-20">
          <nav className="grid grid-cols-2 gap-1 xl:grid-cols-1" aria-label="Employee module pages">
            {sections.map((item) => {
              const Icon = item.icon;
              const active = section.id === item.id;
              return (
                <button key={item.id} type="button" onClick={() => setSectionId(item.id)} className={`flex min-h-11 items-center gap-2 rounded-lg px-3 text-left text-xs font-black transition-colors ${active ? toneStyles[item.tone].button : 'text-slate-700 hover:bg-slate-50'}`}>
                  <Icon className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0">
          <section className={`rounded-lg border p-4 ${toneStyles[section.tone].card}`}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${toneStyles[section.tone].icon}`}><section.icon className="h-5 w-5" /></span>
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-black text-slate-950">{section.title}</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-600">{section.description}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {enterpriseCapabilities.slice(0, 5).map((item) => <span key={item} className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-slate-700">{item}</span>)}
              </div>
            </div>
          </section>

          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white p-2">
            <div className="flex min-w-max gap-1">
              {section.tabs.map((tab) => (
                <button key={tab.id} type="button" onClick={() => setActiveTabs((prev) => ({ ...prev, [section.id]: tab.id }))} className={`min-h-10 rounded-lg px-3 text-xs font-black transition-colors ${activeTab.id === tab.id ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'}`}>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <FeaturePanel section={section} tab={activeTab} employees={employees} />
          </div>

          <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-950">Employee Category & Code Governance</h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">Automatic employee code generation remains category-driven and ready for Payroll, ESS, ERP, and Sage integration.</p>
              </div>
              <Link href="/hris/employees/add-new-employee" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 text-xs font-extrabold text-white">Add Employee <IdCard className="h-4 w-4" /></Link>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
              {categoryPrefix.map(([label, prefix]) => (
                <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-black text-slate-950">{label}</p>
                  <p className="mt-1 text-lg font-black text-blue-700">{prefix}0001</p>
                  <p className="mt-1 text-[11px] font-semibold text-slate-500">Prefix `{prefix}` auto-generated and uniqueness checked.</p>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function MetricCard({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: any; tone: Tone }) {
  return (
    <div className={`relative overflow-hidden rounded-lg border p-4 ${toneStyles[tone].card}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="text-xs font-extrabold uppercase tracking-normal text-slate-600">{label}</p><p className="mt-2 truncate text-2xl font-black text-slate-950">{value}</p><p className="mt-1 text-xs font-semibold text-slate-600">{detail}</p></div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${toneStyles[tone].icon}`}><Icon className="h-5 w-5" /></span>
      </div>
      <div className={`absolute bottom-0 left-0 h-1 w-full ${toneStyles[tone].bar}`} />
    </div>
  );
}

function FeaturePanel({ section, tab, employees }: { section: SectionConfig; tab: TabConfig; employees: Employee[] }) {
  const tone = toneStyles[section.tone];
  const categoryRows = Array.from(employees.reduce((map, employee) => {
    const key = employee.employmentType || 'Unassigned';
    map.set(key, (map.get(key) || 0) + 1);
    return map;
  }, new Map<string, number>()).entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div><h3 className="text-lg font-black text-slate-950">{tab.label}</h3><p className="mt-1 text-sm font-semibold text-slate-600">{tab.description}</p></div>
          {tab.legacyHref ? <Link href={tab.legacyHref} className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-black ${tone.button}`}>Open Detailed Workspace <ClipboardList className="h-4 w-4" /></Link> : null}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {tab.items.map((item) => (
            <div key={item} className={`rounded-lg border p-3 ${tone.card}`}>
              <div className="flex items-start gap-3"><span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tone.icon}`}><CheckCircle2 className="h-4 w-4" /></span><div><p className="text-sm font-black text-slate-950">{item}</p><p className="mt-1 text-xs font-semibold text-slate-600">RBAC-aware, workflow-ready, audit-logged, document-enabled, and integration-ready.</p></div></div>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-black text-slate-950">Enterprise Context</h3>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <ContextTile label="Employees" value={number(employees.length)} icon={Users} tone="blue" />
          <ContextTile label="Categories" value={number(categoryRows.length)} icon={Layers3} tone="green" />
          <ContextTile label="Workflow" value="Ready" icon={GitBranch} tone="amber" />
          <ContextTile label="Audit" value="Enabled" icon={ShieldCheck} tone="violet" />
        </div>
        <div className="mt-4 space-y-3">
          {categoryRows.map(([label, count]) => (
            <div key={label} className="rounded-lg bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-3"><p className="truncate text-xs font-black text-slate-800">{label}</p><p className="text-xs font-black text-slate-950">{number(count)}</p></div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className={`h-full ${tone.bar}`} style={{ width: `${Math.min(100, Math.max(8, (count / Math.max(1, employees.length)) * 100))}%` }} /></div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ContextTile({ label, value, icon: Icon, tone }: { label: string; value: string; icon: any; tone: Tone }) {
  return <div className={`rounded-lg border p-3 ${toneStyles[tone].card}`}><Icon className={`h-4 w-4 ${toneStyles[tone].text}`} /><p className="mt-2 text-[10px] font-black uppercase text-slate-500">{label}</p><p className="mt-1 text-sm font-black text-slate-950">{value}</p></div>;
}
