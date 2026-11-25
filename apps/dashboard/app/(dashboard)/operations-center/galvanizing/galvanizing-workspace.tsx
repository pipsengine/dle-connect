'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { GALVANIZING_MATERIALS, GALVANIZING_STAGE_LABELS, GALVANIZING_STAGES, NCR_DISPOSITIONS } from '@/lib/galvanizing/constants';
import type { GalvanizingCapabilities, GalvanizingSnapshot } from '@/lib/galvanizing/types';

type Section = 'dashboard' | 'jobs' | 'production' | 'quality' | 'inventory' | 'reports';
type JobTab = 'jobs' | 'gate' | 'articles' | 'release';
type Dialog =
  | { name: 'job' }
  | { name: 'gate' }
  | { name: 'tare'; receiptId: number }
  | { name: 'waybill'; receiptId: number }
  | { name: 'link'; receiptId: number }
  | { name: 'open-job'; receiptId: number }
  | { name: 'incoming'; receiptId: number }
  | { name: 'qc'; receiptId: number }
  | { name: 'batch' }
  | { name: 'stage'; batchId: number }
  | { name: 'inspect' }
  | { name: 'stock' }
  | { name: 'dispatch' }
  | { name: 'pod'; dispatchId: number }
  | { name: 'confirm'; title: string; body: string; action: string; payload: Record<string, unknown>; danger?: boolean };

const emptyCapabilities: GalvanizingCapabilities = {
  view: false, intake: false, qc: false, release: false, production: false, dispatch: false, inventory: false, scrap: false,
};

const tonnes = (value: number) => `${(Number(value || 0) / 1000).toLocaleString('en-NG', { maximumFractionDigits: 3 })} t`;
const kg = (value: number) => `${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 1 })} kg`;
const stageLabel = (stage: string) => GALVANIZING_STAGE_LABELS[stage as keyof typeof GALVANIZING_STAGE_LABELS] || stage;

const fieldClass = 'h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#0b1f4a] focus:ring-4 focus:ring-[#0b1f4a]/10';
const labelClass = 'mb-1.5 block text-xs font-semibold text-slate-600';

function Pill({ value }: { value: string }) {
  const tone = /HOLD|FAIL|REJECT|SCRAP|LOW/.test(value)
    ? 'bg-rose-50 text-rose-700 ring-rose-100'
    : /PASS|RELEASE|COMPLETE|STORED|DISPATCH|AVAILABLE|DELIVER/.test(value)
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
      : 'bg-slate-100 text-slate-700 ring-slate-200';
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${tone}`}>{value.replaceAll('_', ' ')}</span>;
}

function PageHead({ kicker, title, text, children }: { kicker: string; title: string; text: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{kicker}</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
      </div>
      {children}
    </div>
  );
}

function PrimaryButton({ children, disabled, onClick }: { children: ReactNode; disabled?: boolean; onClick: () => void }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="inline-flex h-10 items-center rounded-lg bg-[#0b1f4a] px-4 text-sm font-semibold text-white transition hover:bg-[#16336e] disabled:cursor-not-allowed disabled:opacity-40">{children}</button>;
}

function TextButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="text-sm font-semibold text-[#0b1f4a] hover:underline">{children}</button>;
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}>{children}</section>;
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <Card className="p-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{value}</div>
      {detail ? <div className="mt-2 text-sm text-slate-500">{detail}</div> : null}
    </Card>
  );
}

function DataTable({ columns, rows }: { columns: string[]; rows: ReactNode[][] }) {
  if (!rows.length) return <div className="px-5 py-10 text-sm text-slate-500">No records yet.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <tr>{columns.map((column) => <th key={column} className="px-4 py-3 font-semibold">{column}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <tr key={index} className="align-top hover:bg-slate-50/80">
              {row.map((cell, cellIndex) => <td key={cellIndex} className="px-4 py-3 text-slate-800">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Modal({ title, text, wide, onClose, children }: { title: string; text?: string; wide?: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-3 sm:items-center sm:p-6">
      <button type="button" className="absolute inset-0 bg-slate-950/50" aria-label="Close dialog" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="galvanizing-dialog-title" className={`relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ${wide ? 'max-w-3xl' : 'max-w-lg'}`}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <h2 id="galvanizing-dialog-title" className="text-lg font-semibold text-slate-950">{title}</h2>
            {text ? <p className="mt-1 text-sm leading-6 text-slate-600">{text}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-900">Close</button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

export function GalvanizingWorkspace({ section, tab = 'jobs' }: { section: Section; tab?: JobTab }) {
  const [data, setData] = useState<GalvanizingSnapshot | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/galvanizing', { cache: 'no-store' })
      .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
      .then(({ ok, json }) => {
        if (!active) return;
        if (!ok) setError(json.error || 'Unable to load galvanizing operations.');
        else setData(json.data);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load galvanizing operations.');
      });
    return () => {
      active = false;
    };
  }, []);

  const post = async (action: string, payload: Record<string, unknown>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/galvanizing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'The action was rejected.');
      setData(json.data);
      setNotice(json.notice || 'Saved.');
      setDialog(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The action was rejected.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const caps = data?.capabilities || emptyCapabilities;
  const jobs = data?.jobs || [];
  const receipts = data?.receipts || [];
  const articles = data?.articles || [];
  const batches = data?.batches || [];
  const released = useMemo(() => jobs.filter((job) => job.status === 'RELEASED' || job.status === 'IN_PRODUCTION'), [jobs]);
  const close = useCallback(() => setDialog(null), []);
  const openDialog = (next: Dialog) => {
    setError('');
    setDialog(next);
  };
  const receipt = dialog && 'receiptId' in dialog ? receipts.find((item) => item.id === dialog.receiptId) : undefined;
  const receiptArticles = receipt ? articles.filter((article) => article.receiptId === receipt.id) : [];

  return (
    <div className="space-y-6">
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{notice}</div> : null}
      {error && !dialog ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</div> : null}
      {!data && !error ? <Card><div className="p-10 text-sm text-slate-500">Loading plant records…</div></Card> : null}

      {data && section === 'dashboard' ? (
        <>
          <PageHead kicker="Galvanizing" title="Plant overview" text="Live jobs, holds, and batches from the plant database." />
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <Metric label="Jobs" value={data.dashboard.jobs} />
            <Metric label="Work in progress" value={`${data.dashboard.wipTonnes} t`} detail={`${data.dashboard.activeBatches} open batches`} />
            <Metric label="Accepted output" value={`${data.dashboard.completedTonnes} t`} />
            <Metric label="Open holds" value={data.dashboard.gateHolds + data.dashboard.openNcr} detail={`${data.dashboard.gateHolds} gate · ${data.dashboard.openNcr} NCR · ${data.dashboard.pendingRelease} awaiting release`} />
          </div>
          <Card>
            <div className="border-b border-slate-100 px-5 py-4 text-sm font-semibold text-slate-950">Production sequence</div>
            <div className="grid grid-cols-2 gap-3 p-5 md:grid-cols-4 xl:grid-cols-6">
              {GALVANIZING_STAGES.filter((stage) => stage !== 'COMPLETED').map((stage) => (
                <div key={stage} className="rounded-xl bg-slate-50 px-3 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{stageLabel(stage)}</div>
                  <div className="mt-1 text-2xl font-semibold text-slate-950">{batches.filter((batch) => batch.stage === stage).length}</div>
                </div>
              ))}
            </div>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <div className="border-b border-slate-100 px-5 py-4 text-sm font-semibold text-slate-950">Needs attention</div>
              <ul className="space-y-3 px-5 py-4 text-sm text-slate-700">
                <li>{data.dashboard.gateHolds} vehicle(s) on a missing-waybill hold.</li>
                <li>{receipts.filter((item) => item.tareRecorded !== 'YES').length} vehicle(s) waiting for tare after offloading.</li>
                <li>{data.dashboard.pendingRelease} job(s) waiting for GM Operations release.</li>
                <li>{data.dashboard.openNcr} open nonconformance(s).</li>
                <li>{data.inventory.filter((item) => item.status === 'LOW').length} material(s) at or below reorder.</li>
              </ul>
            </Card>
            <Card>
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div className="text-sm font-semibold text-slate-950">Live batches</div>
                <Link href="/operations-center/galvanizing/production" className="text-sm font-semibold text-[#0b1f4a] hover:underline">Open production</Link>
              </div>
              <DataTable columns={['Batch', 'Job', 'Stage', 'Status']} rows={batches.slice(0, 8).map((batch) => [batch.number, batch.jobNumber, stageLabel(batch.stage), <Pill key={batch.id} value={batch.status} />])} />
            </Card>
          </div>
        </>
      ) : null}

      {data && section === 'jobs' && tab === 'jobs' ? (
        <>
          <PageHead kicker="Jobs and intake" title="Jobs" text="Open a job from an accepted gate receipt. Use this only when the work is booked before the truck arrives.">
            <PrimaryButton disabled={!caps.intake} onClick={() => openDialog({ name: 'job' })}>Register job</PrimaryButton>
          </PageHead>
          <Card>
            <DataTable columns={['Job', 'Ownership', 'Customer / department', 'Title', 'Status']} rows={jobs.map((job) => [job.number, job.ownership, job.customerProject, job.title, <Pill key={job.id} value={job.status} />])} />
          </Card>
        </>
      ) : null}

      {data && section === 'jobs' && tab === 'gate' ? (
        <>
          <PageHead kicker="Jobs and intake" title="Gate and weighing" text="Receive the vehicle before a job exists. Tare is taken after offloading, and a missing waybill stays on hold until an approver signs it.">
            <PrimaryButton disabled={!caps.intake} onClick={() => openDialog({ name: 'gate' })}>Receive vehicle</PrimaryButton>
          </PageHead>
          <Card>
            <DataTable columns={['Receipt', 'Vehicle', 'Document', 'Weight', 'Status', '']} rows={receipts.map((item) => [
              item.number,
              item.vehicle || '—',
              item.document || 'No waybill',
              item.tareRecorded === 'YES' ? `Net ${kg(item.netKg)}` : `Gross ${kg(item.grossKg)}`,
              <Pill key={item.id} value={item.status} />,
              <div key={`${item.id}-actions`} className="flex flex-wrap gap-3">
                {item.tareRecorded !== 'YES' && caps.intake ? <TextButton onClick={() => openDialog({ name: 'tare', receiptId: item.id })}>Record tare</TextButton> : null}
                {item.missingWaybill === 'YES' && !item.exceptionApprovedBy && caps.release ? <TextButton onClick={() => openDialog({ name: 'waybill', receiptId: item.id })}>Approve waybill</TextButton> : null}
                {item.status === 'RECEIVED' && !item.jobId && caps.intake ? <TextButton onClick={() => openDialog({ name: 'open-job', receiptId: item.id })}>Open job</TextButton> : null}
                {item.status === 'RECEIVED' && !item.jobId && caps.intake && jobs.some((job) => job.status !== 'REJECTED') ? <TextButton onClick={() => openDialog({ name: 'link', receiptId: item.id })}>Link job</TextButton> : null}
                {['RECEIVED', 'QC_FAIL', 'QC_HOLD'].includes(item.status) && item.jobId > 0 && caps.qc ? <TextButton onClick={() => openDialog({ name: 'incoming', receiptId: item.id })}>Inspect</TextButton> : null}
                {item.status === 'QC_PENDING_APPROVAL' && (caps.qc || caps.release) ? <TextButton onClick={() => openDialog({ name: 'qc', receiptId: item.id })}>Supervisor decision</TextButton> : null}
              </div>,
            ])} />
          </Card>
        </>
      ) : null}

      {data && section === 'jobs' && tab === 'articles' ? (
        <>
          <PageHead kicker="Jobs and intake" title="Articles" text="Declared quantity is recorded at the gate. Accepted quantity, holes, and thickness are written after inspection." />
          <Card>
            <DataTable columns={['Tag', 'Description', 'Declared', 'Accepted', 'Rejected', 'Holes', 'Double dip', 'Steel mm', 'Coating µm', 'Status']} rows={articles.map((article) => [article.tag, article.description, String(article.quantity), article.acceptedQty == null ? '—' : String(article.acceptedQty), article.rejectedQty == null ? '—' : String(article.rejectedQty), article.holeCount == null ? '—' : String(article.holeCount), article.doubleDip ? `${article.doubleDip} ${article.doubleDipCount ?? ''}` : '—', article.steelThicknessMm == null ? '—' : String(article.steelThicknessMm), article.coatingThicknessUm == null ? '—' : String(article.coatingThicknessUm), <Pill key={article.id} value={article.status} />])} />
          </Card>
        </>
      ) : null}

      {data && section === 'production' ? (
        <>
          <PageHead kicker="Production" title="Batches" text="Only accepted quantity can be scheduled. An open nonconformance holds the batch.">
            <PrimaryButton disabled={!caps.production} onClick={() => openDialog({ name: 'batch' })}>Schedule batch</PrimaryButton>
          </PageHead>
          <Card>
            <DataTable columns={['Batch', 'Job', 'Kettle', 'Weight', 'Stage', 'Status', '']} rows={batches.map((batch) => [
              batch.number,
              batch.jobNumber,
              `${batch.kettle} · ${batch.shift}`,
              tonnes(batch.weightKg),
              stageLabel(batch.stage),
              <Pill key={batch.id} value={batch.status} />,
              batch.status !== 'COMPLETED' && batch.status !== 'REJECTED' && caps.production ? <TextButton key={`${batch.id}-go`} onClick={() => openDialog({ name: 'stage', batchId: batch.id })}>Complete stage</TextButton> : null,
            ])} />
          </Card>
        </>
      ) : null}

      {data && section === 'quality' ? (
        <>
          <PageHead kicker="Quality" title="Inspection and disposition" text="Outcome starts blank. Disposition and severity are asked only when the result is a fail. A final pass records coating thickness in microns and steel thickness in millimetres.">
            <PrimaryButton disabled={!caps.qc} onClick={() => openDialog({ name: 'inspect' })}>Record inspection</PrimaryButton>
          </PageHead>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <div className="border-b border-slate-100 px-5 py-4 text-sm font-semibold text-slate-950">Inspections</div>
              <DataTable columns={['No.', 'Batch', 'Kind', 'Outcome', 'Coating µm', 'Steel mm']} rows={data.inspections.map((item) => [item.number, item.batchNumber, item.kind, <Pill key={item.id} value={item.outcome} />, item.thicknessUm == null ? '—' : String(item.thicknessUm), item.steelThicknessMm == null ? '—' : String(item.steelThicknessMm)])} />
            </Card>
            <Card>
              <div className="border-b border-slate-100 px-5 py-4 text-sm font-semibold text-slate-950">Nonconformance</div>
              <DataTable columns={['No.', 'Batch', 'Disposition', 'Status', '']} rows={data.ncrs.map((item) => [
                item.number,
                item.batchNumber,
                item.disposition,
                <Pill key={item.id} value={item.status} />,
                item.status === 'OPEN' && (caps.qc || caps.scrap) ? <TextButton key={`${item.id}-go`} onClick={() => openDialog({ name: 'confirm', title: 'Close nonconformance', body: `${item.number} will be closed as ${item.disposition.toLowerCase()}. Rework still needs a later pass, and scrap needs scrap authority.`, action: 'close-ncr', payload: { ncrId: item.id } })}>Close</TextButton> : null,
              ])} />
            </Card>
          </div>
        </>
      ) : null}

      {data && section === 'inventory' ? (
        <>
          <PageHead kicker="Inventory and dispatch" title="Stock and dispatch" text="Zinc and chemical movements, then outbound clearance, gate verification, and proof of delivery.">
            <div className="flex flex-wrap gap-2">
              <PrimaryButton disabled={!caps.inventory} onClick={() => openDialog({ name: 'stock' })}>Post movement</PrimaryButton>
              <button type="button" disabled={!caps.dispatch} onClick={() => openDialog({ name: 'dispatch' })} className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-40">Authorize dispatch</button>
            </div>
          </PageHead>
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            {data.inventory.map((item) => <Metric key={item.material} label={item.material} value={`${item.stock.toLocaleString('en-NG')} ${item.unit}`} detail={`${item.status} · reorder ${item.reorder}`} />)}
          </div>
          <Card>
            <div className="border-b border-slate-100 px-5 py-4 text-sm font-semibold text-slate-950">Dispatches</div>
            <DataTable columns={['Dispatch', 'Vehicle', 'Weight', 'Destination', 'Status', '']} rows={data.dispatches.map((item) => [
              <div key={item.id}><div className="font-semibold">{item.number}</div><div className="text-xs text-slate-500">{item.waybill}</div></div>,
              item.vehicle,
              kg(item.weightKg),
              item.destination,
              <Pill key={`${item.id}-status`} value={item.status} />,
              <div key={`${item.id}-actions`} className="flex flex-wrap gap-3">
                {caps.release && item.commercialCleared !== 'YES' ? <TextButton onClick={() => openDialog({ name: 'confirm', title: 'Commercial clearance', body: `${item.number} will be marked commercially cleared.`, action: 'update-dispatch', payload: { dispatchId: item.id, commercialCleared: 'YES' } })}>Clear</TextButton> : null}
                {caps.dispatch && item.status === 'HOLD_VEHICLE' ? <TextButton onClick={() => openDialog({ name: 'confirm', title: 'Accept outbound weight', body: 'The held vehicle can continue once the outbound weight is accepted.', action: 'update-dispatch', payload: { dispatchId: item.id, weightOk: 'YES' } })}>Accept weight</TextButton> : null}
                {caps.dispatch && item.status !== 'HOLD_VEHICLE' && item.commercialCleared === 'YES' && item.gateVerified !== 'YES' ? <TextButton onClick={() => openDialog({ name: 'confirm', title: 'Verify gate', body: 'Security confirms the outbound waybill and weight.', action: 'update-dispatch', payload: { dispatchId: item.id, gateVerified: 'YES', weightOk: 'YES' } })}>Verify gate</TextButton> : null}
                {caps.dispatch && item.status !== 'HOLD_VEHICLE' ? <TextButton onClick={() => openDialog({ name: 'confirm', title: 'Hold vehicle', body: 'The outbound weight does not match. Delivery stays blocked.', action: 'update-dispatch', payload: { dispatchId: item.id, weightOk: 'NO' }, danger: true })}>Hold</TextButton> : null}
                {caps.dispatch && item.gateVerified === 'YES' ? <TextButton onClick={() => openDialog({ name: 'pod', dispatchId: item.id })}>Record POD</TextButton> : null}
              </div>,
            ])} />
          </Card>
        </>
      ) : null}

      {data && section === 'reports' ? (
        <>
          <PageHead kicker="Reports" title="Cost control" text="Labour stays on the galvanizing timesheets. This page shows accepted output and posted material cost only." />
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <Metric label="Accepted tonnes" value={data.dashboard.completedTonnes} />
            <Metric label="Dispatched tonnes" value={(data.dispatches.reduce((sum, item) => sum + item.weightKg, 0) / 1000).toLocaleString('en-NG', { maximumFractionDigits: 3 })} />
            <Metric label="Posted material cost" value={data.dashboard.materialCost.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })} detail="Zinc and chemical movements with a unit cost" />
            <Metric label="Open NCR" value={data.dashboard.openNcr} />
          </div>
          <Card className="p-5">
            <p className="text-sm leading-6 text-slate-600">Profit is not calculated. Charging basis is still with finance. Labour for preparation, galvanizing, and finishing remains on the timesheets.</p>
            <Link href="/hris/workforce-management/timesheet-entry" className="mt-3 inline-flex text-sm font-semibold text-[#0b1f4a] hover:underline">Open timesheet entry</Link>
          </Card>
          <Card>
            <div className="border-b border-slate-100 px-5 py-4 text-sm font-semibold text-slate-950">Audit trail</div>
            <DataTable columns={['When', 'Entity', 'Action', 'Actor', 'Detail']} rows={data.audit.map((item) => [item.at.slice(0, 16).replace('T', ' '), `${item.entity} ${item.entityId}`, item.action, item.actor, item.detail])} />
          </Card>
        </>
      ) : null}

      {dialog?.name === 'job' || dialog?.name === 'open-job' ? (
        <Modal title={dialog.name === 'open-job' ? 'Open job from receipt' : 'Register job'} text={dialog.name === 'open-job' ? 'The vehicle is already accepted. This job is linked to that receipt.' : 'Book work before the truck arrives. A gate receipt can be linked later.'} onClose={close}>
          <RegisterJobForm busy={busy} disabled={!caps.intake} onSubmit={(values) => post('create-job', dialog.name === 'open-job' ? { ...values, receiptId: dialog.receiptId } : values)} />
          {error ? <p className="mt-3 text-sm font-medium text-rose-700">{error}</p> : null}
        </Modal>
      ) : null}
      {dialog?.name === 'gate' ? (
        <Modal title="Receive vehicle" text="Gross weight is taken at entry. Tare is recorded after the steel is offloaded." wide onClose={close}>
          <GateForm busy={busy} disabled={!caps.intake} onSubmit={(values) => post('create-receipt', values)} />
          {error ? <p className="mt-3 text-sm font-medium text-rose-700">{error}</p> : null}
        </Modal>
      ) : null}
      {dialog?.name === 'tare' && receipt ? (
        <Modal title="Tare after offloading" text={`${receipt.number} · gross ${kg(receipt.grossKg)}. Net is calculated and saved to the plant database.`} onClose={close}>
          <TareForm grossKg={receipt.grossKg} busy={busy} onSubmit={(tareKg) => post('record-tare', { receiptId: receipt.id, tareKg })} />
          {error ? <p className="mt-3 text-sm font-medium text-rose-700">{error}</p> : null}
        </Modal>
      ) : null}
      {dialog?.name === 'waybill' && receipt ? (
        <Modal title="Missing waybill" text="The signed-in approver is stored with the reason. Inspection stays blocked until this is saved." onClose={close}>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void post('approve-waybill', { receiptId: receipt.id, ...Object.fromEntries(new FormData(event.currentTarget).entries()) }); }}>
            <Field label="Reason" name="reason" as="select" required placeholder="Choose a reason" options={['NOT_PRESENTED|Not presented', 'ILLEGIBLE|Illegible', 'WRONG_PARTY|Wrong customer or department', 'OTHER|Other']} />
            <label className="block"><span className={labelClass}>What was checked</span><textarea name="narrative" required minLength={5} className="min-h-28 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0b1f4a] focus:ring-4 focus:ring-[#0b1f4a]/10" /></label>
            <Submit busy={busy} label="Approve and save" />
          </form>
          {error ? <p className="mt-3 text-sm font-medium text-rose-700">{error}</p> : null}
        </Modal>
      ) : null}
      {dialog?.name === 'link' && receipt ? (
        <Modal title="Link an existing job" text={`${receipt.number} will be attached to the selected job.`} onClose={close}>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void post('link-job', { receiptId: receipt.id, ...Object.fromEntries(new FormData(event.currentTarget).entries()) }); }}>
            <Field label="Job" name="jobId" as="select" options={jobs.filter((job) => job.status !== 'REJECTED').map((job) => `${job.id}|${job.number} · ${job.customerProject}`)} />
            <Submit busy={busy} label="Link job" />
          </form>
          {error ? <p className="mt-3 text-sm font-medium text-rose-700">{error}</p> : null}
        </Modal>
      ) : null}
      {dialog?.name === 'incoming' && receipt ? (
        <Modal title="Incoming inspection" text={`${receipt.number} · ${receipt.jobNumber}. Accepted and rejected quantities must equal the declared quantity.`} wide onClose={close}>
          <IncomingInspection busy={busy} articles={receiptArticles} onSubmit={(payload) => post('inspect-receipt', { receiptId: receipt.id, ...payload })} />
          {error ? <p className="mt-3 text-sm font-medium text-rose-700">{error}</p> : null}
        </Modal>
      ) : null}
      {dialog?.name === 'qc' && receipt ? (
        <Modal title="Supervisor decision" text={`${receipt.number}. The inspector cannot confirm their own result.`} onClose={close}>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void post('approve-receipt-qc', { receiptId: receipt.id, ...Object.fromEntries(new FormData(event.currentTarget).entries()) }); }}>
            <Field label="Decision" name="outcome" as="select" required placeholder="Choose a decision" options={['PASS|Approve', 'HOLD|Hold', 'FAIL|Reject']} />
            <Submit busy={busy} label="Confirm decision" />
          </form>
          {error ? <p className="mt-3 text-sm font-medium text-rose-700">{error}</p> : null}
        </Modal>
      ) : null}
      {dialog?.name === 'batch' ? (
        <Modal title="Schedule batch" text="Select accepted articles from a released job." wide onClose={close}>
          <form className="space-y-4" onSubmit={(event) => {
            event.preventDefault();
            const values = Object.fromEntries(new FormData(event.currentTarget).entries());
            const selected = articles.filter((article) => values[`article-${article.id}`] === 'on').map((article) => article.id);
            void post('create-batch', { jobId: values.jobId, kettle: values.kettle, shift: values.shift, supervisor: values.supervisor, articleIds: selected });
          }}>
            <Field label="Released job" name="jobId" as="select" options={released.map((job) => `${job.id}|${job.number} · ${job.customerProject}`)} disabled={!caps.production} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Kettle" name="kettle" as="select" options={['Kettle 1', 'Kettle 2', 'Kettle 3']} disabled={!caps.production} />
              <Field label="Shift" name="shift" as="select" options={['Day', 'Night']} disabled={!caps.production} />
            </div>
            <Field label="Supervisor" name="supervisor" disabled={!caps.production} />
            <div className="max-h-56 space-y-2 overflow-auto rounded-xl border border-slate-200 p-3">
              {articles.filter((article) => article.status === 'QC_ACCEPTED').map((article) => (
                <label key={article.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" name={`article-${article.id}`} />
                  {article.tag} · {article.description} · accepted {article.acceptedQty ?? 0}
                </label>
              ))}
              {!articles.some((article) => article.status === 'QC_ACCEPTED') ? <p className="text-sm text-slate-500">No accepted articles are waiting.</p> : null}
            </div>
            <Submit busy={busy} disabled={!caps.production} label="Create batch" />
          </form>
          {error ? <p className="mt-3 text-sm font-medium text-rose-700">{error}</p> : null}
        </Modal>
      ) : null}
      {dialog?.name === 'stage' ? (
        <Modal title="Complete stage" text="The batch moves to the next stage when this is saved." onClose={close}>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void post('advance-stage', { batchId: dialog.batchId, ...Object.fromEntries(new FormData(event.currentTarget).entries()) }); }}>
            <Field label="Stage note" name="note" />
            <Submit busy={busy} label="Complete stage" />
          </form>
          {error ? <p className="mt-3 text-sm font-medium text-rose-700">{error}</p> : null}
        </Modal>
      ) : null}
      {dialog?.name === 'inspect' ? (
        <Modal title="Batch inspection" text="Choose the outcome. A fail asks for disposition and severity. A final pass requires both thickness measurements." onClose={close}>
          <BatchInspection busy={busy} disabled={!caps.qc} batches={batches} onSubmit={(payload) => post('inspect-batch', payload)} />
          {error ? <p className="mt-3 text-sm font-medium text-rose-700">{error}</p> : null}
        </Modal>
      ) : null}
      {dialog?.name === 'stock' ? (
        <Modal title="Post stock movement" text="The quantity is added to or drawn from the DLE Enterprise galvanizing stock." onClose={close}>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void post('move-stock', Object.fromEntries(new FormData(event.currentTarget).entries())); }}>
            <Field label="Material" name="material" as="select" options={GALVANIZING_MATERIALS.map((item) => item.material)} disabled={!caps.inventory} />
            <Field label="Movement" name="kind" as="select" options={['RECEIPT', 'CONSUMPTION', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT']} disabled={!caps.inventory} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Quantity" name="quantity" type="number" disabled={!caps.inventory} />
              <Field label="Unit cost" name="unitCost" type="number" disabled={!caps.inventory} />
            </div>
            <Field label="Lot" name="lot" disabled={!caps.inventory} />
            <Field label="Reference" name="reference" disabled={!caps.inventory} />
            <Field label="Reason" name="reason" disabled={!caps.inventory} />
            <Field label="Evidence" name="evidenceRef" disabled={!caps.inventory} />
            <Submit busy={busy} disabled={!caps.inventory} label="Post movement" />
          </form>
          {error ? <p className="mt-3 text-sm font-medium text-rose-700">{error}</p> : null}
        </Modal>
      ) : null}
      {dialog?.name === 'dispatch' ? (
        <Modal title="Authorize dispatch" text="Weight cannot exceed the accepted batch. A mismatch holds the vehicle." onClose={close}>
          <DispatchForm batches={batches} disabled={!caps.dispatch || busy} onSubmit={(payload) => post('create-dispatch', payload)} />
          {error ? <p className="mt-3 text-sm font-medium text-rose-700">{error}</p> : null}
        </Modal>
      ) : null}
      {dialog?.name === 'pod' ? (
        <Modal title="Proof of delivery" text="Security must already have verified the gate." onClose={close}>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void post('update-dispatch', { dispatchId: dialog.dispatchId, ...Object.fromEntries(new FormData(event.currentTarget).entries()) }); }}>
            <Field label="POD reference" name="podRef" />
            <Submit busy={busy} label="Record POD" />
          </form>
          {error ? <p className="mt-3 text-sm font-medium text-rose-700">{error}</p> : null}
        </Modal>
      ) : null}
      {dialog?.name === 'confirm' ? (
        <Modal title={dialog.title} text={dialog.body} onClose={close}>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={close} className="h-10 rounded-lg px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
            <button type="button" disabled={busy} onClick={() => void post(dialog.action, dialog.payload)} className={`h-10 rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-40 ${dialog.danger ? 'bg-rose-700 hover:bg-rose-800' : 'bg-[#0b1f4a] hover:bg-[#16336e]'}`}>Confirm</button>
          </div>
          {error ? <p className="mt-3 text-sm font-medium text-rose-700">{error}</p> : null}
        </Modal>
      ) : null}
    </div>
  );
}

function Submit({ busy, disabled, label }: { busy: boolean; disabled?: boolean; label: string }) {
  return <button disabled={busy || disabled} className="h-11 rounded-lg bg-[#0b1f4a] px-4 text-sm font-semibold text-white hover:bg-[#16336e] disabled:opacity-40">{label}</button>;
}

function RegisterJobForm({ busy, disabled, onSubmit }: { busy: boolean; disabled: boolean; onSubmit: (values: Record<string, unknown>) => Promise<boolean> }) {
  const [ownership, setOwnership] = useState('EXTERNAL');
  const internal = ownership === 'INTERNAL';
  return (
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void onSubmit(Object.fromEntries(new FormData(event.currentTarget).entries())); }}>
      <label className="block">
        <span className={labelClass}>Ownership</span>
        <select name="ownership" value={ownership} onChange={(event) => setOwnership(event.target.value)} disabled={disabled} className={fieldClass}>
          <option value="EXTERNAL">External customer</option>
          <option value="INTERNAL">Internal DLE</option>
        </select>
      </label>
      <Field label={internal ? 'Department' : 'Customer'} name="customerProject" disabled={disabled} />
      {internal ? <Field label="Project" name="projectCode" disabled={disabled} /> : <Field label="Customer code" name="customerCode" disabled={disabled} />}
      {!internal ? <Field label="Project code" name="projectCode" disabled={disabled} /> : null}
      <Field label="Job title" name="title" disabled={disabled} />
      <Field label={internal ? 'Transfer reference' : 'Purchase order'} name="reference" disabled={disabled} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Due date" name="dueDate" type="date" disabled={disabled} />
        <Field label="Estimated tonnes" name="estimatedTonnes" type="number" disabled={disabled} />
      </div>
      <Field label="Coating standard" name="coatingStandard" defaultValue="ISO 1461" disabled={disabled} />
      <Submit busy={busy} disabled={disabled} label="Save job" />
    </form>
  );
}

function GateForm({ busy, disabled, onSubmit }: { busy: boolean; disabled: boolean; onSubmit: (values: Record<string, unknown>) => Promise<boolean> }) {
  const [lines, setLines] = useState([{ description: '', quantity: '1', weightKg: '' }]);
  return (
    <form className="space-y-4" onSubmit={(event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      void onSubmit({ ...values, missingWaybill: values.missingWaybill === 'on' ? 'YES' : 'NO', articles: lines.filter((line) => line.description.trim()) });
    }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Vehicle" name="vehicle" disabled={disabled} />
        <Field label="Driver" name="driverName" disabled={disabled} />
      </div>
      <Field label="Waybill / transfer note" name="document" disabled={disabled} />
      <label className="flex items-center gap-2 text-sm text-slate-700"><input name="missingWaybill" type="checkbox" /> Waybill is missing. Hold the vehicle for approval.</label>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Gate-in" name="gateInAt" type="datetime-local" disabled={disabled} />
        <Field label="Gross kg" name="grossKg" type="number" disabled={disabled} />
      </div>
      <div className="space-y-2">
        <div className="text-xs font-semibold text-slate-600">Declared articles</div>
        {lines.map((line, index) => (
          <div key={index} className="grid grid-cols-[1fr_88px_110px_auto] gap-2">
            <input aria-label={`Article ${index + 1} description`} className={fieldClass} placeholder="Description" value={line.description} onChange={(event) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))} />
            <input aria-label={`Article ${index + 1} quantity`} className={fieldClass} placeholder="Qty" value={line.quantity} onChange={(event) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: event.target.value } : item))} />
            <input aria-label={`Article ${index + 1} weight`} className={fieldClass} placeholder="kg" value={line.weightKg} onChange={(event) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, weightKg: event.target.value } : item))} />
            <button type="button" className="h-11 rounded-lg px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50" onClick={() => setLines((current) => current.length === 1 ? [{ description: '', quantity: '1', weightKg: '' }] : current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
          </div>
        ))}
        <button type="button" className="text-sm font-semibold text-[#0b1f4a] hover:underline" onClick={() => setLines((current) => [...current, { description: '', quantity: '1', weightKg: '' }])}>Add article</button>
      </div>
      <Submit busy={busy} disabled={disabled} label="Save gate receipt" />
    </form>
  );
}

function TareForm({ grossKg, busy, onSubmit }: { grossKg: number; busy: boolean; onSubmit: (tareKg: number) => Promise<boolean> }) {
  const [tare, setTare] = useState('');
  const tareKg = Number(tare);
  const net = tareKg > 0 && tareKg <= grossKg ? Math.round((grossKg - tareKg) * 1000) / 1000 : null;
  return (
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void onSubmit(tareKg); }}>
      <label className="block">
        <span className={labelClass}>Tare kg</span>
        <input type="number" min="0" step="0.001" value={tare} onChange={(event) => setTare(event.target.value)} className={fieldClass} />
      </label>
      <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">Net weight <span className="font-semibold text-slate-950">{net == null ? '—' : kg(net)}</span></div>
      <Submit busy={busy} disabled={net == null} label="Save tare" />
    </form>
  );
}

function IncomingInspection({ articles, busy, onSubmit }: { articles: GalvanizingSnapshot['articles']; busy: boolean; onSubmit: (payload: Record<string, unknown>) => Promise<boolean> }) {
  const [outcome, setOutcome] = useState('');
  return (
    <form className="space-y-4" onSubmit={(event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      void onSubmit({
        outcome,
        supervisor: values.supervisor,
        remarks: values.remarks,
        disposition: values.disposition,
        severity: values.severity,
        articles: articles.map((article) => ({
          id: article.id,
          acceptedQty: values[`accepted-${article.id}`],
          rejectedQty: values[`rejected-${article.id}`],
          holeCount: values[`holes-${article.id}`],
          doubleDip: values[`dip-${article.id}`],
          doubleDipCount: values[`dipCount-${article.id}`],
          steelThicknessMm: values[`steel-${article.id}`],
          coatingThicknessUm: values[`coating-${article.id}`],
        })),
      });
    }}>
      {articles.map((article) => (
        <div key={article.id} className="rounded-xl border border-slate-200 p-3">
          <div className="text-sm font-semibold text-slate-950">{article.tag} · {article.description}</div>
          <div className="mt-1 text-xs text-slate-500">Declared quantity {article.quantity}</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Accepted quantity" name={`accepted-${article.id}`} type="number" required />
            <Field label="Rejected quantity" name={`rejected-${article.id}`} type="number" required />
            <Field label="Number of holes" name={`holes-${article.id}`} type="number" required />
            <Field label="Double dip" name={`dip-${article.id}`} as="select" required placeholder="Choose" options={['NO|No', 'YES|Yes']} />
            <Field label="Dip count" name={`dipCount-${article.id}`} type="number" required />
            <Field label="Steel thickness (mm)" name={`steel-${article.id}`} type="number" required />
            <Field label="Coating thickness (µm)" name={`coating-${article.id}`} type="number" />
          </div>
        </div>
      ))}
      <label className="block">
        <span className={labelClass}>Outcome</span>
        <select value={outcome} required onChange={(event) => setOutcome(event.target.value)} className={fieldClass}>
          <option value="">Choose outcome</option>
          <option value="PASS">Pass</option>
          <option value="HOLD">Hold</option>
          <option value="FAIL">Fail</option>
        </select>
      </label>
      {outcome === 'FAIL' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Disposition" name="disposition" as="select" placeholder="Choose disposition" options={[...NCR_DISPOSITIONS]} />
          <Field label="Severity" name="severity" as="select" placeholder="Choose severity" options={['MINOR', 'MAJOR', 'CRITICAL']} />
        </div>
      ) : null}
      <Field label="QC supervisor" name="supervisor" required />
      <Field label="Remarks / defect" name="remarks" />
      <Submit busy={busy} disabled={!outcome} label="Save inspection" />
    </form>
  );
}

function BatchInspection({ batches, busy, disabled, onSubmit }: { batches: GalvanizingSnapshot['batches']; busy: boolean; disabled: boolean; onSubmit: (payload: Record<string, unknown>) => Promise<boolean> }) {
  const [outcome, setOutcome] = useState('');
  return (
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void onSubmit({ ...Object.fromEntries(new FormData(event.currentTarget).entries()), outcome }); }}>
      <Field label="Batch" name="batchId" as="select" options={batches.map((batch) => `${batch.id}|${batch.number} · ${batch.stage}`)} disabled={disabled} />
      <Field label="Kind" name="kind" as="select" options={['IN_PROCESS', 'FINAL']} disabled={disabled} />
      <label className="block">
        <span className={labelClass}>Outcome</span>
        <select value={outcome} required onChange={(event) => setOutcome(event.target.value)} disabled={disabled} className={fieldClass}>
          <option value="">Choose outcome</option>
          <option value="PASS">Pass</option>
          <option value="FAIL">Fail</option>
          <option value="HOLD">Hold</option>
        </select>
      </label>
      {outcome === 'FAIL' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Disposition" name="disposition" as="select" placeholder="Choose disposition" options={[...NCR_DISPOSITIONS]} disabled={disabled} />
          <Field label="Severity" name="severity" as="select" placeholder="Choose severity" options={['MINOR', 'MAJOR', 'CRITICAL']} disabled={disabled} />
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Coating thickness (µm)" name="thicknessUm" type="number" disabled={disabled} />
        <Field label="Steel thickness (mm)" name="steelThicknessMm" type="number" disabled={disabled} />
      </div>
      <Field label="Standard" name="standard" defaultValue="ISO 1461" disabled={disabled} />
      <Field label="Remarks / defect" name="remarks" disabled={disabled} />
      <Submit busy={busy} disabled={disabled || !outcome} label="Save inspection" />
    </form>
  );
}

function DispatchForm({ batches, disabled, onSubmit }: { batches: GalvanizingSnapshot['batches']; disabled: boolean; onSubmit: (payload: Record<string, unknown>) => Promise<boolean> }) {
  const completed = batches.filter((batch) => batch.status === 'COMPLETED');
  const [batchId, setBatchId] = useState(String(completed[0]?.id || ''));
  const selected = completed.find((batch) => String(batch.id) === batchId);
  return (
    <form className="space-y-4" onSubmit={(event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      void onSubmit({ ...values, batchId, jobId: selected?.jobId || '', weightOk: values.weightOk === 'on' ? 'NO' : 'YES' });
    }}>
      <label className="block">
        <span className={labelClass}>Completed batch</span>
        <select className={fieldClass} value={batchId} onChange={(event) => setBatchId(event.target.value)} disabled={disabled}>
          {completed.map((batch) => <option key={batch.id} value={batch.id}>{batch.number} · {batch.jobNumber}</option>)}
        </select>
      </label>
      <Field label="Weight kg" name="weightKg" type="number" disabled={disabled} />
      <Field label="Outbound waybill" name="waybill" disabled={disabled} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Vehicle" name="vehicle" disabled={disabled} />
        <Field label="Destination" name="destination" disabled={disabled} />
      </div>
      <Field label="Weighbridge ticket" name="weighbridgeRef" disabled={disabled} />
      <label className="flex items-center gap-2 text-sm text-slate-700"><input name="weightOk" type="checkbox" /> Outbound weight does not match. Hold the vehicle.</label>
      <Submit busy={disabled} label="Save dispatch" />
    </form>
  );
}

function Field({ label, name, as, options = [], type = 'text', defaultValue, disabled, placeholder, required }: {
  label: string;
  name: string;
  as?: 'select';
  options?: string[];
  type?: string;
  defaultValue?: string;
  disabled?: boolean;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      {as === 'select' ? (
        <select name={name} className={fieldClass} disabled={disabled} required={required} defaultValue={placeholder ? '' : options[0]?.split('|')[0] || ''}>
          {placeholder ? <option value="">{placeholder}</option> : null}
          {options.map((option) => {
            const [value, caption] = option.split('|');
            return <option key={option} value={value}>{caption || value}</option>;
          })}
        </select>
      ) : (
        <input name={name} type={type} defaultValue={defaultValue} disabled={disabled} required={required} className={fieldClass} />
      )}
    </label>
  );
}
