'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { TenderApproval, TenderAward, TenderDashboard, TenderDocument, TenderItem, TenderLine, TenderOpportunity, TenderSubmission } from '@/lib/commercial/tender-types';
import { formatWhen, money, tenderGet, tenderPost } from './tender-api';

type Detail = {
  opportunity: TenderOpportunity;
  documents: TenderDocument[];
  lines: TenderLine[];
  approvals: TenderApproval[];
  submissions: TenderSubmission[];
  awards: TenderAward[];
  items: TenderItem[];
  audit: Array<{ id: number; action: string; actor: string; details: string; createdAt: string }>;
};

type Desk = 'workspace' | 'bid' | 'evaluation' | 'approvals' | 'submission' | 'awards' | 'reports' | 'administration';

const titles: Record<Desk, string> = {
  workspace: 'Tender Workspace',
  bid: 'Bid Preparation',
  evaluation: 'Tender Evaluation',
  approvals: 'Approvals',
  submission: 'Submission & Tracking',
  awards: 'Awards & Contracts',
  reports: 'Reports & Intelligence',
  administration: 'Administration',
};

const inputClass = 'h-10 w-full rounded-lg border border-slate-200 px-3 text-sm';

export function TenderDesk({ desk }: { desk: Desk }) {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<TenderOpportunity[]>([]);
  const [selectedId, setSelectedId] = useState(searchParams.get('id') || '');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [dashboard, setDashboard] = useState<TenderDashboard | null>(null);
  const [settings, setSettings] = useState<Array<{ key: string; value: string; updatedBy: string }>>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState<Record<string, string>>({});

  const loadList = async () => {
    const opportunities = await tenderGet<TenderOpportunity[]>('opportunities');
    setRows(opportunities);
    const requested = searchParams.get('id') || '';
    setSelectedId((current) => current || requested || opportunities[0]?.id || '');
  };

  const loadDetail = async (id: string) => {
    if (!id) {
      setDetail(null);
      return;
    }
    const next = await tenderGet<Detail>('opportunity', { id });
    setDetail(next);
  };

  useEffect(() => {
    let active = true;
    setError('');
    const run = async () => {
      try {
        if (desk === 'reports') {
          setDashboard(await tenderGet<TenderDashboard>('dashboard'));
          return;
        }
        if (desk === 'administration') {
          setSettings(await tenderGet('settings'));
          return;
        }
        await loadList();
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to read tender records.');
      }
    };
    run();
    return () => { active = false; };
  }, [desk]);

  useEffect(() => {
    if (!selectedId || desk === 'reports' || desk === 'administration') return;
    loadDetail(selectedId).catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to open this opportunity.'));
  }, [selectedId, desk]);

  const submit = async (action: string, body: Record<string, unknown>) => {
    if (!selectedId) {
      setError('Select an opportunity first.');
      return;
    }
    setError('');
    try {
      await tenderPost({ action, id: selectedId, ...body });
      setNotice('Saved to DLE_Enterprise.');
      setForm({});
      await loadDetail(selectedId);
      await loadList();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Save failed.');
    }
  };

  const opportunity = detail?.opportunity;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black text-slate-950">{titles[desk]}</h1>
        <p className="text-sm text-slate-500">Records are read from and written to DLE_Enterprise. Nothing on this page is sample data.</p>
      </div>
      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      {desk === 'reports' ? (
        <div className="grid gap-3 md:grid-cols-4">
          {[
            ['Pipeline value', money(dashboard?.pipelineValue || 0)],
            ['Awarded value', money(dashboard?.awardedValue || 0)],
            ['Win rate', dashboard?.winRatePct == null ? '—' : `${dashboard.winRatePct}%`],
            ['Closing soon', String(dashboard?.closingSoon ?? 0)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-semibold text-slate-500">{label}</div>
              <div className="mt-1 text-xl font-black">{value}</div>
            </div>
          ))}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 md:col-span-2">
            <h2 className="mb-2 text-sm font-black">Stage value</h2>
            {(dashboard?.byStage || []).every((item) => item.value === 0) ? <p className="text-sm text-slate-500">No pipeline value recorded yet.</p> : (dashboard?.byStage || []).map((item) => (
              <div key={item.label} className="mb-2 flex items-center justify-between text-sm"><span>{item.label}</span><b>{money(item.value)}</b></div>
            ))}
          </section>
        </div>
      ) : null}

      {desk === 'administration' ? (
        <section className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-black">Tender settings</h2>
          <form className="grid gap-2 md:grid-cols-[1fr_1fr_auto]" onSubmit={(event) => { event.preventDefault(); tenderPost({ action: 'setting', key: form.key, value: form.value }).then(() => tenderGet<typeof settings>('settings').then(setSettings)).catch((reason) => setError(reason instanceof Error ? reason.message : 'Save failed.')); }}>
            <input className={inputClass} placeholder="Key" value={form.key || ''} onChange={(event) => setForm({ ...form, key: event.target.value })} />
            <input className={inputClass} placeholder="Value" value={form.value || ''} onChange={(event) => setForm({ ...form, value: event.target.value })} />
            <button className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white" type="submit">Save</button>
          </form>
          <ul className="mt-4 divide-y divide-slate-100 text-sm">
            {settings.length === 0 ? <li className="py-3 text-slate-500">No settings have been saved.</li> : settings.map((setting) => (
              <li key={setting.key} className="flex justify-between gap-3 py-2"><span className="font-semibold">{setting.key}</span><span>{setting.value}</span></li>
            ))}
          </ul>
        </section>
      ) : null}

      {desk !== 'reports' && desk !== 'administration' ? (
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-3 py-2 text-xs font-bold uppercase text-slate-400">{rows.length} opportunities</div>
            {rows.length === 0 ? <p className="p-3 text-sm text-slate-500">No opportunities yet. <Link className="font-semibold text-blue-700" href="/commercial/tenders/opportunities">Register one</Link>.</p> : (
              <ul className="max-h-[70vh] overflow-y-auto">
                {rows.map((row) => (
                  <li key={row.id}>
                    <button type="button" onClick={() => setSelectedId(row.id)} className={`block w-full px-3 py-2 text-left ${selectedId === row.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                      <div className="text-sm font-semibold">{row.referenceNo}</div>
                      <div className="truncate text-xs text-slate-500">{row.title}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            {!opportunity ? <p className="text-sm text-slate-500">Select an opportunity.</p> : (
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-bold text-blue-700">{opportunity.referenceNo}</div>
                  <h2 className="text-lg font-black">{opportunity.title}</h2>
                  <p className="text-sm text-slate-500">{opportunity.clientName} · {opportunity.stage} · {opportunity.status} · {money(opportunity.estimatedValue, opportunity.currency)}</p>
                  <p className="mt-1 text-sm text-slate-600">{opportunity.department || 'No department'} · {opportunity.location || 'No location'} · {opportunity.site || 'No site'}</p>
                </div>

                {desk === 'workspace' ? (
                  <>
                    <p className="text-sm text-slate-700">{opportunity.description || opportunity.scopeSummary || 'No description saved.'}</p>
                    <div>
                      <h3 className="text-sm font-black">Documents</h3>
                      {detail.documents.length === 0 ? <p className="text-sm text-slate-500">No documents uploaded.</p> : detail.documents.map((doc) => (
                        <a key={doc.id} className="block text-sm font-semibold text-blue-700" href={`/api/commercial/tenders?resource=document&documentId=${doc.id}`}>{doc.fileName}</a>
                      ))}
                    </div>
                    <div>
                      <h3 className="text-sm font-black">Activity</h3>
                      {detail.audit.length === 0 ? <p className="text-sm text-slate-500">No activity yet.</p> : detail.audit.map((event) => (
                        <div key={event.id} className="border-t border-slate-100 py-2 text-sm"><b>{event.action}</b> · {event.actor} · {event.details} · {formatWhen(event.createdAt)}</div>
                      ))}
                    </div>
                  </>
                ) : null}

                {desk === 'bid' ? (
                  <>
                    <form className="grid gap-2 md:grid-cols-3" onSubmit={(event) => { event.preventDefault(); submit('line', { line: { description: form.description, section: form.section, quantity: Number(form.quantity || 1), unit: form.unit || 'ea', unitCost: Number(form.unitCost || 0), markupPct: Number(form.markupPct || 0) } }); }}>
                      <input className={inputClass} placeholder="Description" required value={form.description || ''} onChange={(event) => setForm({ ...form, description: event.target.value })} />
                      <input className={inputClass} placeholder="Quantity" value={form.quantity || ''} onChange={(event) => setForm({ ...form, quantity: event.target.value })} />
                      <input className={inputClass} placeholder="Unit cost" value={form.unitCost || ''} onChange={(event) => setForm({ ...form, unitCost: event.target.value })} />
                      <input className={inputClass} placeholder="Unit" value={form.unit || ''} onChange={(event) => setForm({ ...form, unit: event.target.value })} />
                      <input className={inputClass} placeholder="Markup %" value={form.markupPct || ''} onChange={(event) => setForm({ ...form, markupPct: event.target.value })} />
                      <button className="h-10 rounded-lg bg-blue-600 text-sm font-bold text-white" type="submit">Add BOQ line</button>
                    </form>
                    <div className="text-sm">Cost {money(detail.lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0))} · Sell {money(detail.lines.reduce((sum, line) => sum + line.sell, 0))}</div>
                    {detail.lines.length === 0 ? <p className="text-sm text-slate-500">No estimate lines yet.</p> : detail.lines.map((line) => (
                      <div key={line.id} className="border-t border-slate-100 py-2 text-sm"><b>{line.description}</b> · {line.quantity} {line.unit} × {money(line.unitCost)} · Sell {money(line.sell)}</div>
                    ))}
                  </>
                ) : null}

                {desk === 'evaluation' ? (
                  <form className="grid max-w-lg gap-2" onSubmit={(event) => { event.preventDefault(); const decision = form.bidDecision || 'Bid'; submit('save', { opportunity: { ...opportunity, bidDecision: decision, approvalNotes: form.notes || opportunity.approvalNotes, stage: decision === 'No-Bid' ? 'Submitted' : 'Bid Preparation', status: decision === 'No-Bid' ? 'No-Bid' : opportunity.status, saveMode: 'submit' } }); }}>
                    <select className={inputClass} value={form.bidDecision || opportunity.bidDecision || 'Bid'} onChange={(event) => setForm({ ...form, bidDecision: event.target.value })}>
                      <option>Bid</option><option>No-Bid</option><option>Pending</option>
                    </select>
                    <textarea className="min-h-24 rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Evaluation notes" value={form.notes || ''} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
                    <button className="h-10 rounded-lg bg-blue-600 text-sm font-bold text-white" type="submit">Save evaluation</button>
                  </form>
                ) : null}

                {desk === 'approvals' ? (
                  <>
                    <form className="grid max-w-lg gap-2" onSubmit={(event) => { event.preventDefault(); submit('approval', { approval: { stage: form.stage || 'COMMERCIAL', decision: form.decision || 'APPROVE', comments: form.comments } }); }}>
                      <select className={inputClass} value={form.stage || 'COMMERCIAL'} onChange={(event) => setForm({ ...form, stage: event.target.value })}>
                        {['TECHNICAL', 'COMMERCIAL', 'FINANCE', 'LEGAL', 'MANAGEMENT'].map((item) => <option key={item}>{item}</option>)}
                      </select>
                      <select className={inputClass} value={form.decision || 'APPROVE'} onChange={(event) => setForm({ ...form, decision: event.target.value })}>
                        <option>APPROVE</option><option>REJECT</option>
                      </select>
                      <textarea className="min-h-20 rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Comments" value={form.comments || ''} onChange={(event) => setForm({ ...form, comments: event.target.value })} />
                      <button className="h-10 rounded-lg bg-blue-600 text-sm font-bold text-white" type="submit">Record decision</button>
                    </form>
                    {detail.approvals.length === 0 ? <p className="text-sm text-slate-500">No approval decisions recorded.</p> : detail.approvals.map((row) => (
                      <div key={row.id} className="border-t border-slate-100 py-2 text-sm">{row.stage} · <b>{row.decision}</b> · {row.actor} · {row.comments}</div>
                    ))}
                  </>
                ) : null}

                {desk === 'submission' ? (
                  <>
                    <form className="grid max-w-lg gap-2" onSubmit={(event) => { event.preventDefault(); submit('submission', { submission: { channel: form.channel, receiptReference: form.receiptReference, notes: form.notes } }); }}>
                      <input className={inputClass} required placeholder="Channel" value={form.channel || ''} onChange={(event) => setForm({ ...form, channel: event.target.value })} />
                      <input className={inputClass} required placeholder="Receipt reference" value={form.receiptReference || ''} onChange={(event) => setForm({ ...form, receiptReference: event.target.value })} />
                      <button className="h-10 rounded-lg bg-blue-600 text-sm font-bold text-white" type="submit">Record submission</button>
                    </form>
                    {detail.submissions.length === 0 ? <p className="text-sm text-slate-500">No submissions recorded.</p> : detail.submissions.map((row) => (
                      <div key={row.id} className="border-t border-slate-100 py-2 text-sm">{row.channel} · {row.receiptReference} · {row.submittedBy} · {formatWhen(row.submittedAt)}</div>
                    ))}
                  </>
                ) : null}

                {desk === 'awards' ? (
                  <>
                    <form className="grid max-w-lg gap-2" onSubmit={(event) => { event.preventDefault(); submit('award', { award: { contractRef: form.contractRef, awardedValue: Number(form.awardedValue || 0), awardDate: form.awardDate, handoverOwner: form.handoverOwner, handoverNotes: form.handoverNotes } }); }}>
                      <input className={inputClass} required placeholder="Contract reference" value={form.contractRef || ''} onChange={(event) => setForm({ ...form, contractRef: event.target.value })} />
                      <input className={inputClass} required placeholder="Awarded value" value={form.awardedValue || ''} onChange={(event) => setForm({ ...form, awardedValue: event.target.value })} />
                      <input className={inputClass} type="date" value={form.awardDate || ''} onChange={(event) => setForm({ ...form, awardDate: event.target.value })} />
                      <input className={inputClass} placeholder="Handover owner" value={form.handoverOwner || ''} onChange={(event) => setForm({ ...form, handoverOwner: event.target.value })} />
                      <textarea className="min-h-20 rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Handover notes" value={form.handoverNotes || ''} onChange={(event) => setForm({ ...form, handoverNotes: event.target.value })} />
                      <button className="h-10 rounded-lg bg-blue-600 text-sm font-bold text-white" type="submit">Record award</button>
                    </form>
                    {detail.awards.length === 0 ? <p className="text-sm text-slate-500">No awards recorded.</p> : detail.awards.map((row) => (
                      <div key={row.id} className="border-t border-slate-100 py-2 text-sm">{row.contractRef} · {money(row.awardedValue)} · {row.handoverOwner} · {formatWhen(row.awardDate)}</div>
                    ))}
                  </>
                ) : null}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
