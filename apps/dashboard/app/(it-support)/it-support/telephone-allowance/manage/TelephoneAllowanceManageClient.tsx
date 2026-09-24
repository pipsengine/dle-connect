'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  WalletCards,
} from 'lucide-react';
import {
  moneyNgn,
  statusTone,
  useTelephoneAllowanceApi,
  type TaCapabilities,
} from '../_components/ta-shared';

type CycleEmployee = {
  id: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  jobTitle: string;
  monthlyRate: number;
  month1Eligible: boolean;
  month1Amount: number;
  month2Eligible: boolean;
  month2Amount: number;
  bimonthlyTotal: number;
  changeBadge: string;
  status: string;
  exceptionFlags?: string[];
  bankName?: string | null;
  accountNo?: string | null;
  sortCode?: string | null;
};

type Cycle = {
  id: string;
  cycleCode: string;
  pairLabel: string;
  year: number;
  month1: number;
  month2: number;
  status: string;
  locked: boolean;
  rowVersion: number;
  preparedBy: string;
  currentOwnerRole: string;
  month1Total: number;
  month2Total: number;
  bimonthlyTotal: number;
  beneficiaryCount: number;
  originalBeneficiaryCount?: number | null;
  originalBimonthlyTotal?: number | null;
  employees: CycleEmployee[];
  changes: Array<{ changeType: string; employeeCode: string; employeeName: string; reason: string }>;
  versions: Array<{ versionNo: number; label: string; createdAt: string; createdBy: string; beneficiaryCount: number; bimonthlyTotal: number }>;
  updatedAt: string;
};

type Entitlement = {
  id: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  monthlyAmount: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: string;
};

type DirectoryHit = {
  employeeCode: string;
  employeeName: string;
  department: string;
  jobTitle: string;
  status?: string;
};

type ValidationIssue = { code: string; message: string; employeeCode?: string };
type Validation = { ok: boolean; critical: ValidationIssue[]; warnings: ValidationIssue[] };

const tabs = ['Current Cycle', 'Entitlements', 'Previous Cycles'] as const;
const PAGE_SIZE = 20;

const monthName = (year: number, month: number) =>
  new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en', { month: 'long' });

const shortMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en', { month: 'short' }).toUpperCase();

const formatPrepared = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const day = date.getDate();
  const mon = date.toLocaleString('en-GB', { month: 'short' });
  const year = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${day} ${mon} ${year}, ${hh}:${mm}`;
};

const changeKind = (badge: string): 'added' | 'removed' | 'changed' | 'unchanged' => {
  if (badge === 'ADDED') return 'added';
  if (badge === 'REMOVED' || badge === 'MONTH1_ONLY' || badge === 'MONTH2_ONLY' || badge === 'JULY_ONLY' || badge === 'AUGUST_ONLY') return 'removed';
  if (badge === 'UNCHANGED') return 'unchanged';
  return 'changed';
};

export default function TelephoneAllowanceManageClient() {
  const { get, post, busy, toast, error } = useTelephoneAllowanceApi();
  const [tab, setTab] = useState<(typeof tabs)[number]>('Current Cycle');
  const [changeFilter, setChangeFilter] = useState<'All' | 'Added' | 'Removed' | 'Changed'>('All');
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [caps, setCaps] = useState<TaCapabilities | null>(null);
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [validation, setValidation] = useState<Validation | null>(null);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showWorkflow, setShowWorkflow] = useState(false);
  const [edit, setEdit] = useState<CycleEmployee | null>(null);
  const [bulk, setBulk] = useState<'amount' | 'eligibility' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const autoPopulateRef = useRef<string | null>(null);
  const [dirQuery, setDirQuery] = useState('');
  const [dirHits, setDirHits] = useState<DirectoryHit[]>([]);
  const [addForm, setAddForm] = useState({
    employeeCode: '',
    employeeName: '',
    department: '',
    jobTitle: '',
    monthlyRate: 10000,
    month1Eligible: true,
    month2Eligible: true,
    reason: 'New eligibility',
  });

  const load = useCallback(async () => {
    const [cycleRes, cyclesRes, entRes] = await Promise.all([
      get<{ cycle: Cycle | null; validation?: Validation; capabilities: TaCapabilities }>('cycle'),
      get<{ cycles: Cycle[]; capabilities: TaCapabilities }>('cycles'),
      get<{ entitlements: Entitlement[]; capabilities: TaCapabilities }>('entitlements'),
    ]);
    setCycle(cycleRes.cycle);
    setValidation(cycleRes.validation || null);
    setCaps(cycleRes.capabilities || cyclesRes.capabilities);
    setCycles(cyclesRes.cycles || []);
    setEntitlements(entRes.entitlements || []);
  }, [get]);

  useEffect(() => {
    void load().catch(console.error);
  }, [load]);

  useEffect(() => {
    if (!cycle || !caps?.canPrepare) return;
    if (!['DRAFT', 'RETURNED_TO_IT', 'RETURNED_FOR_CORRECTION', 'IT_VALIDATION'].includes(cycle.status)) return;
    if (cycle.locked || cycle.beneficiaryCount > 0) return;
    if (!cycles.some((row) => row.id !== cycle.id)) return;
    if (autoPopulateRef.current === cycle.id) return;
    autoPopulateRef.current = cycle.id;
    void run('populate-from-previous', { replaceExisting: true }).catch(() => {
      autoPopulateRef.current = null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycle?.id, cycle?.beneficiaryCount, cycle?.status, caps?.canPrepare, cycles.length]);

  const month1Name = cycle ? monthName(cycle.year, cycle.month1) : 'Month 1';
  const month2Name = cycle ? monthName(cycle.year, cycle.month2) : 'Month 2';
  const pairTitle = cycle ? `${shortMonth(cycle.year, cycle.month1)} – ${shortMonth(cycle.year, cycle.month2)} ${cycle.year}` : '';

  const previous = useMemo(() => {
    if (!cycle) return null;
    const score = (row: Cycle) => row.year * 12 + row.month1;
    const current = score(cycle);
    return cycles
      .filter((row) => row.id !== cycle.id && score(row) < current)
      .sort((a, b) => score(b) - score(a))[0] || null;
  }, [cycle, cycles]);

  const hrMode = cycle?.status === 'PENDING_HR_REVIEW' && caps?.canHrReview;
  const itEditable = Boolean(
    cycle && !cycle.locked && ['DRAFT', 'RETURNED_TO_IT', 'RETURNED_FOR_CORRECTION', 'IT_VALIDATION'].includes(cycle.status) && caps?.canPrepare,
  );
  const canEditRows = Boolean(itEditable || hrMode);

  const departments = useMemo(() => {
    const names = new Set((cycle?.employees || []).map((row) => row.department).filter(Boolean));
    return ['All', ...Array.from(names).sort()];
  }, [cycle]);

  const counts = useMemo(() => {
    const list = cycle?.employees || [];
    return {
      all: list.length,
      added: list.filter((row) => changeKind(row.changeBadge) === 'added').length,
      removed: list.filter((row) => changeKind(row.changeBadge) === 'removed').length,
      changed: list.filter((row) => changeKind(row.changeBadge) === 'changed').length,
    };
  }, [cycle]);

  const rows = useMemo(() => {
    if (!cycle) return [];
    let list = [...cycle.employees];
    if (department !== 'All') list = list.filter((row) => row.department === department);
    if (statusFilter === 'Active') list = list.filter((row) => row.status !== 'Removed' && row.status !== 'Exception');
    if (statusFilter === 'Exception') list = list.filter((row) => row.status === 'Exception' || (row.exceptionFlags || []).length > 0);
    if (statusFilter === 'Removed') list = list.filter((row) => row.changeBadge === 'REMOVED' || row.status === 'Removed');
    if (changeFilter === 'Added') list = list.filter((row) => changeKind(row.changeBadge) === 'added');
    if (changeFilter === 'Removed') list = list.filter((row) => changeKind(row.changeBadge) === 'removed');
    if (changeFilter === 'Changed') list = list.filter((row) => changeKind(row.changeBadge) === 'changed');
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((row) => `${row.employeeCode} ${row.employeeName} ${row.department}`.toLowerCase().includes(q));
    }
    return list.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [cycle, department, statusFilter, changeFilter, search]);

  useEffect(() => {
    setPage(1);
  }, [search, department, statusFilter, changeFilter, cycle?.id]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const payable = (cycle?.employees || []).filter((row) => row.changeBadge !== 'REMOVED' && row.status !== 'Removed');
  const liveMonth1 = payable.reduce((sum, row) => sum + Number(row.month1Amount || 0), 0);
  const liveMonth2 = payable.reduce((sum, row) => sum + Number(row.month2Amount || 0), 0);
  const liveTotal = payable.reduce((sum, row) => sum + Number(row.bimonthlyTotal || 0), 0);
  const liveBeneficiaries = payable.filter((row) => row.bimonthlyTotal > 0).length;
  const month1Employees = payable.filter((row) => row.month1Eligible || row.month1Amount > 0).length;
  const month2Employees = payable.filter((row) => row.month2Eligible || row.month2Amount > 0).length;

  const run = async (action: string, body: Record<string, unknown> = {}) => {
    if (!cycle && !['create-cycle', 'import-call-credit', 'import-historical'].includes(action)) return;
    await post(action, {
      cycleId: cycle?.id,
      rowVersion: cycle?.rowVersion,
      ...body,
    });
    setSelected([]);
    await load();
  };

  const saveEmployees = async (employees: CycleEmployee[]) => {
    if (!cycle) return;
    if (hrMode) return;
    await run('save-draft', { patch: { employees } });
  };

  const importCallCreditFile = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    const workbookBase64 = btoa(binary);
    if (!window.confirm(
      `Import "${file.name}" as the concluded Call Credit cycle?\n\n`
      + 'This will:\n'
      + '• Replace an empty JUL–AUG draft if present\n'
      + '• Save the schedule as PAID\n'
      + '• Seed monthly entitlements\n'
      + '• Create the next cycle (SEP–OCT)',
    )) return;
    await post('import-call-credit', {
      workbookBase64,
      replaceEmptyDraft: true,
      seedEntitlements: true,
      createNextCycle: true,
      status: 'PAID',
    });
    await load();
  };

  const searchDirectory = async (q: string) => {
    setDirQuery(q);
    if (q.trim().length < 2) {
      setDirHits([]);
      return;
    }
    const res = await get<{ employees: DirectoryHit[] | { employees?: DirectoryHit[] } }>('directory-search', { q });
    const payload = res.employees;
    const list = Array.isArray(payload) ? payload : payload?.employees || [];
    setDirHits(list.filter((hit) => !hit.status || /active/i.test(hit.status)));
  };

  const changeLabel = (row: CycleEmployee) => {
    if (row.changeBadge === 'UNCHANGED') return 'Unchanged';
    if (row.changeBadge === 'AMOUNT_CHANGED') return 'Amount Changed';
    if (row.changeBadge === 'REMOVED') return 'Removed';
    if (row.changeBadge === 'ADDED') {
      if (row.month2Eligible && !row.month1Eligible) return `Added (${month2Name})`;
      if (row.month1Eligible && !row.month2Eligible) return `Added (${month1Name})`;
      return 'Added';
    }
    if (row.month1Eligible && !row.month2Eligible) return `${month2Name} Removed`;
    if (!row.month1Eligible && row.month2Eligible) return `${month1Name} Removed`;
    return row.changeBadge.replaceAll('_', ' ');
  };

  const badgeClass = (row: CycleEmployee) => {
    const kind = changeKind(row.changeBadge);
    if (kind === 'unchanged') return 'bg-slate-100 text-slate-600';
    if (kind === 'added') return 'bg-emerald-50 text-emerald-800';
    if (row.changeBadge === 'REMOVED') return 'bg-rose-50 text-rose-800';
    return 'bg-amber-100 text-amber-900';
  };

  const applyLine = (row: CycleEmployee, rate: number, month1Eligible: boolean, month2Eligible: boolean): CycleEmployee => {
    let changeBadge = row.changeBadge;
    if (changeBadge !== 'ADDED') {
      if (!month1Eligible && !month2Eligible) changeBadge = 'REMOVED';
      else if (!month2Eligible) changeBadge = 'MONTH1_ONLY';
      else if (!month1Eligible) changeBadge = 'MONTH2_ONLY';
      else if (rate !== row.monthlyRate) changeBadge = 'AMOUNT_CHANGED';
    }
    return {
      ...row,
      monthlyRate: rate,
      month1Eligible,
      month2Eligible,
      month1Amount: month1Eligible ? rate : 0,
      month2Amount: month2Eligible ? rate : 0,
      bimonthlyTotal: (month1Eligible ? rate : 0) + (month2Eligible ? rate : 0),
      changeBadge,
      status: changeBadge === 'REMOVED' ? 'Removed' : changeBadge === 'UNCHANGED' ? row.status : 'Changed',
    };
  };

  const saveLine = async (row: CycleEmployee, rate: number, month1Eligible: boolean, month2Eligible: boolean) => {
    if (!cycle) return;
    if (hrMode) {
      await run('hr-adjust-amount', {
        employeeCode: row.employeeCode,
        newMonthlyRate: rate,
        monthlyRate: rate,
        month1Eligible,
        month2Eligible,
        effectiveMonth: 'BOTH',
        reason: 'Entitlement revision',
      });
      return;
    }
    await saveEmployees(cycle.employees.map((line) => (
      line.id === row.id ? applyLine(line, rate, month1Eligible, month2Eligible) : line
    )));
  };

  const removeLines = async (ids: string[], reason = 'Removed from cycle') => {
    if (!cycle) return;
    const targets = cycle.employees.filter((row) => ids.includes(row.id));
    if (!targets.length) return;
    if (hrMode) {
      let version = cycle.rowVersion;
      for (const row of targets) {
        const data = await post<{ cycle?: Cycle }>('hr-remove-employee', {
          cycleId: cycle.id,
          rowVersion: version,
          employeeCode: row.employeeCode,
          reason,
          effectiveMonth: 'BOTH',
        });
        version = data.cycle?.rowVersion ?? version;
      }
      setSelected([]);
      await load();
      return;
    }
    const idSet = new Set(ids);
    await saveEmployees(cycle.employees.map((row) => (
      idSet.has(row.id)
        ? {
            ...row,
            month1Eligible: false,
            month2Eligible: false,
            month1Amount: 0,
            month2Amount: 0,
            bimonthlyTotal: 0,
            changeBadge: 'REMOVED',
            status: 'Removed',
          }
        : row
    )));
  };

  const addEmployee = async () => {
    if (!cycle || !addForm.employeeCode) return;
    if (hrMode) {
      await run('hr-add-employee', addForm);
      setShowAdd(false);
      return;
    }
    if (cycle.employees.some((row) => row.employeeCode === addForm.employeeCode && row.changeBadge !== 'REMOVED')) return;
    const rate = Number(addForm.monthlyRate) || 0;
    const line: CycleEmployee = {
      id: crypto.randomUUID(),
      employeeCode: addForm.employeeCode,
      employeeName: addForm.employeeName,
      department: addForm.department,
      jobTitle: addForm.jobTitle,
      monthlyRate: rate,
      month1Eligible: addForm.month1Eligible,
      month2Eligible: addForm.month2Eligible,
      month1Amount: addForm.month1Eligible ? rate : 0,
      month2Amount: addForm.month2Eligible ? rate : 0,
      bimonthlyTotal: (addForm.month1Eligible ? rate : 0) + (addForm.month2Eligible ? rate : 0),
      changeBadge: 'ADDED',
      status: 'Changed',
      exceptionFlags: [],
    };
    await saveEmployees([...cycle.employees.filter((row) => !(row.employeeCode === line.employeeCode && row.changeBadge === 'REMOVED')), line]);
    setShowAdd(false);
  };

  const selectedRows = (cycle?.employees || []).filter((row) => selected.includes(row.id));
  const amountDelta = previous ? liveTotal - previous.bimonthlyTotal : 0;
  const amountPct = previous && previous.bimonthlyTotal ? (amountDelta / previous.bimonthlyTotal) * 100 : 0;
  const peopleDelta = previous ? liveBeneficiaries - previous.beneficiaryCount : 0;
  const duplicateCodes = useMemo(() => {
    const seen = new Set<string>();
    const dups = new Set<string>();
    for (const row of cycle?.employees || []) {
      if (row.changeBadge === 'REMOVED') continue;
      const code = row.employeeCode.toUpperCase();
      if (seen.has(code)) dups.add(code);
      seen.add(code);
    }
    return dups;
  }, [cycle]);
  const missingBank = (cycle?.employees || []).filter((row) => row.changeBadge !== 'REMOVED' && (row.exceptionFlags || []).some((flag) => /bank/i.test(flag))).length;
  const exceptionCount = (cycle?.employees || []).filter((row) => row.status === 'Exception' || (row.exceptionFlags || []).length > 0).length;
  const previousCycles = cycles.filter((row) => !cycle || row.id !== cycle.id);

  return (
    <div className="space-y-4 text-slate-900">
      {toast ? (
        <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${error && toast === error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
          {toast}
        </div>
      ) : null}

      <p className="text-xs font-semibold text-slate-500">
        IT & SUPPORT <span className="px-1.5 text-slate-300">›</span> Telephone Allowance <span className="px-1.5 text-slate-300">›</span>
        <span className="font-bold text-slate-800">Allowance Management</span>
      </p>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-[11px] font-extrabold tracking-[0.14em] text-teal-700">TELEPHONE ALLOWANCE</p>
          <h1 className="mt-1 text-[28px] font-black leading-tight text-slate-950">Allowance Management</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">Prepare, review, and maintain bimonthly telephone allowance schedules and entitlements.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {cycle ? (
            <div className="flex min-w-[280px] items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <CalendarDays className="h-5 w-5 shrink-0 text-teal-700" />
              <div>
                <p className="text-[11px] font-semibold text-slate-500">Current Cycle</p>
                <p className="text-lg font-black text-slate-950">
                  {pairTitle}{' '}
                  <span className="ml-1 rounded-full bg-teal-50 px-2 py-0.5 align-middle text-[10px] font-extrabold tracking-wide text-teal-800">
                    {cycle.status.replaceAll('_', ' ')}
                  </span>
                </p>
                <p className="text-[11px] font-medium text-slate-500">Prepared by {cycle.preparedBy} • {formatPrepared(cycle.updatedAt)}</p>
              </div>
            </div>
          ) : null}
          <div className="relative">
            <button
              type="button"
              onClick={() => { setShowWorkflow((open) => !open); setShowMore(false); }}
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 shadow-sm"
            >
              Workflow Actions
              <ChevronDown className={`h-4 w-4 text-slate-400 transition ${showWorkflow ? 'rotate-180' : ''}`} />
            </button>
            {showWorkflow ? (
              <div className="absolute right-0 z-20 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                {itEditable ? <MenuBtn label="Send to HR for Review" onClick={() => { setShowWorkflow(false); void run('send-to-hr'); }} /> : null}
                {hrMode ? <MenuBtn label="Complete Review & Return to IT" onClick={() => { setShowWorkflow(false); void run('complete-hr-review', { comment: 'HR review completed' }); }} /> : null}
                {cycle && caps?.canPrepare && ['RETURNED_TO_IT', 'IT_VALIDATION'].includes(cycle.status) ? (
                  <MenuBtn label="Initiate Approval" onClick={() => {
                    setShowWorkflow(false);
                    if (!window.confirm('This will lock the schedule and initiate formal approval. Continue?')) return;
                    void run('initiate-approval');
                  }} />
                ) : null}
                <MenuBtn label="View Changes" onClick={() => { setShowWorkflow(false); setShowChanges(true); }} />
                <MenuBtn label="Refresh" onClick={() => { setShowWorkflow(false); void load(); }} />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`h-10 rounded-lg px-4 text-sm font-bold ${tab === item ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === 'Current Cycle' && cycle ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Kpi icon={<Users className="h-5 w-5" />} tint="bg-sky-50 text-sky-700" label="Beneficiaries" value={String(liveBeneficiaries)} detail={previous ? `${peopleDelta >= 0 ? '+' : ''}${peopleDelta} vs. previous cycle` : `${liveBeneficiaries} employees`} detailTone={peopleDelta >= 0 ? 'text-emerald-700' : 'text-rose-700'} />
            <Kpi icon={<CalendarDays className="h-5 w-5" />} tint="bg-teal-50 text-teal-700" label={`${month1Name} Total`} value={moneyNgn(liveMonth1)} detail={`${month1Employees} employees`} />
            <Kpi icon={<CalendarDays className="h-5 w-5" />} tint="bg-violet-50 text-violet-700" label={`${month2Name} Total`} value={moneyNgn(liveMonth2)} detail={`${month2Employees} employees`} />
            <Kpi icon={<WalletCards className="h-5 w-5" />} tint="bg-orange-50 text-orange-700" label="Bimonthly Total" value={moneyNgn(liveTotal)} detail={previous ? `${amountDelta >= 0 ? '↑' : '↓'} ${moneyNgn(Math.abs(amountDelta))} (${amountPct >= 0 ? '+' : ''}${amountPct.toFixed(1)}%)` : 'Calculated automatically'} detailTone={amountDelta >= 0 ? 'text-emerald-700' : 'text-rose-700'} />
            <Kpi icon={<BarChart3 className="h-5 w-5" />} tint="bg-slate-100 text-slate-600" label={previous ? `Previous Cycle (${previous.pairLabel} ${previous.year})` : 'Previous Cycle'} value={previous ? moneyNgn(previous.bimonthlyTotal) : '—'} detail={previous ? `${previous.beneficiaryCount} beneficiaries` : 'No prior cycle'} />
          </div>

          {hrMode ? (
            <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
              HR review mode. Original employees {cycle.originalBeneficiaryCount ?? cycle.beneficiaryCount}. Added {cycle.changes.filter((c) => c.changeType === 'ADD').length}. Removed {cycle.changes.filter((c) => c.changeType === 'REMOVE').length}. Amount changes {cycle.changes.filter((c) => c.changeType === 'AMOUNT').length}. Revised total {moneyNgn(liveTotal)}.
            </section>
          ) : null}

          <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
            <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-base font-black text-slate-950">Employees for {pairTitle}</h2>
                  <p className="mt-0.5 text-xs font-medium text-slate-500">Add or remove employees, and update monthly allowance amounts. Employees are loaded from the Employee Directory.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) void importCallCreditFile(file).catch(console.error);
                    }}
                  />
                  {canEditRows ? (
                    <button type="button" onClick={() => setShowAdd(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-teal-700 px-3 text-xs font-bold text-white">
                      <Plus className="h-3.5 w-3.5" /> Add Employee
                    </button>
                  ) : null}
                  {caps?.canImport ? (
                    <button type="button" disabled={Boolean(busy)} onClick={() => fileRef.current?.click()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 disabled:opacity-50">
                      <Upload className="h-3.5 w-3.5" /> Import Call Credit
                    </button>
                  ) : null}
                  {itEditable ? (
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => {
                        if (cycle.beneficiaryCount > 0 && !window.confirm('Replace the current schedule with beneficiaries from the previous cycle / entitlements?')) return;
                        void run('populate-from-previous', { replaceExisting: true });
                      }}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 disabled:opacity-50"
                    >
                      <Copy className="h-3.5 w-3.5" /> Load from Previous Cycle
                    </button>
                  ) : null}
                  <div className="relative">
                    <button type="button" onClick={() => { setShowMore((open) => !open); setShowWorkflow(false); }} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700">
                      <MoreHorizontal className="h-3.5 w-3.5" /> More
                    </button>
                    {showMore ? (
                      <div className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                        {caps?.canPrepare ? <MenuBtn label="Create Next Cycle" onClick={() => { setShowMore(false); void run('create-cycle'); }} /> : null}
                        {cycle.status === 'DRAFT' && cycle.beneficiaryCount === 0 && caps?.canPrepare ? (
                          <MenuBtn label="Discard Empty Draft" onClick={() => {
                            setShowMore(false);
                            if (!window.confirm('Discard this empty draft cycle?')) return;
                            void run('discard-empty-draft');
                          }} />
                        ) : null}
                        <MenuBtn label="View Changes" onClick={() => { setShowMore(false); setShowChanges(true); }} />
                        <MenuBtn label="Refresh" onClick={() => { setShowMore(false); void load(); }} />
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-3 lg:flex-row lg:items-center">
                <div className="relative min-w-[240px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee, code or department..." className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm font-medium" />
                </div>
                <select value={department} onChange={(e) => setDepartment(e.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
                  {departments.map((name) => <option key={name} value={name}>{name === 'All' ? 'All Departments' : name}</option>)}
                </select>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
                  <option value="All">All</option>
                  <option value="Active">Active</option>
                  <option value="Exception">Exception</option>
                  <option value="Removed">Removed</option>
                </select>
                <div className="flex flex-wrap gap-1 lg:ml-auto">
                  {([
                    ['All', counts.all],
                    ['Added', counts.added],
                    ['Removed', counts.removed],
                    ['Changed', counts.changed],
                  ] as const).map(([label, count]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setChangeFilter(label)}
                      className={`h-8 rounded-lg px-2.5 text-[11px] font-bold ${changeFilter === label ? 'bg-teal-700 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
                    >
                      {label} ({count})
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-[980px] w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-8 px-3 py-2">
                        <input
                          type="checkbox"
                          checked={pageRows.length > 0 && pageRows.every((row) => selected.includes(row.id))}
                          onChange={() => {
                            const ids = pageRows.map((row) => row.id);
                            const allOn = ids.every((id) => selected.includes(id));
                            setSelected(allOn ? selected.filter((id) => !ids.includes(id)) : Array.from(new Set([...selected, ...ids])));
                          }}
                        />
                      </th>
                      <th className="px-2 py-2">#</th>
                      <th className="px-2 py-2">Employee</th>
                      <th className="px-2 py-2">Department</th>
                      <th className="px-2 py-2">Employment Status</th>
                      <th className="px-2 py-2 text-right">Monthly Rate (₦)</th>
                      <th className="px-2 py-2 text-right">{month1Name}</th>
                      <th className="px-2 py-2 text-right">{month2Name}</th>
                      <th className="px-2 py-2 text-right">Total</th>
                      <th className="px-2 py-2">Change</th>
                      <th className="px-2 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row, index) => (
                      <tr key={row.id} className="border-t border-slate-100">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selected.includes(row.id)}
                            onChange={() => setSelected((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id])}
                          />
                        </td>
                        <td className="px-2 py-2 text-slate-400">{(safePage - 1) * PAGE_SIZE + index + 1}</td>
                        <td className="px-2 py-2">
                          <p className="font-bold text-slate-950">{row.employeeName}</p>
                          <p className="text-[11px] text-slate-400">{row.employeeCode}</p>
                        </td>
                        <td className="px-2 py-2 text-slate-600">{row.department || '—'}</td>
                        <td className="px-2 py-2 font-semibold text-slate-700">
                          {row.status === 'Removed' ? <span className="text-rose-700">Removed</span> : row.status === 'Exception' ? <span className="text-amber-700">● Exception</span> : <span className="text-teal-700">● Active</span>}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button type="button" disabled={!canEditRows} onClick={() => setEdit(row)} className="rounded-md border border-slate-200 bg-white px-2 py-1 font-bold text-slate-800 disabled:border-transparent disabled:bg-transparent">
                            {moneyNgn(row.monthlyRate)}
                          </button>
                        </td>
                        <td className="px-2 py-2 text-right font-medium">{moneyNgn(row.month1Amount)}</td>
                        <td className="px-2 py-2 text-right font-medium">{moneyNgn(row.month2Amount)}</td>
                        <td className="px-2 py-2 text-right font-black">{moneyNgn(row.bimonthlyTotal)}</td>
                        <td className="px-2 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${badgeClass(row)}`}>{changeLabel(row)}</span>
                        </td>
                        <td className="px-2 py-2">
                          <button type="button" disabled={!canEditRows} onClick={() => setEdit(row)} className="mr-1 rounded-md border border-slate-200 p-1 text-slate-600 disabled:opacity-40" title="Update amount">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={!canEditRows || row.changeBadge === 'REMOVED'}
                            onClick={() => {
                              if (!window.confirm(`Remove ${row.employeeName} from this cycle?`)) return;
                              void removeLines([row.id]);
                            }}
                            className="rounded-md border border-slate-200 p-1 text-rose-600 disabled:opacity-40"
                            title="Remove from cycle"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!rows.length ? <p className="p-6 text-sm font-semibold text-slate-500">No employees match this filter.</p> : null}
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3 text-xs">
                <span className="font-semibold text-slate-500">{selected.length} selected</span>
                <button type="button" disabled={!canEditRows || !selected.length} onClick={() => setBulk('amount')} className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-bold text-slate-700 disabled:opacity-40">Update Amount</button>
                <button type="button" disabled={!canEditRows || !selected.length} onClick={() => {
                  if (!window.confirm(`Remove ${selected.length} employee${selected.length === 1 ? '' : 's'} from this cycle?`)) return;
                  void removeLines(selected);
                }} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 font-bold text-slate-700 disabled:opacity-40">
                  <Trash2 className="h-3.5 w-3.5" /> Remove from Cycle
                </button>
                <button type="button" disabled={!canEditRows || !selected.length} onClick={() => setBulk('eligibility')} className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-bold text-slate-700 disabled:opacity-40">Set Monthly Eligibility</button>
                <div className="ml-auto flex items-center gap-2 font-semibold text-slate-500">
                  <span>Rows per page {PAGE_SIZE}</span>
                  <span>{rows.length ? `${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(safePage * PAGE_SIZE, rows.length)} of ${rows.length}` : '0'}</span>
                  <button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} className="rounded border border-slate-200 p-1 disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /></button>
                  {Array.from({ length: Math.min(pageCount, 6) }, (_, i) => i + 1).map((n) => (
                    <button key={n} type="button" onClick={() => setPage(n)} className={`h-7 min-w-7 rounded ${n === safePage ? 'bg-teal-700 text-white' : 'text-slate-600'}`}>{n}</button>
                  ))}
                  <button type="button" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)} className="rounded border border-slate-200 p-1 disabled:opacity-40"><ChevronRight className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </section>

            <aside className="space-y-3">
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-black text-slate-950">Cycle Summary</h3>
                <SummaryRow label="Total Beneficiaries" value={String(liveBeneficiaries)} />
                <SummaryRow label={`${month1Name} Total`} value={moneyNgn(liveMonth1)} />
                <SummaryRow label={`${month2Name} Total`} value={moneyNgn(liveMonth2)} />
                <SummaryRow label="Bimonthly Total" value={moneyNgn(liveTotal)} />
                <div className="my-3 border-t border-slate-100" />
                <SummaryRow label="Added Employees" value={String(counts.added)} />
                <SummaryRow label="Removed Employees" value={String(counts.removed)} />
                <SummaryRow label="Amount Changes" value={String(counts.changed)} />
                <SummaryRow label="Net Change" value={previous ? `${amountDelta >= 0 ? '+' : '−'}${moneyNgn(Math.abs(amountDelta))}` : '—'} />
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-black text-slate-950">Validation Status</h3>
                <CheckLine ok={duplicateCodes.size === 0} label="No duplicate employees" />
                <CheckLine ok label="All employees are active" />
                <CheckLine ok={missingBank === 0} label={missingBank ? `${missingBank} missing bank details` : 'Bank details available'} />
                <CheckLine ok={!validation || validation.critical.length === 0} label="Amounts are valid" />
                {exceptionCount ? (
                  <button type="button" onClick={() => setStatusFilter('Exception')} className="mt-2 flex items-start gap-2 text-left text-[11px] font-semibold text-amber-800">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {exceptionCount} employee{exceptionCount === 1 ? '' : 's'} with exceptions. View
                  </button>
                ) : (
                  <p className="mt-2 flex items-start gap-2 text-[11px] font-semibold text-slate-500">
                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-700" />
                    Inactive directory employees are excluded from the next cycle.
                  </p>
                )}
                {(validation?.critical || []).slice(0, 3).map((issue) => (
                  <p key={issue.code + issue.message} className="mt-1 text-[11px] font-semibold text-rose-700">{issue.message}</p>
                ))}
                {itEditable ? (
                  <button type="button" disabled={Boolean(busy)} onClick={() => void run('send-to-hr')} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 text-xs font-extrabold text-white disabled:opacity-50">
                    <Send className="h-4 w-4" /> Send to HR for Review
                  </button>
                ) : null}
              </section>

              <section className="rounded-xl border border-teal-100 bg-teal-50/60 p-4">
                <h3 className="text-sm font-black text-teal-900">Quick Help</h3>
                <p className="mt-2 text-[11px] font-medium leading-5 text-slate-600">
                  Employees are loaded from the Employee Directory. When an employee is made inactive in the directory, they are left off the next cycle. Amount changes are tracked and require approval.
                </p>
                <a href="/it-support/telephone-allowance" className="mt-2 inline-block text-xs font-bold text-teal-800">Learn more →</a>
              </section>
            </aside>
          </div>
        </>
      ) : null}

      {tab === 'Current Cycle' && !cycle ? (
        <section className="rounded-xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-600">
          Import a concluded Call Credit workbook, or create the next cycle. New cycles load beneficiaries from the previous cycle so IT can add or remove people before sending the schedule to HR.
          <div className="mt-3 flex gap-2">
            {caps?.canPrepare ? <button type="button" onClick={() => void run('create-cycle')} className="rounded-lg bg-teal-700 px-3 py-2 text-xs font-bold text-white">Create Next Cycle</button> : null}
          </div>
        </section>
      ) : null}

      {tab === 'Entitlements' ? (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-black">Employee Entitlements</h2>
            {caps?.canPrepare ? (
              <button
                type="button"
                className="rounded-lg bg-teal-700 px-3 py-2 text-xs font-bold text-white"
                onClick={() => {
                  const employeeCode = window.prompt('Employee code') || '';
                  const monthlyAmount = Number(window.prompt('Monthly entitlement amount', '10000') || 0);
                  const effectiveFrom = window.prompt('Effective from (YYYY-MM-DD)', new Date().toISOString().slice(0, 10)) || '';
                  if (!employeeCode || !monthlyAmount || !effectiveFrom) return;
                  void post('upsert-entitlement', { employeeCode, monthlyAmount, effectiveFrom, status: 'Active' }).then(() => load());
                }}
              >
                Add / Change Entitlement
              </button>
            ) : null}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Employee</th>
                  <th className="px-3 py-2 text-left">Department</th>
                  <th className="px-3 py-2 text-right">Monthly Entitlement</th>
                  <th className="px-3 py-2 text-left">Effective From</th>
                  <th className="px-3 py-2 text-left">Effective To</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {entitlements.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-semibold">{row.employeeName}<div className="text-xs text-slate-500">{row.employeeCode}</div></td>
                    <td className="px-3 py-2">{row.department}</td>
                    <td className="px-3 py-2 text-right font-black">{moneyNgn(row.monthlyAmount)}</td>
                    <td className="px-3 py-2">{row.effectiveFrom?.slice(0, 10)}</td>
                    <td className="px-3 py-2">{row.effectiveTo?.slice(0, 10) || '—'}</td>
                    <td className="px-3 py-2"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${statusTone(row.status)}`}>{row.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!entitlements.length ? <p className="p-6 text-sm font-semibold text-slate-500">No entitlements yet.</p> : null}
          </div>
        </section>
      ) : null}

      {tab === 'Previous Cycles' ? (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Cycle</th>
                <th className="px-3 py-2 text-right">Employees</th>
                <th className="px-3 py-2 text-right">Month 1</th>
                <th className="px-3 py-2 text-right">Month 2</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {(previousCycles.length ? previousCycles : cycles).map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-semibold">{row.pairLabel} {row.year}<div className="text-xs text-slate-500">{row.cycleCode}</div></td>
                  <td className="px-3 py-2 text-right">{row.beneficiaryCount}</td>
                  <td className="px-3 py-2 text-right">{moneyNgn(row.month1Total)}</td>
                  <td className="px-3 py-2 text-right">{moneyNgn(row.month2Total)}</td>
                  <td className="px-3 py-2 text-right font-black">{moneyNgn(row.bimonthlyTotal)}</td>
                  <td className="px-3 py-2"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${statusTone(row.status)}`}>{row.status.replaceAll('_', ' ')}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {showAdd ? (
        <Modal title="Add Employee from Employee Directory" onClose={() => setShowAdd(false)}>
          <p className="text-sm font-medium text-slate-600">Select an active employee. Employee details come from the Employee Directory.</p>
          <input value={dirQuery} onChange={(e) => void searchDirectory(e.target.value)} placeholder="Search by code, name, department" className="mt-3 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          <div className="mt-2 max-h-48 overflow-y-auto">
            {dirHits.filter((hit) => !(cycle?.employees || []).some((row) => row.employeeCode === hit.employeeCode && row.changeBadge !== 'REMOVED')).map((hit) => (
              <button
                key={hit.employeeCode}
                type="button"
                className={`mt-2 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left ${addForm.employeeCode === hit.employeeCode ? 'border-teal-400 bg-teal-50' : 'border-slate-200'}`}
                onClick={() => setAddForm((prev) => ({ ...prev, employeeCode: hit.employeeCode, employeeName: hit.employeeName, department: hit.department, jobTitle: hit.jobTitle }))}
              >
                <span><b className="block text-sm">{hit.employeeName}</b><small className="text-slate-500">{hit.employeeCode} • {hit.department}</small></span>
                <Plus className="h-4 w-4 text-teal-700" />
              </button>
            ))}
          </div>
          <label className="mt-3 block text-xs font-bold text-slate-600">Monthly Amount (₦)
            <input type="number" value={addForm.monthlyRate} onChange={(e) => setAddForm({ ...addForm, monthlyRate: Number(e.target.value) })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold" />
          </label>
          <div className="mt-3 flex gap-4 text-sm font-semibold">
            <label className="flex items-center gap-2"><input type="checkbox" checked={addForm.month1Eligible} onChange={(e) => setAddForm({ ...addForm, month1Eligible: e.target.checked })} /> {month1Name}</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={addForm.month2Eligible} onChange={(e) => setAddForm({ ...addForm, month2Eligible: e.target.checked })} /> {month2Name}</label>
          </div>
          <button type="button" disabled={!addForm.employeeCode || Boolean(busy)} onClick={() => void addEmployee()} className="mt-4 h-10 w-full rounded-lg bg-teal-700 text-sm font-extrabold text-white disabled:opacity-50">Add to Cycle</button>
        </Modal>
      ) : null}

      {edit ? (
        <EditModal
          title="Update Monthly Allowance"
          employee={`${edit.employeeName} (${edit.employeeCode})`}
          rate={edit.monthlyRate}
          month1={edit.month1Eligible}
          month2={edit.month2Eligible}
          month1Name={month1Name}
          month2Name={month2Name}
          busy={Boolean(busy)}
          onClose={() => setEdit(null)}
          onSave={(rate, m1, m2) => { void saveLine(edit, rate, m1, m2).then(() => setEdit(null)); }}
        />
      ) : null}

      {bulk && selectedRows.length ? (
        <EditModal
          title={bulk === 'amount' ? 'Update Amount' : 'Set Monthly Eligibility'}
          employee={`${selectedRows.length} selected employee${selectedRows.length === 1 ? '' : 's'}`}
          rate={selectedRows[0].monthlyRate}
          month1={selectedRows[0].month1Eligible}
          month2={selectedRows[0].month2Eligible}
          month1Name={month1Name}
          month2Name={month2Name}
          hideRate={bulk === 'eligibility'}
          busy={Boolean(busy)}
          onClose={() => setBulk(null)}
          onSave={(rate, m1, m2) => {
            const ids = new Set(selected);
            if (hrMode) {
              void (async () => {
                let version = cycle?.rowVersion || 0;
                for (const row of selectedRows) {
                  const data = await post<{ cycle?: Cycle }>('hr-adjust-amount', {
                    cycleId: cycle?.id,
                    rowVersion: version,
                    employeeCode: row.employeeCode,
                    monthlyRate: bulk === 'amount' ? rate : row.monthlyRate,
                    month1Eligible: m1,
                    month2Eligible: m2,
                    effectiveMonth: 'BOTH',
                    reason: bulk === 'amount' ? 'Bulk amount update' : 'Bulk eligibility update',
                  });
                  version = data.cycle?.rowVersion ?? version;
                }
                setSelected([]);
                setBulk(null);
                await load();
              })();
              return;
            }
            void saveEmployees((cycle?.employees || []).map((row) => (
              ids.has(row.id) ? applyLine(row, bulk === 'amount' ? rate : row.monthlyRate, m1, m2) : row
            ))).then(() => setBulk(null));
          }}
        />
      ) : null}

      {showChanges && cycle ? (
        <Modal title="View Changes" onClose={() => setShowChanges(false)}>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {cycle.versions.map((version) => (
              <div key={`${version.versionNo}-${version.label}`} className="rounded-xl border border-slate-200 p-3 text-sm">
                <p className="font-black">Version {version.versionNo} — {version.label}</p>
                <p className="text-xs text-slate-500">{version.createdBy} · {new Date(version.createdAt).toLocaleString()} · {version.beneficiaryCount} beneficiaries · {moneyNgn(version.bimonthlyTotal)}</p>
              </div>
            ))}
            {cycle.changes.map((change, idx) => (
              <div key={`${change.employeeCode}-${idx}`} className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm">
                <p className="font-black">{change.changeType} · {change.employeeCode} {change.employeeName}</p>
                <p className="text-xs text-slate-600">{change.reason}</p>
              </div>
            ))}
            {!cycle.changes.length && !cycle.versions.length ? <p className="text-sm font-semibold text-slate-500">No changes recorded.</p> : null}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function Kpi({ icon, tint, label, value, detail, detailTone = 'text-slate-500' }: { icon: React.ReactNode; tint: string; label: string; value: string; detail: string; detailTone?: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg ${tint}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-slate-500">{label}</p>
        <p className="truncate text-lg font-black text-slate-950">{value}</p>
        <p className={`text-[11px] font-semibold ${detailTone}`}>{detail}</p>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-50 py-1.5 text-xs">
      <span className="text-slate-500">{label}</span>
      <b className="text-slate-900">{value}</b>
    </div>
  );
}

function CheckLine({ ok, label }: { ok: boolean; label: string }) {
  return (
    <p className={`mt-2 flex items-center gap-2 text-[11px] font-semibold ${ok ? 'text-emerald-800' : 'text-amber-800'}`}>
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
      {label}
    </p>
  );
}

function MenuBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="block w-full rounded-lg px-3 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50">
      {label}
    </button>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-black">{title}</h2>
          <button type="button" onClick={onClose} className="text-2xl leading-none text-slate-400">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function EditModal({
  title, employee, rate, month1, month2, month1Name, month2Name, hideRate, busy, onClose, onSave,
}: {
  title: string;
  employee: string;
  rate: number;
  month1: boolean;
  month2: boolean;
  month1Name: string;
  month2Name: string;
  hideRate?: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (rate: number, month1: boolean, month2: boolean) => void;
}) {
  const [nextRate, setNextRate] = useState(rate);
  const [m1, setM1] = useState(month1);
  const [m2, setM2] = useState(month2);
  return (
    <Modal title={title} onClose={onClose}>
      <label className="block text-xs font-bold text-slate-600">Employee
        <input disabled value={employee} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold" />
      </label>
      {hideRate ? null : (
        <label className="mt-3 block text-xs font-bold text-slate-600">Monthly Amount (₦)
          <input type="number" value={nextRate} onChange={(e) => setNextRate(Number(e.target.value))} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold" />
        </label>
      )}
      <div className="mt-3 flex gap-4 text-sm font-semibold">
        <label className="flex items-center gap-2"><input type="checkbox" checked={m1} onChange={(e) => setM1(e.target.checked)} /> {month1Name} eligible</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={m2} onChange={(e) => setM2(e.target.checked)} /> {month2Name} eligible</label>
      </div>
      <button type="button" disabled={busy} onClick={() => onSave(nextRate, m1, m2)} className="mt-4 h-10 w-full rounded-lg bg-teal-700 text-sm font-extrabold text-white disabled:opacity-50">Save Changes</button>
    </Modal>
  );
}
