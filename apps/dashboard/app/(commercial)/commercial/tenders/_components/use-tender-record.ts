'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { TenderApproval, TenderAward, TenderDocument, TenderItem, TenderLine, TenderOpportunity, TenderSubmission } from '@/lib/commercial/tender-types';
import { tenderGet } from './tender-api';

export type TenderDetail = {
  opportunity: TenderOpportunity;
  documents: TenderDocument[];
  lines: TenderLine[];
  approvals: TenderApproval[];
  submissions: TenderSubmission[];
  awards: TenderAward[];
  items: TenderItem[];
  audit: Array<{ id: number; action: string; actor: string; details: string; createdAt: string }>;
};

export function useTenderRecord() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<TenderOpportunity[]>([]);
  const [detail, setDetail] = useState<TenderDetail | null>(null);
  const [selectedId, setSelectedId] = useState(searchParams.get('id') || '');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);

  const loadList = useCallback(async () => {
    const opportunities = await tenderGet<TenderOpportunity[]>('opportunities');
    setRows(opportunities);
    setSelectedId((current) => current || searchParams.get('id') || opportunities[0]?.id || '');
  }, [searchParams]);

  const loadDetail = useCallback(async (id: string) => {
    if (!id) {
      setDetail(null);
      return;
    }
    setDetail(await tenderGet<TenderDetail>('opportunity', { id }));
  }, []);

  const reload = useCallback(async () => {
    await loadList();
    if (selectedId) await loadDetail(selectedId);
  }, [loadDetail, loadList, selectedId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadList()
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to read the register.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loadList]);

  useEffect(() => {
    const requested = searchParams.get('id') || '';
    if (requested) setSelectedId(requested);
  }, [searchParams]);

  useEffect(() => {
    if (!selectedId) return;
    loadDetail(selectedId).catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to open this opportunity.'));
  }, [loadDetail, selectedId]);

  return { rows, detail, opportunity: detail?.opportunity, selectedId, setSelectedId, error, setError, notice, setNotice, loading, reload, loadDetail };
}
