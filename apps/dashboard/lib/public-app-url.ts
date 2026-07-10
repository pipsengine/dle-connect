const compact = (value: unknown) => String(value || '').trim();

const configuredPublicAppUrl = () => {
  const value = compact(
    process.env.DLE_PUBLIC_APP_URL
      || process.env.NEXT_PUBLIC_APP_URL
      || process.env.APP_URL
      || process.env.DASHBOARD_PUBLIC_URL,
  );
  return value ? value.replace(/\/$/, '') : '';
};

const localhostOriginForPort = (port?: string) => `http://localhost:${port || process.env.PORT || '3020'}`;

const isLoopbackHost = (hostname: string) => {
  const host = hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
};

const isNonRoutableHost = (hostname: string) => {
  const host = hostname.toLowerCase();
  return host === '0.0.0.0' || host === '::' || host === '[::]';
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

/** Outbound workflow/email links: prefer configured APP_URL, then live request host, then internal deploy default. */
export const resolveWorkflowLinkOrigin = (requestOrigin?: string | null) => {
  const configured = configuredPublicAppUrl();
  if (configured) {
    try {
      const origin = parseOrigin(configured);
      const host = new URL(origin).hostname;
      if (!isLoopbackHost(host) && !isNonRoutableHost(host)) return origin;
    } catch {
      // fall through
    }
  }

  const live = compact(requestOrigin);
  if (live) {
    try {
      const origin = parseOrigin(live);
      const host = new URL(origin).hostname;
      if (!isNonRoutableHost(host)) return origin;
    } catch {
      // fall through
    }
  }

  const internal = internalDeployDefaultOrigin();
  if (internal) {
    try {
      return parseOrigin(internal);
    } catch {
      // fall through
    }
  }

  return localhostOriginForPort();
};

export const resolvePublicAppOriginFromRequest = (request: Pick<Request, 'url' | 'headers'>) => {
  const forwardedHost = compact(request.headers.get('x-forwarded-host'));
  const forwardedProto = compact(request.headers.get('x-forwarded-proto')) || 'http';
  if (forwardedHost) {
    return resolvePublicAppOrigin(`${forwardedProto}://${forwardedHost.split(',')[0].trim()}`);
  }

  const hostHeader = compact(request.headers.get('host'));
  try {
    const url = new URL(request.url);
    const requestHostBad = isNonRoutableHost(url.hostname) || isLoopbackHost(url.hostname);
    if (hostHeader && requestHostBad) {
      const proto = url.protocol === 'https:' ? 'https' : 'http';
      return resolvePublicAppOrigin(`${proto}://${hostHeader}`);
    }
    return resolvePublicAppOrigin(url.origin);
  } catch {
    if (hostHeader) return resolvePublicAppOrigin(`http://${hostHeader}`);
    return resolveWorkflowLinkOrigin(null);
  }
};

export const resolveWorkflowLinkOriginFromRequest = (request: Pick<Request, 'url' | 'headers'>) =>
  resolveWorkflowLinkOrigin(resolvePublicAppOriginFromRequest(request));

export const normalizePublicHref = (href: string, currentOrigin?: string | null) => {
  const value = compact(href);
  if (!value || (!value.startsWith('http://') && !value.startsWith('https://'))) return value;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (!isNonRoutableHost(host) && !isLoopbackHost(host)) return value;
    const fallback = compact(currentOrigin) || configuredPublicAppUrl() || internalDeployDefaultOrigin();
    if (!fallback) return value;
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
