import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env.local');

for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (!match) continue;
  process.env[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
}

const compact = (value) => String(value || '').trim();
const sender = () => compact(process.env.MS_GRAPH_SENDER_EMAIL || process.env.DLE_SMTP_USER);

const graphConfigured = () => Boolean(
  process.env.MS_GRAPH_TENANT_ID
  && process.env.MS_GRAPH_CLIENT_ID
  && process.env.MS_GRAPH_CLIENT_SECRET
  && sender(),
);

let tokenCache = null;

const getToken = async () => {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const body = new URLSearchParams({
    client_id: compact(process.env.MS_GRAPH_CLIENT_ID),
    client_secret: compact(process.env.MS_GRAPH_CLIENT_SECRET),
    scope: compact(process.env.MS_GRAPH_SCOPE) || 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const response = await fetch(`https://login.microsoftonline.com/${compact(process.env.MS_GRAPH_TENANT_ID)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || `Token request failed (${response.status})`);
  }
  tokenCache = {
    token: payload.access_token,
    expiresAt: Date.now() + Math.max(60, Number(payload.expires_in || 3600) - 60) * 1000,
  };
  return tokenCache.token;
};

const sendGraph = async ({ to, subject, text, html }) => {
  const token = await getToken();
  const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender())}/sendMail`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'HTML', content: html },
        toRecipients: [{ emailAddress: { address: to } }],
      },
      saveToSentItems: true,
    }),
  });
  if (!response.ok) {
    throw new Error(`Graph sendMail failed (${response.status}): ${await response.text()}`);
  }
};

const employeeCode = process.argv[2] || 'P0146';
const to = process.argv[3] || 'chrisogbaisi@dormanlongeng.com';
const fullName = process.argv[4] || 'Mr CHRISTIAN ONUWABHAGBE OGBAISI';
const appUrl = process.env.APP_URL || 'http://localhost:3020';
const provider = compact(process.env.DLE_MAIL_PROVIDER) || (graphConfigured() ? 'graph' : 'smtp');

const subject = `DLE Connect — email test for ${employeeCode}`;
const text = [
  `Dear ${fullName},`,
  '',
  'This is a test email from DLE Connect to confirm outbound mail is working.',
  `Employee code: ${employeeCode}`,
  `Mail provider: ${provider}`,
  `Sent at: ${new Date().toISOString()}`,
  '',
  `Open DLE Connect: ${appUrl}`,
].join('\n');
const html = `<p>Dear <strong>${fullName}</strong>,</p>
<p>This is a <strong>test email</strong> from DLE Connect.</p>
<ul>
  <li><strong>Employee code:</strong> ${employeeCode}</li>
  <li><strong>Mail provider:</strong> ${provider}</li>
  <li><strong>Sent at:</strong> ${new Date().toISOString()}</li>
</ul>
<p><a href="${appUrl}">Open DLE Connect</a></p>`;

if (provider === 'graph') {
  if (!graphConfigured()) {
    console.error('GRAPH_NOT_CONFIGURED: set MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET');
    process.exit(1);
  }
  await sendGraph({ to, subject, text, html });
  console.log(JSON.stringify({ sent: true, provider: 'graph', to, employeeCode, sender: sender() }, null, 2));
} else {
  const nodemailer = await import('nodemailer');
  const transport = nodemailer.createTransport({
    host: process.env.DLE_SMTP_HOST,
    port: Number(process.env.DLE_SMTP_PORT || 587),
    secure: false,
    requireTLS: true,
    auth: {
      user: process.env.DLE_SMTP_USER,
      pass: process.env.DLE_SMTP_PASSWORD,
    },
    tls: { minVersion: 'TLSv1.2' },
  });
  const info = await transport.sendMail({
    from: process.env.DLE_SMTP_FROM,
    to,
    subject,
    text,
    html,
  });
  console.log(JSON.stringify({ sent: true, provider: 'smtp', to, employeeCode, messageId: info.messageId || null }, null, 2));
}
