'use client';

import { useEffect, useState } from 'react';
import { Bell, Loader2, X } from 'lucide-react';
import type { SoftwareAlertConfig } from '@/lib/it-software-alert-constants';
import { SOFTWARE_ALERT_PERIODS } from '@/lib/it-software-alert-constants';
import { fetchAssetSection, postAssetManagementAction } from '../lib/asset-management-api';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function SoftwareAlertConfigModal({ open, onClose }: Props) {
  const [config, setConfig] = useState<SoftwareAlertConfig | null>(null);
  const [emailsText, setEmailsText] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError('');
    setMessage('');
    void fetchAssetSection<{ config: SoftwareAlertConfig }>('software-alert-config')
      .then((data) => {
        setConfig(data.config);
        setEmailsText((data.config.recipientEmails || []).join(', '));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load alert settings.'))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const togglePeriod = (days: number) => {
    if (!config) return;
    setConfig({
      ...config,
      periods: config.periods.map((period) =>
        period.days === days ? { ...period, enabled: !period.enabled } : period,
      ),
    });
  };

  const toggleChannel = (channel: 'In-App' | 'Email') => {
    if (!config) return;
    const has = config.channels.includes(channel);
    setConfig({
      ...config,
      channels: has ? config.channels.filter((item) => item !== channel) : [...config.channels, channel],
    });
  };

  const save = async () => {
    if (!config) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const recipientEmails = emailsText
        .split(/[,;\n]/)
        .map((value) => value.trim())
        .filter(Boolean);
      const data = await postAssetManagementAction<{ config: SoftwareAlertConfig }>({
        action: 'save-software-alert-config',
        config: { ...config, recipientEmails },
      });
      setConfig(data.config);
      setEmailsText((data.config.recipientEmails || []).join(', '));
      setMessage('Expiration alert settings saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save alert settings.');
    } finally {
      setSaving(false);
    }
  };

  const runAlerts = async () => {
    setRunning(true);
    setError('');
    setMessage('');
    try {
      // Persist current form first so run uses latest recipients/periods
      if (config) {
        const recipientEmails = emailsText.split(/[,;\n]/).map((value) => value.trim()).filter(Boolean);
        await postAssetManagementAction({
          action: 'save-software-alert-config',
          config: { ...config, recipientEmails },
        });
      }
      const data = await postAssetManagementAction<{
        sent: number;
        skipped: number;
        emailed: number;
        errors: string[];
        config: SoftwareAlertConfig;
      }>({ action: 'run-software-expiry-alerts' });
      setConfig(data.config);
      setMessage(`Alerts processed: ${data.sent} notifications, ${data.emailed} emails sent, ${data.skipped} skipped.`);
      if (data.errors?.length) setError(data.errors.slice(0, 3).join(' · '));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to run expiry alerts.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]" aria-label="Close dialog" onClick={onClose} />
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Software expiration alerts</h2>
            <p className="mt-1 text-sm text-slate-500">
              Standard notification periods: 90 / 60 / 30 / 14 / 7 days, delivered by email and in-app.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          {loading ? <p className="text-sm text-slate-500">Loading alert settings...</p> : null}
          {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
          {message ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</div> : null}

          {config ? (
            <>
              <label className="flex items-center gap-3 text-sm font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(event) => setConfig({ ...config, enabled: event.target.checked })}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Enable expiration alerts
              </label>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Notification periods</p>
                <div className="flex flex-wrap gap-2">
                  {SOFTWARE_ALERT_PERIODS.map((days) => {
                    const period = config.periods.find((item) => item.days === days);
                    const enabled = period?.enabled ?? true;
                    return (
                      <button
                        key={days}
                        type="button"
                        onClick={() => togglePeriod(days)}
                        className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                          enabled
                            ? 'border-dle-blue bg-blue-50 text-dle-blue'
                            : 'border-slate-200 bg-white text-slate-500'
                        }`}
                      >
                        {days}-day
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Channels</p>
                <div className="flex flex-wrap gap-4 text-sm">
                  {(['In-App', 'Email'] as const).map((channel) => (
                    <label key={channel} className="inline-flex items-center gap-2 font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={config.channels.includes(channel)}
                        onChange={() => toggleChannel(channel)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      {channel}
                    </label>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Recipient emails</span>
                <textarea
                  value={emailsText}
                  onChange={(event) => setEmailsText(event.target.value)}
                  placeholder="it.manager@dle.com, asset.admin@dle.com"
                  className="min-h-[88px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-dle-blue"
                />
                <span className="mt-1 block text-xs text-slate-500">Separate multiple addresses with commas.</span>
              </label>

              <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Last run: {config.lastRunAt ? new Date(config.lastRunAt).toLocaleString() : 'Never'}
                {config.updatedAt ? ` · Updated ${new Date(config.updatedAt).toLocaleString()}` : ''}
              </div>
            </>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Close
          </button>
          <button
            type="button"
            disabled={running || loading || !config}
            onClick={() => void runAlerts()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
            {running ? 'Sending...' : 'Send alerts now'}
          </button>
          <button
            type="button"
            disabled={saving || loading || !config}
            onClick={() => void save()}
            className="inline-flex items-center gap-2 rounded-lg bg-dle-blue px-4 py-2 text-sm font-semibold text-white hover:bg-dle-blue-deep disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving ? 'Saving...' : 'Save settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
