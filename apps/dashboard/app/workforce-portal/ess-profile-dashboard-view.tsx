'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  BriefcaseBusiness,
  Building2,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Download,
  FileText,
  GraduationCap,
  Heart,
  Landmark,
  MapPin,
  Pencil,
  Printer,
  QrCode,
  ShieldCheck,
  Stethoscope,
  Upload,
  UserRound,
  WalletCards,
} from 'lucide-react';
import EmployeeAvatar from '@/components/hris/EmployeeAvatar';
import { EssCard, EssKpiCard, EssSectionHeader } from './ess-portal-ui';
import type { EssTab } from './ess-portal-shell';

export type ProfileTab =
  | 'Overview'
  | 'Personal'
  | 'Employment'
  | 'Contacts'
  | 'Bank'
  | 'Education'
  | 'Professional'
  | 'Documents'
  | 'Security'
  | 'Preferences'
  | 'Audit Trail';

export type EssProfilePayload = {
  generatedAt?: string;
  security?: Record<string, string>;
  employee?: {
    fullName?: string;
    jobTitle?: string;
    department?: string;
    businessUnit?: string;
    salaryGrade?: string;
    location?: string;
    payrollGroup?: string;
    employeeCode?: string;
    employeeId?: string;
    photoUrl?: string;
    hasPhoto?: boolean;
    status?: string;
    yearsOfService?: number;
    email?: string;
    phone?: string;
    manager?: string;
    dateJoined?: string;
    confirmationDate?: string;
    emergencyContactsComplete?: boolean;
    documentCount?: number;
  };
  widgets?: {
    leave: { balance: number; entitlement: number };
    requests: { pending: number; approved: number };
    loans: { outstanding: number; applications: number };
  };
  dashboardAnalytics?: { hrInsights: { trainingProgress: { percent: number } } };
  documents?: Array<{ id: string; title: string; category: string; version: string; status: string }>;
  profileSections?: Array<{ id: string; label: string; status: string; approvalRequired: boolean; fields: Array<{ label: string; value: string }> }>;
  profileAuditTrail?: Array<{ id: string; at: string; action: string; detail: string; actor: string }>;
  profilePreferences?: Array<{ label: string; value: string }>;
  learning?: { certifications?: Array<{ id: string; title: string; expiresAt?: string; status: string }> };
  claims?: Array<{ id: string; type: string; status: string }>;
  notifications?: Array<{ id: string; title: string; type: string; status: string }>;
  leave?: { balances?: Array<{ type: string; balance: number }> };
};

const balanceFor = (balances: Array<{ type: string; balance: number }>, type: string) =>
  balances.find((item) => String(item.type).toLowerCase() === type.toLowerCase())
  || balances.find((item) => String(item.type).toLowerCase().includes(type.toLowerCase().split(' ')[0]!));

const profileTabs: ProfileTab[] = [
  'Overview',
  'Personal',
  'Employment',
  'Contacts',
  'Bank',
  'Education',
  'Professional',
  'Documents',
  'Security',
  'Preferences',
  'Audit Trail',
];

const tabSectionIds: Partial<Record<ProfileTab, string[]>> = {
  Personal: ['personal'],
  Employment: ['employment'],
  Contacts: ['contact', 'address', 'emergency', 'next-of-kin'],
  Bank: ['bank'],
  Education: ['qualifications'],
  Professional: ['certifications'],
  Documents: ['photo'],
};

const completionTabMap: Partial<Record<string, ProfileTab>> = {
  'Bank Details': 'Bank',
  'Emergency Contact': 'Contacts',
  'Means Of Identification': 'Documents',
  Certificates: 'Professional',
  'Personal Information': 'Personal',
  'Employment Information': 'Employment',
  'Contact Details': 'Contacts',
};

const hasIdentificationDocument = (documents: Array<{ title?: string; category?: string }>) =>
  documents.some((item) => /license|driver|passport|national.?id|nin|identification|id.?card|voter/i.test(`${item.title || ''} ${item.category || ''}`));

const sectionStatusClass = (status: string) => {
  const text = status.toLowerCase();
  if (/verified|complete|on file|current|enabled|masked/i.test(text)) return 'bg-[#ECFDF5] text-[#047857] ring-1 ring-[#A7F3D0]';
  if (/incomplete|not configured|not on file|not uploaded|upload|update/i.test(text)) return 'bg-[#FFFBEB] text-[#B45309] ring-1 ring-[#FCD34D]';
  return 'bg-[#EFF6FF] text-[#1D4ED8] ring-1 ring-[#BFDBFE]';
};

function ProfileSectionCard({
  section,
  expanded,
  onToggle,
  onRequestUpdate,
}: {
  section: { id: string; label: string; status: string; approvalRequired: boolean; fields: Array<{ label: string; value: string }> };
  expanded: boolean;
  onToggle: () => void;
  onRequestUpdate: () => void;
}) {
  const missingCount = section.fields.filter((field) => /not configured|not on file|not uploaded/i.test(field.value)).length;

  return (
    <div className="overflow-hidden rounded-[14px] border border-[#E5E7EB] bg-[#F8FAFC]">
      <button type="button" onClick={onToggle} className="flex w-full items-start justify-between gap-3 p-4 text-left transition hover:bg-[#F1F5F9]">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[15px] font-bold text-[#0F172A]">{section.label}</p>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${sectionStatusClass(section.status)}`}>{section.status}</span>
          </div>
          <p className="mt-1 text-[12px] text-[#64748B]">
            {section.approvalRequired ? 'Changes require HR approval' : 'Read-only HR record'}
            {missingCount > 0 ? ` · ${missingCount} field(s) incomplete` : ''}
          </p>
        </div>
        <ChevronRight className={`mt-1 h-4 w-4 shrink-0 text-[#94A3B8] transition ${expanded ? 'rotate-90' : ''}`} />
      </button>
      {expanded ? (
        <div className="border-t border-[#E5E7EB] px-4 pb-4 pt-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {section.fields.map((field) => (
              <div key={`${section.id}-${field.label}`} className="rounded-[12px] border border-[#E9EEF5] bg-white px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">{field.label}</p>
                <p className={`mt-1 text-[14px] font-semibold ${/not configured|not on file|not uploaded/i.test(field.value) ? 'text-[#B45309]' : 'text-[#0F172A]'}`}>
                  {field.value || '—'}
                </p>
              </div>
            ))}
          </div>
          {section.approvalRequired ? (
            <button
              type="button"
              onClick={onRequestUpdate}
              className="mt-4 inline-flex h-10 items-center rounded-[14px] bg-[#2563EB] px-4 text-[13px] font-semibold text-white hover:bg-[#1D4ED8]"
            >
              Request update
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ProfileDetailGrid({ rows }: { rows: Array<{ label: string; value: string }> }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label} className="rounded-[12px] border border-[#E9EEF5] bg-[#F8FAFC] px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">{row.label}</p>
          <p className="mt-1 text-[14px] font-semibold text-[#0F172A]">{row.value || '—'}</p>
        </div>
      ))}
    </div>
  );
}

const moneyFmt = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
const money = (value: number) => moneyFmt.format(value || 0);

const formatDate = (value?: string) => {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const stableDateTime = (value: string) => {
  const iso = new Date(value).toISOString();
  return `${iso.slice(8, 10)} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}, ${iso.slice(11, 16)} UTC`;
};

function ProgressRing({ value, size = 88, variant = 'dark' }: { value: number; size?: number; variant?: 'dark' | 'light' }) {
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const textClass = variant === 'dark' ? 'text-white' : 'text-[#0F172A]';
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={variant === 'dark' ? '#E9EEF5' : '#E5E7EB'} strokeWidth={stroke} opacity={variant === 'dark' ? 0.35 : 1} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#2563EB" strokeWidth={stroke} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-[18px] font-bold ${textClass}`}>{value}%</span>
      </div>
    </div>
  );
}

function QrPlaceholder({ code }: { code: string }) {
  const cells = Array.from({ length: 64 }, (_, index) => ((code.charCodeAt(index % code.length) + index) % 3) !== 0);
  return (
    <div className="rounded-[14px] bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
      <div className="grid grid-cols-8 gap-0.5">
        {cells.map((filled, index) => (
          <div key={index} className={`h-3 w-3 ${filled ? 'bg-[#0F172A]' : 'bg-white'}`} />
        ))}
      </div>
      <p className="mt-2 text-center text-[10px] font-semibold text-[#64748B]">Employee QR</p>
    </div>
  );
}

const docStatusClass = (status: string) => {
  const text = status.toLowerCase();
  if (/verified|current|valid|approved/i.test(text)) return 'bg-[#ECFDF5] text-[#047857] ring-1 ring-[#A7F3D0]';
  if (/pending|review|renewal/i.test(text)) return 'bg-[#FFFBEB] text-[#B45309] ring-1 ring-[#FCD34D]';
  return 'bg-[#EFF6FF] text-[#1D4ED8] ring-1 ring-[#BFDBFE]';
};

const severityClass = (level: 'high' | 'medium' | 'low') =>
  ({
    high: 'bg-[#FEF2F2] text-[#B91C1C] ring-1 ring-[#FECACA]',
    medium: 'bg-[#FFFBEB] text-[#B45309] ring-1 ring-[#FCD34D]',
    low: 'bg-[#EFF6FF] text-[#1D4ED8] ring-1 ring-[#BFDBFE]',
  })[level];

export function EssProfileDashboardView({
  payload,
  initialNow,
  onNavigate,
}: {
  payload: EssProfilePayload | null;
  initialNow: string;
  onNavigate: (tab: EssTab) => void;
}) {
  const [activeTab, setActiveTab] = useState<ProfileTab>('Overview');
  const [expandedSectionId, setExpandedSectionId] = useState<string | null>(null);
  const employee = payload?.employee;
  const employeeCode = employee?.employeeCode || employee?.employeeId || '';
  const documents = payload?.documents || [];
  const profileSections = payload?.profileSections || [];

  const completionItems = useMemo(
    () => [
      { label: 'Personal Information', done: Boolean(employee?.fullName && employee?.email), action: 'Completed' },
      { label: 'Employment Information', done: Boolean(employee?.jobTitle && employee?.department), action: 'Completed' },
      { label: 'Bank Details', done: profileSections.some((item) => item.id === 'bank' && item.fields.some((field) => field.label === 'Bank' && !/not configured/i.test(field.value))), action: 'Add now' },
      { label: 'Contact Details', done: Boolean(employee?.phone && employee?.email), action: 'Completed' },
      { label: 'Emergency Contact', done: employee?.emergencyContactsComplete === true, action: 'Add now' },
      { label: 'Means Of Identification', done: hasIdentificationDocument(documents), action: 'Add now' },
      { label: 'Certificates', done: documents.some((item) => /certificate|certification/i.test(`${item.title} ${item.category}`)), action: 'Add now' },
    ],
    [documents, employee, profileSections],
  );

  const completionPct = Math.round((completionItems.filter((item) => item.done).length / completionItems.length) * 100);

  const timeline = useMemo(() => {
    const joined = employee?.dateJoined;
    const confirmed = employee?.confirmationDate;
    return [
      { title: 'Joined Company', date: formatDate(joined), description: employee?.department || 'DLE Enterprise', icon: Building2, color: '#2563EB', bg: '#DBEAFE' },
      { title: 'Confirmed', date: formatDate(confirmed || joined), description: 'Permanent appointment confirmed', icon: BadgeCheck, color: '#10B981', bg: '#ECFDF5' },
      { title: 'Current Position', date: 'Present', description: employee?.jobTitle || '—', icon: BriefcaseBusiness, color: '#7C3AED', bg: '#F5F3FF' },
    ];
  }, [employee]);

  const insights = useMemo(() => {
    const rows: Array<{ title: string; severity: 'high' | 'medium' | 'low' }> = [];
    if (!documents.some((item) => /passport/i.test(`${item.title} ${item.category}`))) {
      rows.push({ title: 'Passport document not uploaded', severity: 'high' });
    }
    if (!hasIdentificationDocument(documents)) {
      rows.push({ title: 'Means of identification missing', severity: 'medium' });
    }
    if (!employee?.emergencyContactsComplete) {
      rows.push({ title: 'Emergency contact incomplete', severity: 'medium' });
    }
    if (documents.some((item) => /pending|review/i.test(item.status))) {
      rows.push({ title: 'Documents pending verification', severity: 'low' });
    }
    return rows.slice(0, 4);
  }, [documents, employee]);

  const tasks = useMemo(() => {
    const rows: Array<{ title: string; status: string; tone: string }> = [];
    if ((payload?.widgets?.requests.pending || 0) > 0) {
      rows.push({ title: 'HR approval pending', status: 'Pending', tone: 'bg-[#FFFBEB] text-[#B45309]' });
    }
    if (!hasIdentificationDocument(documents)) {
      rows.push({ title: 'Upload means of identification', status: 'Overdue', tone: 'bg-[#FEF2F2] text-[#B91C1C]' });
    }
    if (!employee?.emergencyContactsComplete) {
      rows.push({ title: 'Confirm emergency contact', status: 'Upcoming', tone: 'bg-[#EFF6FF] text-[#2563EB]' });
    }
    return rows;
  }, [documents, employee, payload?.widgets?.requests.pending]);

  const activeClaims = (payload?.claims || []).filter((item) => !/approved|closed|paid/i.test(item.status)).length;
  const leaveBalances = payload?.leave?.balances || [];

  const kpis = [
    { label: 'Annual Leave Balance', value: `${balanceFor(leaveBalances, 'Annual Leave')?.balance ?? payload?.widgets?.leave.balance ?? 0} days`, subtitle: 'Available balance', icon: CalendarCheck, accent: '#10B981', bg: '#ECFDF5' },
    { label: 'Sick Leave Balance', value: `${balanceFor(leaveBalances, 'Sick Leave')?.balance ?? 0} days`, subtitle: 'Working days', icon: Stethoscope, accent: '#2563EB', bg: '#DBEAFE' },
    { label: 'Loan Balance', value: money(payload?.widgets?.loans.outstanding || 0), subtitle: 'Outstanding', icon: Landmark, accent: '#F97316', bg: '#FFF7ED' },
    { label: 'Active Claims', value: String(activeClaims), subtitle: 'In progress', icon: WalletCards, accent: '#7C3AED', bg: '#F5F3FF' },
    { label: 'Pending Approvals', value: String(payload?.widgets?.requests.pending ?? 0), subtitle: 'Awaiting action', icon: ClipboardList, accent: '#F59E0B', bg: '#FFFBEB' },
    { label: 'Training Progress', value: `${payload?.dashboardAnalytics?.hrInsights.trainingProgress.percent ?? 0}%`, subtitle: 'Completed', icon: GraduationCap, accent: '#06B6D4', bg: '#ECFEFF' },
  ];

  const filteredSections = useMemo(() => {
    const ids = tabSectionIds[activeTab];
    if (!ids?.length) return [];
    return profileSections.filter((section) => ids.includes(section.id));
  }, [activeTab, profileSections]);

  useEffect(() => {
    setExpandedSectionId(filteredSections[0]?.id ?? null);
  }, [activeTab, filteredSections]);

  const securityRows = useMemo(
    () => Object.entries(payload?.security || {}).map(([label, value]) => ({
      label: label.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase()),
      value: String(value),
    })),
    [payload?.security],
  );

  const learningCertifications = payload?.learning?.certifications || [];

  return (
    <div className="space-y-5">
      {/* Hero banner */}
      <div
        className="overflow-hidden rounded-[20px] shadow-[0_20px_60px_rgba(15,23,42,0.10)]"
        style={{ background: 'linear-gradient(135deg, #0E1B3D 0%, #0F2D6B 35%, #1e40af 70%, #2563EB 100%)' }}
      >
        <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[auto_1fr_auto] lg:items-center">
          <div className="relative">
            <EmployeeAvatar
              fullName={employee?.fullName || 'Employee'}
              employeeCode={employeeCode}
              photoUrl={employee?.photoUrl}
              hasPhoto={employee?.hasPhoto}
              tryPhoto={Boolean(employeeCode)}
              size="xl"
              className="h-28 w-28 ring-4 ring-white/30"
            />
            <span className="absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-white bg-emerald-400" />
          </div>

          <div className="min-w-0 text-white">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[28px] font-bold leading-tight sm:text-[32px]">{employee?.fullName || 'Employee'}</h1>
              <BadgeCheck className="h-6 w-6 text-[#93C5FD]" />
            </div>
            <p className="mt-1 text-[16px] font-medium text-[#BFDBFE]">{employee?.jobTitle || '—'}</p>
            <p className="mt-0.5 text-[14px] text-white/70">{employee?.department || '—'}</p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Employee No', employeeCode],
                ['Grade', employee?.salaryGrade],
                ['Location', employee?.location],
                ['Status', employee?.status || 'Permanent'],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <p className="text-[11px] uppercase tracking-wide text-white/50">{label}</p>
                  <p className="mt-0.5 text-[13px] font-semibold">{value || '—'}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-4 text-[13px] text-white/80">
              <span>{employee?.email || '—'}</span>
              <span>{employee?.phone || '—'}</span>
              <span>Joined {formatDate(employee?.dateJoined)}</span>
              <span>Updated {stableDateTime(payload?.generatedAt || initialNow)}</span>
            </div>
          </div>

          <div className="flex flex-col items-center gap-4 sm:flex-row lg:flex-col">
            <div className="flex flex-col items-center gap-2">
              <ProgressRing value={completionPct} />
              <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold text-white ring-1 ring-white/25">Verified</span>
              <p className="text-[12px] text-white/70">Profile Complete</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <QrPlaceholder code={employeeCode || 'EMP'} />
              <button type="button" className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-white/90 hover:text-white">
                <Download className="h-3.5 w-3.5" />
                Download QR
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {kpis.map((item) => (
          <EssKpiCard key={item.label} label={item.label} value={item.value} subtitle={item.subtitle} icon={item.icon} accent={item.accent} iconBg={item.bg} />
        ))}
      </div>

      {/* Tabs */}
      <div className="overflow-x-auto border-b border-[#E5E7EB]">
        <div className="flex min-w-max gap-6">
          {profileTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`relative pb-3 text-[14px] font-semibold transition ${
                activeTab === tab ? 'text-[#2563EB]' : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              {tab}
              {activeTab === tab ? <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[#2563EB]" /> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          {(activeTab === 'Overview' || activeTab === 'Employment') && (
            <EssCard className="p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <EssSectionHeader title="Employment Timeline" />
                <button type="button" className="text-[13px] font-semibold text-[#2563EB] hover:underline">View full timeline</button>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-4 md:grid-cols-3">
                {timeline.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.title} className="relative rounded-[16px] border border-[#E9EEF5] bg-[#F8FAFC] p-4">
                      {index < timeline.length - 1 ? <span className="absolute -right-2 top-1/2 hidden h-0.5 w-4 bg-[#DBEAFE] md:block" /> : null}
                      <span className="flex h-10 w-10 items-center justify-center rounded-[12px]" style={{ backgroundColor: item.bg, color: item.color }}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <p className="mt-3 text-[12px] font-semibold uppercase tracking-wide text-[#94A3B8]">{item.date}</p>
                      <p className="mt-1 text-[15px] font-bold text-[#0F172A]">{item.title}</p>
                      <p className="mt-1 text-[13px] text-[#64748B]">{item.description}</p>
                    </div>
                  );
                })}
              </div>
            </EssCard>
          )}

          {(activeTab === 'Overview' || activeTab === 'Documents') && (
            <EssCard className="p-5 sm:p-6">
              <EssSectionHeader title="Document Center" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {documents.slice(0, 5).map((doc) => (
                  <div key={doc.id} className="group rounded-[16px] border border-[#E5E7EB] bg-[#F8FAFC] p-3 transition hover:-translate-y-0.5 hover:shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
                    <div className="flex h-20 items-center justify-center rounded-[12px] bg-white">
                      <FileText className="h-8 w-8 text-[#2563EB]" />
                    </div>
                    <p className="mt-3 truncate text-[13px] font-semibold text-[#0F172A]">{doc.title}</p>
                    <p className="text-[11px] text-[#94A3B8]">{doc.category}</p>
                    <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${docStatusClass(doc.status)}`}>{doc.status}</span>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => onNavigate('documents')}
                  className="flex min-h-[148px] flex-col items-center justify-center rounded-[16px] border border-dashed border-[#CBD5E1] bg-white p-3 text-[#64748B] transition hover:border-[#2563EB] hover:bg-[#EFF6FF] hover:text-[#2563EB]"
                >
                  <Upload className="h-8 w-8" />
                  <span className="mt-2 text-[13px] font-semibold">Upload Document</span>
                </button>
              </div>
            </EssCard>
          )}

          {activeTab !== 'Overview' && filteredSections.length > 0 && (
            <EssCard className="p-5 sm:p-6">
              <EssSectionHeader title={activeTab} />
              <div className="space-y-3">
                {filteredSections.map((section) => (
                  <ProfileSectionCard
                    key={section.id}
                    section={section}
                    expanded={expandedSectionId === section.id}
                    onToggle={() => setExpandedSectionId((current) => (current === section.id ? null : section.id))}
                    onRequestUpdate={() => onNavigate('services')}
                  />
                ))}
              </div>
            </EssCard>
          )}

          {activeTab === 'Professional' && learningCertifications.length > 0 && (
            <EssCard className="p-5 sm:p-6">
              <EssSectionHeader title="Training Certifications" />
              <div className="space-y-2">
                {learningCertifications.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-[12px] border border-[#E9EEF5] bg-[#F8FAFC] p-3">
                    <div>
                      <p className="text-[14px] font-semibold text-[#0F172A]">{item.title}</p>
                      <p className="text-[12px] text-[#64748B]">Expires {formatDate(item.expiresAt)}</p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${docStatusClass(item.status)}`}>{item.status}</span>
                  </div>
                ))}
              </div>
            </EssCard>
          )}

          {activeTab === 'Security' && (
            <EssCard className="p-5 sm:p-6">
              <EssSectionHeader title="Security & Access" />
              <ProfileDetailGrid rows={securityRows} />
            </EssCard>
          )}

          {activeTab === 'Preferences' && (
            <EssCard className="p-5 sm:p-6">
              <EssSectionHeader title="Portal Preferences" />
              <ProfileDetailGrid rows={payload?.profilePreferences || []} />
            </EssCard>
          )}

          {activeTab === 'Audit Trail' && (
            <EssCard className="p-5 sm:p-6">
              <EssSectionHeader title="Audit Trail" />
              <div className="space-y-2">
                {(payload?.profileAuditTrail || []).map((entry) => (
                  <div key={entry.id} className="rounded-[12px] border border-[#E9EEF5] bg-[#F8FAFC] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[14px] font-bold text-[#0F172A]">{entry.action}</p>
                      <span className="text-[12px] text-[#64748B]">{stableDateTime(entry.at)}</span>
                    </div>
                    <p className="mt-1 text-[13px] text-[#475569]">{entry.detail}</p>
                    <p className="mt-2 text-[12px] font-medium text-[#94A3B8]">By {entry.actor}</p>
                  </div>
                ))}
              </div>
            </EssCard>
          )}

          {activeTab !== 'Overview' && filteredSections.length === 0 && !['Security', 'Preferences', 'Audit Trail', 'Professional'].includes(activeTab) && (
            <EssCard className="p-5 sm:p-6">
              <EssSectionHeader title={activeTab} />
              <p className="text-[14px] text-[#64748B]">No profile records are available for this section yet.</p>
              <button type="button" onClick={() => onNavigate('services')} className="mt-4 inline-flex h-10 items-center rounded-[14px] bg-[#2563EB] px-4 text-[13px] font-semibold text-white hover:bg-[#1D4ED8]">
                Request update
              </button>
            </EssCard>
          )}

          {(activeTab === 'Overview' || activeTab === 'Security') && (
            <EssCard className="p-5 sm:p-6">
              <EssSectionHeader title="Key Information Summary" />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {[
                  { label: 'Reporting Manager', value: employee?.manager || '—', icon: UserRound },
                  { label: 'Department / Unit', value: `${employee?.department || '—'} / ${employee?.businessUnit || 'DLE'}`, icon: Building2 },
                  { label: 'Work Location', value: employee?.location || '—', icon: MapPin },
                  { label: 'Employment Type', value: employee?.status || 'Permanent', icon: BriefcaseBusiness },
                  { label: 'Salary Grade', value: employee?.salaryGrade || '—', icon: BadgeCheck },
                  { label: 'Payroll Group', value: employee?.payrollGroup || '—', icon: Banknote },
                  { label: 'MFA Status', value: payload?.security?.mfa || 'Enabled', icon: ShieldCheck },
                  { label: 'Years of Service', value: `${employee?.yearsOfService || 0} years`, icon: Heart },
                ].map((row) => {
                  const Icon = row.icon;
                  return (
                    <div key={row.label} className="flex items-start gap-3 rounded-[14px] border border-[#E9EEF5] bg-[#F8FAFC] p-4">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#EFF6FF] text-[#2563EB]">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">{row.label}</p>
                        <p className="mt-1 text-[14px] font-semibold text-[#0F172A]">{row.value}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </EssCard>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-5">
          <EssCard className="p-5">
            <EssSectionHeader title="Profile Completion" />
            <div className="flex items-center gap-4">
              <ProgressRing value={completionPct} size={72} variant="light" />
              <div className="flex-1">
                <p className="text-[22px] font-bold text-[#0F172A]">{completionPct}%</p>
                <p className="text-[12px] text-[#64748B]">Complete your profile</p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {completionItems.map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-2 text-[13px]">
                  <div className="flex items-center gap-2">
                    {item.done ? <CheckCircle2 className="h-4 w-4 text-[#10B981]" /> : <span className="h-4 w-4 rounded-full border-2 border-[#CBD5E1]" />}
                    <span className={item.done ? 'text-[#475569]' : 'text-[#0F172A] font-medium'}>{item.label}</span>
                  </div>
                  {!item.done ? (
                    <button
                      type="button"
                      onClick={() => setActiveTab(completionTabMap[item.label] || 'Personal')}
                      className="text-[12px] font-semibold text-[#2563EB] hover:underline"
                    >
                      {item.action}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            <button type="button" onClick={() => onNavigate('services')} className="mt-4 flex h-11 w-full items-center justify-center rounded-[14px] bg-[#2563EB] text-[14px] font-semibold text-white hover:bg-[#1D4ED8]">
              Update Profile
            </button>
          </EssCard>

          <EssCard className="p-5">
            <EssSectionHeader title="Quick Actions" />
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Edit Profile', icon: Pencil, action: () => onNavigate('services') },
                { label: 'Upload Document', icon: Upload, action: () => onNavigate('documents') },
                { label: 'Download Profile', icon: Download, action: () => undefined },
                { label: 'Request Update', icon: FileText, action: () => onNavigate('services') },
                { label: 'Print Profile', icon: Printer, action: () => typeof window !== 'undefined' && window.print() },
                { label: 'Generate ID Card', icon: QrCode, action: () => undefined },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <button key={item.label} type="button" onClick={item.action} className="flex flex-col items-start gap-2 rounded-[14px] border border-[#E5E7EB] bg-[#F8FAFC] p-3 text-left transition hover:border-[#2563EB]/30 hover:bg-[#EFF6FF]">
                    <Icon className="h-4 w-4 text-[#2563EB]" />
                    <span className="text-[12px] font-semibold text-[#0F172A]">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </EssCard>

          <EssCard className="p-5">
            <EssSectionHeader title="Profile Insights" action={<span className="rounded-full bg-[#F5F3FF] px-2 py-0.5 text-[10px] font-bold text-[#7C3AED]">AI</span>} />
            <div className="space-y-2">
              {insights.length ? insights.map((item) => (
                <div key={item.title} className="flex items-start justify-between gap-2 rounded-[12px] border border-[#E9EEF5] bg-[#FAFBFD] p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#F59E0B]" />
                    <p className="text-[13px] font-medium text-[#0F172A]">{item.title}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${severityClass(item.severity)}`}>{item.severity}</span>
                </div>
              )) : (
                <p className="text-[13px] text-[#64748B]">No profile insights at this time.</p>
              )}
            </div>
          </EssCard>

          <EssCard className="p-5">
            <EssSectionHeader title="My Tasks" />
            <div className="space-y-2">
              {tasks.length ? tasks.map((item) => (
                <div key={item.title} className="flex items-center justify-between gap-2 rounded-[12px] border border-[#E9EEF5] p-3">
                  <p className="text-[13px] font-medium text-[#0F172A]">{item.title}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.tone}`}>{item.status}</span>
                </div>
              )) : (
                <p className="text-[13px] text-[#64748B]">No pending profile tasks.</p>
              )}
            </div>
          </EssCard>
        </div>
      </div>
    </div>
  );
}
