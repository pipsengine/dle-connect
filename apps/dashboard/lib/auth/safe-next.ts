/** Prevent open redirects: only same-origin relative paths are allowed. */
export const safeInternalNextPath = (value: unknown) => {
  const next = String(value || '').trim();
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('://')) return '';
  return next;
};
