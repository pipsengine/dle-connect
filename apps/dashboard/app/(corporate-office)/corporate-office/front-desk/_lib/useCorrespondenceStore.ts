'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Correspondence, CorrespondenceInput } from '@/lib/corporate-office/front-desk-types';

const endpoint = '/api/corporate-office/front-desk';

async function readJson(response: Response) {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || 'Front Desk request failed.');
  return json.data;
}

async function postJson(body: unknown) {
  const response = await fetch(endpoint, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return readJson(response);
}

async function postFiles(action: string, payload: unknown, files: Record<string, File>) {
  const form = new FormData();
  form.set('action', action);
  form.set('payload', JSON.stringify(payload));
  for (const [id, file] of Object.entries(files)) {
    form.append('files', file, `${id}::${file.name}`);
  }
  const response = await fetch(endpoint, { method: 'POST', credentials: 'same-origin', body: form });
  return readJson(response);
}

export function useCorrespondenceStore() {
  const [items, setItems] = useState<Correspondence[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    const response = await fetch(endpoint, { cache: 'no-store', credentials: 'same-origin' });
    const data = await readJson(response);
    setItems(Array.isArray(data) ? data : []);
    setError('');
  }, []);

  useEffect(() => {
    let active = true;
    reload()
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Could not load the correspondence register.');
      })
      .finally(() => {
        if (active) setIsLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [reload]);

  const addCorrespondence = useCallback(async (data: CorrespondenceInput, files: Record<string, File>) => {
    const created = await postFiles('create', { data }, files) as Correspondence;
    await reload();
    return created;
  }, [reload]);

  const updateCorrespondence = useCallback(async (
    id: string,
    data: CorrespondenceInput,
    files: Record<string, File>,
    removedAttachmentIds: string[],
  ) => {
    const updated = await postFiles('update', { id, data, removedAttachmentIds }, files) as Correspondence;
    await reload();
    return updated;
  }, [reload]);

  const closeCorrespondence = useCallback(async (id: string) => {
    const closed = await postJson({ action: 'close', id }) as Correspondence;
    await reload();
    return closed;
  }, [reload]);

  const deleteCorrespondence = useCallback(async (id: string) => {
    await postJson({ action: 'delete', id });
    await reload();
  }, [reload]);

  return { items, isLoaded, error, reload, addCorrespondence, updateCorrespondence, closeCorrespondence, deleteCorrespondence };
}

export function useCurrentUser() {
  const [name, setName] = useState('Signed-in user');
  useEffect(() => {
    let active = true;
    fetch('/api/auth/me', { cache: 'no-store', credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        if (!active) return;
        const next = json?.data?.fullName || json?.data?.username;
        if (next) setName(String(next));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return { name };
}
