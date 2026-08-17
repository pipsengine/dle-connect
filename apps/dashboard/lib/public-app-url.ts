const compact = (value: unknown) => String(value || '').trim();

/** Canonical public origin employees open from email (IIS HTTPS binding). */
export const DEFAULT_PUBLIC_APP_ORIGIN = 'https://dleconnect.dormanlongeng.com:1432';

const localhostOriginForPort = (port?: string) => `http://localhost:${port || process.env.PORT || '3020'}`;

const isLoopbackHost = (hostname: string) => {
  const host = hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
};

const isNonRoutableHost = (hostname: string) => {
  const host = hostname.toLowerCase();
  return host === '0.0.0.0' || host === '::' || host === '[::]';
};

const isPrivateLanHost = (hostname: string) => {
  const host = hostname.toLowerCase();
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);
};

/** Hosts that off-network employees cannot open from an email client. */
export const isUnusableEmailLinkHost = (hostname: string) => {
  const host = hostname.toLowerCase();
  return isLoopbackHost(host) || isNonRoutableHost(host) || isPrivateLanHost(host);
};

const internalDeployDefaultOrigin = () => {
  const explicit = compact(process.env.DLE_INTERNAL_APP_URL);
  if (explicit) return explicit.replace(/\/$/, '');
  if (compact(process.env.DLE_DEPLOY_ENV).toLowerCase() === 'internal') {
    const host = compact(process.env.DLE_INTERNAL_APP_HOST) || compact(process.env.DLE_ENTERPRISE_DB_HOST) || '192.168.5.5';
    const port = compact(process.env.DLE_INTERNAL_APP_PORT) || compact(process.env.PORT) || '3020';
    return `http://${host}:${port}`;
  }
  return '';
};

const parseOrigin = (candidate: string) => {
  const url = new URL(candidate.includes('://') ? candidate : `http://${candidate}`);
  if (isNonRoutableHost(url.hostname)) {
    return localhostOriginForPort(url.port || undefined);
  }
  return url.origin;
};

/** Configured public origin only — rejects LAN/loopback misconfiguration. */
const configuredPublicAppUrl = () => {
  const value = compact(
    process.env.DLE_PUBLIC_APP_URL
      || process.env.NEXT_PUBLIC_APP_URL
      || process.env.APP_URL
      || process.env.DASHBOARD_PUBLIC_URL,
  );
  if (!value) return '';
  try {
    const origin = parseOrigin(value);
    if (isUnusableEmailLinkHost(new URL(origin).hostname)) return '';
    return origin.replace(/\/$/, '');
  } catch {
    return '';
  }
};

/**
 * General origin resolution (browser redirects, current request host).
 * Prefer the live candidate when provided; otherwise configured / internal / localhost.
 */
export const resolvePublicAppOrigin = (requestOrigin?: string | null) => {
  const configured = configuredPublicAppUrl();
  const candidate = compact(requestOrigin) || configured || internalDeployDefaultOrigin();
  if (!candidate) return localhostOriginForPort();

  try {
    return parseOrigin(candidate);
  } catch {
    return configured || internalDeployDefaultOrigin() || localhostOriginForPort();
  }
};

/**
 * Outbound workflow/email links — always a publicly reachable HTTPS origin.
 * Never emits LAN/loopback hosts even if the API request came from 192.168.x.x.
 */
export const resolveWorkflowLinkOrigin = (requestOrigin?: string | null) => {
  const configured = configuredPublicAppUrl();
  if (configured) return configured;

  const live = compact(requestOrigin);
  if (live) {
    try {
      const origin = parseOrigin(live);
      const host = new URL(origin).hostname;
      if (!isUnusableEmailLinkHost(host)) return origin;
    } catch {
      // fall through
    }
  }

  // Local developer previews may still want localhost in emails.
  if (compact(process.env.NODE_ENV).toLowerCase() === 'development') {
    return localhostOriginForPort();
  }

  return DEFAULT_PUBLIC_APP_ORIGIN;
};

export const resolvePublicAppOriginFromRequest = (request: Pick<Request, 'url' | 'headers'>) => {
  const forwardedHost = compact(request.headers.get('x-forwarded-host'));
  const hostHeader = compact(request.headers.get('host'));
  const forwardedProto = compact(request.headers.get('x-forwarded-proto'));
  const host = (forwardedHost || hostHeader).split(',')[0].trim();
  const hostName = host.replace(/:\d+$/, '').toLowerCase();
  const isLoopback = hostName === 'localhost' || hostName === '127.0.0.1' || hostName === '::1';
  const isPrivateLan = isPrivateLanHost(hostName);
  const proto = forwardedProto
    || ((hostName && !isLoopback && !isPrivateLan) ? 'https' : '')
    || 'http';

  if (host) {
    return resolvePublicAppOrigin(`${proto}://${host}`);
  }

  try {
    const url = new URL(request.url);
    const requestHostBad = isNonRoutableHost(url.hostname) || isLoopbackHost(url.hostname);
    if (hostHeader && requestHostBad) {
      const fallbackProto = url.protocol === 'https:' ? 'https' : 'http';
      return resolvePublicAppOrigin(`${fallbackProto}://${hostHeader}`);
    }
    return resolvePublicAppOrigin(url.origin);
  } catch {
    if (hostHeader) return resolvePublicAppOrigin(`http://${hostHeader}`);
    return resolveWorkflowLinkOrigin(null);
  }
};

/** Always the public email/workflow origin (configured HTTPS), not the private request host. */
export const resolveWorkflowLinkOriginFromRequest = (_request?: Pick<Request, 'url' | 'headers'> | null) =>
  resolveWorkflowLinkOrigin(null);

export const normalizePublicHref = (href: string, currentOrigin?: string | null) => {
  const value = compact(href);
  if (!value || (!value.startsWith('http://') && !value.startsWith('https://'))) return value;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (!isUnusableEmailLinkHost(host)) return value;
    const fallback = resolveWorkflowLinkOrigin(currentOrigin);
    const base = new URL(fallback.includes('://') ? fallback : `http://${fallback}`);
    return `${base.origin}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return value;
  }
};

export const toAbsoluteWorkflowHref = (href: string, origin?: string | null) => {
  const value = compact(href);
  if (!value) return value;
  if (value.startsWith('http://') || value.startsWith('https://')) return normalizePublicHref(value, origin);
  const base = resolveWorkflowLinkOrigin(origin);
  return `${base}${value.startsWith('/') ? value : `/${value}`}`;
};
