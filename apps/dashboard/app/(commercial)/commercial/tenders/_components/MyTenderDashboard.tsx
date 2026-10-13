'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MoreHorizontal, UserRound } from 'lucide-react';
import type { TenderItem, TenderOpportunity } from '@/lib/commercial/tender-types';
import { internalDeadlineOf, preparationOf } from '@/lib/commercial/tender-workflow';
import { formatWhen, tenderGet, tenderPost } from './tender-api';

const isEnquiry = (row: TenderOpportunity) => row.stage === 'Enquiry' || row.tenderType === 'Enquiry' || row.opportunityType === 'Enquiry';

export function MyTenderDashboard() {
  const [rows, setRows] = useState<TenderOpportunity[]>([]);
  const [items, setItems] = useState<TenderItem[]>([]);
  const [me, setMe] = useState({ name: '', code: '', username: '' });
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<'All' | 'Enquiries' | 'Tenders'>('All');

  useEffect(() => {
    let active = true;
    Promise.all([
      tenderGet<TenderOpportunity[]>('opportunities'),
      tenderGet<TenderItem[]>('items'),
      fetch('/api/auth/me', { cache: 'no-store', credentials: 'same-origin' }).then((response) => (response.ok ? response.json() : null)),
    ]).then(([opportunities, itemRows, session]) => {
      if (!active) return;
      setRows(opportunities);
      setItems(itemRows);
      const data = session?.data;
      setMe({ name: String(data?.fullName || ''), code: String(data?.employeeCode || ''), username: String(data?.username || '') });
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Unable to read your assigned work.');
    }).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  const mine = (value: string) => {
    const text = value.toLowerCase();
    if (!text.trim()) return false;
    return [me.name, me.code, me.username].some((part) => part && text.includes(part.toLowerCase()));
  };

  const [notice, setNotice] = useState('');
  const acknowledge = async (id: string) => {
    setError('');
    try {
      await tenderPost({ action: 'acknowledge', id });
      setNotice('Assignment acknowledged.');
      setRows(await tenderGet<TenderOpportunity[]>('opportunities'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The acknowledgement was not saved.');
    }
  };
  const waiting = rows.filter((row) => mine(row.ownerName) && row.ownerName && !row.acknowledgedAt);
  const assigned = [
    ...rows.filter((row) => mine(row.ownerName) || mine(row.ownerEmployeeCode)).map((row) => ({
      id: row.id,
      title: row.title,
      type: isEnquiry(row) ? 'Enquiry' as const : 'Tender' as const,
      assignedBy: row.createdBy || '—',
      internal: internalDeadlineOf(row),
      status: preparationOf(row),
      href: `/commercial/tenders/workspace?id=${row.id}`,
      acknowledge: Boolean(row.ownerName) && !row.acknowledgedAt,
    })),
    ...items.filter((item) => mine(item.assignee) && !/done|closed|cancel|complete/i.test(item.status)).map((item) => {
      const parent = rows.find((row) => row.id === item.opportunityId);
      return {
        id: item.id,
        title: item.title,
        type: parent && isEnquiry(parent) ? 'Enquiry' as const : 'Tender' as const,
        assignedBy: item.createdBy || '—',
        internal: item.dueAt,
        status: /open|new/i.test(item.status) ? 'Not Started' : 'In Progress',
        href: `/commercial/tenders/workspace?id=${item.opportunityId}`,
        acknowledge: false,
      };
    }),
  ];
  const visible = assigned.filter((item) => tab === 'All' || item.type === (tab === 'Enquiries' ? 'Enquiry' : 'Tender'));

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#2563eb] text-white"><UserRound className="h-5 w-5" /></span>
          <div>
            <h1 className="text-[22px] font-black tracking-tight text-slate-950">My Dashboard</h1>
            <p className="text-[12px] text-slate-500">Enquiries and tenders assigned to {me.name || 'you'}. {waiting.length} awaiting acknowledgement.</p>
          </div>
        </div>
      </section>
      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}
      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="text-[15px] font-black text-slate-950">My Assigned Items</h2>
          <Link href="/commercial/tenders/workspace" className="text-[12px] font-semibold text-blue-600">View All</Link>
        </div>
        <div className="flex gap-2 px-4 py-3">
          {(['All', 'Enquiries', 'Tenders'] as const).map((item) => {
            const count = item === 'All' ? assigned.length : assigned.filter((row) => row.type === (item === 'Enquiries' ? 'Enquiry' : 'Tender')).length;
            return (
              <button key={item} type="button" onClick={() => setTab(item)} className={`rounded-lg px-3 py-1.5 text-[12px] font-bold ${tab === item ? 'bg-[#2563eb] text-white' : 'bg-slate-100 text-slate-600'}`}>{item} ({count})</button>
            );
          })}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-[12px]">
            <thead className="text-[11px] uppercase text-slate-400"><tr>{['#', 'Title', 'Type', 'Assigned By', 'Internal Deadline', 'Status', 'Action'].map((heading) => <th key={heading} className="px-4 pb-2 font-semibold">{heading}</th>)}</tr></thead>
            <tbody>
              {visible.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">{ready ? 'No items are assigned to you.' : 'Loading register…'}</td></tr> : visible.map((item, index) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 text-slate-400">{index + 1}</td>
                  <td className="px-4 py-2.5 font-semibold text-slate-800"><Link href={item.href}>{item.title}</Link></td>
                  <td className="px-4 py-2.5">{item.type}</td>
                  <td className="px-4 py-2.5">{item.assignedBy}</td>
                  <td className="px-4 py-2.5">{item.internal ? formatWhen(item.internal) : '—'}</td>
                  <td className="px-4 py-2.5"><span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${item.status === 'Submitted' ? 'bg-emerald-50 text-emerald-700' : item.status === 'In Progress' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{item.status}</span></td>
                  <td className="px-4 py-2.5">{item.acknowledge ? <button type="button" onClick={() => acknowledge(item.id)} className="font-semibold text-blue-700">Acknowledge</button> : <Link href={item.href} aria-label={`Open ${item.title}`} className="text-slate-400"><MoreHorizontal className="h-4 w-4" /></Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  );
}
