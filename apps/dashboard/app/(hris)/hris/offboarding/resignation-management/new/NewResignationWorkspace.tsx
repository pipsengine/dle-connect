'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Info,
  Save,
  Search,
  Send,
} from 'lucide-react';
import type { ResignationEarningLine, ResignationRecord } from '@/lib/resignation-management-shared';
import {
  formatNoticeMonths,
  formatResignationDate,
  formatResignationMoney,
} from '@/lib/resignation-management-shared';
import styles from '@/styles/resignation-management.module.css';

const STEPS = [
  'Employee Details & Resignation Info',
  'Contact & Acknowledgement',
  'Handover',
  'Supporting Documents',
  'Review & Submit',
] as const;

const REASONS = [
  'Career Growth and Development',
  'Personal Reasons',
  'Relocation',
  'Better Opportunity',
  'Retirement',
  'Other',
] as const;

const NOTICE_OPTIONS = [
  { label: '1 Month (30 days)', days: 30 },
  { label: '2 Months (60 days)', days: 60 },
  { label: '3 Months (90 days)', days: 90 },
  { label: 'Custom', days: 0 },
] as const;

type SearchHit = {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  position: string;
  employmentType: string;
  grade?: string;
  managerName: string;
  workLocation: string;
  dateOfJoining: string | null;
  email: string;
  phone: string;
  status: string;
  currency?: 'NGN' | 'USD';
  basicSalary?: number;
  grossMonthly?: number;
  earningsBreakdown?: ResignationEarningLine[];
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '—';

const todayIso = () => new Date().toISOString().slice(0, 10);

const addDaysIso = (iso: string, days: number) => {
  const base = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(base.getTime())) return '';
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
};

export default function NewResignationWorkspace({
  initialId,
  initialEmployeeCode,
}: {
  initialId?: string;
  initialEmployeeCode?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState(initialEmployeeCode || '');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [resignation, setResignation] = useState<ResignationRecord | null>(null);
  const [persisted, setPersisted] = useState(false);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [alternativeEmail, setAlternativeEmail] = useState('');
  const [address, setAddress] = useState('');
  const [resignationDate, setResignationDate] = useState(todayIso());
  const [lastWorkingDay, setLastWorkingDay] = useState('');
  const [noticePeriodDays, setNoticePeriodDays] = useState(30);
  const [customNotice, setCustomNotice] = useState(false);
  const [reasonForLeaving, setReasonForLeaving] = useState('Personal Reasons');
  const [remarks, setRemarks] = useState('');
  const [nextOfKinName, setNextOfKinName] = useState('');
  const [nextOfKinRelationship, setNextOfKinRelationship] = useState('');
  const [nextOfKinPhone, setNextOfKinPhone] = useState('');
  const [nextOfKinEmail, setNextOfKinEmail] = useState('');
  const [propertyAcknowledged, setPropertyAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const applyRecord = (row: ResignationRecord, isPersisted = true) => {
    setResignation(row);
    setPersisted(isPersisted && !String(row.id).startsWith('PREVIEW-'));
    setEmail(row.email || '');
    setPhone(row.phone || '');
    setAlternativeEmail(row.alternativeEmail || '');
    setAddress(row.address || '');
    setResignationDate(row.resignationDate || todayIso());
    setLastWorkingDay(row.lastWorkingDay || '');
    setNoticePeriodDays(row.noticePeriodDays || 30);
    setCustomNotice(!NOTICE_OPTIONS.some((item) => item.days === row.noticePeriodDays && item.days > 0));
    setReasonForLeaving(row.reasonForLeaving || 'Personal Reasons');
    setRemarks(row.remarks || '');
    setNextOfKinName(row.nextOfKinName || '');
    setNextOfKinRelationship(row.nextOfKinRelationship || '');
    setNextOfKinPhone(row.nextOfKinPhone || '');
    setNextOfKinEmail(row.nextOfKinEmail || '');
    setPropertyAcknowledged(Boolean(row.propertyAcknowledged));
  };

  const loadExisting = useCallback(async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/hris/offboarding/resignation-management?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Unable to load resignation.');
      const row = data.selected || data.resignations?.find((item: ResignationRecord) => item.id === id);
      if (!row) {
        setResignation(null);
        setPersisted(false);
        setMessage('No saved resignation for this id. Select an employee to start (not saved until Save as Draft).');
        router.replace('/hris/offboarding/resignation-management/new');
        return;
      }
      applyRecord(row, true);
    } catch (err: any) {
      setError(err?.message || 'Unable to load resignation.');
    } finally {
      setBusy(false);
    }
  }, [router]);

  const previewFromEmployee = async (employeeCode: string, hit?: SearchHit) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/hris/offboarding/resignation-management', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          persist: false,
          employeeCode,
          resignationDate,
          lastWorkingDay: lastWorkingDay || null,
          noticePeriodDays,
          reasonForLeaving,
          remarks,
          email: email || hit?.email,
          phone: phone || hit?.phone,
          alternativeEmail,
          address,
          nextOfKinName,
          nextOfKinRelationship,
          nextOfKinPhone,
          nextOfKinEmail,
          propertyAcknowledged,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Unable to load resignation preview.');
      applyRecord(data.resignation, false);
      setHits([]);
      setQuery('');
      setMessage('Preview only — not saved until you click Save as Draft or Submit Resignation.');
      router.replace(`/hris/offboarding/resignation-management/new?employeeCode=${encodeURIComponent(employeeCode)}`);
    } catch (err: any) {
      setError(err?.message || 'Unable to load resignation preview.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (initialId && !String(initialId).startsWith('PREVIEW-')) {
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
        const res = await fetch(`/api/hris/offboarding/resignation-management?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        if (res.ok && data.ok) setHits(data.results || []);
      } catch {
        setHits([]);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    if (!resignationDate || customNotice) return;
    if (!noticePeriodDays) return;
    setLastWorkingDay(addDaysIso(resignationDate, noticePeriodDays));
  }, [resignationDate, noticePeriodDays, customNotice]);

  const earningsRows = useMemo(() => {
    const rows = resignation?.earningsBreakdown || [];
    if (rows.length) return rows;
    return [] as ResignationEarningLine[];
  }, [resignation]);

  const grossMonthly = useMemo(() => {
    if (resignation?.grossMonthly) return resignation.grossMonthly;
    return earningsRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  }, [resignation, earningsRows]);

  const currency = resignation?.currency || 'NGN';

  const saveDraft = async (submit = false) => {
    if (!resignation) {
      setError('Select an employee first.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      let current = resignation;
      if (!persisted || String(resignation.id).startsWith('PREVIEW-')) {
        const createRes = await fetch('/api/hris/offboarding/resignation-management', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            persist: true,
            employeeCode: resignation.employeeCode,
            resignationDate,
            lastWorkingDay: lastWorkingDay || null,
            noticePeriodDays,
            reasonForLeaving,
            remarks,
            email,
            phone,
            alternativeEmail,
            address,
            nextOfKinName,
            nextOfKinRelationship,
            nextOfKinPhone,
            nextOfKinEmail,
            propertyAcknowledged,
          }),
        });
        const createData = await createRes.json();
        if (!createRes.ok || !createData.ok) throw new Error(createData.error || 'Unable to save resignation.');
        current = createData.resignation;
        applyRecord(current, true);
        router.replace(`/hris/offboarding/resignation-management/new?id=${encodeURIComponent(current.id)}`);
      }

      const res = await fetch('/api/hris/offboarding/resignation-management', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: current.id,
          action: submit ? 'submit' : 'save',
          patch: {
            email,
            phone,
            alternativeEmail,
            address,
            resignationDate,
            lastWorkingDay,
            noticePeriodDays,
            reasonForLeaving,
            remarks,
            nextOfKinName,
            nextOfKinRelationship,
            nextOfKinPhone,
            nextOfKinEmail,
            propertyAcknowledged,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Unable to save resignation.');
      applyRecord(data.resignation, true);
      setMessage(submit ? 'Resignation accepted by HR — notice period started.' : 'Draft saved.');
      if (submit) {
        router.push(`/hris/offboarding/resignation-management?id=${encodeURIComponent(data.resignation.id)}&period=${encodeURIComponent(data.resignation.period)}`);
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to save resignation.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.root}>
      <div className={styles.crumb}>
        Offboarding <ChevronRight />{' '}
        <Link href="/hris/offboarding/resignation-management">Resignation Management</Link>{' '}
        <ChevronRight /> <b>New Resignation</b>
      </div>

      <div className={styles.titleRow}>
        <div className={styles.newTitle}>
          <button type="button" onClick={() => router.push('/hris/offboarding/resignation-management')}>
            <ChevronLeft size={16} />
          </button>
          <div>
            <h1>{step === 0 ? 'Employee Details & Resignation Info' : STEPS[step]}</h1>
            <p>
              {step === 0
                ? 'Confirm employment details, salary package, notice period, and reason for leaving.'
                : 'Complete all required information to proceed.'}
            </p>
          </div>
        </div>
        <div className={styles.actions}>
          <button type="button" disabled={busy} onClick={() => void saveDraft(false)}>
            <Save /> Save as Draft
          </button>
          <button type="button" disabled={!resignation} onClick={() => setStep(STEPS.length - 1)}>
            <Eye /> Preview
          </button>
          <button type="button" className={styles.primary} disabled={busy} onClick={() => void saveDraft(true)}>
            <Send /> Submit Resignation
          </button>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {message ? <p className={styles.message}>{message}</p> : null}
      {resignation && !persisted ? (
        <p style={{ color: '#b87100', margin: '0 0 10px', fontWeight: 600 }}>
          Unsaved preview — this resignation is not on the register until you Save as Draft or Submit.
        </p>
      ) : null}

      <div className={`${styles.card} ${styles.stepper}`} style={{ gridTemplateColumns: `repeat(${STEPS.length}, 1fr)` }}>
        {STEPS.map((label, index) => (
          <button
            key={label}
            type="button"
            className={`${styles.step} ${index === step ? styles.stepActive : ''} ${index < step ? styles.stepDone : ''}`}
            onClick={() => setStep(index)}
          >
            <span className={styles.circle}>{index < step ? '✓' : index + 1}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>

      {step === 0 ? (
        <>
          {!resignation ? (
            <div className={`${styles.card} ${styles.wideCard}`}>
              <h2>Select Employee</h2>
              <p className={styles.sub}>Search the live employee directory to start a resignation.</p>
              <div className={styles.searchBox}>
                <Search />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by name or employee ID..."
                />
              </div>
              {hits.length > 0 ? (
                <div className={styles.searchResults}>
                  {hits.map((hit) => (
                    <button key={hit.employeeCode} type="button" disabled={busy} onClick={() => void previewFromEmployee(hit.employeeCode, hit)}>
                      <b>{hit.employeeName}</b> · {hit.employeeCode} · {hit.department}
                      {hit.grossMonthly ? ` · Gross ${formatResignationMoney(hit.grossMonthly, hit.currency || 'NGN')}` : ''}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <div className={styles.designTop}>
                <div className={`${styles.card} ${styles.formCard}`}>
                  <h2>Employment Details</h2>
                  <p className={styles.sub}>Auto-filled from the employee master record.</p>
                  <div className={styles.employeeTile}>
                    <div className={styles.bigAvatar}>{initials(resignation.employeeName)}</div>
                    <div>
                      <h2>{resignation.employeeName}</h2>
                      <b>{resignation.employeeCode}</b>
                      <p><span className={`${styles.status} ${styles.statusCompleted}`}>Active Employee</span></p>
                    </div>
                  </div>
                  <div className={styles.kvGrid}>
                    {[
                      ['Employee Name', resignation.employeeName],
                      ['Employee ID', resignation.employeeCode],
                      ['Department', resignation.department],
                      ['Position / Designation', resignation.position],
                      ['Grade / Level', resignation.grade || '—'],
                      ['Employment Type', resignation.employmentType],
                      ['Date of Joining', formatResignationDate(resignation.dateOfJoining)],
                      ['Branch / Location', resignation.workLocation],
                      ['Reporting Manager', resignation.managerName],
                    ].map(([label, value]) => (
                      <div key={label} className={styles.kvItem}>
                        <span>{label}</span>
                        <b>{value}</b>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={`${styles.card} ${styles.formCard}`}>
                  <h2>Earnings Breakdown</h2>
                  <p className={styles.sub}>Current monthly salary package (gross pay) from payroll setup.</p>
                  {earningsRows.length === 0 ? (
                    <div className={styles.empty}>No salary package lines found for this employee.</div>
                  ) : (
                    <table className={styles.earningsTable}>
                      <thead>
                        <tr>
                          <th>Description</th>
                          <th>Monthly Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {earningsRows.map((row) => (
                          <tr key={`${row.code}-${row.name}`}>
                            <td>{row.name}</td>
                            <td>{formatResignationMoney(row.amount, currency)}</td>
                          </tr>
                        ))}
                        <tr className={styles.earningsTotal}>
                          <td>Total Monthly Gross Pay</td>
                          <td>{formatResignationMoney(grossMonthly, currency)}</td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <div className={`${styles.card} ${styles.wideCard}`}>
                <h2>Notice Period Details</h2>
                <p className={styles.sub}>Confirm resignation date, notice length, and last working day.</p>
                <div className={styles.threeCols}>
                  <div className={styles.formRow}>
                    <label>Resignation Date *</label>
                    <input
                      className={styles.input}
                      type="date"
                      value={resignationDate}
                      onChange={(e) => setResignationDate(e.target.value)}
                    />
                  </div>
                  <div className={styles.formRow}>
                    <label>Notice Period *</label>
                    <select
                      className={styles.input}
                      value={customNotice ? 'custom' : String(noticePeriodDays)}
                      onChange={(e) => {
                        if (e.target.value === 'custom') {
                          setCustomNotice(true);
                          return;
                        }
                        setCustomNotice(false);
                        setNoticePeriodDays(Number(e.target.value) || 30);
                      }}
                    >
                      {NOTICE_OPTIONS.filter((item) => item.days > 0).map((item) => (
                        <option key={item.days} value={item.days}>{item.label}</option>
                      ))}
                      <option value="custom">Custom days</option>
                    </select>
                    {customNotice ? (
                      <input
                        className={styles.input}
                        style={{ marginTop: 8 }}
                        type="number"
                        min={0}
                        value={noticePeriodDays}
                        onChange={(e) => setNoticePeriodDays(Number(e.target.value) || 0)}
                      />
                    ) : null}
                  </div>
                  <div className={styles.formRow}>
                    <label>Last Working Day *</label>
                    <input
                      className={styles.input}
                      type="date"
                      value={lastWorkingDay}
                      onChange={(e) => {
                        setCustomNotice(true);
                        setLastWorkingDay(e.target.value);
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className={`${styles.card} ${styles.wideCard}`}>
                <h2>Reason for Resignation</h2>
                <p className={styles.sub}>Select the primary reason and add any additional remarks.</p>
                <div className={styles.formRow}>
                  <label>Reason for Leaving *</label>
                  <select
                    className={styles.input}
                    value={reasonForLeaving}
                    onChange={(e) => setReasonForLeaving(e.target.value)}
                  >
                    {REASONS.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.formRow}>
                  <label>Additional Remarks</label>
                  <textarea
                    className={`${styles.input} ${styles.textarea}`}
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Optional comments for HR..."
                  />
                </div>
              </div>
            </>
          )}
        </>
      ) : null}

      {step === 1 ? (
        <>
          <div className={styles.formGrid}>
            <div className={`${styles.card} ${styles.formCard}`}>
              <h2>Contact Information</h2>
              <p className={styles.sub}>Please confirm contact details.</p>
              <div className={styles.formRow}>
                <label>Email Address *</label>
                <input className={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className={styles.formRow}>
                <label>Phone Number *</label>
                <input className={styles.input} value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className={styles.formRow}>
                <label>Alternative Email (Optional)</label>
                <input className={styles.input} value={alternativeEmail} onChange={(e) => setAlternativeEmail(e.target.value)} />
              </div>
              <div className={styles.formRow}>
                <label>Address (Optional)</label>
                <textarea className={`${styles.input} ${styles.textarea}`} value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
            </div>
            <div className={`${styles.card} ${styles.formCard}`}>
              <h2>Submission Information</h2>
              <p className={styles.sub}>System information for this resignation request.</p>
              <div className={styles.formRow}>
                <label>Date of Submission</label>
                <input className={styles.input} value={formatResignationDate(todayIso())} readOnly />
              </div>
              <div className={styles.formRow}>
                <label>Status</label>
                <div className={styles.input} style={{ display: 'flex', alignItems: 'center' }}>
                  <span className={`${styles.status} ${styles.statusSubmitted}`}>{resignation?.status || 'Draft'}</span>
                </div>
              </div>
              <div className={styles.formRow}>
                <label>Reference Number</label>
                <input className={styles.input} value={resignation?.referenceNumber || 'Auto-generated'} readOnly />
              </div>
              <div className={styles.info}>
                <Info />
                <div>
                  <b>Important</b>
                  <div>HR will accept this resignation and start the notice / exit process. Exit clearance still involves the relevant departments.</div>
                </div>
              </div>
            </div>
            <div className={`${styles.card} ${styles.formCard}`}>
              <h2>Next of Kin</h2>
              <p className={styles.sub}>Emergency contact details (optional).</p>
              <div className={styles.formRow}>
                <label>Name</label>
                <input className={styles.input} value={nextOfKinName} onChange={(e) => setNextOfKinName(e.target.value)} />
              </div>
              <div className={styles.formRow}>
                <label>Relationship</label>
                <select className={styles.input} value={nextOfKinRelationship} onChange={(e) => setNextOfKinRelationship(e.target.value)}>
                  <option value="">Select relationship</option>
                  {['Spouse', 'Parent', 'Sibling', 'Child', 'Other'].map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
              <div className={styles.formRow}>
                <label>Phone</label>
                <input className={styles.input} value={nextOfKinPhone} onChange={(e) => setNextOfKinPhone(e.target.value)} />
              </div>
              <div className={styles.formRow}>
                <label>Email</label>
                <input className={styles.input} value={nextOfKinEmail} onChange={(e) => setNextOfKinEmail(e.target.value)} />
              </div>
            </div>
          </div>
          <div className={`${styles.card} ${styles.wideCard}`}>
            <h2>Company Property Acknowledgement</h2>
            <label className={styles.ack}>
              <input type="checkbox" checked={propertyAcknowledged} onChange={(e) => setPropertyAcknowledged(e.target.checked)} />
              <span>
                I acknowledge that I am in possession of company property (e.g. laptop, phone, access card, documents, etc.)
                and I will return all items as required during the exit clearance process.
              </span>
            </label>
          </div>
        </>
      ) : null}

      {step === 2 ? (
        <div className={`${styles.card} ${styles.wideCard}`}>
          <h2>Handover</h2>
          <p className={styles.sub}>Handover checklist starts after HR accepts the resignation.</p>
          <ul>
            {(resignation?.progress || []).map((item) => (
              <li key={item.id}>{item.label} — {item.status}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {step === 3 ? (
        <div className={`${styles.card} ${styles.wideCard}`}>
          <h2>Supporting Documents</h2>
          <p className={styles.sub}>Attach resignation letter and supporting files from Employee Documents when available.</p>
          <div className={styles.empty}>Document upload integrates with Employee Documents in a later step.</div>
        </div>
      ) : null}

      {step === 4 ? (
        <div className={`${styles.card} ${styles.wideCard}`}>
          <h2>Review & Submit</h2>
          <p className={styles.sub}>Confirm details before HR accepts and starts the notice period.</p>
          {!resignation ? (
            <div className={styles.empty}>Select an employee on step 1 first.</div>
          ) : (
            <div className={styles.twoCols}>
              {[
                ['Employee', resignation.employeeName],
                ['Employee ID', resignation.employeeCode],
                ['Grade', resignation.grade || '—'],
                ['Monthly Gross', formatResignationMoney(grossMonthly, currency)],
                ['Resignation Date', formatResignationDate(resignationDate)],
                ['Notice', formatNoticeMonths(noticePeriodDays)],
                ['Last Working Day', formatResignationDate(lastWorkingDay)],
                ['Reason', reasonForLeaving],
                ['Property Acknowledged', propertyAcknowledged ? 'Yes' : 'No'],
                ['Reference', resignation.referenceNumber],
              ].map(([label, value]) => (
                <div key={label} className={styles.formRow}>
                  <label>{label}</label>
                  <div className={styles.input} style={{ display: 'flex', alignItems: 'center' }}>{value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div className={styles.bottom}>
        <button
          type="button"
          className={styles.danger}
          onClick={() => router.push('/hris/offboarding/resignation-management')}
        >
          Cancel
        </button>
        <div className={styles.actions}>
          {step > 0 ? (
            <button type="button" onClick={() => setStep((value) => Math.max(0, value - 1))}>
              ← Back
            </button>
          ) : null}
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              className={styles.primary}
              disabled={step === 0 && !resignation}
              onClick={() => setStep((value) => Math.min(STEPS.length - 1, value + 1))}
            >
              Next Step →
            </button>
          ) : (
            <button type="button" className={styles.primary} disabled={busy} onClick={() => void saveDraft(true)}>
              Submit Resignation
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
