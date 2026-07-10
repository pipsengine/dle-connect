'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import EmployeeAvatar from '@/components/hris/EmployeeAvatar';
import {
  Bell,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  FileText,
  HelpCircle,
  LifeBuoy,
  LockKeyhole,
  LogOut,
  ReceiptText,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-react';

export type EnterpriseUserProfileContext = 'enterprise' | 'hris' | 'ess';

type ProfileUser = {
  name: string;
  role: string;
  employeeCode: string;
  department: string;
  photoUrl: string;
  hasPhoto?: boolean;
  profileHref: string;
  email?: string;
  grade?: string;
  location?: string;
  employmentStatus?: string;
  dateJoined?: string;
  yearsOfService?: number;
  reportingManager?: string;
  availabilityStatus?: string;
  onlineStatus?: string;
  notificationCount?: number;
  pendingApprovals?: number;
  teamSize?: number;
  rbacRole?: string;
};

type EnterpriseUserProfileProps = Partial<ProfileUser> & {
  context?: EnterpriseUserProfileContext;
  teamSize?: number;
  pendingApprovals?: number;
};

const defaults: Record<EnterpriseUserProfileContext, ProfileUser> = {
  enterprise: {
    name: 'Loading profile...',
    role: 'Resolving signed-in user',
    employeeCode: 'SIGNED-IN',
    department: 'Enterprise workspace',
    photoUrl: '',
    hasPhoto: false,
    profileHref: '/dashboard',
    grade: 'Unassigned',
    location: 'Unassigned',
    employmentStatus: 'Unknown',
    reportingManager: 'Not assigned',
    availabilityStatus: 'Offline',
    onlineStatus: 'Offline',
    notificationCount: 0,
    pendingApprovals: 0,
    teamSize: 0,
    rbacRole: 'Employee',
  },
  hris: {
    name: 'Loading profile...',
    role: 'Resolving signed-in user',
    employeeCode: 'SIGNED-IN',
    department: 'Human Capital',
    photoUrl: '',
    hasPhoto: false,
    profileHref: '/hris/employees/employee-profile',
    grade: 'Unassigned',
    location: 'Unassigned',
    employmentStatus: 'Unknown',
    reportingManager: 'Not assigned',
    availabilityStatus: 'Offline',
    onlineStatus: 'Offline',
    notificationCount: 0,
    pendingApprovals: 0,
    teamSize: 0,
    rbacRole: 'Employee',
  },
  ess: {
    name: 'Employee',
    role: 'Employee Self-Service',
    employeeCode: 'ESS',
    department: 'My Workspace',
    photoUrl: '',
    hasPhoto: false,
    profileHref: '/workforce-portal?tab=profile',
    grade: 'Unassigned',
    location: 'Unassigned',
    employmentStatus: 'Unknown',
    reportingManager: 'Not assigned',
    availabilityStatus: 'Offline',
    onlineStatus: 'Offline',
    notificationCount: 0,
    pendingApprovals: 0,
    teamSize: 0,
    rbacRole: 'Employee',
  },
};

const contextTone = (context: EnterpriseUserProfileContext) => {
  if (context === 'ess') return { shell: 'border-cyan-200 bg-cyan-50 text-cyan-950 hover:bg-cyan-100', panel: 'bg-cyan-50', accent: 'text-cyan-700', action: 'bg-cyan-600 hover:bg-cyan-700' };
  if (context === 'hris') return { shell: 'border-blue-200 bg-blue-50 text-blue-950 hover:bg-blue-100', panel: 'bg-blue-50', accent: 'text-blue-700', action: 'bg-blue-600 hover:bg-blue-700' };
  return { shell: 'border-violet-200 bg-violet-50 text-violet-950 hover:bg-violet-100', panel: 'bg-violet-50', accent: 'text-violet-700', action: 'bg-violet-600 hover:bg-violet-700' };
};

const compact = (value: unknown) => String(value || '').trim();

const employeePhotoUrl = (employeeCode: string) => `/api/hris/employees/${encodeURIComponent(employeeCode)}/photo`;

const isPlaceholderEmployeeCode = (value?: string) => {
  const code = compact(value).toUpperCase();
  return !code || ['SIGNED-IN', 'ESS', 'UNLINKED', 'ADMIN'].includes(code);
};

const resolveProfilePhotoUrl = (user: Pick<ProfileUser, 'employeeCode' | 'photoUrl' | 'hasPhoto'>) => {
  if (user.photoUrl && !user.photoUrl.includes('/brand/dorman-long-logo')) return user.photoUrl;
  const code = compact(user.employeeCode);
  if (!isPlaceholderEmployeeCode(code) && (user.hasPhoto || code)) return employeePhotoUrl(code);
  return '';
};

const pruneEmpty = (user: Partial<ProfileUser>) => (
  Object.fromEntries(Object.entries(user).filter(([, value]) => value === 0 || Boolean(compact(value)))) as Partial<ProfileUser>
);

const displayRole = (value?: string) => compact(value).replace(/^[A-Z]{2,}\d{1,4}\s*-\s*/i, '').trim();

const dateLabel = (value?: string) => {
  if (!value) return 'Not captured';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-NG', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
};

const statusTone = (status?: string) => {
  const value = compact(status).toLowerCase();
  if (value.includes('suspend') || value.includes('inactive') || value.includes('terminated')) return 'border-red-200 bg-red-50 text-red-700';
  if (value.includes('leave')) return 'border-amber-200 bg-amber-50 text-amber-700';
  if (value.includes('online') || value.includes('active')) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
};

const linksFor = (context: EnterpriseUserProfileContext, user: ProfileUser) => {
  const ess = context === 'ess';
  const hrisProfile = user.employeeCode && user.employeeCode !== 'UNLINKED' ? `/hris/employees/employee-profile/${encodeURIComponent(user.employeeCode)}` : '/hris/employees/employee-profile';
  return [
    { label: 'My Profile', href: user.profileHref || (ess ? '/workforce-portal?tab=profile' : hrisProfile), icon: UserRound },
    { label: 'My Documents', href: ess ? '/workforce-portal?tab=documents' : '/hris/employees/employee-documents', icon: FileText },
    { label: 'My Payslips', href: ess ? '/workforce-portal?tab=payroll' : '/hris/payroll/payslip-generation', icon: ReceiptText },
    { label: 'My Leave', href: ess ? '/workforce-portal?tab=leave' : '/hris/leave-management/applications', icon: CalendarDays },
    { label: 'My Requests', href: ess ? '/workforce-portal?tab=services' : '/hris/employees/employee-timeline', icon: CheckSquare },
    { label: 'My Approvals', href: ess ? '/workforce-portal?tab=leave&leaveSection=Approvals' : '/hris/employees/reporting-line', icon: ShieldCheck, count: user.pendingApprovals || 0 },
  ];
};

const infoRows = (user: ProfileUser) => [
  ['Employee ID', user.employeeCode],
  ['Department', user.department],
  ['Job Title', user.role],
  ['Grade', user.grade || 'Unassigned'],
  ['Location', user.location || 'Unassigned'],
  ['Employment Status', user.employmentStatus || 'Unknown'],
  ['Date Joined', dateLabel(user.dateJoined)],
  ['Years of Service', `${Number(user.yearsOfService || 0).toFixed(1)} yrs`],
  ['Reporting Manager', user.reportingManager || 'Not assigned'],
];

export function EnterpriseUserProfile({
  context = 'enterprise',
  name,
  role,
  employeeCode,
  department,
  photoUrl,
  profileHref,
  hasPhoto,
  teamSize,
  pendingApprovals,
}: EnterpriseUserProfileProps) {
  const [currentUser, setCurrentUser] = useState<Partial<ProfileUser>>({});

  useEffect(() => {
    let ignore = false;

    fetch('/api/auth/me', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (ignore || !payload?.data) return;
        const session = payload.data;
        setCurrentUser((current) => ({
          ...current,
          ...pruneEmpty({
            name: session.fullName,
            role: Array.isArray(session.roles) ? session.roles[0] : '',
            employeeCode: session.employeeCode || session.employeeId || session.username,
            department: session.department || session.unit,
            employmentStatus: session.status,
            onlineStatus: 'Online',
            availabilityStatus: 'Online',
            rbacRole: Array.isArray(session.roles) ? session.roles[0] : '',
            profileHref: session.employeeCode || session.employeeId
              ? `/hris/employees/employee-profile/${encodeURIComponent(session.employeeCode || session.employeeId)}`
              : '/hris/administration/user-management/user-accounts',
          }),
        }));
      })
      .catch(() => undefined);

    fetch(`/api/current-user?context=${context}`, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!ignore && payload?.data) setCurrentUser(pruneEmpty(payload.data));
      })
      .catch(() => {
        if (!ignore) setCurrentUser({});
      });

    return () => {
      ignore = true;
    };
  }, [context]);

  const explicitUser = useMemo(
    () => pruneEmpty({ name, role, employeeCode, department, photoUrl, profileHref, hasPhoto, teamSize, pendingApprovals }),
    [department, employeeCode, hasPhoto, name, pendingApprovals, photoUrl, profileHref, role, teamSize],
  );
  const user = { ...defaults[context], ...currentUser, ...explicitUser } as ProfileUser;
  user.role = displayRole(user.role) || user.role;
  const resolvedPhotoUrl = resolveProfilePhotoUrl(user);
  const useEmployeePhoto = Boolean(resolvedPhotoUrl) || !isPlaceholderEmployeeCode(user.employeeCode);
  const tone = contextTone(context);
  const links = linksFor(context, user);
  const notificationCount = Number(user.notificationCount || 0);
  const pendingApprovalCount = Number(user.pendingApprovals || 0);
  const isManager = pendingApprovalCount > 0 || Number(user.teamSize || 0) > 0 || compact(user.rbacRole).match(/manager|executive/i);
  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', cache: 'no-store' }).catch(() => undefined);
    window.location.replace('/login');
  };

  return (
    <details className="group relative">
      <summary
        aria-label="Open employee profile menu"
        className={`flex h-11 min-w-11 cursor-pointer list-none items-center justify-center gap-2 rounded-lg border px-1.5 py-1.5 text-left shadow-sm transition-colors sm:justify-start sm:px-2 lg:gap-3 ${tone.shell}`}
      >
        <span className="relative h-8 w-8 shrink-0">
          <EmployeeAvatar
            fullName={user.name}
            employeeCode={user.employeeCode}
            photoUrl={resolvedPhotoUrl || undefined}
            hasPhoto={user.hasPhoto || useEmployeePhoto}
            tryPhoto={useEmployeePhoto}
            size="sm"
            className="ring-0"
          />
          <span aria-label={user.onlineStatus || 'Offline'} className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-white ${user.onlineStatus === 'Online' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
        </span>
        <span className="hidden min-w-0 flex-col leading-tight lg:flex">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-black">{user.name}</span>
            <span className="shrink-0 rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-600">
              {user.rbacRole || 'Employee'}
            </span>
          </span>
          <span className="max-w-48 truncate text-xs font-semibold text-slate-600">{user.role}</span>
        </span>
        {notificationCount > 0 ? (
          <span className="hidden min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-center text-[10px] font-black text-white md:inline-flex">{notificationCount}</span>
        ) : null}
        <ChevronDown className="hidden h-4 w-4 text-slate-400 transition-transform group-open:rotate-180 md:block" />
      </summary>

      <div className="fixed inset-x-2 bottom-2 top-2 z-50 overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-auto sm:mt-2 sm:max-h-[calc(100dvh-5rem)] sm:w-[min(92vw,440px)]">
        <div className={`border-b border-slate-100 p-4 ${tone.panel}`}>
          <div className="flex items-start gap-3">
            <span className="relative h-14 w-14 shrink-0">
              <EmployeeAvatar
                fullName={user.name}
                employeeCode={user.employeeCode}
                photoUrl={resolvedPhotoUrl || undefined}
                hasPhoto={user.hasPhoto || useEmployeePhoto}
                tryPhoto={useEmployeePhoto}
                size="lg"
                className="ring-0"
              />
              <span className={`absolute bottom-1 right-1 h-3 w-3 rounded-full border-2 border-white ${user.onlineStatus === 'Online' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-black text-slate-950">{user.name}</p>
              <p className="truncate text-sm font-semibold text-slate-600">{user.role}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className={`rounded-full border px-2 py-1 text-[11px] font-black ${statusTone(user.employmentStatus)}`}>{user.employmentStatus || 'Unknown'}</span>
                <span className={`rounded-full border px-2 py-1 text-[11px] font-black ${statusTone(user.availabilityStatus)}`}>{user.availabilityStatus || 'Offline'}</span>
                <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-black text-slate-700">{user.rbacRole || 'Employee'}</span>
              </div>
            </div>
            <div className="relative shrink-0 rounded-lg border border-slate-200 bg-white p-2 text-slate-600">
              <Bell className="h-4 w-4" />
              {notificationCount > 0 ? <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-red-600 px-1 text-center text-[9px] font-black text-white">{notificationCount}</span> : null}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 min-[420px]:grid-cols-3">
            <Link href={user.profileHref} className={`flex min-h-11 items-center justify-center rounded-lg px-3 py-2 text-center text-xs font-black text-white ${tone.action}`}>
              View Profile
            </Link>
            <Link href={context === 'ess' ? '/workforce-portal?tab=leave' : '/hris/leave-management/applications'} className="flex min-h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-xs font-black text-slate-800 hover:bg-slate-50">
              Apply Leave
            </Link>
            <Link href={context === 'ess' ? '/workforce-portal?tab=payroll' : '/hris/payroll/payslip-generation'} className="flex min-h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-xs font-black text-slate-800 hover:bg-slate-50">
              View Payslip
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 border-b border-slate-100 p-3">
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
            <p className="text-[10px] font-black uppercase text-blue-700">Team Size</p>
            <p className="mt-1 text-lg font-black text-slate-950">{isManager ? Number(user.teamSize || 0) : '-'}</p>
          </div>
          <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
            <p className="text-[10px] font-black uppercase text-amber-700">Pending Approvals</p>
            <p className="mt-1 text-lg font-black text-slate-950">{isManager ? pendingApprovalCount : '-'}</p>
          </div>
        </div>

        <div className="border-b border-slate-100 p-3">
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
            {infoRows(user).map(([label, value]) => (
              <div key={label} className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[10px] font-black uppercase text-slate-500">{label}</p>
                <p className="mt-1 truncate text-xs font-bold text-slate-900" title={value}>{value}</p>
              </div>
            ))}
          </div>
        </div>

        <nav aria-label="Employee profile shortcuts" className="grid grid-cols-1 gap-1 border-b border-slate-100 p-2 min-[420px]:grid-cols-2">
          {links.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.label} href={item.href} className="flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
                <Icon className={`h-4 w-4 ${tone.accent}`} />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.count ? <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-black text-amber-700">{item.count}</span> : null}
              </Link>
            );
          })}
        </nav>

        <div className="grid grid-cols-1 gap-1 border-b border-slate-100 p-2 min-[420px]:grid-cols-2">
          <Link href="/settings" className="flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
            <Settings className="h-4 w-4 text-slate-500" />
            Account Settings
          </Link>
          <Link href="/settings/security" className="flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
            <LockKeyhole className="h-4 w-4 text-emerald-600" />
            Security & MFA
          </Link>
          <Link href="/help" className="flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
            <LifeBuoy className="h-4 w-4 text-blue-600" />
            Help & Support
          </Link>
          <button type="button" className="flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-bold text-slate-700 hover:bg-slate-50">
            <HelpCircle className="h-4 w-4 text-violet-600" />
            RBAC: {user.rbacRole || 'Employee'}
          </button>
        </div>

        <div className="p-2">
          <button type="button" onClick={() => void logout()} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-bold text-red-700 hover:bg-red-50">
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </div>
    </details>
  );
}
