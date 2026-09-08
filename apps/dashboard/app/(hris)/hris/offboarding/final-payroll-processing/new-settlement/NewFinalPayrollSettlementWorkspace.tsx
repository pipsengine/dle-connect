'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Eye,
  Info,
  RefreshCw,
  Save,
  Search,
  Send,
} from 'lucide-react';
import type { FinalPayrollSettlement } from '@/lib/final-payroll-settlement-shared';
import {
  formatFinalPayrollDate,
  formatFinalPayrollMoney,
  sumIncludedLines,
} from '@/lib/final-payroll-settlement-shared';
import styles from '@/styles/final-payroll-processing.module.css';

const STEPS = [
  'Employee Details',
  'Earnings',
  'Deductions & Recoveries',
  'Clearance',
  'Calculation',
  'Approval',
  'Review & Submit',
] as const;

const EARNINGS_TABS = [
  'Earnings',
  'Deductions & Recoveries',
  'Statutory Deductions',
  'Clearance Status',
  'Documents',
] as const;

type SearchHit = {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  employmentType: string;
  jobTitle: string;
  currency: 'NGN' | 'USD';
  basicSalary: number;
  dateOfJoining: string | null;
  status: string;
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '—';

const isPreviewId = (id?: string | null) => Boolean(id && String(id).startsWith('PREVIEW-'));

export default function NewFinalPayrollSettlementWorkspace({
  initialId,
  initialEmployeeCode,
}: {
  initialId?: string;
  initialEmployeeCode?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [earningsTab, setEarningsTab] = useState<(typeof EARNINGS_TABS)[number]>('Earnings');
  const [query, setQuery] = useState(initialEmployeeCode || '');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [settlement, setSettlement] = useState<FinalPayrollSettlement | null>(null);
  const [persisted, setPersisted] = useState(false);
  const [exitType, setExitType] = useState('Resignation');
  const [resignationDate, setResignationDate] = useState('');
  const [lastWorkingDay, setLastWorkingDay] = useState('');
  const [noticePeriod, setNoticePeriod] = useState('1 Month');
  const [reason, setReason] = useState('Career Growth');
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const applySettlement = (row: FinalPayrollSettlement, isPersisted: boolean) => {
    setSettlement(row);
    setPersisted(isPersisted && !isPreviewId(row.id));
    setExitType(row.exitType || 'Resignation');
    setResignationDate(row.resignationDate || '');
    setLastWorkingDay(row.lastWorkingDay || '');
    setNoticePeriod(row.noticePeriod || '1 Month');
    setReason(row.reasonForLeaving || 'Career Growth');
    setRemarks(row.remarks || '');
  };

  const loadExisting = useCallback(async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/hris/offboarding/final-payroll?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Unable to load settlement.');
      const row = data.selected || data.settlements?.find((item: FinalPayrollSettlement) => item.id === id);
      if (!row) {
        setSettlement(null);
        setPersisted(false);
        setMessage('No saved settlement for this id. Select an employee to start (not saved until you click Save as Draft).');
        router.replace('/hris/offboarding/final-payroll-processing/new-settlement');
        return;
      }
      applySettlement(row, true);
    } catch (err: any) {
      setError(err?.message || 'Unable to load settlement.');
    } finally {
      setBusy(false);
    }
  }, [router]);

  const previewFromEmployee = async (employeeCode: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/hris/offboarding/final-payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          persist: false,
          employeeCode,
          exitType,
          resignationDate: resignationDate || null,
          lastWorkingDay: lastWorkingDay || null,
          noticePeriod,
          reasonForLeaving: reason,
          remarks,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Unable to load employee settlement preview.');
      applySettlement(data.settlement, false);
      setHits([]);
      setQuery('');
      setMessage('Preview only — not saved until you click Save as Draft or Submit for Approval.');
      router.replace(`/hris/offboarding/final-payroll-processing/new-settlement?employeeCode=${encodeURIComponent(employeeCode)}`);
    } catch (err: any) {
      setError(err?.message || 'Unable to load employee settlement preview.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (initialId && !isPreviewId(initialId)) {
      void loadExisting(initialId);
      return;
    }
    if (!initialEmployeeCode) return;
    void previewFromEmployee(initialEmployeeCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialId, initialEmployeeCode, loadExisting]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/hris/offboarding/final-payroll?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        if (res.ok && data.ok) setHits(data.results || []);
      } catch {
        setHits([]);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  const persistSettlement = async (action: 'save' | 'submit') => {
    if (!settlement) {
      setError('Select an employee first.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      let current = settlement;
      if (!persisted || isPreviewId(settlement.id)) {
        const createRes = await fetch('/api/hris/offboarding/final-payroll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            persist: true,
            employeeCode: settlement.employeeCode,
            exitType,
            resignationDate: resignationDate || null,
            lastWorkingDay: lastWorkingDay || null,
            noticePeriod,
            reasonForLeaving: reason,
            remarks,
          }),
        });
        const createData = await createRes.json();
        if (!createRes.ok || !createData.ok) throw new Error(createData.error || 'Unable to save settlement.');
        current = createData.settlement;
        applySettlement(current, true);
        router.replace(`/hris/offboarding/final-payroll-processing/new-settlement?id=${encodeURIComponent(current.id)}`);
      }

      const res = await fetch('/api/hris/offboarding/final-payroll', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: current.id,
          action: action === 'submit' ? 'submit' : 'save',
          patch: {
            exitType,
            resignationDate: resignationDate || null,
            lastWorkingDay: lastWorkingDay || null,
            noticePeriod,
            reasonForLeaving: reason,
            remarks,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Unable to update settlement.');
      applySettlement(data.settlement, true);
      if (action === 'submit') {
        setMessage('Submitted for approval.');
        router.push(`/hris/offboarding/final-payroll-processing?period=${encodeURIComponent(data.settlement.period)}`);
        return;
      }
      setMessage('Draft saved.');
    } catch (err: any) {
      setError(err?.message || 'Unable to save settlement.');
    } finally {
      setBusy(false);
    }
  };

  const recalculate = async () => {
    if (!settlement) {
      setError('Select an employee first.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (!persisted || isPreviewId(settlement.id)) {
        const res = await fetch('/api/hris/offboarding/final-payroll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            persist: false,
            employeeCode: settlement.employeeCode,
            exitType,
            resignationDate: resignationDate || null,
            lastWorkingDay: lastWorkingDay || null,
            noticePeriod,
            reasonForLeaving: reason,
            remarks,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Unable to recalculate.');
        applySettlement(data.settlement, false);
        setMessage('Earnings recalculated from employee salary package (preview — not saved).');
        return;
      }
      const res = await fetch('/api/hris/offboarding/final-payroll', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: settlement.id,
          action: 'recalculate',
          patch: {
            exitType,
            resignationDate: resignationDate || null,
            lastWorkingDay: lastWorkingDay || null,
            noticePeriod,
            reasonForLeaving: reason,
            remarks,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Unable to recalculate.');
      applySettlement(data.settlement, true);
      setMessage('Earnings recalculated from employee salary package.');
    } catch (err: any) {
      setError(err?.message || 'Unable to recalculate.');
    } finally {
      setBusy(false);
    }
  };

  const activeLines = useMemo(() => {
    if (!settlement) return [];
    if (earningsTab === 'Deductions & Recoveries') return settlement.deductions;
    if (earningsTab === 'Statutory Deductions') return settlement.statutory;
    return settlement.earnings;
  }, [settlement, earningsTab]);

  const totalAmount = sumIncludedLines(activeLines);
  const nextPayrollLabel = settlement?.nextPayrollExcluded ? 'Excluded' : 'Included';

  return (
    <div className={styles.root}>
      <div className={styles.crumb}>
        Offboarding <ChevronRight />{' '}
        <Link href="/hris/offboarding/final-payroll-processing">Final Payroll Processing</Link>{' '}
        <ChevronRight /> <b>New Settlement</b>
      </div>

      <div className={styles.titleRow}>
        <div className={styles.newTitle}>
          <button type="button" onClick={() => router.push('/hris/offboarding/final-payroll-processing')}>
            <ChevronLeft />
          </button>
          <div>
            <h1>New Final Payroll Settlement</h1>
            <p>Create and calculate final settlement for an exiting employee.</p>
          </div>
        </div>
        <div className={styles.actions}>
          <button type="button" disabled={busy || !settlement} onClick={() => void persistSettlement('save')}>
            <Save /> Save as Draft
          </button>
          <button type="button" disabled={busy || !settlement} onClick={() => setStep(6)}>
            <Eye /> Preview
          </button>
          <button type="button" className={styles.primary} disabled={busy || !settlement} onClick={() => void persistSettlement('submit')}>
            <Send /> Submit for Approval
          </button>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {message ? <p>{message}</p> : null}
      {settlement && !persisted ? (
        <p style={{ color: '#b87100', margin: '0 0 10px', fontWeight: 600 }}>
          Unsaved preview — this settlement is not on the register until you Save as Draft or Submit.
        </p>
      ) : null}

      <div className={styles.steps}>
        {STEPS.map((label, index) => (
          <button
            key={label}
            type="button"
            className={`${styles.step} ${index === step ? styles.current : ''}`}
            onClick={() => setStep(index)}
          >
            <i>{index + 1}</i>
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className={styles.formGrid}>
        <section className={`${styles.card} ${styles.formCard}`}>
          <h2>Employee Information</h2>
          <p>Search and select the employee to create final settlement.</p>
          <label>Search Employee *</label>
          <div className={styles.searchBox}>
            <Search />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, employee ID, or department..."
            />
          </div>
          {hits.length > 0 ? (
            <div className={styles.searchResults}>
              {hits.map((hit) => (
                <button key={hit.employeeCode} type="button" onClick={() => void previewFromEmployee(hit.employeeCode)}>
                  <b>{hit.employeeName}</b> · {hit.employeeCode} · {hit.department}
                </button>
              ))}
            </div>
          ) : null}

          {settlement ? (
            <>
              <div className={styles.employeeCard}>
                <div className={styles.bigAvatar}>{initials(settlement.employeeName)}</div>
                <div>
                  <h2>{settlement.employeeName}</h2>
                  <p>{settlement.employeeCode}</p>
                  <span className={`${styles.status} ${styles.statusCompleted}`}>Active (Exiting)</span>
                  <div style={{ marginTop: 8 }}>
                    <Link href={`/hris/employees/employee-profile/${encodeURIComponent(settlement.employeeId || settlement.employeeCode)}`}>
                      Open Employee Profile
                    </Link>
                  </div>
                </div>
              </div>
              <div className={styles.twoCol}>
                {[
                  ['Department', settlement.department],
                  ['Employment Type', settlement.employmentType],
                  ['Current Grade', settlement.grade],
                  ['Payroll Currency', settlement.currency],
                  ['Current Basic Salary', formatFinalPayrollMoney(settlement.basicSalary, settlement.currency)],
                  ['Monthly Package Gross', formatFinalPayrollMoney(settlement.grossSalary || settlement.basicSalary + (settlement.allowanceMonthly || 0), settlement.currency)],
                  ['Date of Joining', formatFinalPayrollDate(settlement.dateOfJoining)],
                  ['Service Length', settlement.serviceLength],
                ].map(([label, value]) => (
                  <div className={styles.field} key={label}>
                    <small>{label}</small>
                    <b>{value}</b>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className={styles.empty}>Search and select an employee to begin.</div>
          )}
        </section>

        <section className={`${styles.card} ${styles.formCard}`}>
          <h2>Exit Details</h2>
          <p>Provide the employee&apos;s exit information.</p>
          <div className={styles.twoCol}>
            <div>
              <label>Exit Type *</label>
              <div className={styles.input}>
                <select value={exitType} onChange={(event) => setExitType(event.target.value)}>
                  {['Resignation', 'Termination', 'End of Contract', 'Retirement', 'Contract Expiry'].map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label>Resignation Date</label>
              <div className={styles.input}>
                <CalendarDays />
                <input type="date" value={resignationDate} onChange={(event) => setResignationDate(event.target.value)} />
              </div>
            </div>
            <div>
              <label>Last Working Day</label>
              <div className={styles.input}>
                <CalendarDays />
                <input type="date" value={lastWorkingDay} onChange={(event) => setLastWorkingDay(event.target.value)} />
              </div>
            </div>
            <div>
              <label>Notice Period</label>
              <div className={styles.input}>
                <select value={noticePeriod} onChange={(event) => setNoticePeriod(event.target.value)}>
                  {['1 Month', '2 Months', '3 Months', 'None'].map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <label>Reason for Leaving</label>
          <div className={styles.input}>
            <select value={reason} onChange={(event) => setReason(event.target.value)}>
              {['Career Growth', 'Personal', 'Relocation', 'Better Opportunity', 'Retirement', 'Other'].map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
          <label>Remarks</label>
          <textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="Optional notes..." />
        </section>

        <section className={`${styles.card} ${styles.formCard}`}>
          <h2>Payroll Control</h2>
          <p>Settlement period and payroll exclusion controls.</p>
          {[
            ['Last Regular Payroll', settlement?.lastRegularPayroll || '—'],
            ['Next Payroll', nextPayrollLabel],
            ['Final Settlement Period', settlement?.period || '—'],
            ['Status', settlement ? (persisted ? settlement.status : 'Unsaved Preview') : '—'],
          ].map(([label, value]) => (
            <div className={styles.kv} key={label}>
              <span>{label}</span>
              <b>{value}</b>
            </div>
          ))}
          <div className={styles.info}>
            <Info />
            <div>
              <b>Important</b>
              <p>This employee will be automatically excluded from subsequent regular payrolls after final settlement is processed.</p>
            </div>
          </div>
          <div className={styles.miniFlow}>
            {(settlement?.approvalStages || []).map((stage, index) => (
              <div key={stage.id} className={stage.status !== 'Pending' ? styles.done : undefined}>
                <i>{index + 1}</i>
                {stage.label}
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className={`${styles.card} ${styles.earnings}`}>
        <div className={styles.tabs}>
          {EARNINGS_TABS.map((item) => (
            <button
              key={item}
              type="button"
              className={earningsTab === item ? styles.activeTab : undefined}
              onClick={() => setEarningsTab(item)}
            >
              {item}
            </button>
          ))}
        </div>

        {earningsTab === 'Clearance Status' && settlement ? (
          <div className={styles.formCard}>
            {(settlement.clearance || []).map((item) => (
              <div className={styles.check} key={item.id}>
                <span>{item.label}{item.note ? ` — ${item.note}` : ''}</span>
                <span className={styles.status}>{item.status}</span>
              </div>
            ))}
          </div>
        ) : earningsTab === 'Documents' ? (
          <div className={styles.empty}>Attach exit documents from Employee Documents when available.</div>
        ) : (
          <>
            <div className={styles.sectionHead}>
              <div>
                <h2>
                  {earningsTab === 'Earnings'
                    ? 'Earnings & Entitlements'
                    : earningsTab === 'Statutory Deductions'
                      ? 'Statutory Deductions'
                      : 'Deductions & Recoveries'}
                </h2>
                <p>Amounts are calculated from the employee salary package.</p>
              </div>
              <button type="button" disabled={busy || !settlement} onClick={() => void recalculate()}>
                <RefreshCw /> Recalculate
              </button>
            </div>
            {settlement ? (
              <table>
                <thead>
                  <tr>
                    {['#', earningsTab === 'Earnings' ? 'Earning Component' : 'Component', 'Description', 'Policy Basis', 'Period / Days', `Amount (${settlement.currency === 'USD' ? '$' : '₦'})`, 'Remarks'].map((heading) => (
                      <th key={heading}>{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeLines.map((line, index) => (
                    <tr key={line.id}>
                      <td>{index + 1}</td>
                      <td>{line.label}</td>
                      <td>{line.description}</td>
                      <td>{line.policyBasis}</td>
                      <td>{line.periodDays}</td>
                      <td>{formatFinalPayrollMoney(line.amount, settlement.currency)}</td>
                      <td>{line.remarks}</td>
                    </tr>
                  ))}
                  <tr className={styles.total}>
                    <td colSpan={5}>Total {earningsTab === 'Earnings' ? 'Earnings' : earningsTab === 'Statutory Deductions' ? 'Statutory' : 'Deductions'}</td>
                    <td>{formatFinalPayrollMoney(totalAmount, settlement.currency)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            ) : (
              <div className={styles.empty}>Select an employee to calculate settlement lines.</div>
            )}
          </>
        )}
      </section>

      <div className={styles.footerActions}>
        <button type="button" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}>
          Back
        </button>
        <button
          type="button"
          className={styles.primary}
          onClick={() => {
            if (step >= STEPS.length - 1) void persistSettlement('submit');
            else setStep((value) => Math.min(STEPS.length - 1, value + 1));
          }}
        >
          {step >= STEPS.length - 1 ? 'Submit for Approval' : 'Next Step'}
        </button>
      </div>
    </div>
  );
}
