const compact = (value: unknown) => String(value || '').trim();

export type GraphMailResult = {
  sent: boolean;
  reason?: string;
  provider?: 'microsoft-graph';
};

type TokenCache = {
  token: string;
  expiresAt: number;
};

let tokenCache: TokenCache | null = null;

export const graphMailConfigured = () => Boolean(
  process.env.MS_GRAPH_TENANT_ID
  && process.env.MS_GRAPH_CLIENT_ID
  && process.env.MS_GRAPH_CLIENT_SECRET
  && graphSenderEmail(),
);

export const graphSenderEmail = () =>
  compact(process.env.MS_GRAPH_SENDER_EMAIL || process.env.DLE_SMTP_USER || process.env.DLE_SMTP_FROM?.replace(/^.*<([^>]+)>.*$/, '$1'));

const graphScope = () => compact(process.env.MS_GRAPH_SCOPE) || 'https://graph.microsoft.com/.default';

const resetTokenCache = () => {
  tokenCache = null;
};

export const getGraphAccessToken = async () => {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }

  const tenantId = compact(process.env.MS_GRAPH_TENANT_ID);
  const clientId = compact(process.env.MS_GRAPH_CLIENT_ID);
  const clientSecret = compact(process.env.MS_GRAPH_CLIENT_SECRET);
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Microsoft Graph mail credentials are incomplete.');
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: graphScope(),
    grant_type: 'client_credentials',
  });

  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });

  const payload = await response.json().catch(() => ({})) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    resetTokenCache();
    const detail = payload.error_description || payload.error || `HTTP ${response.status}`;
    throw new Error(`Graph token request failed: ${detail}`);
  }

  tokenCache = {
    token: payload.access_token,
    expiresAt: Date.now() + Math.max(60, Number(payload.expires_in || 3600) - 60) * 1000,
  };
  return tokenCache.token;
};

export const verifyGraphMailConnection = async () => {
  if (!graphMailConfigured()) return { ok: false as const, reason: 'Microsoft Graph mail not configured.' };
  try {
    await getGraphAccessToken();
    return { ok: true as const, provider: 'microsoft-graph' as const, sender: graphSenderEmail() };
  } catch (error) {
    return {
      ok: false as const,
      reason: error instanceof Error ? error.message : 'Graph verification failed.',
    };
  }
};

export const sendGraphMail = async (input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}): Promise<GraphMailResult> => {
  const to = compact(input.to);
  if (!to) return { sent: false, reason: 'No recipient email.' };
  if (!graphMailConfigured()) return { sent: false, reason: 'Microsoft Graph mail not configured.' };

  const sender = graphSenderEmail();
  if (!sender) return { sent: false, reason: 'Graph sender mailbox is not configured.' };

  const token = await getGraphAccessToken();
  const html = input.html || input.text.replace(/\n/g, '<br/>');
  const replyTo = compact(input.replyTo || process.env.DLE_SMTP_REPLY_TO);

  const message: Record<string, unknown> = {
    subject: input.subject,
    body: { contentType: 'HTML', content: html },
    toRecipients: [{ emailAddress: { address: to } }],
  };
  if (replyTo) {
    message.replyTo = [{ emailAddress: { address: replyTo } }];
  }

  const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ message, saveToSentItems: true }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => `HTTP ${response.status}`);
    if (response.status === 401) resetTokenCache();
    return { sent: false, reason: `Graph sendMail failed (${response.status}): ${detail}` };
  }

  return { sent: true, provider: 'microsoft-graph' };
};
