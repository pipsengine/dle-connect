'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, RefreshCw, Search } from 'lucide-react';
import { formatSlaTimer, relativeTime, serviceDeskGet, serviceDeskPost } from '../lib/service-desk-api';
import { ServiceDeskItsmShell } from '../ServiceDeskItsmShell';

export type TicketRow = {
  ticketId: string;
  subject: string;
  description: string | null;
  status: string;
  priority: string;
  category: string | null;
  queue: string | null;
  requesterName: string | null;
  department: string | null;
  assigneeName: string | null;
  slaDueAt: string | null;
  isArchived: boolean;
  isReopened: boolean;
  updatedAt: string;
  createdAt: string;
};

type Mode =
  | 'all'
  | 'my'
  | 'assignments'
  | 'open'
  | 'in-progress'
  | 'pending'
  | 'resolved'
  | 'closed'
  | 'overdue'
  | 'reopened'
  | 'archived';

const priorityClass: Record<string, string> = {
  Critical: 'bg-red-100 text-red-700',
  High: 'bg-orange-100 text-orange-700',
  Medium: 'bg-amber-100 text-amber-700',
  Low: 'bg-slate-100 text-slate-600',
};

type Props = {
  mode: Mode;
  title: string;
  description?: string;
};

export function TicketsWorkspace({ mode, title, description }: Props) {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [assignee, setAssignee] = useState('');
  const [showCreate, setShowCreate] = useState(mode === 'my');
  const [form, setForm] = useState({
    subject: '',
    description: '',
    priority: 'Medium',
    category: 'Software',
    impact: 'Medium',
    urgency: 'Medium',
    assigneeName: '',
  });
  const [saving, setSaving] = useState(false);
  const [me, setMe] = useState('');

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((j) => {
        const user = j?.data?.user || j?.data || j?.user || j;
        setMe(user?.fullName || user?.name || user?.username || '');
      })
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string | undefined> = { search: search || undefined };
      if (mode === 'open') params.status = 'Open';
      if (mode === 'in-progress') params.status = 'In Progress';
      if (mode === 'pending') params.status = 'Pending';
      if (mode === 'resolved') params.status = 'Resolved';
      if (mode === 'closed') params.status = 'Closed';
      if (mode === 'overdue') params.overdueOnly = '1';
      if (mode === 'reopened') params.reopened = '1';
      if (mode === 'archived') params.archived = '1';
      else if (mode !== 'all') params.archived = '0';
      if (mode === 'my' && me) params.mineFor = me;
      if (mode === 'assignments') params.archived = '0';

      let rows = await serviceDeskGet<TicketRow[]>('tickets', params);
      if (mode === 'assignments') {
        // show unassigned first then assigned
        rows = [...rows].sort((a, b) => Number(Boolean(a.assigneeName)) - Number(Boolean(b.assigneeName)));
      }
      setTickets(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, [mode, search, me]);

  useEffect(() => {
    void load();
  }, [load]);

  const createTicket = async () => {
    if (!form.subject.trim()) return;
    setSaving(true);
    setError('');
    try {
      await serviceDeskPost('create-ticket', {
        payload: {
          ...form,
          requesterName: me || 'Requester',
          status: 'Open',
        },
      });
      setForm({ subject: '', description: '', priority: 'Medium', category: 'Software', impact: 'Medium', urgency: 'Medium', assigneeName: '' });
      setShowCreate(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create ticket');
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (ticketId: string, status: string) => {
    await serviceDeskPost('update-ticket', { id: ticketId, payload: { status } });
    await load();
  };

  const assignOne = async (ticketId: string, name: string) => {
    await serviceDeskPost('update-ticket', { id: ticketId, payload: { assigneeName: name, status: 'In Progress' } });
    await load();
  };

  const bulkAssign = async () => {
    if (!selected.length || !assignee.trim()) return;
    setSaving(true);
    try {
      await serviceDeskPost('bulk-assign', { ticketIds: selected, assigneeName: assignee.trim() });
      setSelected([]);
      setAssignee('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bulk assign failed');
    } finally {
      setSaving(false);
    }
  };

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const counts = useMemo(
    () => ({
      total: tickets.length,
      unassigned: tickets.filter((t) => !t.assigneeName).length,
      critical: tickets.filter((t) => t.priority === 'Critical').length,
    }),
    [tickets],
  );

  return (
    <ServiceDeskItsmShell title={title} description={description}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tickets…"
              className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm"
            />
          </div>
          <button type="button" onClick={() => void load()} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button type="button" onClick={() => setShowCreate((v) => !v)} className="inline-flex h-10 items-center gap-2 rounded-md bg-teal-700 px-3 text-sm font-semibold text-white">
            <Plus className="h-4 w-4" /> New Ticket
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="text-xs font-semibold uppercase text-slate-500">Shown</div><div className="mt-1 text-2xl font-black text-slate-900">{counts.total}</div></div>
          <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="text-xs font-semibold uppercase text-slate-500">Unassigned</div><div className="mt-1 text-2xl font-black text-slate-900">{counts.unassigned}</div></div>
          <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="text-xs font-semibold uppercase text-slate-500">Critical</div><div className="mt-1 text-2xl font-black text-red-600">{counts.critical}</div></div>
        </div>

        {showCreate ? (
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-black text-slate-900">Create ticket</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <input className="h-10 rounded-md border border-slate-200 px-3 text-sm md:col-span-2" placeholder="Subject" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
              <textarea className="min-h-[90px] rounded-md border border-slate-200 px-3 py-2 text-sm md:col-span-2" placeholder="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              <select className="h-10 rounded-md border border-slate-200 px-3 text-sm" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
                {['Critical', 'High', 'Medium', 'Low'].map((p) => <option key={p}>{p}</option>)}
              </select>
              <select className="h-10 rounded-md border border-slate-200 px-3 text-sm" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                {['Email', 'Network', 'Hardware', 'Software', 'Infrastructure', 'HR'].map((p) => <option key={p}>{p}</option>)}
              </select>
              <input className="h-10 rounded-md border border-slate-200 px-3 text-sm" placeholder="Assignee (optional)" value={form.assigneeName} onChange={(e) => setForm((f) => ({ ...f, assigneeName: e.target.value }))} />
              <button type="button" disabled={saving} onClick={() => void createTicket()} className="h-10 rounded-md bg-teal-700 text-sm font-semibold text-white disabled:opacity-60">
                {saving ? 'Saving…' : 'Submit ticket'}
              </button>
            </div>
          </div>
        ) : null}

        {mode === 'assignments' ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
            <input className="h-10 min-w-[200px] flex-1 rounded-md border border-slate-200 px-3 text-sm" placeholder="Assignee name" value={assignee} onChange={(e) => setAssignee(e.target.value)} />
            <button type="button" disabled={saving || !selected.length} onClick={() => void bulkAssign()} className="h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white disabled:opacity-60">
              Assign {selected.length || ''} selected
            </button>
          </div>
        ) : null}

        {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading tickets…</div>
          ) : tickets.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-500">No tickets found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    {mode === 'assignments' ? <th className="px-3 py-3" /> : null}
                    <th className="px-3 py-3">ID</th>
                    <th className="px-3 py-3">Subject</th>
                    <th className="px-3 py-3">Priority</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Assignee</th>
                    <th className="px-3 py-3">SLA</th>
                    <th className="px-3 py-3">Updated</th>
                    <th className="px-3 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => (
                    <tr key={t.ticketId} className="border-t border-slate-100">
                      {mode === 'assignments' ? (
                        <td className="px-3 py-3">
                          <input type="checkbox" checked={selected.includes(t.ticketId)} onChange={() => toggle(t.ticketId)} />
                        </td>
                      ) : null}
                      <td className="px-3 py-3 font-mono text-xs font-semibold text-slate-700">{t.ticketId}</td>
                      <td className="px-3 py-3">
                        <div className="font-semibold text-slate-900">{t.subject}</div>
                        <div className="text-xs text-slate-500">{t.category || '—'} · {t.requesterName || '—'}</div>
                      </td>
                      <td className="px-3 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${priorityClass[t.priority] || 'bg-slate-100 text-slate-600'}`}>{t.priority}</span></td>
                      <td className="px-3 py-3">{t.status}</td>
                      <td className="px-3 py-3">{t.assigneeName || <span className="text-amber-600">Unassigned</span>}</td>
                      <td className="px-3 py-3">{formatSlaTimer(t.slaDueAt)}</td>
                      <td className="px-3 py-3 text-xs text-slate-500">{relativeTime(t.updatedAt)}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {mode === 'assignments' && !t.assigneeName ? (
                            <button type="button" className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold" onClick={() => void assignOne(t.ticketId, me || 'Service Desk')}>Assign me</button>
                          ) : null}
                          {t.status === 'Open' ? <button type="button" className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold" onClick={() => void updateStatus(t.ticketId, 'In Progress')}>Start</button> : null}
                          {!['Resolved', 'Closed'].includes(t.status) ? <button type="button" className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold" onClick={() => void updateStatus(t.ticketId, 'Resolved')}>Resolve</button> : null}
                          {t.status === 'Resolved' ? <button type="button" className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold" onClick={() => void updateStatus(t.ticketId, 'Closed')}>Close</button> : null}
                          {['Resolved', 'Closed'].includes(t.status) ? <button type="button" className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold" onClick={() => void updateStatus(t.ticketId, 'Open')}>Reopen</button> : null}
                          {!t.isArchived ? <button type="button" className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold" onClick={() => void serviceDeskPost('update-ticket', { id: t.ticketId, payload: { isArchived: true } }).then(load)}>Archive</button> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </ServiceDeskItsmShell>
  );
}
