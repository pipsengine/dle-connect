import type {
  DirectoryEmployee,
  VisitorArtifact,
  VisitorTimelineEvent,
  VisitorVisit,
  VisitorVisitInput,
  VisitorWorkspace,
} from '@/lib/security/visitor-types';

const readJson = async <T>(response: Response): Promise<T> => {
  const body = await response.json().catch(() => null) as { status?: string; data?: T; error?: string } | null;
  if (!response.ok || body?.status === 'error') {
    throw new Error(body?.error || 'Visitor request failed.');
  }
  return body?.data as T;
};

export const loadVisitorWorkspace = async () => {
  const response = await fetch('/api/security/visitors', { credentials: 'same-origin', cache: 'no-store' });
  return readJson<VisitorWorkspace>(response);
};

export const searchVisitorEmployees = async (query: string, department = '') => {
  const params = new URLSearchParams({ resource: 'employees', q: query, department });
  const response = await fetch(`/api/security/visitors?${params.toString()}`, { credentials: 'same-origin', cache: 'no-store' });
  const data = await readJson<{ employees: DirectoryEmployee[] }>(response);
  return data.employees;
};

export const saveVisitorVisit = async (visit: VisitorVisitInput, event?: VisitorTimelineEvent) => {
  const response = await fetch('/api/security/visitors', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'save', visit, event }),
  });
  return readJson<VisitorVisit>(response);
};

export const patchVisitorVisit = async (id: string, patch: VisitorVisitInput, event?: VisitorTimelineEvent) => {
  const response = await fetch('/api/security/visitors', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'patch', id, patch, event }),
  });
  return readJson<VisitorVisit>(response);
};

export const removeVisitorVisit = async (id: string) => {
  const response = await fetch('/api/security/visitors', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete', id }),
  });
  return readJson<{ deleted: boolean }>(response);
};

export const saveVisitorArtifact = async (artifact: { id?: string; kind: string; name: string; payload?: Record<string, unknown> }) => {
  const response = await fetch('/api/security/visitors', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'save-artifact', artifact }),
  });
  return readJson<VisitorArtifact>(response);
};

export const removeVisitorArtifact = async (id: string) => {
  const response = await fetch('/api/security/visitors', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete-artifact', id }),
  });
  return readJson<{ deleted: boolean }>(response);
};
