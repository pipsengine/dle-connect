import type { ItAssetDashboardPayload } from '@/lib/it-asset-management-store';

type ApiResponse<T> = { status: 'success'; data: T } | { status: 'error'; error: string };

const parse = async <T>(response: Response): Promise<T> => {
  const json = (await response.json()) as ApiResponse<T>;
  if (!response.ok || json.status === 'error') {
    throw new Error(json.status === 'error' ? json.error : 'Request failed.');
  }
  return json.data;
};

export const fetchAssetManagementPayload = async () => {
  const response = await fetch('/api/it-support/asset-management?section=dashboard', { cache: 'no-store' });
  return parse<ItAssetDashboardPayload>(response);
};

export const fetchAssetSection = async <T,>(section: string, params?: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams({ section });
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });
  const response = await fetch(`/api/it-support/asset-management?${search.toString()}`, { cache: 'no-store' });
  return parse<T>(response);
};

export const initializeAssetManagement = async () => {
  const response = await fetch('/api/it-support/asset-management', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'initialize' }),
  });
  return parse<ItAssetDashboardPayload>(response);
};

export const importBundledAssetRegister = async () => {
  const response = await fetch('/api/it-support/asset-management', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'import-bundled-register' }),
  });
  return parse<{ result: { imported: number; updated: number; skipped: number; maintenanceCreated: number; errors: string[] }; payload: ItAssetDashboardPayload }>(response);
};

export const importAssetRegisterFile = async (file: File) => {
  const csvText = await file.text();
  const response = await fetch('/api/it-support/asset-management', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'import-register', csvText }),
  });
  return parse<{ result: { imported: number; updated: number; skipped: number; maintenanceCreated: number; errors: string[] }; payload: ItAssetDashboardPayload }>(response);
};

export const postAssetManagementAction = async <T>(body: Record<string, unknown>) => {
  const response = await fetch('/api/it-support/asset-management', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parse<T>(response);
};
