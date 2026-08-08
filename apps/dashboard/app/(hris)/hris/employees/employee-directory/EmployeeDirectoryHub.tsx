'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRightLeft,
  Building2,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  Eye,
  FileBarChart,
  LayoutGrid,
  List,
  MapPin,
  MoreHorizontal,
  Plus,
  RefreshCcw,
  Search,
  Upload,
  Users,
  X,
} from 'lucide-react';
import EmployeeAvatar from '@/components/hris/EmployeeAvatar';
import {
  ApiResponse,
  categoryStyles,
  DirectoryEmployee,
  EmployeeDirectoryPayload,
  employeeCodeGuide,
  formatDateOnly,
  formatDateTime,
  formatNumber,
  formatPct,
  formatRelativeTime,
  normalizeDirectoryEmployee,
  resolveWorkforceCategory,
  statusTone,
  type WorkforceCategory,
} from './directory-shared';

type ViewMode = 'card' | 'table';
type CategoryFilter = 'all' | WorkforceCategory | 'Active' | 'Inactive' | 'Probation';
type DrawerTab =
  | 'personal'
  | 'employment'
  | 'payroll'
  | 'leave'
  | 'attendance'
  | 'documents'
  | 'performance'
  | 'training'
  | 'history';

const categoryKpis: Array<{ key: WorkforceCategory | 'total'; label: string; accent: string; iconBg: string }> = [
  { key: 'total', label: 'Total Employees', accent: 'text-[#2563EB]', iconBg: 'bg-blue-50 text-[#2563EB]' },
  { key: 'Permanent', label: 'Permanent Employees', accent: 'text-[#10B981]', iconBg: 'bg-emerald-50 text-[#10B981]' },
  { key: 'Contract', label: 'Contract Employees', accent: 'text-[#F59E0B]', iconBg: 'bg-amber-50 text-[#F59E0B]' },
  { key: 'Lumpsum', label: 'Lumpsum Employees', accent: 'text-[#8B5CF6]', iconBg: 'bg-violet-50 text-[#8B5CF6]' },
  { key: 'NYSC', label: 'NYSC Members', accent: 'text-sky-600', iconBg: 'bg-sky-50 text-sky-600' },
  { key: 'IT Student', label: 'IT Students', accent: 'text-yellow-600', iconBg: 'bg-yellow-50 text-yellow-600' },
];

const donutColors = ['#2563EB', '#F59E0B', '#8B5CF6', '#10B981', '#EAB308'];

const drawerTabs: Array<{ id: DrawerTab; label: string }> = [
  { id: 'personal', label: 'Personal Information' },
  { id: 'employment', label: 'Employment Information' },
  { id: 'payroll', label: 'Payroll' },
  { id: 'leave', label: 'Leave' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'documents', label: 'Documents' },
  { id: 'performance', label: 'Performance' },
  { id: 'training', label: 'Training' },
  { id: 'history', label: 'History' },
];

function DonutChart({ rows, total }: { rows: Array<{ label: string; count: number }>; total: number }) {
  let acc = 0;
  const stops = rows
    .map((row, index) => {
      const start = acc;
      const pct = total ? (row.count / total) * 100 : 0;
      acc += pct;
      return `${donutColors[index % donutColors.length]} ${start}% ${acc}%`;
    })
    .join(', ');

  return (
    <div className="space-y-4">
      <div className="relative mx-auto h-36 w-36 rounded-full" style={{ background: `conic-gradient(${stops || '#e2e8f0 0% 100%'})` }}>
        <div className="absolute inset-8 flex flex-col items-center justify-center rounded-full bg-white text-center shadow-inner">
          <span className="text-xl font-bold text-[#0F172A]">{formatNumber(total)}</span>
          <span className="text-[11px] font-semibold text-[#64748B]">Workforce</span>
        </div>
      </div>
      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={row.label} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-2 font-medium text-[#64748B]">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: donutColors[index % donutColors.length] }} />
              <span className="truncate">{row.label}</span>
            </span>
            <span className="font-semibold text-[#0F172A]">{formatPct(row.count, total)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, pct, accent, iconBg }: { label: string; value: number; pct: string; accent: string; iconBg: string }) {
  return (
    <div className="flex h-[110px] min-w-[220px] flex-1 flex-col justify-between rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-[#64748B]">{label}</p>
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconBg}`}>
          <Users className="h-4 w-4" />
        </span>
      </div>
      <div>
        <p className={`text-2xl font-bold ${accent}`}>{formatNumber(value)}</p>
        <p className="mt-0.5 text-xs font-medium text-[#64748B]">{pct} of workforce</p>
      </div>
    </div>
  );
}

function EmployeeCard({
  employee,
  category,
  onView,
  onEdit,
}: {
  employee: DirectoryEmployee;
  category: WorkforceCategory;
  onView: () => void;
  onEdit: () => void;
}) {
  const style = categoryStyles[category];
  return (
    <article
      className="group flex h-[300px] w-full flex-col rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm transition-all hover:border-[#2563EB] hover:shadow-md"
      onClick={onView}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onView();
        }
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <EmployeeAvatar
          fullName={employee.fullName}
          employeeCode={employee.employeeCode}
          employeeId={employee.employeeId}
          photoUrl={employee.photoUrl}
          hasPhoto={employee.hasPhoto}
          size="xl"
        />
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${style.bg} ${style.text}`}>
          <span className={`h-2 w-2 rounded-full ${style.dot}`} />
          {style.label}
        </span>
      </div>

      <div className="mt-4 min-w-0 flex-1">
        <h3 className="truncate text-lg font-medium text-[#0F172A]">{employee.fullName}</h3>
        <p className="mt-1 text-sm font-semibold text-[#64748B]">{employee.employeeCode || employee.employeeId}</p>
        <p className="mt-2 truncate text-sm text-[#0F172A]">{employee.jobTitle}</p>
        <p className="mt-2 flex items-center gap-1.5 truncate text-sm text-[#64748B]">
          <Building2 className="h-3.5 w-3.5 shrink-0" />
          {employee.department}
        </p>
        <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-[#64748B]">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          {employee.location}
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-[#E5E7EB] pt-4">
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(employee.status)}`}>{employee.status || 'Active'}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onView();
            }}
            className="rounded-lg p-2 text-[#64748B] hover:bg-blue-50 hover:text-[#2563EB]"
            title="View"
          >
            <Eye className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onEdit();
            }}
            className="rounded-lg p-2 text-[#64748B] hover:bg-blue-50 hover:text-[#2563EB]"
            title="Edit"
          >
            <Edit3 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={(event) => event.stopPropagation()}
            className="rounded-lg p-2 text-[#64748B] hover:bg-slate-100"
            title="More"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>
    </article>
  );
}

function DrawerField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">{label}</p>
      <p className="mt-1 text-sm font-medium text-[#0F172A]">{value || '—'}</p>
    </div>
  );
}

export default function EmployeeDirectoryHub({ initialNow }: { initialNow: string }) {
  const router = useRouter();
  const [employees, setEmployees] = useState<DirectoryEmployee[]>([]);
  const [directoryWarning, setDirectoryWarning] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All Departments');
  const [locationFilter, setLocationFilter] = useState('All Locations');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [drawerEmployee, setDrawerEmployee] = useState<DirectoryEmployee | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('personal');

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/hris/employees', { method: 'GET', cache: 'no-store' });
      const payload = (await res.json().catch(() => null)) as ApiResponse<EmployeeDirectoryPayload> | null;
      if (!res.ok || !payload || payload.status !== 'success' || !payload.data) {
        throw new Error(payload?.error || `Employee directory request failed (${res.status})`);
      }
      const data = payload.data;
      setEmployees((Array.isArray(data.employees) ? data.employees : []).map(normalizeDirectoryEmployee));
      setDirectoryWarning(data.dataSource?.warning || null);
      setSyncedAt(data.syncedAt || initialNow);
      setPage(1);
    } catch (loadError) {
      setEmployees([]);
      setError(loadError instanceof Error ? loadError.message : 'Unable to load employees');
    } finally {
      setLoading(false);
    }
  }, [initialNow]);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const enrichedEmployees = useMemo(
    () => employees.map((employee) => ({ ...employee, workforceCategory: resolveWorkforceCategory(employee) })),
    [employees],
  );

  const departments = useMemo(
    () => ['All Departments', ...Array.from(new Set(enrichedEmployees.map((e) => e.department).filter(Boolean))).sort((a, b) => a.localeCompare(b))],
    [enrichedEmployees],
  );
  const locations = useMemo(
    () => ['All Locations', ...Array.from(new Set(enrichedEmployees.map((e) => e.location).filter(Boolean))).sort((a, b) => a.localeCompare(b))],
    [enrichedEmployees],
  );
  const statuses = useMemo(
    () => ['All Status', ...Array.from(new Set(enrichedEmployees.map((e) => e.status).filter(Boolean))).sort((a, b) => a.localeCompare(b))],
    [enrichedEmployees],
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<WorkforceCategory, number> = {
      Permanent: 0,
      Contract: 0,
      Lumpsum: 0,
      NYSC: 0,
      'IT Student': 0,
      Other: 0,
    };
    for (const employee of enrichedEmployees) counts[employee.workforceCategory] += 1;
    return counts;
  }, [enrichedEmployees]);

  const statusCounts = useMemo(() => {
    const active = enrichedEmployees.filter((e) => String(e.status).toLowerCase().includes('active')).length;
    const inactive = enrichedEmployees.filter((e) => String(e.status).toLowerCase().includes('inactive')).length;
    const probation = enrichedEmployees.filter((e) => String(e.status).toLowerCase().includes('probation')).length;
    return { active, inactive, probation };
  }, [enrichedEmployees]);

  const filteredEmployees = useMemo(() => {
    const q = debouncedQuery.toLowerCase();
    return enrichedEmployees.filter((employee) => {
      if (departmentFilter !== 'All Departments' && employee.department !== departmentFilter) return false;
      if (locationFilter !== 'All Locations' && employee.location !== locationFilter) return false;
      if (statusFilter !== 'All Status' && employee.status !== statusFilter) return false;

      if (categoryFilter === 'Active' && !String(employee.status).toLowerCase().includes('active')) return false;
      if (categoryFilter === 'Inactive' && !String(employee.status).toLowerCase().includes('inactive')) return false;
      if (categoryFilter === 'Probation' && !String(employee.status).toLowerCase().includes('probation')) return false;
      if (categoryFilter !== 'all' && categoryFilter !== 'Active' && categoryFilter !== 'Inactive' && categoryFilter !== 'Probation') {
        if (employee.workforceCategory !== categoryFilter) return false;
      }

      if (!q) return true;
      return [employee.fullName, employee.employeeId, employee.employeeCode, employee.department, employee.jobTitle, employee.location]
        .some((value) => String(value || '').toLowerCase().includes(q));
    });
  }, [categoryFilter, debouncedQuery, departmentFilter, enrichedEmployees, locationFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / pageSize));
  const pageRows = useMemo(() => filteredEmployees.slice((page - 1) * pageSize, page * pageSize), [filteredEmployees, page, pageSize]);

  const compositionRows = useMemo(() => {
    const rows = (['Permanent', 'Contract', 'Lumpsum', 'NYSC', 'IT Student'] as WorkforceCategory[])
      .map((label) => ({ label, count: categoryCounts[label] }))
      .filter((row) => row.count > 0);
    return rows.length ? rows : [{ label: 'Permanent', count: 0 }];
  }, [categoryCounts]);

  const recentlyAdded = useMemo(() => {
    return [...enrichedEmployees]
      .sort((a, b) => new Date(b.createdAt || b.dateJoined || 0).getTime() - new Date(a.createdAt || a.dateJoined || 0).getTime())
      .slice(0, 5);
  }, [enrichedEmployees]);

  const clearFilters = () => {
    setQuery('');
    setDepartmentFilter('All Departments');
    setLocationFilter('All Locations');
    setStatusFilter('All Status');
    setCategoryFilter('all');
    setPage(1);
  };

  const openProfile = (employee: DirectoryEmployee) => {
    router.push(`/hris/employees/employee-profile/${encodeURIComponent(employee.employeeId)}`);
  };

  const openDrawer = (employee: DirectoryEmployee) => {
    setDrawerEmployee(employee);
    setDrawerTab('personal');
  };

  const exportDirectory = () => {
    const headers = ['Employee ID', 'Name', 'Job Title', 'Department', 'Location', 'Category', 'Status', 'Email', 'Phone'];
    const lines = filteredEmployees.map((employee) => {
      const category = resolveWorkforceCategory(employee);
      return [employee.employeeId, employee.fullName, employee.jobTitle, employee.department, employee.location, category, employee.status, employee.email, employee.phone]
        .map((value) => `"${String(value || '').replace(/"/g, '""')}"`)
        .join(',');
    });
    const blob = new Blob([[headers.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `employee-directory-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
    const items: Array<number | 'ellipsis'> = [1];
    if (page > 3) items.push('ellipsis');
    for (let current = Math.max(2, page - 1); current <= Math.min(totalPages - 1, page + 1); current += 1) items.push(current);
    if (page < totalPages - 2) items.push('ellipsis');
    items.push(totalPages);
    return items;
  }, [page, totalPages]);

  const drawerCategory = drawerEmployee ? resolveWorkforceCategory(drawerEmployee) : 'Other';

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className="border-b border-[#E5E7EB] bg-white px-6 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">Employee Directory</h1>
            <p className="mt-1 max-w-3xl text-sm text-[#64748B]">Centralized directory to search, view and manage employees across the organization.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">Last Updated: {formatDateTime(syncedAt)}</span>
              <button type="button" onClick={() => void loadEmployees()} disabled={loading} className="inline-flex items-center gap-1 rounded-full border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                <RefreshCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={exportDirectory} className="inline-flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Download className="h-4 w-4" />
              Export
            </button>
            <Link href="/hris/employees/add-new-employee" className="inline-flex items-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              <Plus className="h-4 w-4" />
              Add Employee
            </Link>
          </div>
        </div>
      </div>

      <div className="px-6 py-5">
        {error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</div> : null}
        {directoryWarning && !error ? <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">{directoryWarning}</div> : null}

        <div className="flex gap-3 overflow-x-auto pb-1">
          {categoryKpis.map((item) => {
            const value = item.key === 'total' ? enrichedEmployees.length : categoryCounts[item.key];
            const pct = formatPct(value, enrichedEmployees.length || 1);
            return <SummaryCard key={item.key} label={item.label} value={value} pct={item.key === 'total' ? '100%' : pct} accent={item.accent} iconBg={item.iconBg} />;
          })}
        </div>

        <div className="mt-5 rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative w-full max-w-[500px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Search employees..."
                  className="w-full rounded-lg border border-[#E5E7EB] py-2.5 pl-10 pr-3 text-sm text-[#0F172A] placeholder:text-[#64748B] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <select value={departmentFilter} onChange={(event) => { setDepartmentFilter(event.target.value); setPage(1); }} className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-2.5 text-sm font-medium text-slate-700">
                {departments.map((item) => <option key={item} value={item}>{item === 'All Departments' ? 'Department' : item}</option>)}
              </select>
              <select value={locationFilter} onChange={(event) => { setLocationFilter(event.target.value); setPage(1); }} className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-2.5 text-sm font-medium text-slate-700">
                {locations.map((item) => <option key={item} value={item}>{item === 'All Locations' ? 'Location' : item}</option>)}
              </select>
              <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-2.5 text-sm font-medium text-slate-700">
                {statuses.map((item) => <option key={item} value={item}>{item === 'All Status' ? 'Status' : item}</option>)}
              </select>
              <button type="button" onClick={clearFilters} className="text-sm font-semibold text-[#2563EB] hover:text-blue-700">Clear All</button>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setViewMode('card')} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${viewMode === 'card' ? 'border-[#2563EB] bg-blue-50 text-[#2563EB]' : 'border-[#E5E7EB] bg-white text-slate-700'}`}>
                <LayoutGrid className="h-4 w-4" />
                Card View
              </button>
              <button type="button" onClick={() => setViewMode('table')} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${viewMode === 'table' ? 'border-[#2563EB] bg-blue-50 text-[#2563EB]' : 'border-[#E5E7EB] bg-white text-slate-700'}`}>
                <List className="h-4 w-4" />
                Table View
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {[
              { id: 'all' as const, label: 'All Employees', count: enrichedEmployees.length },
              { id: 'Permanent' as const, label: 'Permanent', count: categoryCounts.Permanent },
              { id: 'Contract' as const, label: 'Contract', count: categoryCounts.Contract },
              { id: 'Lumpsum' as const, label: 'Lumpsum', count: categoryCounts.Lumpsum },
              { id: 'NYSC' as const, label: 'NYSC', count: categoryCounts.NYSC },
              { id: 'IT Student' as const, label: 'IT Students', count: categoryCounts['IT Student'] },
              { id: 'Active' as const, label: 'Active', count: statusCounts.active },
              { id: 'Inactive' as const, label: 'Inactive', count: statusCounts.inactive },
              { id: 'Probation' as const, label: 'Probation', count: statusCounts.probation },
            ].map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => {
                  setCategoryFilter(chip.id);
                  setPage(1);
                }}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  categoryFilter === chip.id ? 'bg-[#2563EB] text-white' : 'border border-[#E5E7EB] bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {chip.label} ({formatNumber(chip.count)})
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="min-w-0">
            {viewMode === 'card' ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
                {pageRows.map((employee) => (
                  <EmployeeCard
                    key={employee.id}
                    employee={employee}
                    category={employee.workforceCategory}
                    onView={() => openDrawer(employee)}
                    onEdit={() => openProfile(employee)}
                  />
                ))}
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-[#F8FAFC] text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                      <tr>
                        <th className="px-4 py-3">Employee</th>
                        <th className="px-4 py-3">ID</th>
                        <th className="px-4 py-3">Job Title</th>
                        <th className="px-4 py-3">Department</th>
                        <th className="px-4 py-3">Location</th>
                        <th className="px-4 py-3">Category</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((employee) => (
                        <tr key={employee.id} className="border-t border-[#E5E7EB] hover:bg-[#F8FAFC]">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <EmployeeAvatar
                                fullName={employee.fullName}
                                employeeCode={employee.employeeCode}
                                employeeId={employee.employeeId}
                                photoUrl={employee.photoUrl}
                                hasPhoto={employee.hasPhoto}
                                size="sm"
                              />
                              <span className="font-medium">{employee.fullName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[#64748B]">{employee.employeeCode || employee.employeeId}</td>
                          <td className="px-4 py-3">{employee.jobTitle}</td>
                          <td className="px-4 py-3">{employee.department}</td>
                          <td className="px-4 py-3">{employee.location}</td>
                          <td className="px-4 py-3">{categoryStyles[employee.workforceCategory].label}</td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusTone(employee.status)}`}>{employee.status}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <button type="button" onClick={() => openDrawer(employee)} className="rounded p-1.5 hover:bg-blue-50"><Eye className="h-4 w-4" /></button>
                              <button type="button" onClick={() => openProfile(employee)} className="rounded p-1.5 hover:bg-blue-50"><Edit3 className="h-4 w-4" /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {pageRows.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-[#E5E7EB] bg-white px-6 py-16 text-center text-sm font-semibold text-[#64748B]">
                {loading ? 'Loading employees from HRIS...' : 'No employees match your search or filters.'}
              </div>
            ) : null}

            <div className="mt-5 flex flex-col items-center justify-between gap-3 rounded-xl border border-[#E5E7EB] bg-white px-4 py-3 shadow-sm sm:flex-row">
              <p className="text-sm text-[#64748B]">
                Showing <span className="font-semibold text-[#0F172A]">{formatNumber((page - 1) * pageSize + 1)}</span> to{' '}
                <span className="font-semibold text-[#0F172A]">{formatNumber(Math.min(page * pageSize, filteredEmployees.length))}</span> of{' '}
                <span className="font-semibold text-[#0F172A]">{formatNumber(filteredEmployees.length)}</span> employees
              </p>
              <div className="flex items-center gap-1">
                <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-lg border border-[#E5E7EB] p-2 disabled:opacity-40">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {pageNumbers.map((item, index) =>
                  item === 'ellipsis' ? (
                    <span key={`ellipsis-${index}`} className="px-2 text-sm text-[#64748B]">...</span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setPage(item)}
                      className={`min-w-9 rounded-lg px-3 py-2 text-sm font-semibold ${page === item ? 'bg-[#2563EB] text-white' : 'border border-[#E5E7EB] bg-white text-slate-700 hover:bg-slate-50'}`}
                    >
                      {item}
                    </button>
                  ),
                )}
                <button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} className="rounded-lg border border-[#E5E7EB] p-2 disabled:opacity-40">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <label className="flex items-center gap-2 text-sm text-[#64748B]">
                Show
                <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="rounded-lg border border-[#E5E7EB] bg-white px-2 py-1.5 text-sm font-medium text-slate-700">
                  {[12, 24, 48, 96].map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
                per page
              </label>
            </div>
          </section>

          <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
            <section className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold">Workforce Composition</h2>
              <div className="mt-4">
                <DonutChart rows={compositionRows} total={enrichedEmployees.length} />
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
                  Import Employee
                </Link>
                <Link href="/hris/employees/employee-reports" className="flex items-center gap-3 rounded-lg border border-[#E5E7EB] px-3 py-2.5 text-sm font-semibold text-slate-700 hover:border-blue-200 hover:bg-blue-50">
                  <FileBarChart className="h-4 w-4 text-[#2563EB]" />
                  Generate Report
                </Link>
                <Link href="/hris/employees/employee-transfer" className="flex items-center gap-3 rounded-lg border border-[#E5E7EB] px-3 py-2.5 text-sm font-semibold text-slate-700 hover:border-blue-200 hover:bg-blue-50">
                  <ArrowRightLeft className="h-4 w-4 text-[#2563EB]" />
                  Employee Movements
                </Link>
                <button type="button" onClick={exportDirectory} className="flex w-full items-center gap-3 rounded-lg border border-[#E5E7EB] px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:border-blue-200 hover:bg-blue-50">
                  <Download className="h-4 w-4 text-[#2563EB]" />
                  Export Directory
                </button>
              </div>
            </section>

            <section className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold">Recently Added</h2>
              <div className="mt-3 space-y-3">
                {recentlyAdded.map((employee) => (
                  <button key={employee.id} type="button" onClick={() => openDrawer(employee)} className="flex w-full items-center gap-3 rounded-lg px-1 py-1 text-left hover:bg-[#F8FAFC]">
                    <EmployeeAvatar
                      fullName={employee.fullName}
                      employeeCode={employee.employeeCode}
                      employeeId={employee.employeeId}
                      photoUrl={employee.photoUrl}
                      hasPhoto={employee.hasPhoto}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[#0F172A]">{employee.fullName}</p>
                      <p className="truncate text-xs text-[#64748B]">{employee.employeeCode || employee.employeeId} · {categoryStyles[employee.workforceCategory].label}</p>
                    </div>
                    <span className="text-[11px] font-medium text-[#64748B]">{formatRelativeTime(employee.createdAt || employee.dateJoined)}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold">Employee Code Guide</h2>
              <div className="mt-3 space-y-2">
                {employeeCodeGuide.map((item) => (
                  <div key={item.category} className="flex items-center justify-between gap-3 rounded-lg bg-[#F8FAFC] px-3 py-2 text-xs">
                    <span className="font-semibold text-[#0F172A]">{item.category}</span>
                    <span className="font-medium text-[#64748B]">{item.range}</span>
                  </div>
                ))}
              </div>
              <Link href="/hris/employees/add-new-employee" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#2563EB] hover:text-blue-700">
                Learn More
                <ChevronRight className="h-4 w-4" />
              </Link>
            </section>
          </aside>
        </div>
      </div>

      {drawerEmployee ? (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm" onClick={() => setDrawerEmployee(null)}>
          <div className="absolute right-0 top-0 h-full w-full max-w-[500px] overflow-hidden bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex h-16 items-center justify-between border-b border-[#E5E7EB] px-5">
              <div className="flex min-w-0 items-center gap-3">
                <EmployeeAvatar
                  fullName={drawerEmployee.fullName}
                  employeeCode={drawerEmployee.employeeCode}
                  employeeId={drawerEmployee.employeeId}
                  photoUrl={drawerEmployee.photoUrl}
                  hasPhoto={drawerEmployee.hasPhoto}
                  size="lg"
                />
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-[#0F172A]">{drawerEmployee.fullName}</p>
                  <p className="truncate text-xs text-[#64748B]">{drawerEmployee.employeeCode || drawerEmployee.employeeId} · {drawerEmployee.jobTitle}</p>
                </div>
              </div>
              <button type="button" onClick={() => setDrawerEmployee(null)} className="rounded-lg border border-[#E5E7EB] p-2 hover:bg-slate-50">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="border-b border-[#E5E7EB] px-3 py-2">
              <div className="flex gap-1 overflow-x-auto">
                {drawerTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setDrawerTab(tab.id)}
                    className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${drawerTab === tab.id ? 'bg-[#2563EB] text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-[calc(100%-8rem)] overflow-auto p-5">
              {drawerTab === 'personal' && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <DrawerField label="Full Name" value={drawerEmployee.fullName} />
                  <DrawerField label="Employee ID" value={drawerEmployee.employeeCode || drawerEmployee.employeeId} />
                  <DrawerField label="Email" value={drawerEmployee.email} />
                  <DrawerField label="Phone" value={drawerEmployee.phone} />
                  <DrawerField label="Location" value={drawerEmployee.location} />
                  <DrawerField label="Status" value={drawerEmployee.status} />
                </div>
              )}
              {drawerTab === 'employment' && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <DrawerField label="Job Title" value={drawerEmployee.jobTitle} />
                  <DrawerField label="Department" value={drawerEmployee.department} />
                  <DrawerField label="Business Unit" value={drawerEmployee.businessUnit} />
                  <DrawerField label="Employment Type" value={drawerEmployee.employmentType} />
                  <DrawerField label="Category" value={categoryStyles[drawerCategory].label} />
                  <DrawerField label="Manager" value={drawerEmployee.managerName || 'Unassigned'} />
                  <DrawerField label="Date Joined" value={formatDateOnly(drawerEmployee.dateJoined)} />
                  <DrawerField label="Years of Service" value={`${drawerEmployee.yearsOfService} years`} />
                </div>
              )}
              {drawerTab === 'payroll' && (
                <div className="space-y-3 text-sm text-[#64748B]">
                  <p>Payroll profile and compensation details are available in the full employee profile workspace.</p>
                  <DrawerField label="Payroll Group" value={drawerEmployee.staffCategory || drawerEmployee.employeeCategory || '—'} />
                </div>
              )}
              {drawerTab === 'leave' && <p className="text-sm text-[#64748B]">Leave balances and requests are managed in Leave Management and the employee profile.</p>}
              {drawerTab === 'attendance' && <p className="text-sm text-[#64748B]">Attendance records are available in Workforce Management and Timesheet modules.</p>}
              {drawerTab === 'documents' && <DrawerField label="Document Count" value={formatNumber(drawerEmployee.documentCount || 0)} />}
              {drawerTab === 'performance' && <p className="text-sm text-[#64748B]">Performance ratings and reviews are available in the employee profile workspace.</p>}
              {drawerTab === 'training' && <p className="text-sm text-[#64748B]">Training compliance and certifications are tracked in the employee documents workspace.</p>}
              {drawerTab === 'history' && <p className="text-sm text-[#64748B]">Employment history, movements, and timeline events are available in Employee Lifecycle workspaces.</p>}

              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" onClick={() => openProfile(drawerEmployee)} className="inline-flex items-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                  Open Full Profile
                </button>
                <Link href={`/hris/employees/employment-history/${encodeURIComponent(drawerEmployee.employeeId)}`} className="inline-flex items-center gap-2 rounded-lg border border-[#E5E7EB] px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  View History
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
