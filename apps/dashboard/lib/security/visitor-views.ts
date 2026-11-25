import type { VisitorStatus, VisitorVisit } from '@/lib/security/visitor-types';

const COLORS = ['bg-blue-500', 'bg-emerald-500', 'bg-indigo-500', 'bg-amber-500', 'bg-slate-500', 'bg-cyan-600'];

export const visitorInitials = (name: string) =>
  name.trim().split(/\s+/).map((part) => part[0] || '').join('').slice(0, 2).toUpperCase() || 'V';

export const visitorColor = (name: string) => {
  const total = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return COLORS[total % COLORS.length];
};

export const durationToMinutes = (label: string) => {
  const text = label.toLowerCase();
  if (text.includes('half')) return 240;
  if (text.includes('full')) return 480;
  const hours = text.match(/(\d+(?:\.\d+)?)\s*hour/);
  if (hours) return Math.round(Number(hours[1]) * 60);
  const mins = text.match(/(\d+)\s*min/);
  if (mins) return Number(mins[1]);
  const numeric = Number(text);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 60;
};

export const minutesToDuration = (minutes: number) => `${Math.max(15, Math.round(minutes))} min`;

export const todayISO = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const formatVisitDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return value || '—';
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${months[(month || 1) - 1]} ${year}`;
};

export const formatVisitTime = (value: string) => {
  if (!value) return '—';
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return value;
  const hours = Number(match[1]);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${hour12}:${match[2]} ${suffix}`;
};

export const visitDayLabel = (value: string) => {
  if (!value) return 'Unscheduled';
  if (value.slice(0, 10) === todayISO()) return 'Today';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayISO = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  if (value.slice(0, 10) === yesterdayISO) return 'Yesterday';
  return formatVisitDate(value);
};

const epoch = (value: string | null) => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

export type DeskStatus = 'Ready for Check-in' | 'Waiting for Host' | 'Checked In' | 'Checked Out';

export const visitorStageAction = (status: VisitorStatus) => {
  if (status === 'Pending Security Check-in' || status === 'Pending Approval' || status === 'More Info Requested' || status === 'Waiting for Host') {
    return { status: 'Pending Reception Check-in' as const, role: 'security' as const, label: 'Security check-in', action: 'Security checked the visitor in' };
  }
  if (status === 'Pending Reception Check-in') {
    return { status: 'Checked In' as const, role: 'reception' as const, label: 'Reception check-in', action: 'Reception checked the visitor in' };
  }
  if (status === 'Checked In' || status === 'Pending Reception Check-out') {
    return { status: 'Pending Security Check-out' as const, role: 'reception' as const, label: 'Reception check-out', action: 'Reception checked the visitor out' };
  }
  if (status === 'Pending Security Check-out') {
    return { status: 'Checked Out' as const, role: 'security' as const, label: 'Security check-out', action: 'Security checked the visitor out and closed the visit' };
  }
  return null;
};

export const toDeskStatus = (status: VisitorStatus): DeskStatus | null => {
  if (status === 'Checked In' || status === 'Pending Reception Check-out') return 'Checked In';
  if (status === 'Checked Out' || status === 'Pending Security Check-out') return 'Checked Out';
  if (status === 'Waiting for Host' || status === 'Pending Approval' || status === 'More Info Requested') return 'Waiting for Host';
  if (status === 'Pending Reception Check-in' || status === 'Pending Security Check-in') return 'Ready for Check-in';
  return null;
};

export const fromDeskStatus = (status: DeskStatus): VisitorStatus => {
  if (status === 'Checked In') return 'Checked In';
  if (status === 'Checked Out') return 'Pending Security Check-out';
  if (status === 'Waiting for Host') return 'Waiting for Host';
  return 'Pending Reception Check-in';
};

export const visibleOnDesk = (visit: VisitorVisit) => toDeskStatus(visit.status) !== null && visit.status !== 'Draft';

export type DashboardActivityStatus = 'Checked In' | 'Awaiting Approval' | 'Badge Printed' | 'Checked Out';

export const toDashboardStatus = (visit: VisitorVisit): DashboardActivityStatus | null => {
  if (visit.status === 'Draft' || visit.status === 'Cancelled' || visit.status === 'Rejected' || visit.status === 'Blacklisted') return null;
  if (visit.status === 'Checked Out' || visit.status === 'Pending Security Check-out') return 'Checked Out';
  if (visit.status === 'Checked In' || visit.status === 'Pending Reception Check-out') return 'Checked In';
  if (visit.badgeNumber && (visit.status === 'Pending Reception Check-in' || visit.status === 'Waiting for Host')) return 'Badge Printed';
  if (visit.status === 'Pending Approval' || visit.status === 'More Info Requested' || visit.status === 'Pending Security Check-in') return 'Awaiting Approval';
  return 'Badge Printed';
};

export const approvalPageStatus = (status: VisitorStatus) => {
  if (status === 'Rejected' || status === 'Cancelled' || status === 'Blacklisted') return 'Rejected' as const;
  if (status === 'More Info Requested') return 'More Info Requested' as const;
  if (status === 'Pending Approval') return 'Pending Review' as const;
  return 'Approved' as const;
};

export const fromApprovalStatus = (status: 'Pending Review' | 'Approved' | 'Rejected' | 'More Info Requested'): VisitorStatus => {
  if (status === 'Approved') return 'Pending Security Check-in';
  if (status === 'Rejected') return 'Rejected';
  if (status === 'More Info Requested') return 'More Info Requested';
  return 'Pending Approval';
};

export type ReceptionStage =
  | 'Pending Security Check-in'
  | 'Pending Reception Check-in'
  | 'Checked In'
  | 'Pending Reception Check-out'
  | 'Pending Security Check-out'
  | 'Completed'
  | 'Rejected';

export const toReceptionStage = (status: VisitorStatus): ReceptionStage | null => {
  if (status === 'Pending Reception Check-in') return 'Pending Reception Check-in';
  if (status === 'Checked In') return 'Checked In';
  if (status === 'Pending Reception Check-out') return 'Pending Reception Check-out';
  if (status === 'Pending Security Check-out') return 'Pending Security Check-out';
  if (status === 'Checked Out') return 'Completed';
  if (status === 'Rejected' || status === 'Blacklisted' || status === 'Cancelled') return 'Rejected';
  return null;
};

export const fromReceptionStage = (stage: ReceptionStage): VisitorStatus => {
  if (stage === 'Completed') return 'Checked Out';
  if (stage === 'Rejected') return 'Rejected';
  return stage;
};

export const toSecurityStage = (status: VisitorStatus): ReceptionStage | null => {
  if (status === 'Pending Security Check-in') return 'Pending Security Check-in';
  if (status === 'Pending Reception Check-in') return 'Pending Reception Check-in';
  if (status === 'Checked In') return 'Checked In';
  if (status === 'Pending Reception Check-out') return 'Pending Reception Check-out';
  if (status === 'Pending Security Check-out') return 'Pending Security Check-out';
  if (status === 'Checked Out') return 'Completed';
  if (status === 'Rejected' || status === 'Blacklisted') return 'Rejected';
  return null;
};

export const toRequesterStage = (status: VisitorStatus): ReceptionStage | null => {
  if (status === 'Draft' || status === 'Cancelled') return null;
  if (status === 'Pending Approval' || status === 'More Info Requested' || status === 'Pending Security Check-in') return 'Pending Security Check-in';
  return toSecurityStage(status);
};

export type RecordStatus = 'Currently Inside' | 'Checked Out' | 'Expected Today' | 'Pre-Registered' | 'Blacklisted';

export const toRecordStatus = (visit: VisitorVisit): RecordStatus => {
  if (visit.blacklisted || visit.status === 'Blacklisted') return 'Blacklisted';
  if (visit.status === 'Checked In' || visit.status === 'Pending Reception Check-out' || visit.status === 'Pending Security Check-out') return 'Currently Inside';
  if (visit.status === 'Checked Out') return 'Checked Out';
  if (visit.visitDate.slice(0, 10) === todayISO()) return 'Expected Today';
  return 'Pre-Registered';
};

export const previewRows = (visits: VisitorVisit[]) =>
  visits.slice(0, 8).map((visit) => [
    visit.visitorName,
    visit.hostName || '—',
    formatVisitDate(visit.visitDate),
    visit.status,
  ]);

export const summarizeVisits = (visits: VisitorVisit[]) => {
  const departmentCounts = new Map<string, number>();
  const hostCounts = new Map<string, number>();
  const dayCounts = new Map<string, number>();
  const people = new Map<string, number>();
  let durationTotal = 0;
  let durationCount = 0;
  let vendors = 0;
  for (const visit of visits) {
    if (visit.department) departmentCounts.set(visit.department, (departmentCounts.get(visit.department) || 0) + 1);
    if (visit.hostName) hostCounts.set(visit.hostName, (hostCounts.get(visit.hostName) || 0) + 1);
    if (visit.visitDate) {
      const day = new Date(`${visit.visitDate.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' });
      dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
    }
    const minutes = durationToMinutes(visit.duration);
    if (minutes) {
      durationTotal += minutes;
      durationCount += 1;
    }
    const key = visit.visitorName.toLowerCase();
    people.set(key, (people.get(key) || 0) + 1);
    if (visit.visitorType === 'Vendor') vendors += 1;
  }
  const top = (counts: Map<string, number>) => [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || '—';
  const repeats = [...people.values()].filter((count) => count > 1).length;
  const average = durationCount ? durationTotal / durationCount : 0;
  const hours = Math.floor(average / 60);
  const minutes = Math.round(average % 60);
  return {
    department: top(departmentCounts),
    peakDay: top(dayCounts),
    averageDuration: durationCount ? (hours ? `${hours}h ${minutes}m` : `${minutes}m`) : '—',
    topHost: top(hostCounts),
    repeatRate: people.size ? `${Math.round((repeats / people.size) * 100)}%` : '—',
    vendorShare: visits.length ? `${Math.round((vendors / visits.length) * 100)}%` : '—',
    total: visits.length,
  };
};

export const withinRange = (visitDate: string, range: string) => {
  if (!visitDate || range === 'Custom Range') return true;
  const date = visitDate.slice(0, 10);
  const today = todayISO();
  if (range === 'Today') return date === today;
  const start = new Date(`${today}T12:00:00`);
  if (range === 'Last 7 Days') start.setDate(start.getDate() - 7);
  else if (range === 'Last 30 Days') start.setDate(start.getDate() - 30);
  else if (range === 'This Quarter') start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1);
  else return true;
  const startISO = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
  return date >= startISO && date <= today;
};

export const matchesReportStatus = (visit: VisitorVisit, selected: string[]) => {
  if (!selected.length) return true;
  return selected.some((status) => {
    if (status === 'Checked In') return visit.status === 'Checked In' || visit.status === 'Pending Reception Check-out' || visit.status === 'Pending Security Check-out';
    if (status === 'Checked Out') return visit.status === 'Checked Out';
    if (status === 'Pending') return visit.status === 'Pending Approval' || visit.status === 'Pending Security Check-in' || visit.status === 'Pending Reception Check-in' || visit.status === 'More Info Requested' || visit.status === 'Waiting for Host';
    if (status === 'Rejected') return visit.status === 'Rejected' || visit.status === 'Blacklisted' || visit.status === 'Cancelled';
    return visit.status === status;
  });
};

export const filterReportVisits = (
  visits: VisitorVisit[],
  filters: { dateRange: string; visitorTypes: string[]; department: string; host: string; statuses: string[] },
) => visits.filter((visit) => {
  if (!withinRange(visit.visitDate, filters.dateRange)) return false;
  if (filters.visitorTypes.length && visit.visitorType && !filters.visitorTypes.includes(visit.visitorType)) return false;
  if (filters.department && filters.department !== 'All Departments' && visit.department !== filters.department) return false;
  if (filters.host && visit.hostName.toLowerCase() !== filters.host.toLowerCase()) return false;
  return matchesReportStatus(visit, filters.statuses);
});

export const scheduleFromVisit = (visit: VisitorVisit) => {
  const inside = visit.status === 'Checked In' || visit.status === 'Pending Reception Check-out';
  const done = visit.status === 'Checked Out' || visit.status === 'Pending Security Check-out' || visit.status === 'Rejected' || visit.status === 'Cancelled';
  const arrived = visit.status === 'Pending Reception Check-in' || visit.status === 'Waiting for Host';
  return {
    id: visit.id,
    time: visit.visitTime || '—',
    title: visit.purpose || visit.visitorType || 'Visit',
    room: visit.meetingRoom || visit.location || 'Reception',
    visitor: visit.visitorName,
    host: visit.hostName || 'Unassigned',
    status: (done ? 'Completed' : inside ? 'In Progress' : arrived ? 'Arrived' : 'Upcoming') as 'Completed' | 'In Progress' | 'Arrived' | 'Upcoming',
    countdown: done ? 'Completed' : inside ? 'In progress' : arrived ? 'Arrived' : 'Scheduled',
  };
};

export const hostCardsFromVisits = (visits: VisitorVisit[]) => {
  const grouped = new Map<string, { department: string; visits: number; last: string }>();
  for (const visit of visits) {
    if (!visit.hostName) continue;
    const current = grouped.get(visit.hostName) || { department: visit.department, visits: 0, last: visit.visitDate };
    current.visits += 1;
    if (visit.visitDate > current.last) current.last = visit.visitDate;
    if (!current.department) current.department = visit.department;
    grouped.set(visit.hostName, current);
  }
  return [...grouped.entries()].map(([name, value]) => ({
    name,
    department: value.department || '—',
    visits: value.visits,
    lastMeeting: value.last ? formatVisitDate(value.last) : '—',
    initials: visitorInitials(name),
  }));
};

export const groupVisitorProfiles = (visits: VisitorVisit[]) => {
  const groups = new Map<string, VisitorVisit[]>();
  for (const visit of visits) {
    if (visit.status === 'Draft' || visit.status === 'Cancelled') continue;
    const key = `${visit.visitorName.toLowerCase()}|${visit.company.toLowerCase()}`;
    groups.set(key, [...(groups.get(key) || []), visit]);
  }
  return [...groups.values()].map((items) => {
    const ordered = [...items].sort((left, right) => (right.visitDate || right.createdAt).localeCompare(left.visitDate || left.createdAt));
    const latest = ordered[0];
    const hostCounts = new Map<string, number>();
    const deptCounts = new Map<string, number>();
    for (const item of ordered) {
      if (item.hostName) hostCounts.set(item.hostName, (hostCounts.get(item.hostName) || 0) + 1);
      if (item.department) deptCounts.set(item.department, (deptCounts.get(item.department) || 0) + 1);
    }
    const favorite = [...hostCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || latest.hostName;
    const department = [...deptCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || latest.department;
    const durations = ordered.map((item) => durationToMinutes(item.duration)).filter(Boolean);
    const average = durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0;
    return {
      id: latest.id,
      name: latest.visitorName,
      initials: visitorInitials(latest.visitorName),
      color: visitorColor(latest.visitorName),
      company: latest.company,
      visitorType: latest.visitorType || 'Guest',
      phone: latest.phone,
      email: latest.email,
      nationality: latest.nationality,
      lastVisit: formatVisitDate(latest.visitDate || latest.createdAt.slice(0, 10)),
      lastVisitISO: latest.visitDate || latest.createdAt.slice(0, 10),
      totalVisits: ordered.length,
      status: toRecordStatus(latest),
      host: latest.hostName,
      avgDuration: average ? `${Math.floor(average / 60) ? `${Math.floor(average / 60)}h ` : ''}${average % 60}m` : latest.duration || '—',
      favoriteHost: favorite,
      mostVisitedDept: department,
      idVerified: latest.idVerified,
      badgeHistory: ordered.map((item) => item.badgeNumber).filter((value): value is string => Boolean(value)),
      vehicleRegistered: latest.vehicleRegistered,
      itemsCarried: latest.itemsCarried,
      notes: latest.notes,
      isVIP: latest.isVip,
      visits: ordered.map((item) => ({
        date: formatVisitDate(item.visitDate || item.createdAt.slice(0, 10)),
        dateISO: item.visitDate || item.createdAt.slice(0, 10),
        host: item.hostName,
        department: item.department,
        purpose: item.purpose,
        duration: item.status === 'Checked In' ? 'Ongoing' : item.duration || '—',
        status: (item.status === 'Checked In' || item.status === 'Pending Reception Check-out' || item.status === 'Pending Security Check-out' ? 'Ongoing' : 'Completed') as 'Ongoing' | 'Completed',
        checkIn: item.checkInAt ? new Date(item.checkInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : formatVisitTime(item.visitTime),
        checkOut: item.checkOutAt ? new Date(item.checkOutAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null,
      })),
    };
  });
};

export const epochOrNull = epoch;
