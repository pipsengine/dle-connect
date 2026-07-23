import { promises as fs } from 'fs';
import path from 'path';
import type { SessionPayload } from '@/lib/auth/session';
import { createEnterpriseNotification } from '@/lib/enterprise-notifications-store';
import { listItSoftwareLicenses, type ItSoftwareLicenseRecord } from '@/lib/it-asset-management-store';
import { sendTransactionalEmail } from '@/lib/mail-service';
import {
  SOFTWARE_ALERT_PERIODS,
  type SoftwareAlertConfig,
  type SoftwareAlertPeriod,
  type SoftwareLicenseMetrics,
} from '@/lib/it-software-alert-constants';

export {
  SOFTWARE_ALERT_PERIODS,
  type SoftwareAlertConfig,
  type SoftwareAlertPeriod,
  type SoftwareAlertPeriodConfig,
  type SoftwareLicenseMetrics,
} from '@/lib/it-software-alert-constants';

const compact = (value: unknown) => String(value || '').trim();

const resolveConfigPathCandidates = () => {
  const override = compact(process.env.DLE_SOFTWARE_ALERT_CONFIG_PATH);
  if (override) return [override];
  return [
    path.join(process.cwd(), 'data', 'it-software-alert-config.json'),
    path.join(process.cwd(), 'apps', 'dashboard', 'data', 'it-software-alert-config.json'),
  ];
};

const readConfigFile = async (): Promise<SoftwareAlertConfig> => {
  for (const filePath of resolveConfigPathCandidates()) {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      return normalizeConfig(JSON.parse(raw) as Partial<SoftwareAlertConfig>);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') continue;
      throw error;
    }
  }
  return defaultConfig();
};

const writeConfigFile = async (config: SoftwareAlertConfig) => {
  const filePath = resolveConfigPathCandidates()[0];
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
};

const defaultConfig = (): SoftwareAlertConfig => ({
  enabled: true,
  periods: SOFTWARE_ALERT_PERIODS.map((days) => ({ days, enabled: true })),
  recipientEmails: [],
  channels: ['In-App', 'Email'],
  updatedAt: null,
  updatedBy: null,
  lastRunAt: null,
  sentLog: [],
});

const normalizeConfig = (raw: Partial<SoftwareAlertConfig> | null | undefined): SoftwareAlertConfig => {
  const periodMap = new Map((raw?.periods || []).map((item) => [Number(item.days), Boolean(item.enabled)]));
  return {
    enabled: raw?.enabled ?? true,
    periods: SOFTWARE_ALERT_PERIODS.map((days) => ({
      days,
      enabled: periodMap.has(days) ? Boolean(periodMap.get(days)) : true,
    })),
    recipientEmails: Array.from(
      new Set((raw?.recipientEmails || []).map((email) => compact(email).toLowerCase()).filter(Boolean)),
    ),
    channels: (raw?.channels || ['In-App', 'Email']).filter((channel): channel is 'In-App' | 'Email' =>
      channel === 'In-App' || channel === 'Email',
    ),
    updatedAt: raw?.updatedAt || null,
    updatedBy: raw?.updatedBy || null,
    lastRunAt: raw?.lastRunAt || null,
    sentLog: Array.isArray(raw?.sentLog) ? raw!.sentLog!.slice(0, 500) : [],
  };
};

export const daysUntilExpiry = (expiryDate: string | null | undefined, now = new Date()) => {
  if (!expiryDate) return null;
  const expiry = new Date(`${expiryDate}T00:00:00`);
  if (Number.isNaN(expiry.getTime())) return null;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return Math.ceil((expiry.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
};

export const resolveAlertPeriod = (daysLeft: number | null, enabledPeriods: number[]): SoftwareAlertPeriod | null => {
  if (daysLeft == null || daysLeft < 0) return null;
  const sorted = [...enabledPeriods].sort((a, b) => a - b) as SoftwareAlertPeriod[];
  for (const period of sorted) {
    if (daysLeft <= period) return period;
  }
  return null;
};

export const buildSoftwareLicenseMetrics = (licenses: ItSoftwareLicenseRecord[]): SoftwareLicenseMetrics => {
  const byPeriod = Object.fromEntries(SOFTWARE_ALERT_PERIODS.map((days) => [days, 0])) as Record<SoftwareAlertPeriod, number>;
  let inCompliance = 0;
  let overLicensed = 0;
  let underLicensed = 0;
  let expiringSoon = 0;
  let expired = 0;

  for (const license of licenses) {
    const daysLeft = daysUntilExpiry(license.expiryDate);
    const status = compact(license.complianceStatus).toLowerCase();

    if (daysLeft != null && daysLeft < 0) expired += 1;
    else if (status.includes('expired')) expired += 1;

    if (daysLeft != null && daysLeft >= 0 && daysLeft <= 30) expiringSoon += 1;
    else if (status.includes('expir') && !status.includes('expired')) expiringSoon += 1;

    if (license.seatsUsed > license.seatsTotal) overLicensed += 1;
    else if (license.seatsTotal > 0 && license.seatsUsed < Math.ceil(license.seatsTotal * 0.5)) underLicensed += 1;

    if (
      (status.includes('compliance') || status === 'valid' || status === 'active')
      && !(daysLeft != null && daysLeft < 0)
      && license.seatsUsed <= license.seatsTotal
    ) {
      inCompliance += 1;
    }

    if (daysLeft != null && daysLeft >= 0) {
      for (const period of SOFTWARE_ALERT_PERIODS) {
        if (daysLeft <= period) byPeriod[period] += 1;
      }
    }
  }

  return {
    totalLicenses: licenses.length,
    inCompliance,
    overLicensed,
    underLicensed,
    expiringSoon,
    expired,
    seatsTotal: licenses.reduce((sum, row) => sum + (row.seatsTotal || 0), 0),
    seatsUsed: licenses.reduce((sum, row) => sum + (row.seatsUsed || 0), 0),
    annualCost: licenses.reduce((sum, row) => sum + (row.annualCost || 0), 0),
    byPeriod,
  };
};

export const getSoftwareAlertConfig = async () => readConfigFile();

export const saveSoftwareAlertConfig = async (
  input: Partial<SoftwareAlertConfig>,
  actor: string,
) => {
  const current = await readConfigFile();
  const next = normalizeConfig({
    ...current,
    ...input,
    periods: input.periods || current.periods,
    recipientEmails: input.recipientEmails ?? current.recipientEmails,
    channels: input.channels || current.channels,
    sentLog: current.sentLog,
    lastRunAt: current.lastRunAt,
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
  });
  await writeConfigFile(next);
  return next;
};

const alreadySentToday = (config: SoftwareAlertConfig, licenseId: string, period: number, today: string) =>
  config.sentLog.some((entry) => entry.licenseId === licenseId && entry.period === period && entry.sentOn.startsWith(today));

const buildAlertEmail = (license: ItSoftwareLicenseRecord, period: number, daysLeft: number) => {
  const subject = `[DLE Software] ${period}-day expiry alert: ${license.productName}`;
  const text = [
    `Software license expiry alert (${period}-day notification window)`,
    '',
    `Product: ${license.productName}`,
    `Vendor: ${license.vendorName || '—'}`,
    `Expiry date: ${license.expiryDate || '—'}`,
    `Days remaining: ${daysLeft}`,
    `Seats: ${license.seatsUsed}/${license.seatsTotal}`,
    `Compliance: ${license.complianceStatus}`,
    `Annual cost: ${license.annualCost == null ? '—' : license.annualCost}`,
    '',
    'Open Asset Management → Software → Licenses to renew or update this record.',
  ].join('\n');
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;color:#0f172a;line-height:1.5">
      <h2 style="margin:0 0 12px">Software license expiry alert</h2>
      <p style="margin:0 0 16px">Standard <strong>${period}-day</strong> notification window.</p>
      <table style="border-collapse:collapse;width:100%;max-width:560px">
        <tr><td style="padding:6px 0;color:#64748b">Product</td><td style="padding:6px 0;font-weight:600">${license.productName}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Vendor</td><td style="padding:6px 0">${license.vendorName || '—'}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Expiry date</td><td style="padding:6px 0">${license.expiryDate || '—'}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Days remaining</td><td style="padding:6px 0;font-weight:600">${daysLeft}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Seats</td><td style="padding:6px 0">${license.seatsUsed}/${license.seatsTotal}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Compliance</td><td style="padding:6px 0">${license.complianceStatus}</td></tr>
      </table>
      <p style="margin:16px 0 0;color:#64748b;font-size:13px">DLE Connect · Asset Management · Software Licenses</p>
    </div>
  `;
  return { subject, text, html };
};

export const runSoftwareExpiryAlerts = async (session: SessionPayload, actor: string) => {
  const config = await readConfigFile();
  if (!config.enabled) {
    return { sent: 0, skipped: 0, emailed: 0, errors: ['Expiry alerts are disabled.'], config };
  }

  const enabledPeriods = config.periods.filter((item) => item.enabled).map((item) => item.days);
  if (!enabledPeriods.length) {
    return { sent: 0, skipped: 0, emailed: 0, errors: ['No notification periods are enabled.'], config };
  }

  const licenses = await listItSoftwareLicenses();
  const today = new Date().toISOString().slice(0, 10);
  let sent = 0;
  let skipped = 0;
  let emailed = 0;
  const errors: string[] = [];
  const wantEmail = config.channels.includes('Email');
  const wantInApp = config.channels.includes('In-App');

  for (const license of licenses) {
    const daysLeft = daysUntilExpiry(license.expiryDate);
    const period = resolveAlertPeriod(daysLeft, enabledPeriods);
    if (period == null || daysLeft == null) {
      skipped += 1;
      continue;
    }
    if (alreadySentToday(config, license.licenseId, period, today)) {
      skipped += 1;
      continue;
    }

    const channelsUsed: string[] = [];
    if (wantInApp) {
      await createEnterpriseNotification(session, {
        title: `${period}-day software expiry: ${license.productName}`,
        body: `${license.productName} expires on ${license.expiryDate} (${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining).`,
        module: 'Asset Management',
        kind: 'Notification',
        severity: period <= 14 ? 'critical' : period <= 30 ? 'warning' : 'info',
        href: '/it-support/asset-management/software/licenses',
        channels: ['In-App', ...(wantEmail ? (['Email'] as const) : [])],
        actor,
        recipientRoles: ['it-manager', 'it-admin', 'asset-manager', 'global-admin'],
        metadata: {
          licenseId: license.licenseId,
          period,
          daysLeft,
          productName: license.productName,
        },
      });
      channelsUsed.push('In-App');
    }

    if (wantEmail && config.recipientEmails.length) {
      const mail = buildAlertEmail(license, period, daysLeft);
      for (const email of config.recipientEmails) {
        const result = await sendTransactionalEmail({ to: email, ...mail });
        if (result.sent) emailed += 1;
        else errors.push(`${license.productName} → ${email}: ${result.reason || 'Email not sent'}`);
      }
      channelsUsed.push('Email');
    } else if (wantEmail && !config.recipientEmails.length) {
      errors.push('Email channel enabled but no recipient emails are configured.');
    }

    if (channelsUsed.length) {
      sent += 1;
      config.sentLog.unshift({
        licenseId: license.licenseId,
        productName: license.productName,
        period,
        sentOn: new Date().toISOString(),
        channels: channelsUsed,
      });
    } else {
      skipped += 1;
    }
  }

  config.sentLog = config.sentLog.slice(0, 500);
  config.lastRunAt = new Date().toISOString();
  await writeConfigFile(config);

  return { sent, skipped, emailed, errors: Array.from(new Set(errors)).slice(0, 20), config };
};
