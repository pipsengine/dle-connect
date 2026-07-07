'use client';

import {
  AlertTriangle,
  Cloud,
  FileCheck2,
  HardDrive,
  RefreshCw,
  RotateCcw,
  ServerCog,
  ShieldCheck,
  Timer,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  BackupDisasterRecoveryState,
  BackupFailureRecoveryRule,
  BackupMetric,
  BackupPolicy,
  BackupReplicationTarget,
  BackupStorageAutomation,
} from '@/lib/backup-disaster-recovery-types';

type Tone = 'green' | 'blue' | 'amber' | 'red' | 'slate' | 'violet';

const toneStyles: Record<Tone, { card: string; icon: string; badge: string }> = {
  green: { card: 'border-emerald-200 bg-emerald-50', icon: 'bg-emerald-600 text-white', badge: 'bg-emerald-100 text-emerald-800' },
  blue: { card: 'border-blue-200 bg-blue-50', icon: 'bg-blue-600 text-white', badge: 'bg-blue-100 text-blue-800' },
  amber: { card: 'border-amber-200 bg-amber-50', icon: 'bg-amber-500 text-white', badge: 'bg-amber-100 text-amber-800' },
  red: { card: 'border-red-200 bg-red-50', icon: 'bg-red-600 text-white', badge: 'bg-red-100 text-red-800' },
  slate: { card: 'border-slate-200 bg-slate-50', icon: 'bg-slate-800 text-white', badge: 'bg-slate-100 text-slate-800' },
  violet: { card: 'border-violet-200 bg-violet-50', icon: 'bg-violet-600 text-white', badge: 'bg-violet-100 text-violet-800' },
};

const formatTime = (value: string) => new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
const formatOptionalTime = (value: string) => value ? formatTime(value) : 'Not available';
const configuredStatus = (location: string, currentStatus: string) => {
  if (!location.trim()) return 'Not configured';
  return currentStatus === 'Not configured' ? 'Configured' : currentStatus;
};

const metricIcon = (label: string) => {
  const text = label.toLowerCase();
  if (text.includes('storage')) return HardDrive;
  if (text.includes('verified') || text.includes('validation')) return FileCheck2;
  if (text.includes('health')) return Timer;
  return ServerCog;
};

function MetricCard({ item }: { item: BackupMetric }) {
  const Icon = metricIcon(item.label);
  const tone = toneStyles[item.tone];
  return (
    <div className={`rounded-lg border p-4 ${tone.card}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-normal text-slate-500">{item.label}</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{item.value}</p>
          <p className="mt-1 text-xs font-semibold text-slate-600">{item.detail}</p>
        </div>
        <span className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${tone.icon}`}><Icon className="h-5 w-5" /></span>
      </div>
    </div>
  );
}

function StatusBadge({ value }: { value: string }) {
  const lower = value.toLowerCase();
  const tone: Tone = lower.includes('failed') || lower.includes('critical') ? 'red' : lower.includes('warning') || lower.includes('queued') || lower.includes('watch') || lower.includes('attention') ? 'amber' : lower.includes('ready') || lower.includes('passed') || lower.includes('online') || lower.includes('automated') || lower.includes('healthy') || lower.includes('verified') || lower.includes('active') || lower.includes('completed') ? 'green' : 'blue';
  return <span className={`rounded-full px-2 py-1 text-[11px] font-black ${toneStyles[tone].badge}`}>{value}</span>;
}

function Panel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-black uppercase tracking-normal text-slate-700">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-bold text-slate-500">
      {message}
    </div>
  );
}

const locationDraftsFrom = (targets: BackupReplicationTarget[]) => Object.fromEntries(targets.map((target) => [target.target, target.location]));
const newPolicy = (): BackupPolicy => ({ type: '', schedule: '', validation: '', retention: '', status: 'Configured' });
const backupTypeOptions = [
  '',
  'Full database backup',
  'Differential database backup',
  'Transaction log backup',
  'Application backup',
  'Document repository backup',
  'Configuration backup',
  'System snapshot',
];
const scheduleOptions = [
  '',
  'Every 15 minutes',
  'Every 30 minutes',
  'Hourly',
  'Every 6 hours',
  'Every 12 hours',
  'Daily 22:00',
  'Daily 23:00',
  'Weekly Sunday 23:00',
  'Before deployment',
  'Before updates',
];
const validationOptions = [
  '',
  'RESTORE VERIFYONLY',
  'Checksum verification',
  'Checksum + size verification',
  'Log chain validation',
  'Archive integrity check',
  'Manifest reconciliation',
  'Snapshot mount probe',
];
const retentionOptions = [
  '',
  '7 days',
  '14 days',
  '21 days',
  '35 days',
  '60 days',
  '90 days',
  '6 months',
  '1 year',
  '10 releases',
];
const cleanPolicies = (policies: BackupPolicy[]) => policies
  .map((policy) => ({
    type: policy.type.trim(),
    schedule: policy.schedule.trim(),
    validation: policy.validation.trim(),
    retention: policy.retention.trim(),
    status: policy.status.trim() || 'Configured',
  }))
  .filter((policy) => policy.type || policy.schedule || policy.validation || policy.retention);

const policiesEqual = (left: BackupPolicy[], right: BackupPolicy[]) =>
  JSON.stringify(cleanPolicies(left)) === JSON.stringify(cleanPolicies(right));

const locationsEqual = (left: Record<string, string>, right: Record<string, string>) =>
  JSON.stringify(left) === JSON.stringify(right);

const criticalAlertMessage = (state: BackupDisasterRecoveryState): { message: string; severity: 'failed' | 'warning' } | null => {
  if (state.lastOperation?.status === 'failed' && state.lastOperation.message.trim()) {
    return { message: state.lastOperation.message.trim(), severity: 'failed' };
  }
  const incident = state.incidents.find((item) => /critical/i.test(item.severity));
  if (incident?.message.trim()) return { message: incident.message.trim(), severity: 'failed' };
  const warningIncident = state.incidents.find((item) => /warning/i.test(item.severity));
  if (warningIncident?.message.trim()) return { message: warningIncident.message.trim(), severity: 'warning' };
  const backupMetric = state.serviceMetrics.find((item) => item.label === 'Backup Service');
  if (backupMetric?.value === 'Failed') {
    return { message: backupMetric.detail.trim() || 'The last backup attempt failed.', severity: 'failed' };
  }
  if (backupMetric?.value === 'No backup') {
    return { message: 'No full backup has been recorded yet. Click Run Full Backup to create tonight\'s backup.', severity: 'warning' };
  }
  return null;
};

function CriticalAlertBanner({ message, severity, onDismiss }: { message: string; severity: 'failed' | 'warning'; onDismiss?: () => void }) {
  const failed = severity === 'failed';
  return (
    <div className={`rounded-lg border-2 px-4 py-4 shadow-sm ${failed ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`} role="alert">
      <div className="flex items-start gap-3">
        <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${failed ? 'text-red-700' : 'text-amber-700'}`} />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-black uppercase tracking-normal ${failed ? 'text-red-800' : 'text-amber-900'}`}>
            {failed ? 'Backup failed' : 'Backup action required tonight'}
          </p>
          <p className={`mt-1 text-sm font-bold leading-6 ${failed ? 'text-red-900' : 'text-amber-950'}`}>{message}</p>
          <p className={`mt-2 text-xs font-semibold ${failed ? 'text-red-700' : 'text-amber-800'}`}>
            Backups are written on SQL Server (<strong>X3ADMIN\SAGEX3V11</strong>) at the path you configure — not on your PC.
            The folder is created automatically on the server when you run a backup.
          </p>
        </div>
        {onDismiss ? (
          <button type="button" onClick={onDismiss} className={`rounded-lg border bg-white px-2 py-1 text-xs font-black ${failed ? 'border-red-200 text-red-700' : 'border-amber-200 text-amber-800'}`}>Dismiss</button>
        ) : null}
      </div>
    </div>
  );
}

async function parseApiResponse<T>(response: Response): Promise<{ data?: T; error?: string }> {
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.status === 'error') {
    return { error: json.error || `Request failed (${response.status}).` };
  }
  if (json.status === 'success' && json.data) return { data: json.data as T };
  return { error: 'Unexpected response from backup centre API.' };
}

export default function BackupDisasterRecoveryClient({ initialState }: { initialState: BackupDisasterRecoveryState }) {
  const [state, setState] = useState(initialState);
  const [locationDrafts, setLocationDrafts] = useState<Record<string, string>>(() => locationDraftsFrom(initialState.replicationTargets));
  const [policyDrafts, setPolicyDrafts] = useState<BackupPolicy[]>(() => initialState.backupPolicies.length ? initialState.backupPolicies : [newPolicy()]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<'success' | 'error' | 'info'>('info');
  const [dismissedAlert, setDismissedAlert] = useState<string | null>(null);
  const policyPanelRef = useRef<HTMLElement | null>(null);

  const savedLocationDrafts = useMemo(() => locationDraftsFrom(state.replicationTargets), [state.replicationTargets]);
  const policiesDirty = !policiesEqual(policyDrafts, state.backupPolicies);
  const locationsDirty = !locationsEqual(locationDrafts, savedLocationDrafts);
  const criticalAlert = useMemo(() => criticalAlertMessage(state), [state]);
  const showCriticalAlert = Boolean(criticalAlert && criticalAlert.message !== dismissedAlert);

  useEffect(() => {
    setState(initialState);
    setLocationDrafts(locationDraftsFrom(initialState.replicationTargets));
    setPolicyDrafts(initialState.backupPolicies.length ? initialState.backupPolicies : [newPolicy()]);
  }, [initialState]);

  const applyState = (next: BackupDisasterRecoveryState) => {
    setState(next);
    setLocationDrafts(locationDraftsFrom(next.replicationTargets));
    setPolicyDrafts(next.backupPolicies.length ? next.backupPolicies : [newPolicy()]);
  };

  const showMessage = (text: string, tone: 'success' | 'error' | 'info' = 'info') => {
    setMessage(text);
    setMessageTone(tone);
  };

  const refreshState = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/backup-disaster-recovery', { method: 'GET', cache: 'no-store' });
      const parsed = await parseApiResponse<BackupDisasterRecoveryState>(response);
      if (parsed.error || !parsed.data) {
        showMessage(parsed.error || 'Unable to refresh backup centre status.', 'error');
        return;
      }
      applyState(parsed.data);
      showMessage('Backup centre status refreshed from DLE_Enterprise and SQL Server.', 'success');
    } catch (error) {
      showMessage(error instanceof Error ? error.message : 'Unable to refresh backup centre status.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveBackupLocations = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const replicationTargets = state.replicationTargets.map((target) => {
        const location = (locationDrafts[target.target] ?? '').trim();
        return {
          ...target,
          location,
          status: configuredStatus(location, target.status),
        };
      });
      const response = await fetch('/api/admin/backup-disaster-recovery', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ replicationTargets }),
      });
      const parsed = await parseApiResponse<BackupDisasterRecoveryState>(response);
      if (parsed.error || !parsed.data) {
        showMessage(parsed.error || 'Unable to save backup locations.', 'error');
        return;
      }
      applyState(parsed.data);

      const auditResponse = await fetch('/api/admin/backup-disaster-recovery', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'Backup locations configured',
          detail: 'Primary, secondary, disaster recovery, and cloud backup locations were saved from the administration centre.',
        }),
      });
      const auditParsed = await parseApiResponse<BackupDisasterRecoveryState>(auditResponse);
      if (auditParsed.data) applyState(auditParsed.data);
      showMessage('Backup locations saved successfully.', 'success');
    } catch (error) {
      showMessage(error instanceof Error ? error.message : 'Unable to save backup locations.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveBackupPolicies = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const backupPolicies = cleanPolicies(policyDrafts);
      const response = await fetch('/api/admin/backup-disaster-recovery', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ backupPolicies }),
      });
      const parsed = await parseApiResponse<BackupDisasterRecoveryState>(response);
      if (parsed.error || !parsed.data) {
        showMessage(parsed.error || 'Unable to save backup policies.', 'error');
        return;
      }
      applyState(parsed.data);

      const auditResponse = await fetch('/api/admin/backup-disaster-recovery', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'Backup policies configured',
          detail: `${backupPolicies.length} automated backup ${backupPolicies.length === 1 ? 'policy' : 'policies'} saved from the administration centre.`,
        }),
      });
      const auditParsed = await parseApiResponse<BackupDisasterRecoveryState>(auditResponse);
      if (auditParsed.data) applyState(auditParsed.data);
      showMessage(backupPolicies.length ? 'Automated backup policies saved.' : 'Automated backup policies cleared.', 'success');
    } catch (error) {
      showMessage(error instanceof Error ? error.message : 'Unable to save backup policies.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const updatePolicyDraft = (index: number, key: keyof BackupPolicy, value: string) => {
    setPolicyDrafts((current) => current.map((policy, policyIndex) => policyIndex === index ? { ...policy, [key]: value } : policy));
  };

  const addPolicyDraft = () => setPolicyDrafts((current) => [...current, newPolicy()]);
  const removePolicyDraft = (index: number) => setPolicyDrafts((current) => {
    const next = current.filter((_, policyIndex) => policyIndex !== index);
    return next.length ? next : [newPolicy()];
  });
  const scrollToPolicySetup = () => policyPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const runFullBackup = async () => {
    setSaving(true);
    showMessage('Running full database backup. Keep this page open until the result returns.', 'info');
    try {
      const response = await fetch('/api/admin/backup-disaster-recovery', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ operation: 'run-full-backup' }),
      });
      const parsed = await parseApiResponse<BackupDisasterRecoveryState>(response);
      if (parsed.error || !parsed.data) {
        showMessage(parsed.error || 'Backup could not be started.', 'error');
        return;
      }
      applyState(parsed.data);
      const failed = parsed.data.lastOperation?.status === 'failed'
        || parsed.data.executionQueue?.[0]?.status === 'Failed';
      const errorDetail = parsed.data.lastOperation?.message
        || parsed.data.incidents?.[0]?.message
        || 'Backup failed.';
      if (failed) {
        setDismissedAlert(null);
        showMessage(errorDetail, 'error');
        return;
      }
      showMessage('Backup completed and RESTORE VERIFYONLY passed.', 'success');
    } catch (error) {
      showMessage(error instanceof Error ? error.message : 'Backup could not be started.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const runRestoreDrill = async () => {
    setSaving(true);
    showMessage('Running restore readiness drill (RESTORE VERIFYONLY)...', 'info');
    try {
      const response = await fetch('/api/admin/backup-disaster-recovery', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ operation: 'run-restore-drill' }),
      });
      const parsed = await parseApiResponse<BackupDisasterRecoveryState>(response);
      if (parsed.error || !parsed.data) {
        showMessage(parsed.error || 'Restore drill could not be started.', 'error');
        return;
      }
      applyState(parsed.data);
      const failed = parsed.data.restoreReadiness?.[0]?.result === 'Failed';
      showMessage(failed ? 'Restore drill failed. Review Alerts & Incidents.' : 'Restore drill completed successfully.', failed ? 'error' : 'success');
    } catch (error) {
      showMessage(error instanceof Error ? error.message : 'Restore drill could not be started.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const resetBackupLocations = () => {
    setLocationDrafts(savedLocationDrafts);
    showMessage('Backup location drafts reset.', 'info');
  };
  const resetBackupPolicies = () => {
    setPolicyDrafts(state.backupPolicies.length ? state.backupPolicies : [newPolicy()]);
    showMessage('Backup policy drafts reset.', 'info');
  };

  const messageClass = messageTone === 'error'
    ? 'border-red-200 bg-red-50 text-red-900'
    : messageTone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : 'border-blue-200 bg-blue-50 text-blue-900';

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-950 md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <section className="rounded-lg border border-blue-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-normal text-blue-700">Administration</p>
              <h1 className="mt-1 text-2xl font-black tracking-normal text-slate-950">Backup & Disaster Recovery Centre</h1>
              <p className="mt-1 max-w-4xl text-sm font-semibold leading-6 text-slate-600">
                Zero-touch enterprise backup control centre for schedules, validation, retention, replication, storage health, alerts, and restore readiness.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button disabled={saving} onClick={runFullBackup} className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-700 px-3 text-xs font-black text-white disabled:opacity-60"><HardDrive className="h-4 w-4" /> Run Full Backup</button>
              <button disabled={saving} onClick={scrollToPolicySetup} className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-3 text-xs font-black text-white disabled:opacity-60"><ShieldCheck className="h-4 w-4" /> Configure Policy</button>
              <button disabled={saving} onClick={runRestoreDrill} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-800 disabled:opacity-60"><RotateCcw className="h-4 w-4" /> Restore Drill</button>
              <button disabled={saving} onClick={refreshState} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-800 disabled:opacity-60"><RefreshCw className="h-4 w-4" /> Refresh</button>
            </div>
          </div>
        </section>

        {showCriticalAlert && criticalAlert ? (
          <CriticalAlertBanner message={criticalAlert.message} severity={criticalAlert.severity} onDismiss={() => setDismissedAlert(criticalAlert.message)} />
        ) : null}

        {message ? (
          <div className={`rounded-lg border px-4 py-3 text-sm font-bold ${messageClass}`}>
            {message}
          </div>
        ) : null}

        {state.serviceMetrics.length ? (
          <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {state.serviceMetrics.map((item) => <MetricCard key={item.label} item={item} />)}
          </section>
        ) : (
          <Panel title="Backup Service Status">
            <EmptyState message="No live backup service metrics have been recorded yet. Save backup locations, configure policies, then run a full backup or refresh." />
          </Panel>
        )}

        <Panel
          title="Backup Policy Configuration"
          action={<StatusBadge value={policiesDirty ? `${cleanPolicies(policyDrafts).length} unsaved` : 'Saved'} />}
        >
          <section ref={policyPanelRef} className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    {['Backup Type', 'Schedule', 'Automatic Validation', 'Retention', 'Status', 'Actions'].map((header) => (
                      <th key={header} className="border-b border-slate-200 px-3 py-2 text-left font-black">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {policyDrafts.map((policy, index) => (
                    <tr key={index} className="border-b border-slate-100 align-top">
                      <td className="px-3 py-3">
                        <select value={policy.type} onChange={(event) => updatePolicyDraft(index, 'type', event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
                          {backupTypeOptions.map((option) => <option key={option || 'blank'} value={option}>{option || 'Select backup type'}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <select value={policy.schedule} onChange={(event) => updatePolicyDraft(index, 'schedule', event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
                          {scheduleOptions.map((option) => <option key={option || 'blank'} value={option}>{option || 'Select schedule'}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <select value={policy.validation} onChange={(event) => updatePolicyDraft(index, 'validation', event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
                          {validationOptions.map((option) => <option key={option || 'blank'} value={option}>{option || 'Select validation'}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <select value={policy.retention} onChange={(event) => updatePolicyDraft(index, 'retention', event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
                          {retentionOptions.map((option) => <option key={option || 'blank'} value={option}>{option || 'Select retention'}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <select value={policy.status} onChange={(event) => updatePolicyDraft(index, 'status', event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
                          {['Configured', 'Automated', 'Paused', 'Disabled'].map((status) => <option key={status} value={status}>{status}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <button type="button" disabled={saving} onClick={() => removePolicyDraft(index)} className="h-10 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-black text-red-700 disabled:opacity-60">Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <p className="text-xs font-semibold text-slate-500">Policies define what should run, when it should run, how it should be validated, and how long backup files should be retained.</p>
              <div className="flex flex-wrap gap-2">
                <button disabled={saving} onClick={addPolicyDraft} className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-800 disabled:opacity-60">Add Policy</button>
                <button disabled={saving || !policiesDirty} onClick={resetBackupPolicies} className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-800 disabled:opacity-60">Reset</button>
                <button disabled={saving || !policiesDirty} onClick={saveBackupPolicies} className="inline-flex h-10 items-center rounded-lg bg-blue-600 px-4 text-xs font-black text-white disabled:opacity-60">Save Policies</button>
              </div>
            </div>
          </section>
        </Panel>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_.9fr]">
          <Panel title="Automated Backup Policies" action={<StatusBadge value={state.backupPolicies.length ? 'Configured' : 'Not configured'} />}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>{['Backup Type', 'Schedule', 'Automatic Validation', 'Retention', 'Status'].map((header) => <th key={header} className="border-b border-slate-200 px-3 py-2 text-left font-black">{header}</th>)}</tr>
                </thead>
                <tbody>
                  {state.backupPolicies.length ? state.backupPolicies.map((policy) => (
                    <tr key={`${policy.type}-${policy.schedule}`} className="border-b border-slate-100">
                      <td className="px-3 py-3 font-black text-slate-950">{policy.type}</td>
                      <td className="px-3 py-3 font-semibold text-slate-700">{policy.schedule}</td>
                      <td className="px-3 py-3 font-semibold text-slate-700">{policy.validation}</td>
                      <td className="px-3 py-3 font-semibold text-slate-700">{policy.retention}</td>
                      <td className="px-3 py-3"><StatusBadge value={policy.status} /></td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={5} className="px-3 py-4">
                        <EmptyState message="No automated backup policies have been configured." />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Automatic Failure Recovery" action={<StatusBadge value={state.failureRecoveryRules.length ? 'Active' : 'Not configured'} />}>
            <div className="space-y-2">
              {state.failureRecoveryRules.length ? state.failureRecoveryRules.map((rule: BackupFailureRecoveryRule) => (
                <div key={`${rule.trigger}-${rule.action}`} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-black text-slate-950">{rule.trigger}</p>
                    <StatusBadge value={rule.status} />
                  </div>
                  <p className="mt-1 text-xs font-semibold text-slate-600">{rule.action}</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">{rule.retry}</p>
                </div>
              )) : <EmptyState message="Configure automated backup policies to generate failure recovery rules." />}
            </div>
          </Panel>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Panel title="Execution Queue" action={<StatusBadge value={state.executionQueue.length ? 'Jobs available' : 'No queued jobs'} />}>
            <div className="space-y-2">
              {state.executionQueue.length ? state.executionQueue.map((job) => (
                <div key={`${job.job}-${job.nextRun}`} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-[1fr_auto]">
                  <div>
                    <p className="font-black text-slate-950">{job.job}</p>
                    <p className="text-xs font-semibold text-slate-500">{job.owner} · {job.retry}</p>
                  </div>
                  <div className="text-left md:text-right">
                    <StatusBadge value={job.status} />
                    <p className="mt-1 text-xs font-bold text-slate-600">{formatOptionalTime(job.nextRun)}</p>
                  </div>
                </div>
              )) : <EmptyState message="No backup jobs are currently queued." />}
            </div>
          </Panel>

          <Panel title="Replication Status" action={<Cloud className="h-4 w-4 text-blue-700" />}>
            <div className="space-y-2">
              {state.replicationTargets.map((target) => (
                <div key={target.target} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-slate-950">{target.target}</p>
                      <p className="text-xs font-semibold text-slate-500">{target.location || 'Not configured'}</p>
                    </div>
                    <StatusBadge value={target.status} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs font-bold text-slate-600">
                    <span>Last copy: {formatOptionalTime(target.lastCopy)}</span>
                    <span>Lag: {target.lag || 'Not available'}</span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </section>

        <Panel
          title="Backup Location Configuration"
          action={<StatusBadge value={locationsDirty ? 'Unsaved changes' : 'Saved in DLE_Enterprise'} />}
        >
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {state.replicationTargets.map((target) => (
              <label key={target.target} className="block rounded-lg border border-slate-200 bg-slate-50 p-3">
                <span className="flex items-center justify-between gap-3">
                  <span>
                    <span className="block text-xs font-black uppercase tracking-normal text-slate-500">{target.target}</span>
                    <span className="mt-1 block text-[11px] font-bold text-slate-500">Enter local path, network share, or cloud storage container.</span>
                  </span>
                  <StatusBadge value={configuredStatus(locationDrafts[target.target] ?? '', target.status)} />
                </span>
                <input
                  value={locationDrafts[target.target] ?? ''}
                  onChange={(event) => setLocationDrafts((current) => ({ ...current, [target.target]: event.target.value }))}
                  placeholder="Enter backup location"
                  className="mt-3 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-500">
              These locations control the paths shown in replication status and are persisted for the backup service configuration.
            </p>
            <div className="flex gap-2">
              <button disabled={saving || !locationsDirty} onClick={resetBackupLocations} className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-800 disabled:opacity-60">Reset</button>
              <button disabled={saving || !locationsDirty} onClick={saveBackupLocations} className="inline-flex h-10 items-center rounded-lg bg-blue-600 px-4 text-xs font-black text-white disabled:opacity-60">Save Backup Locations</button>
            </div>
          </div>
        </Panel>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Panel title="Storage & Retention Automation" action={<StatusBadge value={state.storageAutomation.length ? 'Configured' : 'Not configured'} />}>
            <div className="space-y-2">
              {state.storageAutomation.length ? state.storageAutomation.map((item: BackupStorageAutomation) => (
                <div key={`${item.scope}-${item.rule}`} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-black text-slate-950">{item.scope}</p>
                    <StatusBadge value={item.status} />
                  </div>
                  <p className="mt-1 text-xs font-semibold text-slate-600">{item.rule}</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">Schedule: {item.threshold}</p>
                </div>
              )) : <EmptyState message="Configure backup policies to generate storage and retention automation rules." />}
            </div>
          </Panel>

          <Panel title="Restore Readiness">
            <div className="space-y-2">
              {state.restoreReadiness.length ? state.restoreReadiness.map((item) => (
                <div key={`${item.control}-${item.evidence}`} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-black text-slate-900">{item.control}</p>
                    <StatusBadge value={item.result} />
                  </div>
                  <p className="mt-1 text-xs font-semibold text-slate-600">{item.evidence}</p>
                </div>
              )) : <EmptyState message="No restore readiness checks have been recorded." />}
            </div>
          </Panel>

          <Panel title="Alerts & Incidents" action={<AlertTriangle className="h-4 w-4 text-amber-600" />}>
            <div className="space-y-2">
              {state.incidents.length ? state.incidents.map((incident) => (
                <div key={`${incident.message}-${incident.status}`} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge value={incident.severity} />
                    <span className="text-xs font-black text-slate-500">{incident.status}</span>
                  </div>
                  <p className="mt-2 text-sm font-bold text-slate-800">{incident.message}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{incident.owner}</p>
                </div>
              )) : <EmptyState message="No backup alerts or incidents have been recorded." />}
            </div>
          </Panel>
        </section>

        <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {[
            { label: 'Locations', value: `${state.replicationTargets.filter((target) => target.location.trim()).length}/${state.replicationTargets.length} configured`, icon: HardDrive },
            { label: 'Policies', value: `${state.backupPolicies.length} configured`, icon: ShieldCheck },
            { label: 'Restore Checks', value: `${state.restoreReadiness.length} recorded`, icon: FileCheck2 },
            { label: 'Incidents', value: `${state.incidents.length} recorded`, icon: AlertTriangle },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <Icon className="h-5 w-5 text-blue-700" />
                <p className="mt-3 text-xs font-black uppercase text-slate-500">{item.label}</p>
                <p className="mt-1 text-sm font-black text-slate-950">{item.value}</p>
              </div>
            );
          })}
        </section>

        <Panel title="DLE_Enterprise Persistence Audit" action={<StatusBadge value={`Updated by ${state.updatedBy}`} />}>
          <div className="space-y-2">
            {state.audit.length ? state.audit.slice(0, 6).map((event, index) => (
              <div key={`${event.at}-${event.action}-${event.actor}-${index}`} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-[180px_1fr_auto]">
                <p className="text-xs font-black text-slate-500">{formatTime(event.at)}</p>
                <div>
                  <p className="text-sm font-black text-slate-900">{event.action}</p>
                  <p className="text-xs font-semibold text-slate-600">{event.detail}</p>
                </div>
                <p className="text-xs font-black text-slate-600">{event.actor}</p>
              </div>
            )) : <p className="rounded-lg bg-slate-50 p-3 text-sm font-bold text-slate-500">No persisted administration events yet.</p>}
          </div>
        </Panel>
      </div>
    </main>
  );
}
