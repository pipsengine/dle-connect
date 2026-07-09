const compact = (value: unknown) => String(value || '').trim();

const configuredPublicAppUrl = () => {
  const value = compact(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL);
  return value ? value.replace(/\/$/, '') : '';
};

const localhostOriginForPort = (port?: string) => `http://localhost:${port || '3020'}`;

const isNonRoutableHost = (hostname: string) => {
  const host = hostname.toLowerCase();
  return host === '0.0.0.0' || host === '::' || host === '[::]';
};

export const resolvePublicAppOrigin = (requestOrigin?: string | null) => {
  const configured = configuredPublicAppUrl();
  const candidate = compact(requestOrigin) || configured;
  if (!candidate) return localhostOriginForPort('3020');

  try {
    const url = new URL(candidate.includes('://') ? candidate : `http://${candidate}`);
    if (isNonRoutableHost(url.hostname)) {
      if (configured) {
        try {
          return new URL(configured).origin;
        } catch {
          // Fall through to localhost.
        }
      }
      return localhostOriginForPort(url.port || '3020');
    }
    return url.origin;
  } catch {
    return configured || localhostOriginForPort('3020');
  }
};

export const normalizePublicHref = (href: string) => {
  const value = compact(href);
  if (!value || (!value.startsWith('http://') && !value.startsWith('https://'))) return value;
  try {
    const url = new URL(value);
    if (!isNonRoutableHost(url.hostname)) return value;
    url.hostname = 'localhost';
    return url.toString();
  } catch {
    return value;
  }
};

export const resolvePublicAppOriginFromRequest = (request: Pick<Request, 'url' | 'headers'>) => {
  const forwardedHost = compact(request.headers.get('x-forwarded-host'));
  const forwardedProto = compact(request.headers.get('x-forwarded-proto')) || 'http';
  if (forwardedHost) {
    return resolvePublicAppOrigin(`${forwardedProto}://${forwardedHost}`);
  }
  try {
    return resolvePublicAppOrigin(new URL(request.url).origin);
  } catch {
    return resolvePublicAppOrigin(null);
  }
};
