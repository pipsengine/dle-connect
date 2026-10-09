export async function tenderGet<T>(resource: string, params: Record<string, string> = {}) {
  const query = new URLSearchParams({ resource, ...params });
  const response = await fetch(`/api/commercial/tenders?${query.toString()}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.status === 'error') throw new Error(json.error || 'Request failed.');
  return json.data as T;
}

export async function tenderPost<T>(body: unknown) {
  const response = await fetch('/api/commercial/tenders', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.status === 'error') throw new Error(json.error || 'Request failed.');
  return json.data as T;
}

export async function tenderUpload(opportunityId: string, file: File, category: string) {
  const form = new FormData();
  form.set('opportunityId', opportunityId);
  form.set('category', category);
  form.set('file', file);
  const response = await fetch('/api/commercial/tenders', {
    method: 'POST',
    credentials: 'same-origin',
    body: form,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.status === 'error') throw new Error(json.error || 'Upload failed.');
  return json.data;
}

export const money = (value: number, currency = 'NGN') => {
  const formatted = Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (currency === 'NGN') return `₦ ${formatted}`;
  return `${currency} ${formatted}`;
};

export const compactMoney = (value: number) => {
  const amount = Number(value || 0);
  if (Math.abs(amount) >= 1_000_000_000) return `₦ ${(amount / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(amount) >= 1_000_000) return `₦ ${(amount / 1_000_000).toFixed(2)}M`;
  return money(amount);
};

export const formatWhen = (value: string) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const todayLabel = () => {
  const now = new Date();
  const weekday = now.toLocaleDateString('en-GB', { weekday: 'short' });
  const rest = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return `Today, ${weekday}, ${rest}`;
};
