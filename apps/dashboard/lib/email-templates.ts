import { resolvePublicAppOrigin } from '@/lib/public-app-url';

export type DleEmailModule =
  | 'Payroll Management'
  | 'Leave Management'
  | 'Overtime Management'
  | 'Employee Self-Service'
  | 'HRIS'
  | 'Security';

export type DleEmailTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

export type DleEmailDetailRow = {
  label: string;
  value: string;
};

export type DleEmailAction = {
  href: string;
  label: string;
  tone?: 'primary' | 'success' | 'danger' | 'neutral';
};

export type DleEmailTemplateInput = {
  recipientName: string;
  subject: string;
  module: DleEmailModule;
  headline: string;
  intro: string;
  tone?: DleEmailTone;
  accentColor?: string;
  logoUrl?: string;
  details?: DleEmailDetailRow[];
  note?: string;
  actions?: DleEmailAction[];
  footerNote?: string;
  preheader?: string;
};

const compact = (value: unknown) => String(value || '').trim();

export const resolveEmailLogoUrl = (baseUrl?: string | null) => {
  const configured = compact(process.env.DLE_EMAIL_LOGO_URL);
  if (configured) return configured;
  const base = resolvePublicAppOrigin(baseUrl);
  return base ? `${base}/brand/dorman-long-logo.svg` : '';
};

const BRAND = {
  name: 'DLE Connect',
  company: 'Dorman Long Engineering',
  primary: '#11A0E6',
  primaryDeep: '#0A6EA8',
  success: '#059669',
  danger: '#DC2626',
  neutral: '#334155',
  text: '#0F172A',
  muted: '#64748B',
  border: '#E2E8F0',
  surface: '#F8FAFC',
};

const toneAccent: Record<DleEmailTone, string> = {
  info: BRAND.primary,
  success: BRAND.success,
  warning: '#D97706',
  danger: BRAND.danger,
  neutral: BRAND.neutral,
};

const actionBackground: Record<NonNullable<DleEmailAction['tone']>, string> = {
  primary: BRAND.primary,
  success: BRAND.success,
  danger: BRAND.danger,
  neutral: BRAND.neutral,
};

export const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const detailTableHtml = (rows: DleEmailDetailRow[]) => {
  if (!rows.length) return '';
  const cells = rows
    .map((row) => `<tr>
      <td style="padding:10px 16px 10px 0;border-bottom:1px solid ${BRAND.border};color:${BRAND.muted};font-size:13px;font-weight:700;white-space:nowrap;vertical-align:top">${escapeHtml(row.label)}</td>
      <td style="padding:10px 0;border-bottom:1px solid ${BRAND.border};color:${BRAND.text};font-size:14px;font-weight:600;vertical-align:top">${escapeHtml(row.value)}</td>
    </tr>`)
    .join('');
  return `<table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin:20px 0;border-collapse:collapse">${cells}</table>`;
};

const detailTableText = (rows: DleEmailDetailRow[]) =>
  rows.map((row) => `${row.label}: ${row.value}`).join('\n');

const actionsHtml = (actions: DleEmailAction[]) => {
  if (!actions.length) return '';
  return `<div style="margin:24px 0 8px">${actions
    .map((action) => {
      const bg = actionBackground[action.tone || 'primary'];
      return `<a href="${escapeHtml(action.href)}" style="display:inline-block;margin:0 12px 12px 0;padding:13px 20px;border-radius:10px;background:${bg};color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;line-height:1">${escapeHtml(action.label)}</a>`;
    })
    .join('')}</div>`;
};

const actionsText = (actions: DleEmailAction[]) =>
  actions.map((action) => `${action.label}: ${action.href}`).join('\n');

export const buildDleEmailHtml = (input: DleEmailTemplateInput) => {
  const tone = input.tone || 'info';
  const accent = input.accentColor || toneAccent[tone];
  const preheader = escapeHtml(input.preheader || input.intro);
  const logoUrl = compact(input.logoUrl);
  const logoBlock = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(BRAND.company)}" style="display:block;height:36px;max-width:220px;margin-bottom:14px" />`
    : '';
  const noteBlock = input.note
    ? `<div style="margin:18px 0 0;padding:14px 16px;border-radius:12px;background:#FFFBEB;border:1px solid #FDE68A;color:#92400E;font-size:13px;line-height:1.5">${escapeHtml(input.note)}</div>`
    : '';
  const footerNote = input.footerNote
    ? `<p style="margin:16px 0 0;color:${BRAND.muted};font-size:12px;line-height:1.6">${escapeHtml(input.footerNote)}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#EEF2F7;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${BRAND.text}">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#EEF2F7;padding:24px 12px">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid ${BRAND.border};border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,0.08)">
          <tr>
            <td style="padding:24px 28px;background:linear-gradient(135deg,${BRAND.primaryDeep} 0%,${BRAND.primary} 100%);color:#ffffff">
              ${logoBlock}
              <div style="font-size:12px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;opacity:0.9">${escapeHtml(BRAND.name)}</div>
              <div style="margin-top:6px;font-size:22px;font-weight:800;line-height:1.3">${escapeHtml(input.headline)}</div>
              <div style="margin-top:8px;font-size:13px;font-weight:600;opacity:0.92">${escapeHtml(input.module)}</div>
            </td>
          </tr>
          <tr>
            <td style="height:4px;background:${accent};line-height:4px;font-size:0">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:28px">
              <p style="margin:0 0 12px;font-size:15px;line-height:1.6">Dear <strong>${escapeHtml(input.recipientName)}</strong>,</p>
              <p style="margin:0 0 8px;font-size:15px;line-height:1.7;color:${BRAND.text}">${escapeHtml(input.intro)}</p>
              ${detailTableHtml(input.details || [])}
              ${noteBlock}
              ${actionsHtml(input.actions || [])}
              ${footerNote}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 24px;border-top:1px solid ${BRAND.border};background:${BRAND.surface}">
              <p style="margin:0;font-size:12px;line-height:1.6;color:${BRAND.muted}">
                ${escapeHtml(BRAND.company)} — ${escapeHtml(input.module)}<br />
                This is an automated message from ${escapeHtml(BRAND.name)}. Please do not reply directly to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

export const buildDleEmailText = (input: DleEmailTemplateInput) => [
  `Dear ${input.recipientName},`,
  '',
  input.headline,
  input.module,
  '',
  input.intro,
  '',
  input.details?.length ? detailTableText(input.details) : '',
  input.note ? `Note: ${input.note}` : '',
  '',
  input.actions?.length ? actionsText(input.actions) : '',
  input.footerNote || '',
  '',
  `${BRAND.company} — ${input.module}`,
  `Automated message from ${BRAND.name}.`,
].filter(Boolean).join('\n');

export const buildDleEmail = (input: DleEmailTemplateInput) => ({
  subject: input.subject,
  html: buildDleEmailHtml(input),
  text: buildDleEmailText(input),
});

export const moneyNgn = (value: number) => `₦${value.toLocaleString('en-NG')}`;

export const formatEmailDateTime = (value?: string | Date | null) => {
  if (!value) return new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
};
