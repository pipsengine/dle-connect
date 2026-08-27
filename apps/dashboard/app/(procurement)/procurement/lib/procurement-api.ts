export type ProcurementApiResponse<T> = { status: 'success'; data: T } | { status: 'error'; error: string };

async function parseJson<T>(res: Response): Promise<T> {
  const json = (await res.json()) as ProcurementApiResponse<T>;
  if (!res.ok || json.status === 'error') {
    throw new Error((json as { error?: string }).error || `Request failed (${res.status})`);
  }
  return json.data;
}

export async function procurementGet<T>(resource: string, params: Record<string, string | undefined> = {}) {
  const qs = new URLSearchParams({ resource });
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== '') qs.set(key, value);
  }
  const res = await fetch(`/api/procurement?${qs.toString()}`, { cache: 'no-store' });
  return parseJson<T>(res);
}

export async function procurementPost<T>(action: string, body: Record<string, unknown> = {}) {
  const res = await fetch('/api/procurement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  });
  return parseJson<T>(res);
}

export const moneyNgn = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 }).format(n || 0);
