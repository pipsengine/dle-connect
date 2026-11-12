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

const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error(`Unable to read ${file.name}.`));
  reader.onload = () => {
    const result = String(reader.result || '');
    const marker = 'base64,';
    const index = result.indexOf(marker);
    resolve(index >= 0 ? result.slice(index + marker.length) : result);
  };
  reader.readAsDataURL(file);
});

/** Upload via JSON/base64 so IIS / HttpPlatform does not have to parse multipart FormData. */
export async function tenderUpload(opportunityId: string, file: File, category: string) {
  if (file.size > 12 * 1024 * 1024) throw new Error(`${file.name} exceeds the 12 MB limit.`);
  const contentBase64 = await fileToBase64(file);
  try {
    return await tenderPost({
      action: 'upload-document',
      opportunityId,
      category,
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      contentBase64,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/unterminated string|unexpected end of json|position \d+/i.test(message)) {
      throw new Error(`${file.name} could not be uploaded (request too large after encoding). Use a file under 12 MB.`);
    }
    throw error;
  }
}

export async function tenderDeleteDocument(documentId: string) {
  return tenderPost({ action: 'delete-document', documentId });
}

export const money = (value: number, currency = 'NGN') => {
  const formatted = Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (currency === 'NGN') return `₦ ${formatted}`;
  if (currency === 'USD') return `$ ${formatted}`;
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
  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parsed = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const todayLabel = () => {
  const now = new Date();
  const weekday = now.toLocaleDateString('en-GB', { weekday: 'short' });
  const rest = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return `Today, ${weekday}, ${rest}`;
};
