import type { Correspondence } from '@/lib/corporate-office/front-desk-types';

export const CLOSE_SLA_DAYS = 3;
const DAY_MS = 86_400_000;

export const todayISO = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};

export const addDaysISO = (iso: string, days: number) => {
  const parsed = new Date(`${iso.slice(0, 10)}T00:00:00`);
  parsed.setDate(parsed.getDate() + days);
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${parsed.getFullYear()}-${month}-${day}`;
};

export const daysBetween = (from: string, to: string) =>
  Math.round((new Date(`${to.slice(0, 10)}T00:00:00`).getTime() - new Date(`${from.slice(0, 10)}T00:00:00`).getTime()) / DAY_MS);

export const formatDate = (value?: string) =>
  value
    ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

export const isPastDeadline = (item: Correspondence, today = todayISO()) =>
  item.status === 'Open' && !!item.dueDate && item.dueDate < today;

export const isOverdue = (item: Correspondence, today = todayISO()) =>
  item.status === 'Open' && (item.dueDate ? isPastDeadline(item, today) : daysBetween(item.dateReceived, today) > CLOSE_SLA_DAYS);

export function describeDue(item: Correspondence, today = todayISO()) {
  if (!item.dueDate) return '';
  if (item.status === 'Closed') return `Due ${formatDate(item.dueDate)}`;
  const delta = daysBetween(today, item.dueDate);
  if (delta === 0) return 'Due today';
  if (delta > 0) return `Due in ${delta} day${delta === 1 ? '' : 's'}`;
  return `${-delta} day${delta === -1 ? '' : 's'} late`;
}

export function displayStatus(
  item: Pick<Correspondence, 'status' | 'workflowStatus' | 'dueDate' | 'assignedEmployeeCode'>,
  today = todayISO(),
): 'New' | 'Assigned' | 'In Progress' | 'Overdue' | 'Closed' {
  if (item.status === 'Closed' || item.workflowStatus === 'Closed' || item.workflowStatus === 'Archived') return 'Closed';
  if (item.dueDate && item.dueDate < today) return 'Overdue';
  if (item.workflowStatus === 'In Progress') return 'In Progress';
  if (item.workflowStatus === 'Assigned' || item.assignedEmployeeCode) return 'Assigned';
  return 'New';
}

export function percentChange(current: number, previous: number) {
  if (!previous) return current ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export function nextOfficeReference(existing: string[], direction: 'Incoming' | 'Outgoing', dateReceived: string) {
  const year = dateReceived.slice(0, 4) || String(new Date().getFullYear());
  const prefix = direction === 'Outgoing' ? `DLE/OUT/${year}/` : `DLE/IN/${year}/`;
  const max = existing
    .filter((reference) => reference.startsWith(prefix))
    .reduce((highest, reference) => Math.max(highest, parseInt(reference.slice(prefix.length), 10) || 0), 0);
  return `${prefix}${String(max + 1).padStart(6, '0')}`;
}

export const unfinishedDepartmentRoutes = <T extends { status?: string }>(routes: T[] = []) =>
  routes.filter((route) => route.status !== 'Completed' && route.status !== 'Waived');

export type FrontDeskDeadlineAlert = {
  key: 'd10' | 'd5' | 'due-1' | 'due-2' | 'due-3';
  daysRemaining: number;
  headline: string;
  intro: string;
  tone: 'warning' | 'danger';
};

/** HOD alerts: 10 days before, a reminder 5 days before, then three alerts on the due date (08:00, 12:00 and 16:00). */
export function frontDeskDeadlineAlert(dueDate: string, now = new Date()): FrontDeskDeadlineAlert | null {
  const due = dueDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return null;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const days = daysBetween(today, due);
  if (days === 10) {
    return {
      key: 'd10',
      daysRemaining: 10,
      headline: 'Correspondence response due in 10 days',
      intro: 'A departmental response is due in 10 days. Please review the correspondence and coordinate your department’s action.',
      tone: 'warning',
    };
  }
  if (days === 5) {
    return {
      key: 'd5',
      daysRemaining: 5,
      headline: 'Reminder: correspondence response due in 5 days',
      intro: 'This is a reminder. Your department’s response is due in 5 days.',
      tone: 'warning',
    };
  }
  if (days !== 0) return null;
  const hour = now.getHours();
  if (hour >= 8 && hour < 12) {
    return {
      key: 'due-1',
      daysRemaining: 0,
      headline: 'Correspondence response is due today',
      intro: 'Your department’s response is due today. This is the first of three alerts on the due date.',
      tone: 'danger',
    };
  }
  if (hour >= 12 && hour < 16) {
    return {
      key: 'due-2',
      daysRemaining: 0,
      headline: 'Second reminder: correspondence response is due today',
      intro: 'Your department’s response is still due today. This is the second of three alerts on the due date.',
      tone: 'danger',
    };
  }
  if (hour >= 16 && hour < 20) {
    return {
      key: 'due-3',
      daysRemaining: 0,
      headline: 'Final reminder: correspondence response is due today',
      intro: 'Your department’s response is due today and is still open. This is the third and final alert for the due date.',
      tone: 'danger',
    };
  }
  return null;
}

export function nextReferenceNo(existing: string[], dateReceived: string) {
  const year = dateReceived.slice(0, 4) || String(new Date().getFullYear());
  const prefix = `COR-${year}-`;
  const max = existing
    .filter((reference) => reference.startsWith(prefix))
    .reduce((highest, reference) => Math.max(highest, parseInt(reference.slice(prefix.length), 10) || 0), 0);
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}
