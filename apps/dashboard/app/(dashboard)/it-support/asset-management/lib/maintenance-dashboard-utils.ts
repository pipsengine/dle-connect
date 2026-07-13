import type { ItAssetRecord, ItMaintenanceRecord } from '@/lib/it-asset-management-store';
import { deriveMaintenanceStatus } from './maintenance-utils';

export type EnrichedMaintenanceRecord = ItMaintenanceRecord & {
  displayStatus: string;
  assetTag: string | null;
  maintenanceType: string;
};

const TYPE_LABELS = ['Preventive', 'Corrective', 'Predictive', 'Calibration'] as const;

export const enrichMaintenanceRecord = (
  record: ItMaintenanceRecord,
  assetMap: Map<string, ItAssetRecord>,
): EnrichedMaintenanceRecord => {
  const asset = record.assetId ? assetMap.get(record.assetId) : undefined;
  return {
    ...record,
    department: record.department || asset?.department || null,
    location: record.location || asset?.location || null,
    assetTag: asset?.assetTag || null,
    displayStatus: deriveMaintenanceStatus(record.scheduledDate, record.status),
    maintenanceType: extractMaintenanceType(record.title),
  };
};

export const enrichMaintenanceRecords = (records: ItMaintenanceRecord[], assets: ItAssetRecord[]) => {
  const assetMap = new Map(assets.map((asset) => [asset.assetId, asset]));
  return records.map((record) => enrichMaintenanceRecord(record, assetMap));
};

export const extractMaintenanceType = (title: string) => {
  const value = title.toLowerCase();
  if (value.includes('preventive')) return 'Preventive';
  if (value.includes('corrective') || value.includes('repair')) return 'Corrective';
  if (value.includes('calibration')) return 'Calibration';
  if (value.includes('inspection') || value.includes('software') || value.includes('predictive')) return 'Predictive';
  return 'Preventive';
};

export const formatScheduledRelative = (scheduledDate: string | null, status: string) => {
  if (!scheduledDate) return { date: '—', relative: '', overdue: false };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${scheduledDate}T00:00:00`);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (status === 'Overdue' || diffDays < 0) {
    const days = Math.abs(diffDays);
    return { date: scheduledDate, relative: `${days} day${days === 1 ? '' : 's'} overdue`, overdue: true };
  }
  if (diffDays === 0) return { date: scheduledDate, relative: 'Today', overdue: false };
  return { date: scheduledDate, relative: `In ${diffDays} day${diffDays === 1 ? '' : 's'}`, overdue: false };
};

export const priorityTone = (priority: string) => {
  const value = priority.toLowerCase();
  if (value === 'critical' || value === 'high') return 'bg-rose-50 text-rose-700 ring-rose-100';
  if (value === 'medium') return 'bg-orange-50 text-orange-700 ring-orange-100';
  return 'bg-emerald-50 text-emerald-700 ring-emerald-100';
};

export const statusDotTone = (status: string) => {
  const value = status.toLowerCase();
  if (value === 'overdue') return 'bg-rose-500';
  if (value === 'completed') return 'bg-emerald-500';
  if (value === 'in progress') return 'bg-amber-500';
  if (value === 'planned') return 'bg-blue-500';
  return 'bg-slate-400';
};

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const parseDate = (value: string | null) => (value ? new Date(`${value}T00:00:00`) : null);

export const buildMaintenanceDashboardStats = (records: EnrichedMaintenanceRecord[]) => {
  const total = records.length;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const overdue = records.filter((row) => row.displayStatus === 'Overdue').length;
  const dueThisWeek = records.filter((row) => {
    if (row.displayStatus === 'Completed' || row.displayStatus === 'Cancelled') return false;
    const scheduled = parseDate(row.scheduledDate);
    if (!scheduled) return false;
    return scheduled >= today && scheduled <= weekEnd;
  }).length;

  const monthStart = startOfMonth(today);
  const completedThisMonth = records.filter((row) => {
    if (row.displayStatus !== 'Completed') return false;
    const updated = new Date(row.updatedAt);
    return updated >= monthStart;
  }).length;

  const completionRate = total ? Math.round((completedThisMonth / total) * 1000) / 10 : 0;

  const completedWithSchedule = records.filter((row) => row.displayStatus === 'Completed' && row.scheduledDate);
  const downtimeHours = completedWithSchedule.length
    ? completedWithSchedule.reduce((sum, row) => {
      const scheduled = parseDate(row.scheduledDate);
      const completed = new Date(row.updatedAt);
      if (!scheduled) return sum;
      const hours = Math.max(1, (completed.getTime() - scheduled.getTime()) / 3600000);
      return sum + Math.min(hours, 72);
    }, 0) / completedWithSchedule.length
    : 0;

  const yearStart = new Date(today.getFullYear(), 0, 1);
  const maintenanceCost = records
    .filter((row) => row.displayStatus === 'Completed' && new Date(row.updatedAt) >= yearStart)
    .reduce((sum, row) => sum + estimateMaintenanceCost(row.priority), 0);

  return {
    total,
    overdue,
    overduePct: total ? Math.round((overdue / total) * 1000) / 10 : 0,
    dueThisWeek,
    dueThisWeekPct: total ? Math.round((dueThisWeek / total) * 1000) / 10 : 0,
    completedThisMonth,
    completionRate,
    avgDowntimeHours: Math.round(downtimeHours * 10) / 10,
    maintenanceCostYtd: maintenanceCost,
  };
};

const estimateMaintenanceCost = (priority: string) => {
  const value = priority.toLowerCase();
  if (value === 'critical') return 85000;
  if (value === 'high') return 62000;
  if (value === 'medium') return 38000;
  return 22000;
};

export const buildMaintenanceStatusChart = (records: EnrichedMaintenanceRecord[]) => {
  const buckets = new Map([
    ['Completed', 0],
    ['Overdue', 0],
    ['In Progress', 0],
    ['Planned', 0],
    ['Upcoming', 0],
  ]);
  records.forEach((row) => {
    const key = row.displayStatus === 'Upcoming' ? 'Upcoming' : row.displayStatus;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  });
  const colors: Record<string, string> = {
    Completed: '#22c55e',
    Overdue: '#ef4444',
    'In Progress': '#f59e0b',
    Planned: '#3b82f6',
    Upcoming: '#94a3b8',
  };
  return Array.from(buckets.entries())
    .filter(([, value]) => value > 0)
    .map(([name, value]) => ({ name, value, color: colors[name] || '#64748b' }));
};

export const buildMaintenancePriorityChart = (records: EnrichedMaintenanceRecord[]) => {
  const buckets = { High: 0, Medium: 0, Low: 0 };
  records.forEach((row) => {
    const value = row.priority.toLowerCase();
    if (value === 'critical' || value === 'high') buckets.High += 1;
    else if (value === 'medium') buckets.Medium += 1;
    else buckets.Low += 1;
  });
  return [
    { name: 'High', value: buckets.High, color: '#ef4444' },
    { name: 'Medium', value: buckets.Medium, color: '#f97316' },
    { name: 'Low', value: buckets.Low, color: '#22c55e' },
  ].filter((item) => item.value > 0);
};

export const buildMaintenanceTypeBreakdown = (records: EnrichedMaintenanceRecord[]) => {
  const counts = new Map<string, number>();
  TYPE_LABELS.forEach((label) => counts.set(label, 0));
  records.forEach((row) => {
    counts.set(row.maintenanceType, (counts.get(row.maintenanceType) || 0) + 1);
  });
  const total = records.length || 1;
  return TYPE_LABELS
    .map((name) => {
      const value = counts.get(name) || 0;
      if (!value) return null;
      return { name, value, pct: Math.round((value / total) * 1000) / 10 };
    })
    .filter((item): item is { name: string; value: number; pct: number } => Boolean(item));
};

export const buildUpcomingSchedules = (records: EnrichedMaintenanceRecord[], limit = 4) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return records
    .filter((row) => row.scheduledDate && row.displayStatus !== 'Completed' && row.displayStatus !== 'Cancelled')
    .map((row) => {
      const scheduled = parseDate(row.scheduledDate);
      const diffDays = scheduled ? Math.round((scheduled.getTime() - today.getTime()) / 86400000) : 0;
      return { row, diffDays };
    })
    .filter((item) => item.diffDays >= 0)
    .sort((a, b) => a.diffDays - b.diffDays)
    .slice(0, limit);
};

export const filterMaintenanceRecords = (
  records: EnrichedMaintenanceRecord[],
  filters: {
    search?: string;
    department?: string;
    location?: string;
    status?: string;
    priority?: string;
    dateFrom?: string;
    dateTo?: string;
  },
) => {
  const search = (filters.search || '').trim().toLowerCase();
  return records.filter((row) => {
    if (search) {
      const haystack = [row.title, row.assetName, row.assetTag, row.department, row.location, row.assignedTo]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    if (filters.department && (row.department || '').toLowerCase() !== filters.department.toLowerCase()) return false;
    if (filters.location && (row.location || '').toLowerCase() !== filters.location.toLowerCase()) return false;
    if (filters.status && row.displayStatus.toLowerCase() !== filters.status.toLowerCase()) return false;
    if (filters.priority) {
      const priority = row.priority.toLowerCase();
      const filter = filters.priority.toLowerCase();
      if (filter === 'high' && priority !== 'high' && priority !== 'critical') return false;
      if (filter === 'medium' && priority !== 'medium') return false;
      if (filter === 'low' && priority !== 'low') return false;
    }
    if (filters.dateFrom && row.scheduledDate && row.scheduledDate < filters.dateFrom) return false;
    if (filters.dateTo && row.scheduledDate && row.scheduledDate > filters.dateTo) return false;
    return true;
  });
};

export const paginateRecords = <T,>(records: T[], page: number, pageSize: number) => {
  const total = records.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: records.slice(start, start + pageSize),
    total,
    page: safePage,
    pageSize,
    totalPages,
  };
};

export const currencyNgn = (value: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 1, notation: value >= 1_000_000 ? 'compact' : 'standard' }).format(value || 0);

export const numberFmt = (value: number) => new Intl.NumberFormat('en-NG').format(value || 0);
