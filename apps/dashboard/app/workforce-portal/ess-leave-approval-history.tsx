'use client';

import { History } from 'lucide-react';
import { EssCard } from './ess-portal-ui';

export type LeaveApprovalHistoryEvent = {
  at?: string;
  actor?: string;
  action?: string;
  comment?: string;
};

export type LeaveApprovalHistoryItem = {
  id?: string;
  employee?: string;
  employeeCode?: string;
  leaveType?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
  from?: string;
  to?: string;
  days?: number;
  status?: string;
  stage?: string;
  approvalStage?: string;
  submittedAt?: string;
  updatedAt?: string;
  lineManager?: string;
  reliever?: string;
  events?: LeaveApprovalHistoryEvent[];
};

const formatWhen = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
};

const statusClass = (status?: string) => {
  const text = String(status || '').toLowerCase();
  if (text.includes('reject') || text.includes('terminat') || text.includes('cancel')) return 'bg-[#FEF2F2] text-[#B91C1C]';
  if (text.includes('approv') || text.includes('complete') || text.includes('closed')) return 'bg-[#ECFDF5] text-[#047857]';
  if (text.includes('review') || text.includes('pending') || text.includes('submitted')) return 'bg-[#EFF6FF] text-[#1D4ED8]';
  return 'bg-[#F1F5F9] text-[#475569]';
};

export function EssLeaveApprovalHistoryList({
  title,
  emptyTitle,
  emptyDescription,
  rows,
}: {
  title: string;
  emptyTitle: string;
  emptyDescription: string;
  rows: LeaveApprovalHistoryItem[];
}) {
  if (!rows.length) {
    return (
      <EssCard className="p-6 text-center">
        <History className="mx-auto h-8 w-8 text-[#94A3B8]" />
        <p className="mt-3 text-[15px] font-bold text-[#0F172A]">{emptyTitle}</p>
        <p className="mt-1 text-[13px] text-[#64748B]">{emptyDescription}</p>
      </EssCard>
    );
  }

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-[15px] font-bold text-[#0F172A]">{title}</h3>
        <p className="text-[12px] font-medium text-[#64748B]">{rows.length} record{rows.length === 1 ? '' : 's'}</p>
      </div>
      {rows.map((row) => {
        const leaveType = row.leaveType || row.type || 'Leave';
        const start = row.startDate || row.from || '';
        const end = row.endDate || row.to || '';
        return (
          <EssCard key={String(row.id || `${leaveType}-${start}`)} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[14px] font-bold text-[#0F172A]">
                  {row.employee ? `${row.employee} · ${leaveType}` : leaveType}
                </p>
                <p className="mt-1 text-[12px] font-medium text-[#64748B]">
                  {[start && end ? `${start} to ${end}` : start || end, row.days ? `${row.days} day(s)` : '', row.lineManager ? `Manager: ${row.lineManager}` : '']
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${statusClass(row.status)}`}>
                {row.status || row.stage || 'Recorded'}
              </span>
            </div>
            <ol className="mt-3 space-y-2 border-t border-[#E2E8F0] pt-3">
              {(row.events || []).map((event, index) => (
                <li key={`${row.id}-event-${index}`} className="flex gap-3">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#2563EB]" />
                  <div className="min-w-0">
                    <p className="text-[12px] font-bold text-[#0F172A]">{event.action || 'Update'}</p>
                    <p className="text-[11px] font-medium text-[#64748B]">
                      {event.actor || 'Leave Workflow'} · {formatWhen(event.at)}
                    </p>
                    {event.comment ? <p className="mt-0.5 text-[12px] text-[#475569]">{event.comment}</p> : null}
                  </div>
                </li>
              ))}
            </ol>
          </EssCard>
        );
      })}
    </section>
  );
}
