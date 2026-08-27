export type ServiceDeskApiResponse<T> = { status: 'success'; data: T } | { status: 'error'; error: string };

async function parseJson<T>(res: Response): Promise<T> {
  const json = (await res.json()) as ServiceDeskApiResponse<T>;
  if (!res.ok || json.status === 'error') {
    throw new Error((json as { error?: string }).error || `Request failed (${res.status})`);
  }
  return json.data;
}

export async function serviceDeskGet<T>(resource: string, params: Record<string, string | undefined> = {}) {
  const qs = new URLSearchParams({ resource });
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== '') qs.set(key, value);
  }
  const res = await fetch(`/api/it-support/service-desk-itsm?${qs.toString()}`, { cache: 'no-store' });
  return parseJson<T>(res);
}

export async function serviceDeskPost<T>(action: string, body: Record<string, unknown> = {}) {
  const res = await fetch('/api/it-support/service-desk-itsm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  });
  return parseJson<T>(res);
}

export const formatSlaTimer = (slaDueAt: string | null | undefined) => {
  if (!slaDueAt) return '—';
  const due = new Date(slaDueAt).getTime();
  const diff = due - Date.now();
  if (Number.isNaN(due)) return '—';
  if (diff < 0) return 'Overdue';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours < 24) return `${hours}h ${rem}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
};

export const relativeTime = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '—';
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};
