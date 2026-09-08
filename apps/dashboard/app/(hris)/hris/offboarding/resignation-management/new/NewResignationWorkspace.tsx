'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Info,
  Save,
  Search,
  Send,
} from 'lucide-react';
import type { ResignationRecord } from '@/lib/resignation-management-shared';
import { formatResignationDate } from '@/lib/resignation-management-shared';
import styles from '@/styles/resignation-management.module.css';

const STEPS = [
  'Employee Details',
  'Resignation Details',
  'Notice Period',
  'Handover',
  'Supporting Documents',
  'Review & Submit',
] as const;

type SearchHit = {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  position: string;
  employmentType: string;
  managerName: string;
  workLocation: string;
  dateOfJoining: string | null;
  email: string;
  phone: string;
  status: string;
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '—';

const todayIso = () => new Date().toISOString().slice(0, 10);

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
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [alternativeEmail, setAlternativeEmail] = useState('');
  const [address, setAddress] = useState('');
  const [resignationDate, setResignationDate] = useState(todayIso());
  const [lastWorkingDay, setLastWorkingDay] = useState('');
  const [noticePeriodDays, setNoticePeriodDays] = useState(30);
  const [reasonForLeaving, setReasonForLeaving] = useState('Career Growth and Development');
  const [remarks, setRemarks] = useState('');
  const [nextOfKinName, setNextOfKinName] = useState('');
  const [nextOfKinRelationship, setNextOfKinRelationship] = useState('');
  const [nextOfKinPhone, setNextOfKinPhone] = useState('');
  const [nextOfKinEmail, setNextOfKinEmail] = useState('');
  const [propertyAcknowledged, setPropertyAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const applyRecord = (row: ResignationRecord) => {
    setResignation(row);
    setEmail(row.email || '');
    setPhone(row.phone || '');
    setAlternativeEmail(row.alternativeEmail || '');
    setAddress(row.address || '');
    setResignationDate(row.resignationDate || todayIso());
    setLastWorkingDay(row.lastWorkingDay || '');
    setNoticePeriodDays(row.noticePeriodDays || 30);
    setReasonForLeaving(row.reasonForLeaving || 'Career Growth and Development');
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
      if (!row) throw new Error('Resignation not found.');
      applyRecord(row);
    } catch (err: any) {
      setError(err?.message || 'Unable to load resignation.');
    } finally {
      setBusy(false);
    }
  }, []);

  const createFromEmployee = async (hit: SearchHit) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/hris/offboarding/resignation-management', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeCode: hit.employeeCode,
          resignationDate,
          lastWorkingDay: lastWorkingDay || null,
          noticePeriodDays,
          reasonForLeaving,
          remarks,
          email: email || hit.email,
          phone: phone || hit.phone,
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
      if (!res.ok || !data.ok) throw new Error(data.error || 'Unable to create resignation.');
      applyRecord(data.resignation);
      setHits([]);
      setQuery('');
      setMessage('Draft resignation created.');
    } catch (err: any) {
      setError(err?.message || 'Unable to create resignation.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (initialId) {
      void loadExisting(initialId);
      return;
    }
    if (!initialEmployeeCode) return;
    let cancelled = false;
    (async () => {
      try {
        const lookup = await fetch(
          `/api/hris/offboarding/resignation-management?lookup=employee&employeeCode=${encodeURIComponent(initialEmployeeCode)}`,
          { cache: 'no-store' },
        );
        const lookupData = await lookup.json();
        if (cancelled) return;
        if (lookup.ok && lookupData.ok && lookupData.resignation) {
          applyRecord(lookupData.resignation);
          return;
        }
        const searchRes = await fetch(`/api/hris/offboarding/resignation-management?q=${encodeURIComponent(initialEmployeeCode)}`);
        const searchData = await searchRes.json();
        if (cancelled || !searchRes.ok || !searchData.ok) return;
        const hit = (searchData.results || []).find((item: SearchHit) =>
          String(item.employeeCode).toUpperCase() === initialEmployeeCode.toUpperCase()
          || String(item.employeeId).toUpperCase() === initialEmployeeCode.toUpperCase(),
        ) || (searchData.results || [])[0];
        if (hit) await createFromEmployee(hit);
      } catch {
        // leave empty for manual search
      }
    })();
    return () => {
      cancelled = true;
    };
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
    if (!resignationDate || lastWorkingDay) return;
    const base = new Date(`${resignationDate}T00:00:00.000Z`);
    if (Number.isNaN(base.getTime())) return;
    base.setUTCDate(base.getUTCDate() + noticePeriodDays);
    setLastWorkingDay(base.toISOString().slice(0, 10));
  }, [resignationDate, noticePeriodDays, lastWorkingDay]);

  const saveDraft = async (submit = false) => {
    if (!resignation) {
      setError('Select an employee first.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/hris/offboarding/resignation-management', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: resignation.id,
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
      applyRecord(data.resignation);
      setMessage(submit ? 'Resignation submitted for manager review.' : 'Draft saved.');
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
            <h1>New Resignation</h1>
            <p>Submit a new resignation request. Complete all required information to proceed.</p>
          </div>
        </div>
        <div className={styles.actions}>
          <button type="button" disabled={busy} onClick={() => void saveDraft(false)}>
            <Save /> Save as Draft
          </button>
          <button type="button" disabled={!resignation} onClick={() => setStep(5)}>
            <Eye /> Preview
          </button>
          <button type="button" className={styles.primary} disabled={busy} onClick={() => void saveDraft(true)}>
            <Send /> Submit Resignation
          </button>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {message ? <p className={styles.message}>{message}</p> : null}

      <div className={`${styles.card} ${styles.stepper}`}>
        {STEPS.map((label, index) => (
          <button
            key={label}
            type="button"
            className={`${styles.step} ${index === step ? styles.stepActive : ''} ${index < step ? styles.stepDone : ''}`}
            onClick={() => setStep(index)}
          >
            <span className={styles.circle}>{index + 1}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>

      {step === 0 ? (
        <>
          <div className={styles.formGrid}>
            <div className={`${styles.card} ${styles.formCard}`}>
              <h2>Employee Information</h2>
              <p className={styles.sub}>Search the live employee directory, then confirm details.</p>
              {!resignation ? (
                <>
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
                        <button key={hit.employeeCode} type="button" disabled={busy} onClick={() => void createFromEmployee(hit)}>
                          <b>{hit.employeeName}</b> · {hit.employeeCode} · {hit.department}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className={styles.employeeTile}>
                  <div className={styles.bigAvatar}>{initials(resignation.employeeName)}</div>
                  <div>
                    <h2>{resignation.employeeName}</h2>
                    <b>{resignation.employeeCode}</b>
                    <p><span className={`${styles.status} ${styles.statusCompleted}`}>Active Employee</span></p>
                    <div className={styles.twoCols} style={{ marginTop: 12 }}>
                      <div>
                        <small>Department</small>
                        <h3>{resignation.department}</h3>
                        <small>Employment Type</small>
                        <h3>{resignation.employmentType}</h3>
                        <small>Manager</small>
                        <h3>{resignation.managerName}</h3>
                      </div>
                      <div>
                        <small>Position</small>
                        <h3>{resignation.position}</h3>
                        <small>Date of Joining</small>
                        <h3>{formatResignationDate(resignation.dateOfJoining)}</h3>
                        <small>Work Location</small>
                        <h3>{resignation.workLocation}</h3>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

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
                <input className={styles.input} value={alternativeEmail} onChange={(e) => setAlternativeEmail(e.target.value)} placeholder="Enter alternative email address..." />
              </div>
              <div className={styles.formRow}>
                <label>Address (Optional)</label>
                <textarea className={`${styles.input} ${styles.textarea}`} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Enter your current address..." />
              </div>
            </div>

            <div className={`${styles.card} ${styles.formCard}`}>
              <h2>Submission Information</h2>
              <p className={styles.sub}>System information for this resignation request.</p>
              <div className={styles.twoCols}>
                <div className={styles.formRow}>
                  <label>Date of Submission *</label>
                  <input className={styles.input} value={formatResignationDate(todayIso())} readOnly />
                </div>
                <div className={styles.formRow}>
                  <label>Submission Channel</label>
                  <input className={styles.input} value="HRIS" readOnly />
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
              </div>
              <div className={styles.info}>
                <Info />
                <div>
                  <b>Important</b>
                  <div>Your resignation request will be sent to your Line Manager for review after submission.</div>
                </div>
              </div>
            </div>
          </div>

          <div className={`${styles.card} ${styles.wideCard}`}>
            <h2>Next of Kin Information</h2>
            <p className={styles.sub}>Provide next of kin details for emergency contact purposes (if required).</p>
            <div className={styles.fourCols}>
              <input className={styles.input} value={nextOfKinName} onChange={(e) => setNextOfKinName(e.target.value)} placeholder="Enter next of kin name..." />
              <select className={styles.input} value={nextOfKinRelationship} onChange={(e) => setNextOfKinRelationship(e.target.value)}>
                <option value="">Select relationship</option>
                {['Spouse', 'Parent', 'Sibling', 'Child', 'Other'].map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
              <input className={styles.input} value={nextOfKinPhone} onChange={(e) => setNextOfKinPhone(e.target.value)} placeholder="Enter phone number..." />
              <input className={styles.input} value={nextOfKinEmail} onChange={(e) => setNextOfKinEmail(e.target.value)} placeholder="Enter email address..." />
            </div>
          </div>

          <div className={`${styles.card} ${styles.wideCard}`}>
            <h2>Company Property Acknowledgement</h2>
            <p className={styles.sub}>Please confirm that you will return all company property as part of the exit process.</p>
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

      {step === 1 ? (
        <div className={`${styles.card} ${styles.wideCard}`}>
          <h2>Resignation Details</h2>
          <p className={styles.sub}>Capture resignation date, reason, and remarks.</p>
          <div className={styles.twoCols}>
            <div className={styles.formRow}>
              <label>Resignation Date *</label>
              <input className={styles.input} type="date" value={resignationDate} onChange={(e) => setResignationDate(e.target.value)} />
            </div>
            <div className={styles.formRow}>
              <label>Reason for Leaving *</label>
              <select className={styles.input} value={reasonForLeaving} onChange={(e) => setReasonForLeaving(e.target.value)}>
                {['Career Growth and Development', 'Personal Reasons', 'Relocation', 'Better Opportunity', 'Retirement', 'Other'].map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
          </div>
          <div className={styles.formRow}>
            <label>Additional Remarks</label>
            <textarea className={`${styles.input} ${styles.textarea}`} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional comments..." />
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className={`${styles.card} ${styles.wideCard}`}>
          <h2>Notice Period</h2>
          <p className={styles.sub}>Confirm notice length and last working day.</p>
          <div className={styles.twoCols}>
            <div className={styles.formRow}>
              <label>Notice Period (Days) *</label>
              <input className={styles.input} type="number" min={0} value={noticePeriodDays} onChange={(e) => setNoticePeriodDays(Number(e.target.value) || 0)} />
            </div>
            <div className={styles.formRow}>
              <label>Last Working Day *</label>
              <input className={styles.input} type="date" value={lastWorkingDay} onChange={(e) => setLastWorkingDay(e.target.value)} />
            </div>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className={`${styles.card} ${styles.wideCard}`}>
          <h2>Handover</h2>
          <p className={styles.sub}>Handover checklist starts after management acceptance. Progress items are tracked on the register workspace.</p>
          <ul>
            {(resignation?.progress || []).map((item) => (
              <li key={item.id}>{item.label} — {item.status}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {step === 4 ? (
        <div className={`${styles.card} ${styles.wideCard}`}>
          <h2>Supporting Documents</h2>
          <p className={styles.sub}>Attach resignation letter and supporting files from Employee Documents when available.</p>
          <div className={styles.empty}>Document upload integrates with Employee Documents in a later step.</div>
        </div>
      ) : null}

      {step === 5 ? (
        <div className={`${styles.card} ${styles.wideCard}`}>
          <h2>Review & Submit</h2>
          <p className={styles.sub}>Confirm details before submitting to Line Manager.</p>
          {!resignation ? (
            <div className={styles.empty}>Select an employee on step 1 first.</div>
          ) : (
            <div className={styles.twoCols}>
              {[
                ['Employee', resignation.employeeName],
                ['Employee ID', resignation.employeeCode],
                ['Resignation Date', formatResignationDate(resignationDate)],
                ['Last Working Day', formatResignationDate(lastWorkingDay)],
                ['Notice Days', String(noticePeriodDays)],
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
            <button type="button" className={styles.primary} onClick={() => setStep((value) => Math.min(STEPS.length - 1, value + 1))}>
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
