const ESS_RESPONSE_CACHE_MS = Number(process.env.ESS_PORTAL_RESPONSE_CACHE_MS || 30000);

const essResponseCache = new Map<string, { expiresAt: number; payload: unknown }>();

export const readEssPortalResponseCache = (key: string) => {
  const cached = essResponseCache.get(key);
  if (!cached || cached.expiresAt <= Date.now()) return null;
  return cached.payload;
};

export const writeEssPortalResponseCache = (key: string, payload: unknown) => {
  essResponseCache.set(key, { expiresAt: Date.now() + ESS_RESPONSE_CACHE_MS, payload });
};

export const invalidateEssPortalCache = () => {
  essResponseCache.clear();
};
