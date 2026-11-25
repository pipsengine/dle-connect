'use client';

import { useEffect, useState } from 'react';
import {
  emptyPaymentPosition,
  ledgerFromPosition,
  type ProjectPaymentPosition,
} from '@/lib/projects-engineering/payment-cost';

type Payload = {
  status?: string;
  data?: { projects?: ProjectPaymentPosition[] };
};

let cache: { at: number; map: Map<string, ProjectPaymentPosition> } | null = null;
let inflight: Promise<Map<string, ProjectPaymentPosition>> | null = null;
let subscribers = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<(map: Map<string, ProjectPaymentPosition>) => void>();

const load = async (force = false) => {
  if (!force && cache && Date.now() - cache.at < 15_000) return cache.map;
  if (!force && inflight) return inflight;
  const run = fetch('/api/projects-engineering/cost-control/payments', { cache: 'no-store', credentials: 'same-origin' })
    .then(async (res) => {
      const json = (await res.json()) as Payload;
      if (!res.ok || json.status !== 'success') throw new Error('Unable to load project payments');
      const map = new Map<string, ProjectPaymentPosition>();
      for (const row of json.data?.projects || []) {
        if (row?.projectCode) map.set(String(row.projectCode).toUpperCase(), row);
      }
      cache = { at: Date.now(), map };
      listeners.forEach((listener) => listener(map));
      return map;
    })
    .finally(() => {
      if (inflight === run) inflight = null;
    });
  inflight = run;
  return run;
};

export function useProjectPaymentMap() {
  const [map, setMap] = useState<Map<string, ProjectPaymentPosition>>(() => cache?.map || new Map());
  const [ready, setReady] = useState(Boolean(cache));

  useEffect(() => {
    const listener = (next: Map<string, ProjectPaymentPosition>) => {
      setMap(next);
      setReady(true);
    };
    listeners.add(listener);
    subscribers += 1;
    if (!pollTimer) pollTimer = setInterval(() => { void load(true); }, 30_000);
    let cancelled = false;
    load(false)
      .then((next) => {
        if (!cancelled) listener(next);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
      listeners.delete(listener);
      subscribers -= 1;
      if (subscribers <= 0 && pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
        subscribers = 0;
      }
    };
  }, []);

  return { ready, map };
}

export function useProjectPaymentPosition(projectCode?: string | null) {
  const code = String(projectCode || '').trim().toUpperCase();
  const { ready, map } = useProjectPaymentMap();
  const position = (code && map.get(code)) || emptyPaymentPosition(code);
  return {
    ready,
    position,
    ledger: ready ? ledgerFromPosition(position) : undefined,
    lines: position.lines,
  };
}
