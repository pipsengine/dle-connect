'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BadgeDollarSign,
  BarChart3,
  Boxes,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileText,
  History,
  LayoutDashboard,
  Loader2,
  MessageSquareMore,
  Plus,
  Save,
  Scale,
  Send,
  Trophy,
  Users,
} from 'lucide-react';
import { moneyNgn, procurementGet, procurementPost } from '../../lib/procurement-api';
import '../cbe-styles.css';

type BidPrice = { original: number; negotiated?: number | null };
type BidItem = {
  itemId: string;
  lineNo: number;
  description: string;
  uom: string | null;
  qty: number;
  prices: Record<string, BidPrice>;
};
type Bidder = {
  bidderId: string;
  name: string;
  code: string | null;
  approved: boolean;
  quoteNo: string | null;
  quoteDate: string | null;
  validUntil: string | null;
  currency: string | null;
  paymentTerms: string | null;
  deliveryPeriod: string | null;
  deliveryLocation: string | null;
  outstanding: number;
  discount: number;
  transportation: number;
  otherCharges: number;
  vatRate: number;
  sortOrder: number;
};
type TechCriteria = {
  criteriaId: string;
  lineNo: number;
  section: string;
  requirement: string;
  mandatory: boolean;
  supplierStatus: Record<string, string>;
  comments: string | null;
};
type NegotiationRound = {
  roundId: string;
  bidderId: string;
  roundDate: string | null;
  method: string | null;
  negotiatedBy: string | null;
  originalValue: number;
  vendorOffer: number;
  agreedValue: number;
  notes: string | null;
  isBafo: boolean;
  createdAt: string;
};
type Recommendation = {
  recommendationId: string;
  recommendedBidderId: string | null;
  recommendedName: string | null;
  basis: string | null;
  status: string;
  submittedAt: string | null;
} | null;
type Approval = {
  approvalId: string;
  stepNo: number;
  roleName: string;
  actorName: string | null;
  status: string;
  actionAt: string | null;
  notes: string | null;
};
type DocumentRow = {
  documentId: string;
  name: string;
  category: string | null;
  vendor: string | null;
  version: string | null;
  uploadedBy: string | null;
  uploadedOn: string | null;
  sizeLabel: string | null;
  createdAt?: string;
};
type AuditRow = {
  auditId: string;
  action: string;
  section: string | null;
  details: string | null;
  actorName: string | null;
  actorRole: string | null;
  createdAt: string;
};
type Evaluation = {
  cbeId: string;
  title: string;
  rfqNumber: string | null;
  project: string | null;
  department: string | null;
  buyerName: string | null;
  currency: string;
  evaluationMethod: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};
type CbeDetail = {
  evaluation: Evaluation;
  bidders: Bidder[];
  items: BidItem[];
  technicalCriteria: TechCriteria[];
  negotiationRounds: NegotiationRound[];
  recommendation: Recommendation;
  approvals: Approval[];
  documents: DocumentRow[];
  audit: AuditRow[];
};

const TABS = [
  'Overview',
  'Bid Comparison',
  'Technical Evaluation',
  'Commercial Evaluation',
  'Negotiation',
  'Recommendation & Approval',
  'Documents',
  'Audit Trail',
] as const;
type Tab = (typeof TABS)[number];

const STAGES = [
  'Overview',
  'Bid Comparison',
  'Technical Evaluation',
  'Commercial Evaluation',
  'Negotiation',
  'Recommendation & Approval',
] as const;

const STATUS_OPTIONS = [
  'Draft',
  'Bid Comparison',
  'Technical Evaluation',
  'Commercial Evaluation',
  'Negotiation',
  'Recommendation & Approval',
  'Awarded',
  'Cancelled',
];

const TECH_STATUSES = ['Compliant', 'Partial', 'Non-Compliant', 'N/A'];

function supplierSubtotal(
  items: Array<{ qty: number; prices?: Record<string, BidPrice> }>,
  bidderId: string,
  negotiated: boolean,
) {
  return items.reduce((sum, item) => {
    const p = item.prices?.[bidderId];
    if (!p) return sum;
    const unit = negotiated ? (p.negotiated ?? p.original) : p.original;
    return sum + item.qty * Number(unit || 0);
  }, 0);
}

function supplierTotal(
  bidder: {
    bidderId: string;
    discount?: number;
    transportation?: number;
    otherCharges?: number;
    vatRate?: number;
  },
  items: Array<{ qty: number; prices?: Record<string, BidPrice> }>,
  negotiated: boolean,
) {
  const subtotal = supplierSubtotal(items, bidder.bidderId, negotiated);
  const taxable =
    subtotal - Number(bidder.discount || 0) + Number(bidder.transportation || 0) + Number(bidder.otherCharges || 0);
  return taxable + taxable * (Number(bidder.vatRate || 0) / 100);
}

function technicalAccepted(criteria: TechCriteria[], bidderId: string) {
  return !criteria.some((c) => c.mandatory && c.supplierStatus?.[bidderId] === 'Non-Compliant');
}

function formatWhen(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function badgeForTech(status: string | undefined) {
  if (status === 'Compliant') return 'badge success';
  if (status === 'Partial') return 'badge warning';
  if (status === 'Non-Compliant') return 'badge danger';
  return 'badge';
}

function stageIndex(status: string) {
  const idx = STAGES.findIndex((s) => s === status);
  if (idx >= 0) return idx;
  if (status === 'Draft') return 0;
  if (status === 'Awarded') return STAGES.length;
  return 1;
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  tone = '',
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  value: string;
  sub: string;
  tone?: string;
}) {
  return (
    <div className="kpi">
      <div className={`kpiIcon ${tone}`}>
        <Icon size={22} />
      </div>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <span>{sub}</span>
      </div>
    </div>
  );
}

type Props = { cbeId: string };

export default function CbeWorkspaceClient({ cbeId }: Props) {
  const [detail, setDetail] = useState<CbeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState<Tab>('Overview');
  const [statusDraft, setStatusDraft] = useState('Draft');
  const [techDraft, setTechDraft] = useState<TechCriteria[]>([]);
  const [onlyAccepted, setOnlyAccepted] = useState(true);

  const [negForm, setNegForm] = useState({
    bidderId: '',
    method: 'Email',
    originalValue: '',
    vendorOffer: '',
    agreedValue: '',
    notes: '',
    isBafo: false,
    roundDate: '',
  });
  const [docForm, setDocForm] = useState({
    name: '',
    category: 'Evaluation Reports',
    vendor: '',
    version: '1.0',
    sizeLabel: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await procurementGet<CbeDetail>('cbe', { id: cbeId });
      setDetail(data);
      setStatusDraft(data.evaluation.status);
      setTechDraft(data.technicalCriteria.map((c) => ({ ...c, supplierStatus: { ...c.supplierStatus } })));
      setNegForm((f) => ({
        ...f,
        bidderId: f.bidderId || data.bidders[0]?.bidderId || '',
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load CBE');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [cbeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const evaluation = detail?.evaluation;
  const bidders = detail?.bidders || [];
  const items = detail?.items || [];
  const criteria = techDraft.length ? techDraft : detail?.technicalCriteria || [];
  const rounds = detail?.negotiationRounds || [];
  const approvals = detail?.approvals || [];
  const documents = detail?.documents || [];
  const audit = detail?.audit || [];
  const recommendation = detail?.recommendation;

  const rankedAll = useMemo(
    () =>
      bidders
        .map((b) => ({
          ...b,
          total: supplierTotal(b, items, true),
          originalTotal: supplierTotal(b, items, false),
          subtotal: supplierSubtotal(items, b.bidderId, true),
          accepted: technicalAccepted(criteria, b.bidderId),
        }))
        .sort((a, b) => a.total - b.total),
    [bidders, items, criteria],
  );

  const rankedAccepted = useMemo(() => rankedAll.filter((b) => b.accepted), [rankedAll]);
  const best = rankedAccepted[0] || null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const saveStatus = () =>
    run(async () => {
      await procurementPost('update-cbe', {
        id: cbeId,
        payload: { status: statusDraft },
      });
    });

  const markBidComparisonComplete = () =>
    run(async () => {
      await procurementPost('update-cbe', {
        id: cbeId,
        payload: { status: 'Technical Evaluation' },
      });
      await procurementPost('add-audit', {
        id: cbeId,
        actionLabel: 'Bid comparison completed',
        section: 'Bid Comparison',
        details: 'Original bid values reviewed and comparison marked complete',
      });
      setActive('Technical Evaluation');
    });

  const saveTechnicalContinue = () =>
    run(async () => {
      await procurementPost('save-technical', {
        id: cbeId,
        criteria: techDraft,
      });
      await procurementPost('update-cbe', {
        id: cbeId,
        payload: { status: 'Commercial Evaluation' },
      });
      setActive('Commercial Evaluation');
    });

  const continueToNegotiation = () =>
    run(async () => {
      await procurementPost('update-cbe', {
        id: cbeId,
        payload: { status: 'Negotiation' },
      });
      setActive('Negotiation');
    });

  const addNegotiation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!negForm.bidderId) {
      setError('Select a bidder for the negotiation round');
      return;
    }
    void run(async () => {
      await procurementPost('add-negotiation', {
        id: cbeId,
        payload: {
          bidderId: negForm.bidderId,
          method: negForm.method,
          originalValue: Number(negForm.originalValue || 0),
          vendorOffer: Number(negForm.vendorOffer || 0),
          agreedValue: Number(negForm.agreedValue || 0),
          notes: negForm.notes || null,
          isBafo: negForm.isBafo,
          roundDate: negForm.roundDate || new Date().toISOString().slice(0, 10),
        },
      });
      setNegForm((f) => ({
        ...f,
        originalValue: '',
        vendorOffer: '',
        agreedValue: '',
        notes: '',
        isBafo: false,
      }));
    });
  };

  const continueToRecommendation = () =>
    run(async () => {
      await procurementPost('update-cbe', {
        id: cbeId,
        payload: { status: 'Recommendation & Approval' },
      });
      setActive('Recommendation & Approval');
    });

  const submitRecommendation = () => {
    if (!best) {
      setError('No technically accepted bidder available to recommend');
      return;
    }
    void run(async () => {
      await procurementPost('submit-recommendation', {
        id: cbeId,
        payload: {
          recommendedBidderId: best.bidderId,
          recommendedName: best.name,
          basis: 'Lowest evaluated responsive bid among technically accepted suppliers',
          status: 'Submitted',
          cbeStatus: 'Recommendation & Approval',
        },
      });
    });
  };

  const updateApproval = (stepNo: number, status: string) =>
    run(async () => {
      await procurementPost('update-approval', {
        id: cbeId,
        stepNo,
        status,
      });
    });

  const addDocument = (e: React.FormEvent) => {
    e.preventDefault();
    if (!docForm.name.trim()) {
      setError('Document name is required');
      return;
    }
    void run(async () => {
      await procurementPost('add-document', {
        id: cbeId,
        payload: {
          name: docForm.name.trim(),
          category: docForm.category.trim() || null,
          vendor: docForm.vendor.trim() || null,
          version: docForm.version.trim() || null,
          sizeLabel: docForm.sizeLabel.trim() || null,
        },
      });
      setDocForm({
        name: '',
        category: 'Evaluation Reports',
        vendor: '',
        version: '1.0',
        sizeLabel: '',
      });
    });
  };

  const setTechStatus = (criteriaId: string, bidderId: string, status: string) => {
    setTechDraft((rows) =>
      rows.map((row) =>
        row.criteriaId === criteriaId
          ? { ...row, supplierStatus: { ...row.supplierStatus, [bidderId]: status } }
          : row,
      ),
    );
  };

  const commercialBidders = onlyAccepted ? rankedAccepted : rankedAll;
  const currentStage = stageIndex(evaluation?.status || 'Draft');
  const tabIcons: Record<Tab, React.ComponentType<{ size?: number }>> = {
    Overview: LayoutDashboard,
    'Bid Comparison': Scale,
    'Technical Evaluation': ClipboardCheck,
    'Commercial Evaluation': BarChart3,
    Negotiation: MessageSquareMore,
    'Recommendation & Approval': Trophy,
    Documents: FileText,
    'Audit Trail': History,
  };

  if (loading) {
    return (
      <div className="procurement-cbe">
        <div className="content" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Loader2 size={18} className="animate-spin" /> Loading CBE workspace…
        </div>
      </div>
    );
  }

  if (!evaluation) {
    return (
      <div className="procurement-cbe">
        <div className="content">
          <div className="infoBanner" style={{ background: '#fdeaea', borderColor: '#f3c0c0', color: '#b72d2d' }}>
            {error || `CBE ${cbeId} was not found.`}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="procurement-cbe">
      <div className="pageHeader">
        <div>
          <div className="titleLine">
            <h1>
              {evaluation.cbeId} – {evaluation.title}
            </h1>
            <span className="statusChip">Status: {evaluation.status}</span>
          </div>
          <div className="metaLine">
            <b>RFQ No.:</b> {evaluation.rfqNumber || '—'}
            <span />
            <b>Project:</b> {evaluation.project || '—'}
            <span />
            <b>Department:</b> {evaluation.department || '—'}
            <span />
            <b>Buyer:</b> {evaluation.buyerName || '—'}
            <span />
            <b>Currency:</b> {evaluation.currency}
            <span />
            <b>Bidders:</b> {bidders.length}
            <span />
            <b>Items:</b> {items.length}
          </div>
        </div>
        <div className="headerButtons">
          <select value={statusDraft} onChange={(e) => setStatusDraft(e.target.value)}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button type="button" className="btn primary" disabled={busy} onClick={() => void saveStatus()}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save
          </button>
        </div>
      </div>

      {error ? (
        <div className="content" style={{ paddingBottom: 0 }}>
          <div className="infoBanner" style={{ background: '#fdeaea', borderColor: '#f3c0c0', color: '#b72d2d' }}>
            {error}
          </div>
        </div>
      ) : null}

      <div className="tabbar">
        {TABS.map((tab) => {
          const Icon = tabIcons[tab];
          return (
            <button
              key={tab}
              type="button"
              className={active === tab ? 'tab active' : 'tab'}
              onClick={() => setActive(tab)}
            >
              <Icon size={16} />
              {tab}
            </button>
          );
        })}
      </div>

      {active === 'Overview' ? (
        <div className="content">
          <div className="kpiRow five">
            <Kpi icon={Users} label="Total Bidders" value={String(bidders.length)} sub="Participating suppliers" />
            <Kpi icon={Boxes} label="Total Items" value={String(items.length)} sub="Line items in scope" tone="green" />
            <Kpi
              icon={BadgeDollarSign}
              label="Evaluated Value (Best)"
              value={best ? moneyNgn(best.total) : '—'}
              sub={best ? best.name : 'No technically accepted bid'}
              tone="purple"
            />
            <Kpi
              icon={CheckCircle2}
              label="Technically Accepted"
              value={String(rankedAccepted.length)}
              sub={`of ${bidders.length} bidders`}
              tone="orange"
            />
            <Kpi icon={Clock3} label="Current Phase" value={evaluation.status} sub={`Updated ${formatWhen(evaluation.updatedAt)}`} tone="cyan" />
          </div>

          <div className="grid twoThirds">
            <section className="card">
              <h3>COMPETITIVE BID EVALUATION SUMMARY</h3>
              <div className="summarySplit">
                <div className="keyValueList">
                  {[
                    ['CBE Number', evaluation.cbeId],
                    ['Description', evaluation.title],
                    ['RFQ Number', evaluation.rfqNumber || '—'],
                    ['Project', evaluation.project || '—'],
                    ['Department', evaluation.department || '—'],
                    ['Buyer', evaluation.buyerName || '—'],
                    ['Evaluation Method', evaluation.evaluationMethod || '—'],
                    ['Currency', evaluation.currency],
                    ['CBE Created On', formatWhen(evaluation.createdAt)],
                    ['Last Updated', formatWhen(evaluation.updatedAt)],
                  ].map(([a, b]) => (
                    <div key={a}>
                      <b>{a}</b>
                      <span>{b}</span>
                    </div>
                  ))}
                </div>
                <div className="stagePanel">
                  <h4>CURRENT PROCESS STAGE</h4>
                  <div className="stageTrack">
                    {STAGES.map((s, i) => (
                      <div key={s} className={`stage ${i < currentStage ? 'done' : ''}`}>
                        <div className="circle">{i < currentStage ? <Check size={14} /> : i + 1}</div>
                        <span>{s}</span>
                        <small>{i < currentStage ? 'Completed' : i === currentStage ? 'Current' : 'Pending'}</small>
                      </div>
                    ))}
                  </div>
                  <div className="infoBanner">
                    Current status is <b>{evaluation.status}</b>. Use the tabs to continue evaluation.
                  </div>
                  <div className="row">
                    <button type="button" className="btn primary" onClick={() => setActive('Bid Comparison')}>
                      Open Bid Comparison <ArrowRight size={16} />
                    </button>
                    <button type="button" className="btn secondary" onClick={() => setActive('Technical Evaluation')}>
                      Technical Evaluation
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section className="card">
              <div className="cardTitleRow">
                <h3>PROVISIONAL COMMERCIAL RANKING</h3>
                <button type="button" className="textBtn" onClick={() => setActive('Commercial Evaluation')}>
                  View Details →
                </button>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Supplier</th>
                    <th>Total Evaluated Value</th>
                    <th>Technical</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedAll.length === 0 ? (
                    <tr>
                      <td colSpan={4}>No bidders loaded.</td>
                    </tr>
                  ) : (
                    rankedAll.map((s, i) => (
                      <tr key={s.bidderId}>
                        <td>{i + 1}</td>
                        <td>
                          <b>{s.name}</b>
                        </td>
                        <td className="num">{moneyNgn(s.total)}</td>
                        <td>
                          <span className={`badge ${s.accepted ? 'success' : 'danger'}`}>
                            {s.accepted ? 'Accepted' : 'Not Accepted'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>
          </div>

          <div className="grid twoThirds bottomGap">
            <section className="card">
              <div className="cardTitleRow">
                <h3>BIDDER RESPONSE SUMMARY</h3>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>Quote No.</th>
                    <th>Quote Date</th>
                    <th>Valid Until</th>
                    <th>Approved Supplier</th>
                    <th>Technical</th>
                  </tr>
                </thead>
                <tbody>
                  {bidders.map((s) => (
                    <tr key={s.bidderId}>
                      <td>
                        <b>{s.name}</b>
                      </td>
                      <td>{s.quoteNo || '—'}</td>
                      <td>{s.quoteDate || '—'}</td>
                      <td>{s.validUntil || '—'}</td>
                      <td>
                        <span className={`badge ${s.approved ? 'success' : 'warning'}`}>
                          {s.approved ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${technicalAccepted(criteria, s.bidderId) ? 'success' : 'danger'}`}>
                          {technicalAccepted(criteria, s.bidderId) ? 'Accepted' : 'Not Accepted'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <div className="stack">
              <section className="card">
                <h3>KEY VALUES</h3>
                <div className="keyValueList compact">
                  <div>
                    <b>Best Accepted Total</b>
                    <span>{best ? moneyNgn(best.total) : '—'}</span>
                  </div>
                  <div>
                    <b>Recommended</b>
                    <span>{recommendation?.recommendedName || evaluation.status}</span>
                  </div>
                  <div>
                    <b>Documents</b>
                    <span>{documents.length}</span>
                  </div>
                  <div>
                    <b>Audit Entries</b>
                    <span>{audit.length}</span>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}

      {active === 'Bid Comparison' ? (
        <div className="content">
          <div className="kpiRow six">
            <Kpi icon={Boxes} label="Items" value={String(items.length)} sub="Total requirements" />
            <Kpi icon={Users} label="Bidders" value={String(bidders.length)} sub="Participating" />
            <Kpi
              icon={CheckCircle2}
              label="Quotations"
              value={`${bidders.length} / ${bidders.length || 0}`}
              sub="Loaded"
            />
            <Kpi
              icon={BadgeDollarSign}
              label="Original Best"
              value={rankedAll[0] ? moneyNgn(rankedAll[0].originalTotal) : '—'}
              sub={rankedAll[0]?.name || '—'}
            />
            <Kpi
              icon={BadgeDollarSign}
              label="Negotiated Best"
              value={rankedAll[0] ? moneyNgn(rankedAll[0].total) : '—'}
              sub={rankedAll[0]?.name || '—'}
              tone="green"
            />
            <Kpi icon={ClipboardCheck} label="Status" value={evaluation.status} sub="Header status" tone="cyan" />
          </div>

          <section className="card matrixCard">
            <div className="tableScroll">
              <table className="matrix">
                <thead>
                  <tr>
                    <th rowSpan={2}>#</th>
                    <th rowSpan={2}>Description</th>
                    <th rowSpan={2}>UOM</th>
                    <th rowSpan={2}>Qty</th>
                    {bidders.map((s) => (
                      <th colSpan={4} key={s.bidderId} className="supplierHead">
                        {s.name}
                        <small>
                          {s.quoteNo || '—'} • {s.quoteDate || '—'}
                        </small>
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {bidders.flatMap((s) => [
                      <th key={`${s.bidderId}-o`}>
                        Unit
                        <br />
                        <small>Original</small>
                      </th>,
                      <th key={`${s.bidderId}-oe`}>
                        Ext.
                        <br />
                        <small>Original</small>
                      </th>,
                      <th key={`${s.bidderId}-n`}>
                        Unit
                        <br />
                        <small>Negotiated</small>
                      </th>,
                      <th key={`${s.bidderId}-ne`}>
                        Ext.
                        <br />
                        <small>Negotiated</small>
                      </th>,
                    ])}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.itemId}>
                      <td>{item.lineNo}</td>
                      <td className="wrap">{item.description}</td>
                      <td>{item.uom || '—'}</td>
                      <td>{item.qty}</td>
                      {bidders.flatMap((s) => {
                        const p = item.prices?.[s.bidderId];
                        const original = Number(p?.original || 0);
                        const negotiated = Number(p?.negotiated ?? p?.original ?? 0);
                        return [
                          <td key={`${item.itemId}-${s.bidderId}-o`}>{moneyNgn(original)}</td>,
                          <td key={`${item.itemId}-${s.bidderId}-oe`}>{moneyNgn(original * item.qty)}</td>,
                          <td key={`${item.itemId}-${s.bidderId}-n`}>{moneyNgn(negotiated)}</td>,
                          <td key={`${item.itemId}-${s.bidderId}-ne`}>{moneyNgn(negotiated * item.qty)}</td>,
                        ];
                      })}
                    </tr>
                  ))}
                  <tr className="totalRow">
                    <td colSpan={4}>Subtotal (Material Value)</td>
                    {bidders.flatMap((s) => [
                      <td key={`${s.bidderId}-so`} colSpan={2}>
                        {moneyNgn(supplierSubtotal(items, s.bidderId, false))}
                      </td>,
                      <td key={`${s.bidderId}-sn`} colSpan={2}>
                        {moneyNgn(supplierSubtotal(items, s.bidderId, true))}
                      </td>,
                    ])}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <h3>SUPPLIER COMMERCIAL SUMMARY</h3>
            <div className="tableScroll">
              <table>
                <thead>
                  <tr>
                    <th>Commercial Condition</th>
                    {bidders.map((s) => (
                      <th key={s.bidderId} colSpan={2}>
                        {s.name}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    <th />
                    {bidders.flatMap((s) => [
                      <th key={`${s.bidderId}-orig`}>Original</th>,
                      <th key={`${s.bidderId}-neg`}>Negotiated</th>,
                    ])}
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ['Discount', (s: Bidder) => moneyNgn(s.discount)],
                      ['Transportation / Delivery Charges', (s: Bidder) => moneyNgn(s.transportation)],
                      ['Other Charges', (s: Bidder) => moneyNgn(s.otherCharges)],
                      [
                        'VAT',
                        (s: Bidder, negotiated: boolean) => {
                          const sub = supplierSubtotal(items, s.bidderId, negotiated);
                          const taxable = sub - s.discount + s.transportation + s.otherCharges;
                          return moneyNgn(taxable * (Number(s.vatRate || 0) / 100));
                        },
                      ],
                      [
                        'Total Order Value (Incl. VAT)',
                        (s: Bidder, negotiated: boolean) => moneyNgn(supplierTotal(s, items, negotiated)),
                      ],
                      ['Delivery Location', (s: Bidder) => s.deliveryLocation || '—'],
                      ['Delivery Period', (s: Bidder) => s.deliveryPeriod || '—'],
                      ['Payment Terms', (s: Bidder) => s.paymentTerms || '—'],
                      ['Quote Valid Until', (s: Bidder) => s.validUntil || '—'],
                    ] as Array<[string, (s: Bidder, negotiated: boolean) => string]>
                  ).map(([label, fn]) => (
                    <tr key={label}>
                      <td>
                        <b>{label}</b>
                      </td>
                      {bidders.flatMap((s) => [
                        <td key={`${s.bidderId}-${label}-o`}>{fn(s, false)}</td>,
                        <td key={`${s.bidderId}-${label}-n`}>{fn(s, true)}</td>,
                      ])}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="footerActions">
            <button type="button" className="btn secondary" onClick={() => setActive('Overview')}>
              Cancel
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() => void markBidComparisonComplete()}
            >
              Mark Bid Comparison Complete <ArrowRight size={16} />
            </button>
          </div>
        </div>
      ) : null}

      {active === 'Technical Evaluation' ? (
        <div className="content">
          <div className="infoBanner">
            Vendors must meet all mandatory requirements to be technically responsive. Update statuses as needed, then
            save &amp; continue.
          </div>
          <div className="grid mainAside">
            <section className="card">
              <div className="cardTitleRow">
                <h3>TECHNICAL REQUIREMENTS MATRIX</h3>
                <div className="legend">
                  <span className="badge success">Compliant</span>
                  <span className="badge warning">Partial</span>
                  <span className="badge danger">Non-Compliant</span>
                  <span className="badge">N/A</span>
                </div>
              </div>
              <div className="tableScroll">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Requirement / Specification</th>
                      <th>Mandatory</th>
                      {bidders.map((s) => (
                        <th key={s.bidderId}>{s.name}</th>
                      ))}
                      <th>Comments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {criteria.length === 0 ? (
                      <tr>
                        <td colSpan={4 + bidders.length}>No technical criteria loaded for this CBE.</td>
                      </tr>
                    ) : (
                      criteria.map((c, i) => {
                        const showSection = i === 0 || criteria[i - 1].section !== c.section;
                        return (
                          <Fragment key={c.criteriaId}>
                            {showSection ? (
                              <tr className="sectionRow">
                                <td colSpan={4 + bidders.length}>{c.section}</td>
                              </tr>
                            ) : null}
                            <tr>
                              <td>{c.lineNo}</td>
                              <td>{c.requirement}</td>
                              <td>
                                {c.mandatory ? (
                                  <CheckCircle2 size={16} className="greenText" />
                                ) : (
                                  <span className="badge">Optional</span>
                                )}
                              </td>
                              {bidders.map((s) => {
                                const st = c.supplierStatus?.[s.bidderId] || 'N/A';
                                return (
                                  <td key={s.bidderId}>
                                    <select
                                      value={st}
                                      onChange={(e) => setTechStatus(c.criteriaId, s.bidderId, e.target.value)}
                                      style={{ minWidth: 120 }}
                                    >
                                      {TECH_STATUSES.map((opt) => (
                                        <option key={opt} value={opt}>
                                          {opt}
                                        </option>
                                      ))}
                                    </select>
                                    <div style={{ marginTop: 4 }}>
                                      <span className={badgeForTech(st)}>{st}</span>
                                    </div>
                                  </td>
                                );
                              })}
                              <td>{c.comments || '—'}</td>
                            </tr>
                          </Fragment>
                        );
                      })
                    )}
                    <tr className="totalRow">
                      <td colSpan={3}>Overall Technical Status</td>
                      {bidders.map((s) => {
                        const ok = technicalAccepted(criteria, s.bidderId);
                        return (
                          <td key={s.bidderId}>
                            <span className={`badge ${ok ? 'success' : 'danger'}`}>
                              {ok ? 'Accepted' : 'Not Accepted'}
                            </span>
                          </td>
                        );
                      })}
                      <td>—</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
            <aside className="stack">
              <section className="card">
                <h3>TECHNICAL EVALUATION SUMMARY</h3>
                <div className="keyValueList compact">
                  <div>
                    <b>Mandatory Criteria</b>
                    <span>{criteria.filter((c) => c.mandatory).length}</span>
                  </div>
                  <div>
                    <b>Vendors Accepted</b>
                    <span>{rankedAccepted.length}</span>
                  </div>
                  <div>
                    <b>Vendors Not Accepted</b>
                    <span>{bidders.length - rankedAccepted.length}</span>
                  </div>
                </div>
              </section>
            </aside>
          </div>
          <div className="footerActions">
            <button type="button" className="btn secondary" onClick={() => setActive('Bid Comparison')}>
              <ArrowLeft size={16} /> Back
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() => void saveTechnicalContinue()}
            >
              Save &amp; Continue to Commercial Evaluation <ArrowRight size={16} />
            </button>
          </div>
        </div>
      ) : null}

      {active === 'Commercial Evaluation' ? (
        <div className="content">
          <div className="kpiRow five">
            <Kpi
              icon={BadgeDollarSign}
              label="Lowest Evaluated Bid"
              value={rankedAccepted[0] ? moneyNgn(rankedAccepted[0].total) : '—'}
              sub={rankedAccepted[0] ? `${rankedAccepted[0].name} • Rank L1` : 'No accepted bidder'}
              tone="green"
            />
            <Kpi
              icon={Clock3}
              label="Second Lowest Bid"
              value={rankedAccepted[1] ? moneyNgn(rankedAccepted[1].total) : '—'}
              sub={rankedAccepted[1] ? `${rankedAccepted[1].name} • Rank L2` : '—'}
              tone="orange"
            />
            <Kpi
              icon={BarChart3}
              label="Highest Evaluated Bid"
              value={rankedAll.length ? moneyNgn(Math.max(...rankedAll.map((r) => r.total))) : '—'}
              sub="Across all bidders"
            />
            <Kpi
              icon={Users}
              label="Accepted Vendors"
              value={String(rankedAccepted.length)}
              sub={`of ${bidders.length}`}
              tone="purple"
            />
            <Kpi icon={ClipboardCheck} label="Phase" value={evaluation.status} sub="Commercial" tone="cyan" />
          </div>

          <div className="grid mainAside">
            <section className="card">
              <div className="toolbar slim">
                <div className="row">
                  <span>View:</span>
                  <button type="button" className="seg active">
                    By Supplier
                  </button>
                </div>
                <label className="switchLine">
                  <input
                    type="checkbox"
                    checked={onlyAccepted}
                    onChange={(e) => setOnlyAccepted(e.target.checked)}
                  />
                  Show only technically acceptable vendors
                </label>
              </div>
              <h3>COMMERCIAL EVALUATION SUMMARY (BY SUPPLIER)</h3>
              <div className="tableScroll">
                <table>
                  <thead>
                    <tr>
                      <th>Commercial Condition</th>
                      {commercialBidders.map((s) => (
                        <th key={s.bidderId}>{s.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ['Material Subtotal', (s: (typeof rankedAll)[number]) => moneyNgn(s.subtotal)],
                        [
                          'Discount (%)',
                          (s: (typeof rankedAll)[number]) =>
                            s.subtotal ? `${((s.discount / s.subtotal) * 100).toFixed(2)}%` : '0.00%',
                        ],
                        ['Discount Amount', (s: (typeof rankedAll)[number]) => moneyNgn(s.discount)],
                        ['Transportation / Delivery Charges', (s: (typeof rankedAll)[number]) => moneyNgn(s.transportation)],
                        ['Other Charges', (s: (typeof rankedAll)[number]) => moneyNgn(s.otherCharges)],
                        [
                          `VAT`,
                          (s: (typeof rankedAll)[number]) => {
                            const taxable = s.subtotal - s.discount + s.transportation + s.otherCharges;
                            return moneyNgn(taxable * (Number(s.vatRate || 0) / 100));
                          },
                        ],
                        ['TOTAL ORDER VALUE (Incl. VAT)', (s: (typeof rankedAll)[number]) => moneyNgn(s.total)],
                        ['Delivery Location', (s: (typeof rankedAll)[number]) => s.deliveryLocation || '—'],
                        ['Delivery Period', (s: (typeof rankedAll)[number]) => s.deliveryPeriod || '—'],
                        ['Payment Terms', (s: (typeof rankedAll)[number]) => s.paymentTerms || '—'],
                        ['Quote Valid Until', (s: (typeof rankedAll)[number]) => s.validUntil || '—'],
                        ['Currency', (s: (typeof rankedAll)[number]) => s.currency || evaluation.currency],
                        ['Vendor Outstanding with DLE', (s: (typeof rankedAll)[number]) => moneyNgn(s.outstanding)],
                        [
                          'Approved Supplier Status',
                          (s: (typeof rankedAll)[number]) => (s.approved ? 'Approved' : 'Not Approved'),
                        ],
                        [
                          'Provisional Commercial Rank',
                          (s: (typeof rankedAll)[number]) =>
                            s.accepted ? `L${rankedAccepted.findIndex((x) => x.bidderId === s.bidderId) + 1}` : 'N/A',
                        ],
                        [
                          'Notes',
                          (s: (typeof rankedAll)[number]) =>
                            s.accepted
                              ? best?.bidderId === s.bidderId
                                ? 'Lowest evaluated responsive bid'
                                : 'Responsive'
                              : 'Technically non-responsive',
                        ],
                      ] as Array<[string, (s: (typeof rankedAll)[number]) => string]>
                    ).map(([label, fn]) => (
                      <tr key={label}>
                        <td>
                          <b>{label}</b>
                        </td>
                        {commercialBidders.map((s) => (
                          <td key={s.bidderId}>{fn(s)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <aside className="stack">
              <section className="card">
                <h3>COMMERCIAL POSITION</h3>
                {best ? (
                  <div className="winner">
                    <Trophy size={26} />
                    <div>
                      <small>Recommended Position (Provisional)</small>
                      <strong>{best.name}</strong>
                      <span>Lowest evaluated responsive bid</span>
                    </div>
                  </div>
                ) : (
                  <p className="muted">No technically accepted bidder yet.</p>
                )}
                <div className="keyValueList compact">
                  <div>
                    <b>Total Order Value</b>
                    <span>{best ? moneyNgn(best.total) : '—'}</span>
                  </div>
                </div>
              </section>
            </aside>
          </div>

          <div className="footerActions">
            <button type="button" className="btn secondary" onClick={() => setActive('Technical Evaluation')}>
              Back
            </button>
            <button type="button" className="btn primary" disabled={busy} onClick={() => void continueToNegotiation()}>
              Continue to Negotiation <ArrowRight size={16} />
            </button>
          </div>
        </div>
      ) : null}

      {active === 'Negotiation' ? (
        <div className="content">
          <div className="kpiRow five">
            <Kpi
              icon={MessageSquareMore}
              label="Total Negotiation Rounds"
              value={String(rounds.length)}
              sub="Across all vendors"
              tone="green"
            />
            <Kpi
              icon={BadgeDollarSign}
              label="Best Negotiated"
              value={best ? moneyNgn(best.total) : '—'}
              sub={best?.name || '—'}
            />
            <Kpi
              icon={CheckCircle2}
              label="BAFO Rounds"
              value={String(rounds.filter((r) => r.isBafo).length)}
              sub="Marked as BAFO"
              tone="purple"
            />
            <Kpi
              icon={Clock3}
              label="Original Best"
              value={rankedAll[0] ? moneyNgn(rankedAll[0].originalTotal) : '—'}
              sub="Before negotiation"
              tone="orange"
            />
            <Kpi
              icon={Trophy}
              label="Accepted Vendors"
              value={String(rankedAccepted.length)}
              sub="Technically responsive"
              tone="green"
            />
          </div>

          <section className="card">
            <h3>NEGOTIATION PROGRESS PER SUPPLIER</h3>
            <table>
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Original Total</th>
                  <th>Negotiated Total</th>
                  <th>Savings</th>
                  <th>Savings %</th>
                  <th>Rounds</th>
                  <th>BAFO</th>
                  <th>Technical</th>
                </tr>
              </thead>
              <tbody>
                {rankedAll.map((s) => {
                  const bidderRounds = rounds.filter((r) => r.bidderId === s.bidderId);
                  const savings = Math.max(0, s.originalTotal - s.total);
                  const pct = s.originalTotal > 0 ? ((savings / s.originalTotal) * 100).toFixed(2) : '0.00';
                  return (
                    <tr key={s.bidderId}>
                      <td>
                        <b>{s.name}</b>
                      </td>
                      <td>{moneyNgn(s.originalTotal)}</td>
                      <td className="greenText">
                        <b>{moneyNgn(s.total)}</b>
                      </td>
                      <td className="greenText">{moneyNgn(savings)}</td>
                      <td>{pct}%</td>
                      <td>{bidderRounds.length}</td>
                      <td>
                        <span className={`badge ${bidderRounds.some((r) => r.isBafo) ? 'success' : 'warning'}`}>
                          {bidderRounds.some((r) => r.isBafo) ? 'Submitted' : 'Not Submitted'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${s.accepted ? 'success' : 'danger'}`}>
                          {s.accepted ? 'Accepted' : 'Not Accepted'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="card">
            <div className="cardTitleRow">
              <h3>NEGOTIATION ROUNDS & HISTORY</h3>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Supplier</th>
                  <th>Method</th>
                  <th>Negotiated By</th>
                  <th>Original</th>
                  <th>Vendor Offer</th>
                  <th>Agreed</th>
                  <th>Notes</th>
                  <th>BAFO</th>
                </tr>
              </thead>
              <tbody>
                {rounds.length === 0 ? (
                  <tr>
                    <td colSpan={9}>No negotiation rounds yet.</td>
                  </tr>
                ) : (
                  rounds.map((r) => {
                    const bidder = bidders.find((b) => b.bidderId === r.bidderId);
                    return (
                      <tr key={r.roundId}>
                        <td>{r.roundDate || formatWhen(r.createdAt)}</td>
                        <td>
                          <b>{bidder?.name || r.bidderId}</b>
                        </td>
                        <td>{r.method || '—'}</td>
                        <td>{r.negotiatedBy || '—'}</td>
                        <td>{moneyNgn(r.originalValue)}</td>
                        <td>{moneyNgn(r.vendorOffer)}</td>
                        <td>{moneyNgn(r.agreedValue)}</td>
                        <td>{r.notes || '—'}</td>
                        <td>{r.isBafo ? <span className="badge success">BAFO</span> : '—'}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            <form onSubmit={addNegotiation} style={{ marginTop: 14 }}>
              <h4>Add Negotiation Round</h4>
              <div className="grid two" style={{ marginTop: 8 }}>
                <select
                  value={negForm.bidderId}
                  onChange={(e) => setNegForm((f) => ({ ...f, bidderId: e.target.value }))}
                  required
                >
                  <option value="">Select bidder</option>
                  {bidders.map((b) => (
                    <option key={b.bidderId} value={b.bidderId}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <select value={negForm.method} onChange={(e) => setNegForm((f) => ({ ...f, method: e.target.value }))}>
                  <option>Email</option>
                  <option>Meeting</option>
                  <option>Phone</option>
                  <option>BAFO Request</option>
                </select>
                <input
                  type="date"
                  value={negForm.roundDate}
                  onChange={(e) => setNegForm((f) => ({ ...f, roundDate: e.target.value }))}
                />
                <input
                  type="number"
                  placeholder="Original value"
                  value={negForm.originalValue}
                  onChange={(e) => setNegForm((f) => ({ ...f, originalValue: e.target.value }))}
                />
                <input
                  type="number"
                  placeholder="Vendor offer"
                  value={negForm.vendorOffer}
                  onChange={(e) => setNegForm((f) => ({ ...f, vendorOffer: e.target.value }))}
                />
                <input
                  type="number"
                  placeholder="Agreed value"
                  value={negForm.agreedValue}
                  onChange={(e) => setNegForm((f) => ({ ...f, agreedValue: e.target.value }))}
                />
                <input
                  placeholder="Notes"
                  value={negForm.notes}
                  onChange={(e) => setNegForm((f) => ({ ...f, notes: e.target.value }))}
                />
                <label className="switchLine">
                  <input
                    type="checkbox"
                    checked={negForm.isBafo}
                    onChange={(e) => setNegForm((f) => ({ ...f, isBafo: e.target.checked }))}
                  />
                  Is BAFO
                </label>
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <button type="submit" className="btn primary" disabled={busy}>
                  <Plus size={16} /> Add Round
                </button>
              </div>
            </form>
          </section>

          <div className="footerActions">
            <button type="button" className="btn secondary" onClick={() => setActive('Commercial Evaluation')}>
              Back
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() => void continueToRecommendation()}
            >
              Continue to Recommendation &amp; Approval <ArrowRight size={16} />
            </button>
          </div>
        </div>
      ) : null}

      {active === 'Recommendation & Approval' ? (
        <div className="content">
          <section className="card">
            <h3>RECOMMENDATION SUMMARY</h3>
            <div className="recommendStrip">
              <div className="winner large">
                <Trophy size={30} />
                <div>
                  <small>Recommended Vendor</small>
                  <strong>{recommendation?.recommendedName || best?.name || '—'}</strong>
                  <span>Lowest evaluated responsive bid</span>
                </div>
              </div>
              <div>
                <small>Total Evaluated Value (Final)</small>
                <strong className="greenText">{best ? moneyNgn(best.total) : '—'}</strong>
              </div>
              <div>
                <small>Technical Status</small>
                <span className={`badge ${best ? 'success' : 'danger'}`}>{best ? 'Responsive' : 'None'}</span>
              </div>
              <div>
                <small>Overall Status</small>
                <span className="badge success">{recommendation?.status || 'Draft'}</span>
              </div>
              <div>
                <small>Submitted</small>
                <strong>{formatWhen(recommendation?.submittedAt)}</strong>
              </div>
            </div>
          </section>

          <div className="infoBanner">
            Recommendation uses the best technically accepted bidder by negotiated total. Submit to create the approval
            workflow.
          </div>

          <div className="grid mainAside">
            <section className="card">
              <h3>FINAL EVALUATION RESULTS</h3>
              <table>
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>Evaluated Total</th>
                    <th>Rank</th>
                    <th>Technical</th>
                    <th>Overall Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedAll.map((s, i) => (
                    <tr key={s.bidderId}>
                      <td>
                        <b>{s.name}</b>
                      </td>
                      <td>{moneyNgn(s.total)}</td>
                      <td>{i + 1}</td>
                      <td>
                        <span className={`badge ${s.accepted ? 'success' : 'danger'}`}>
                          {s.accepted ? 'Accepted' : 'Not Accepted'}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            (recommendation?.recommendedBidderId || best?.bidderId) === s.bidderId
                              ? 'success'
                              : s.accepted
                                ? 'success'
                                : 'danger'
                          }`}
                        >
                          {(recommendation?.recommendedBidderId || best?.bidderId) === s.bidderId
                            ? 'Recommended'
                            : s.accepted
                              ? 'Responsive'
                              : 'Not Responsive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="keyValueList compact" style={{ marginTop: 12 }}>
                <div>
                  <b>Basis</b>
                  <span>
                    {recommendation?.basis ||
                      'Lowest evaluated responsive bid among technically accepted suppliers'}
                  </span>
                </div>
              </div>
            </section>

            <aside className="stack">
              <section className="card">
                <h3>APPROVAL WORKFLOW</h3>
                <div className="approvalFlow">
                  {approvals.length === 0 ? (
                    <p className="muted">No approval steps yet. Submit a recommendation to generate the workflow.</p>
                  ) : (
                    approvals.map((a) => {
                      const done = a.status === 'Approved' || a.status === 'Completed';
                      return (
                        <div key={a.approvalId} className={done ? 'approved' : undefined}>
                          {done ? <Check size={16} /> : <span className="stepNo">{a.stepNo}</span>}
                          <div>
                            <b>{a.roleName}</b>
                            <span>{a.actorName || a.status}</span>
                            <small>{formatWhen(a.actionAt)}</small>
                          </div>
                          <div className="row">
                            <span
                              className={`badge ${
                                done ? 'success' : a.status === 'Rejected' ? 'danger' : 'warning'
                              }`}
                            >
                              {a.status}
                            </span>
                            {a.status === 'Pending' ? (
                              <>
                                <button
                                  type="button"
                                  className="btn secondary"
                                  disabled={busy}
                                  onClick={() => void updateApproval(a.stepNo, 'Approved')}
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  className="btn secondary"
                                  disabled={busy}
                                  onClick={() => void updateApproval(a.stepNo, 'Rejected')}
                                >
                                  Reject
                                </button>
                              </>
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
            </aside>
          </div>

          <div className="footerActions">
            <button type="button" className="btn secondary" onClick={() => setActive('Negotiation')}>
              <ArrowLeft size={16} /> Back to Negotiation
            </button>
            <button type="button" className="btn primary" disabled={busy || !best} onClick={submitRecommendation}>
              <Send size={16} />
              {recommendation?.status === 'Submitted' ? 'Resubmit Recommendation' : 'Submit for Approval'}
            </button>
          </div>
        </div>
      ) : null}

      {active === 'Documents' ? (
        <div className="content">
          <div className="kpiRow five">
            <Kpi icon={FileText} label="Total Documents" value={String(documents.length)} sub="Attached to this CBE" />
            <Kpi
              icon={History}
              label="Latest Upload"
              value={documents[0] ? formatWhen(documents[0].uploadedOn || documents[0].createdAt) : '—'}
              sub={documents[0]?.uploadedBy || '—'}
              tone="purple"
            />
            <Kpi icon={Boxes} label="Categories" value={String(new Set(documents.map((d) => d.category || 'Other')).size)} sub="Unique" tone="green" />
            <Kpi icon={Users} label="Vendors Linked" value={String(new Set(documents.map((d) => d.vendor).filter(Boolean)).size)} sub="In document set" tone="orange" />
            <Kpi icon={ClipboardCheck} label="Status" value={evaluation.status} sub="CBE phase" tone="cyan" />
          </div>

          <section className="card">
            <div className="cardTitleRow">
              <h3>DOCUMENTS</h3>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Document Name</th>
                  <th>Category</th>
                  <th>Vendor</th>
                  <th>Version</th>
                  <th>Uploaded By</th>
                  <th>Uploaded On</th>
                  <th>Size</th>
                </tr>
              </thead>
              <tbody>
                {documents.length === 0 ? (
                  <tr>
                    <td colSpan={7}>No documents yet.</td>
                  </tr>
                ) : (
                  documents.map((d) => (
                    <tr key={d.documentId}>
                      <td>
                        <b>{d.name}</b>
                      </td>
                      <td>{d.category || '—'}</td>
                      <td>{d.vendor || '—'}</td>
                      <td>{d.version || '—'}</td>
                      <td>{d.uploadedBy || '—'}</td>
                      <td>{d.uploadedOn || formatWhen(d.createdAt)}</td>
                      <td>{d.sizeLabel || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <form onSubmit={addDocument} style={{ marginTop: 14 }}>
              <h4>Add Document</h4>
              <div className="grid two" style={{ marginTop: 8 }}>
                <input
                  placeholder="Name *"
                  value={docForm.name}
                  onChange={(e) => setDocForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
                <input
                  placeholder="Category"
                  value={docForm.category}
                  onChange={(e) => setDocForm((f) => ({ ...f, category: e.target.value }))}
                />
                <input
                  placeholder="Vendor"
                  value={docForm.vendor}
                  onChange={(e) => setDocForm((f) => ({ ...f, vendor: e.target.value }))}
                />
                <input
                  placeholder="Version"
                  value={docForm.version}
                  onChange={(e) => setDocForm((f) => ({ ...f, version: e.target.value }))}
                />
                <input
                  placeholder="Size label (e.g. 1.2 MB)"
                  value={docForm.sizeLabel}
                  onChange={(e) => setDocForm((f) => ({ ...f, sizeLabel: e.target.value }))}
                />
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <button type="submit" className="btn primary" disabled={busy}>
                  <Plus size={16} /> Add Document
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {active === 'Audit Trail' ? (
        <div className="content">
          <section className="card">
            <div className="cardTitleRow">
              <div>
                <h3>AUDIT TRAIL</h3>
                <p className="muted">Record of key actions, changes and approvals for this CBE.</p>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Date / Time</th>
                  <th>User</th>
                  <th>Role</th>
                  <th>Action</th>
                  <th>Section</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {audit.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No audit entries yet.</td>
                  </tr>
                ) : (
                  audit.map((e) => (
                    <tr key={e.auditId}>
                      <td>{formatWhen(e.createdAt)}</td>
                      <td>
                        <b>{e.actorName || '—'}</b>
                      </td>
                      <td>{e.actorRole || '—'}</td>
                      <td>{e.action}</td>
                      <td>
                        <span className="badge">{e.section || '—'}</span>
                      </td>
                      <td>{e.details || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        </div>
      ) : null}
    </div>
  );
}
