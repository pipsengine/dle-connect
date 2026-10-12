'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { TenderBlueprint } from '@/lib/commercial/tender-types';
import { tenderGet, tenderPost } from './tender-api';
import { ActingEmployee } from './acting-employee';

const inputClass = 'h-9 rounded-lg border border-slate-200 px-2 text-[12px]';

const emptyBlueprint = (): TenderBlueprint => ({
  lots: [], parties: [], qualifications: [], scores: [], weightedScore: null, bidThreshold: 60, roles: [], rates: [],
  estimates: [], quotes: [], scenarios: [], cashFlow: { periods: [], npv: null, irr: null, peakFunding: 0, discountRate: 0.12 },
  clauses: [], manifest: [], baselines: [], reviews: [], limits: [],
});

function Capture({ children, onSave, label }: { children: ReactNode; onSave: () => Promise<unknown>; label: string }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form className="mb-3 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-6" onSubmit={(event) => {
      event.preventDefault();
      setBusy(true);
      setError('');
      onSave().catch((reason) => setError(reason instanceof Error ? reason.message : 'The record was not saved.')).finally(() => setBusy(false));
    }}>
      {children}
      <button type="submit" disabled={busy} className="h-9 rounded-lg bg-[#2563eb] px-3 text-[12px] font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : label}</button>
      {error ? <p className="text-[12px] text-rose-600 md:col-span-6">{error}</p> : null}
    </form>
  );
}

export function BlueprintRegisters({ opportunityId, focus }: { opportunityId: string; focus: 'workspace' | 'bid' | 'evaluation' | 'approval' | 'submission' | 'award' | 'reports' | 'admin' }) {
  const [pack, setPack] = useState<TenderBlueprint>(emptyBlueprint);
  const [error, setError] = useState('');
  const [policy, setPolicy] = useState({ threshold: '60', discount: '0.12', stage: 'Commercial Review', limit: '' });

  const load = () => tenderGet<TenderBlueprint>('blueprint', opportunityId ? { id: opportunityId } : {}).then((data) => setPack(data)).catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to read blueprint records.'));
  useEffect(() => { load(); }, [opportunityId]);

  const save = (kind: string, record: Record<string, unknown>) => tenderPost<TenderBlueprint>({ action: 'blueprint', kind, id: opportunityId, record }).then((data) => setPack(data));

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-black text-slate-900">Blueprint registers</h2>
      <div className="mb-3"><ActingEmployee /></div>
      {error ? <p className="mb-2 text-[12px] text-rose-600">{error}</p> : null}

      {focus === 'workspace' && opportunityId ? <WorkspaceForms pack={pack} save={save} /> : null}

      {focus === 'bid' ? <BidForms pack={pack} save={save} opportunityId={opportunityId} /> : null}
      {focus === 'evaluation' && opportunityId ? <EvaluationForms pack={pack} save={save} /> : null}
      {focus === 'approval' ? <p className="text-[12px] text-slate-600">{pack.limits.length ? pack.limits.map((item) => `${item.stage}: ${item.amount}`).join(' · ') : 'No approval limits saved. Set them on Administration. An approver cannot approve their own bid, and a value above a saved limit needs EXCEPTION: in the comment.'}</p> : null}
      {focus === 'submission' ? <p className="text-[12px] text-slate-600">{pack.manifest.length ? pack.manifest.map((item) => `${item.fileName} ${item.contentHash.slice(0, 12)}`).join(' · ') : 'The sealed file manifest is written when a submission is recorded.'}</p> : null}
      {focus === 'award' && opportunityId ? <AwardForm pack={pack} save={save} /> : null}
      {focus === 'reports' && opportunityId ? <ReviewList pack={pack} save={save} /> : null}
      {focus === 'admin' ? <AdminPolicy policy={policy} setPolicy={setPolicy} onSaved={load} /> : null}
    </section>
  );
}

function WorkspaceForms({ pack, save }: { pack: TenderBlueprint; save: (kind: string, record: Record<string, unknown>) => Promise<unknown> }) {
  const [lot, setLot] = useState({ lotCode: '', title: '', estimatedValue: '', currency: 'NGN' });
  const [party, setParty] = useState({ role: 'JV Partner', name: '', worksharePct: '', liability: '', accessScope: '' });
  const [qualification, setQualification] = useState({ certificate: '', referenceNo: '', expiresOn: '', evidence: '' });
  const [role, setRole] = useState({ role: 'Bid Manager', person: '', employeeCode: '' });
  return (
    <>
      <Capture label="Save lot" onSave={() => save('lot', lot)}>
        <input className={inputClass} placeholder="Lot code" value={lot.lotCode} onChange={(event) => setLot({ ...lot, lotCode: event.target.value })} />
        <input required className={`${inputClass} md:col-span-2`} placeholder="Lot title" value={lot.title} onChange={(event) => setLot({ ...lot, title: event.target.value })} />
        <select className={inputClass} value={lot.currency} onChange={(event) => setLot({ ...lot, currency: event.target.value })} aria-label="Lot currency"><option value="NGN">NGN - Nigerian Naira</option><option value="USD">USD - US Dollar</option></select>
        <input className={inputClass} placeholder="Value" value={lot.estimatedValue} onChange={(event) => setLot({ ...lot, estimatedValue: event.target.value })} />
      </Capture>
      <p className="mb-3 text-[12px] text-slate-600">{pack.lots.length ? pack.lots.map((item) => `${item.lotCode} ${item.title}`).join(' · ') : 'No lots saved.'}</p>
      <Capture label="Save party" onSave={() => save('party', party)}>
        <select className={inputClass} value={party.role} onChange={(event) => setParty({ ...party, role: event.target.value })}>{['JV Partner', 'Client', 'Supplier'].map((item) => <option key={item}>{item}</option>)}</select>
        <input required className={inputClass} placeholder="Name" value={party.name} onChange={(event) => setParty({ ...party, name: event.target.value })} />
        <input className={inputClass} placeholder="Workshare %" value={party.worksharePct} onChange={(event) => setParty({ ...party, worksharePct: event.target.value })} />
        <input className={inputClass} placeholder="Liability" value={party.liability} onChange={(event) => setParty({ ...party, liability: event.target.value })} />
        <input className={inputClass} placeholder="Access scope" value={party.accessScope} onChange={(event) => setParty({ ...party, accessScope: event.target.value })} />
      </Capture>
      <p className="mb-3 text-[12px] text-slate-600">{pack.parties.length ? pack.parties.map((item) => `${item.role}: ${item.name} ${item.worksharePct}%`).join(' · ') : 'No parties saved.'}</p>
      <Capture label="Save qualification" onSave={() => save('qualification', qualification)}>
        <input required className={`${inputClass} md:col-span-2`} placeholder="Certificate" value={qualification.certificate} onChange={(event) => setQualification({ ...qualification, certificate: event.target.value })} />
        <input className={inputClass} placeholder="Reference" value={qualification.referenceNo} onChange={(event) => setQualification({ ...qualification, referenceNo: event.target.value })} />
        <input type="date" className={inputClass} value={qualification.expiresOn} onChange={(event) => setQualification({ ...qualification, expiresOn: event.target.value })} aria-label="Expiry" />
        <input className={inputClass} placeholder="Evidence" value={qualification.evidence} onChange={(event) => setQualification({ ...qualification, evidence: event.target.value })} />
      </Capture>
      <p className="mb-3 text-[12px] text-slate-600">{pack.qualifications.length ? pack.qualifications.map((item) => `${item.certificate} ${item.eligibility} ${item.expiresOn}`).join(' · ') : 'No qualification evidence saved.'}</p>
      <Capture label="Save role" onSave={() => save('role', role)}>
        <select className={inputClass} value={role.role} onChange={(event) => setRole({ ...role, role: event.target.value })}>{['Bid Manager', 'Estimator', 'Engineer', 'Commercial Reviewer', 'Legal Reviewer', 'Accountable Executive', 'Delegate'].map((item) => <option key={item}>{item}</option>)}</select>
        <input required className={inputClass} placeholder="Person" value={role.person} onChange={(event) => setRole({ ...role, person: event.target.value })} />
        <input className={inputClass} placeholder="Employee code" value={role.employeeCode} onChange={(event) => setRole({ ...role, employeeCode: event.target.value })} />
      </Capture>
      <p className="text-[12px] text-slate-600">{pack.roles.length ? pack.roles.map((item) => `${item.role}: ${item.person}`).join(' · ') : 'No named roles saved.'}</p>
    </>
  );
}

function BidForms({ pack, save, opportunityId }: { pack: TenderBlueprint; save: (kind: string, record: Record<string, unknown>) => Promise<unknown>; opportunityId: string }) {
  const [rate, setRate] = useState({ code: '', description: '', unit: 'ea', rate: '', currency: 'NGN', locationFactor: '1', effectiveFrom: '' });
  const [estimate, setEstimate] = useState({ label: '', fxRate: '1', explanation: '' });
  const [quote, setQuote] = useState({ supplier: '', lotCode: '', technicalNotes: '', commercialAmount: '', currency: 'NGN' });
  return (
    <>
      <Capture label="Save rate" onSave={() => save('rate', rate)}>
        <input required className={inputClass} placeholder="Code" value={rate.code} onChange={(event) => setRate({ ...rate, code: event.target.value })} />
        <input required className={`${inputClass} md:col-span-2`} placeholder="Description" value={rate.description} onChange={(event) => setRate({ ...rate, description: event.target.value })} />
        <input className={inputClass} placeholder="Unit" value={rate.unit} onChange={(event) => setRate({ ...rate, unit: event.target.value })} />
        <select className={inputClass} value={rate.currency} onChange={(event) => setRate({ ...rate, currency: event.target.value })} aria-label="Rate currency"><option value="NGN">NGN - Nigerian Naira</option><option value="USD">USD - US Dollar</option></select>
        <input required className={inputClass} placeholder="Rate" value={rate.rate} onChange={(event) => setRate({ ...rate, rate: event.target.value })} />
        <input className={inputClass} placeholder="Location factor" value={rate.locationFactor} onChange={(event) => setRate({ ...rate, locationFactor: event.target.value })} />
      </Capture>
      <p className="mb-3 text-[12px] text-slate-600">{pack.rates.length ? pack.rates.map((item) => `${item.code} ${item.rate} ${item.currency}`).join(' · ') : 'No rate-library entries.'}</p>
      {opportunityId ? (
        <>
          <Capture label="Lock estimate snapshot" onSave={() => save('estimate', estimate)}>
            <input className={inputClass} placeholder="Label" value={estimate.label} onChange={(event) => setEstimate({ ...estimate, label: event.target.value })} />
            <input className={inputClass} placeholder="FX rate" value={estimate.fxRate} onChange={(event) => setEstimate({ ...estimate, fxRate: event.target.value })} />
            <input className={`${inputClass} md:col-span-2`} placeholder="Change explanation" value={estimate.explanation} onChange={(event) => setEstimate({ ...estimate, explanation: event.target.value })} />
          </Capture>
          <p className="mb-3 text-[12px] text-slate-600">{pack.estimates.length ? pack.estimates.map((item) => `v${item.version} cost ${item.totalCost.toFixed(2)} sell ${item.totalSell.toFixed(2)} locked`).join(' · ') : 'No locked estimate snapshots.'}</p>
          <Capture label="Save sealed quote" onSave={() => save('quote', quote)}>
            <input required className={inputClass} placeholder="Supplier" value={quote.supplier} onChange={(event) => setQuote({ ...quote, supplier: event.target.value })} />
            <input className={inputClass} placeholder="Lot" value={quote.lotCode} onChange={(event) => setQuote({ ...quote, lotCode: event.target.value })} />
            <input className={inputClass} placeholder="Technical notes" value={quote.technicalNotes} onChange={(event) => setQuote({ ...quote, technicalNotes: event.target.value })} />
            <select className={inputClass} value={quote.currency} onChange={(event) => setQuote({ ...quote, currency: event.target.value })} aria-label="Quotation currency"><option value="NGN">NGN - Nigerian Naira</option><option value="USD">USD - US Dollar</option></select>
            <input className={inputClass} placeholder="Commercial amount" value={quote.commercialAmount} onChange={(event) => setQuote({ ...quote, commercialAmount: event.target.value })} />
          </Capture>
          <ul className="text-[12px] text-slate-600">
            {pack.quotes.length === 0 ? <li>No supplier quotations.</li> : pack.quotes.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 border-t border-slate-100 py-1">
                <span>{item.supplier} · {item.sealed ? 'Sealed' : item.commercialAmount} {item.currency} · {item.technicalNotes}</span>
                {item.sealed ? <button type="button" className="font-semibold text-blue-700" onClick={() => save('quote-release', { quoteId: item.id })}>Release commercial</button> : null}
              </li>
            ))}
          </ul>
        </>
      ) : <p className="text-[12px] text-slate-500">Open an opportunity to lock an estimate or receive a quotation.</p>}
    </>
  );
}

function EvaluationForms({ pack, save }: { pack: TenderBlueprint; save: (kind: string, record: Record<string, unknown>) => Promise<unknown> }) {
  const [score, setScore] = useState({ criterion: '', weightPct: '', score: '', overrideReason: '', authority: '' });
  const [scenario, setScenario] = useState({ name: 'Base', fxRate: '1', escalationPct: '0', productivityPct: '100', delayDays: '0', overrunPct: '0', assumptions: '' });
  const [cash, setCash] = useState({ month: '', inflow: '', outflow: '', retention: '', mobilization: '', guarantee: '' });
  const [clause, setClause] = useState({ clauseType: 'Liquidated damages', text: '', deviation: '', residualRisk: '', owner: '', acceptance: 'OPEN' });
  return (
    <>
      <p className="mb-2 text-[12px] text-slate-600">Weighted score {pack.weightedScore == null ? '—' : pack.weightedScore.toFixed(1)} / threshold {pack.bidThreshold}. A Bid decision is saved only when the score meets the threshold or the approval notes contain override:.</p>
      <Capture label="Save score" onSave={() => save('score', score)}>
        <input required className={inputClass} placeholder="Criterion" value={score.criterion} onChange={(event) => setScore({ ...score, criterion: event.target.value })} />
        <input className={inputClass} placeholder="Weight %" value={score.weightPct} onChange={(event) => setScore({ ...score, weightPct: event.target.value })} />
        <input className={inputClass} placeholder="Score" value={score.score} onChange={(event) => setScore({ ...score, score: event.target.value })} />
        <input className={inputClass} placeholder="Override reason" value={score.overrideReason} onChange={(event) => setScore({ ...score, overrideReason: event.target.value })} />
        <input className={inputClass} placeholder="Authority" value={score.authority} onChange={(event) => setScore({ ...score, authority: event.target.value })} />
      </Capture>
      <Capture label="Save scenario" onSave={() => save('scenario', scenario)}>
        <select className={inputClass} value={scenario.name} onChange={(event) => setScenario({ ...scenario, name: event.target.value })}>{['Base', 'Optimistic', 'Downside', 'Stress'].map((item) => <option key={item}>{item}</option>)}</select>
        <input className={inputClass} placeholder="FX" value={scenario.fxRate} onChange={(event) => setScenario({ ...scenario, fxRate: event.target.value })} />
        <input className={inputClass} placeholder="Escalation %" value={scenario.escalationPct} onChange={(event) => setScenario({ ...scenario, escalationPct: event.target.value })} />
        <input className={inputClass} placeholder="Productivity %" value={scenario.productivityPct} onChange={(event) => setScenario({ ...scenario, productivityPct: event.target.value })} />
        <input className={inputClass} placeholder="Delay days" value={scenario.delayDays} onChange={(event) => setScenario({ ...scenario, delayDays: event.target.value })} />
        <input className={inputClass} placeholder="Overrun %" value={scenario.overrunPct} onChange={(event) => setScenario({ ...scenario, overrunPct: event.target.value })} />
      </Capture>
      <p className="mb-3 text-[12px] text-slate-600">{pack.scenarios.length ? pack.scenarios.map((item) => `${item.name} margin ${item.margin.toFixed(2)}`).join(' · ') : 'No priced scenarios.'}</p>
      <Capture label="Save cash-flow month" onSave={() => save('cashflow', cash)}>
        <input required className={inputClass} placeholder="YYYY-MM" value={cash.month} onChange={(event) => setCash({ ...cash, month: event.target.value })} />
        <input className={inputClass} placeholder="Inflow" value={cash.inflow} onChange={(event) => setCash({ ...cash, inflow: event.target.value })} />
        <input className={inputClass} placeholder="Outflow" value={cash.outflow} onChange={(event) => setCash({ ...cash, outflow: event.target.value })} />
        <input className={inputClass} placeholder="Retention" value={cash.retention} onChange={(event) => setCash({ ...cash, retention: event.target.value })} />
        <input className={inputClass} placeholder="Mobilization" value={cash.mobilization} onChange={(event) => setCash({ ...cash, mobilization: event.target.value })} />
        <input className={inputClass} placeholder="Guarantee" value={cash.guarantee} onChange={(event) => setCash({ ...cash, guarantee: event.target.value })} />
      </Capture>
      <p className="mb-3 text-[12px] text-slate-600">NPV {pack.cashFlow.npv == null ? '—' : pack.cashFlow.npv.toFixed(2)} · IRR {pack.cashFlow.irr == null ? '—' : `${(pack.cashFlow.irr * 100).toFixed(2)}%`} · Peak funding {pack.cashFlow.peakFunding.toFixed(2)} · Discount {(pack.cashFlow.discountRate * 100).toFixed(2)}%</p>
      <Capture label="Save clause" onSave={() => save('clause', clause)}>
        <select className={inputClass} value={clause.clauseType} onChange={(event) => setClause({ ...clause, clauseType: event.target.value })}>{['Liquidated damages', 'Liability cap', 'Indemnity', 'Warranty', 'Defects', 'Termination', 'Insurance', 'Dispute resolution'].map((item) => <option key={item}>{item}</option>)}</select>
        <input className={inputClass} placeholder="Clause text" value={clause.text} onChange={(event) => setClause({ ...clause, text: event.target.value })} />
        <input className={inputClass} placeholder="Deviation" value={clause.deviation} onChange={(event) => setClause({ ...clause, deviation: event.target.value })} />
        <input className={inputClass} placeholder="Residual risk" value={clause.residualRisk} onChange={(event) => setClause({ ...clause, residualRisk: event.target.value })} />
        <input className={inputClass} placeholder="Owner" value={clause.owner} onChange={(event) => setClause({ ...clause, owner: event.target.value })} />
      </Capture>
      <p className="text-[12px] text-slate-600">{pack.clauses.length ? pack.clauses.map((item) => `${item.clauseType} ${item.acceptance}`).join(' · ') : 'No clauses saved.'}</p>
    </>
  );
}

function AwardForm({ pack, save }: { pack: TenderBlueprint; save: (kind: string, record: Record<string, unknown>) => Promise<unknown> }) {
  const [form, setForm] = useState({ awardId: '', lotCode: '', acceptedBy: '', employeeCode: '' });
  return (
    <>
      <Capture label="Hand over baseline" onSave={() => save('baseline', form)}>
        <input className={inputClass} placeholder="Award id (blank uses latest)" value={form.awardId} onChange={(event) => setForm({ ...form, awardId: event.target.value })} />
        <input className={inputClass} placeholder="Lot code for a partial award" value={form.lotCode} onChange={(event) => setForm({ ...form, lotCode: event.target.value })} />
        <input required className={inputClass} placeholder="Project manager acceptance" value={form.acceptedBy} onChange={(event) => setForm({ ...form, acceptedBy: event.target.value })} />
        <input className={inputClass} placeholder="Employee code" value={form.employeeCode} onChange={(event) => setForm({ ...form, employeeCode: event.target.value })} />
      </Capture>
      <p className="text-[12px] text-slate-600">{pack.baselines.length ? pack.baselines.map((item) => `${item.projectCode} accepted by ${item.acceptedBy}`).join(' · ') : 'No project baseline has been accepted.'}</p>
    </>
  );
}

function ReviewList({ pack, save }: { pack: TenderBlueprint; save: (kind: string, record: Record<string, unknown>) => Promise<unknown> }) {
  return (
    <>
      <button type="button" className="mb-3 h-9 rounded-lg bg-[#2563eb] px-3 text-[12px] font-bold text-white" onClick={() => save('review', {})}>Run rules review</button>
      <ul className="space-y-2 text-[12px] text-slate-700">
        {pack.reviews.length === 0 ? <li>No review findings yet.</li> : pack.reviews.map((item) => (
          <li key={item.id} className="rounded-lg border border-slate-100 p-2">
            <div className="font-semibold">{item.finding}</div>
            <div className="text-slate-500">Evidence: {item.evidence} · ruleset {item.ruleset} · confidence {item.confidence}</div>
            <div className="mt-1">{item.humanDecision || 'Awaiting a human decision'}</div>
            {item.humanDecision ? null : (
              <div className="mt-1 flex gap-2">
                <button type="button" className="font-semibold text-emerald-700" onClick={() => save('review-decision', { reviewId: item.id, decision: 'ACCEPT', outcome: 'Accepted by reviewer' })}>Accept</button>
                <button type="button" className="font-semibold text-rose-700" onClick={() => save('review-decision', { reviewId: item.id, decision: 'REJECT', outcome: 'Rejected by reviewer' })}>Reject</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function AdminPolicy({ policy, setPolicy, onSaved }: { policy: { threshold: string; discount: string; stage: string; limit: string }; setPolicy: (value: { threshold: string; discount: string; stage: string; limit: string }) => void; onSaved: () => void }) {
  const [error, setError] = useState('');
  const saveSetting = (key: string, value: string) => tenderPost({ action: 'setting', key, value }).then(() => onSaved());
  return (
    <div className="grid gap-2 md:grid-cols-4">
      <input className={inputClass} placeholder="Bid threshold" value={policy.threshold} onChange={(event) => setPolicy({ ...policy, threshold: event.target.value })} />
      <button type="button" className="h-9 rounded-lg bg-[#2563eb] text-[12px] font-bold text-white" onClick={() => saveSetting('bid.threshold', policy.threshold).catch((reason) => setError(reason instanceof Error ? reason.message : 'Save failed.'))}>Save threshold</button>
      <input className={inputClass} placeholder="Annual discount rate" value={policy.discount} onChange={(event) => setPolicy({ ...policy, discount: event.target.value })} />
      <button type="button" className="h-9 rounded-lg bg-[#2563eb] text-[12px] font-bold text-white" onClick={() => saveSetting('finance.discountRate', policy.discount).catch((reason) => setError(reason instanceof Error ? reason.message : 'Save failed.'))}>Save discount rate</button>
      <select className={inputClass} value={policy.stage} onChange={(event) => setPolicy({ ...policy, stage: event.target.value })}>{['Engineering', 'Commercial Review', 'Finance', 'Legal', 'HSE', 'Management Approval'].map((item) => <option key={item}>{item}</option>)}</select>
      <input className={inputClass} placeholder="Approval limit" value={policy.limit} onChange={(event) => setPolicy({ ...policy, limit: event.target.value })} />
      <button type="button" className="h-9 rounded-lg bg-[#2563eb] text-[12px] font-bold text-white md:col-span-2" onClick={() => saveSetting(`approval.limit.${policy.stage}`, policy.limit).catch((reason) => setError(reason instanceof Error ? reason.message : 'Save failed.'))}>Save approval limit</button>
      {error ? <p className="text-[12px] text-rose-600 md:col-span-4">{error}</p> : null}
    </div>
  );
}
