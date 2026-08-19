'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MessageSquare, Send } from 'lucide-react';
import type { PaymentRequestCommentRow } from '@/lib/finance-intelligence/payment-requests-service';

const fmtDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const codesEqual = (left?: string | null, right?: string | null) =>
  String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase()
  && Boolean(String(left || '').trim());

type Props = {
  requestId: string;
  comments?: PaymentRequestCommentRow[];
  canComment?: boolean;
  actorCode?: string;
  onCommentsChange?: (comments: PaymentRequestCommentRow[]) => void;
};

export default function PaymentRequestCommentsThread({
  requestId,
  comments: commentsProp,
  canComment = false,
  actorCode,
  onCommentsChange,
}: Props) {
  const [comments, setComments] = useState<PaymentRequestCommentRow[]>(commentsProp || []);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(commentsProp === undefined);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (commentsProp !== undefined) {
      setComments(commentsProp);
      setLoading(false);
    }
  }, [commentsProp]);

  useEffect(() => {
    if (commentsProp !== undefined || !requestId) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/finance/payment-requests?requestId=${encodeURIComponent(requestId)}`, {
          cache: 'no-store',
        });
        const json = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (response.ok && json.status === 'success' && Array.isArray(json.data?.comments)) {
          setComments(json.data.comments as PaymentRequestCommentRow[]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [commentsProp, requestId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash !== '#payment-comments') return;
    window.setTimeout(() => {
      document.getElementById('payment-comments')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);
  }, [requestId]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [comments.length]);

  const sorted = useMemo(
    () => [...comments].sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt))),
    [comments],
  );

  const post = async () => {
    const body = draft.trim();
    if (!body) {
      setMessage('Enter a comment before sending.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/finance/payment-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'add-comment',
          requestId,
          comment: body,
        }),
      });
      const json = await response.json().catch(() => ({ status: 'error', error: 'Unable to post comment.' }));
      if (!response.ok || json.status !== 'success') {
        throw new Error(json.error || 'Unable to post comment.');
      }
      const next = Array.isArray(json.data?.comments)
        ? (json.data.comments as PaymentRequestCommentRow[])
        : [...comments, json.data?.comment as PaymentRequestCommentRow].filter(Boolean);
      setComments(next);
      onCommentsChange?.(next);
      setDraft('');
      setMessage('Comment sent. The other party is notified.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to post comment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="payment-comments" className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
            <MessageSquare className="h-4 w-4 text-[#008FD5]" />
            Clarification comments
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            The current approver and the initiator can chat here without returning or rejecting the request.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
          {sorted.length}
        </span>
      </div>

      <div ref={listRef} className="mt-3 max-h-72 space-y-2 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/70 p-3">
        {loading ? (
          <div className="flex items-center justify-center py-6 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : sorted.length ? (
          sorted.map((item) => {
            const mine = codesEqual(item.actorCode, actorCode);
            return (
              <div key={item.commentId} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                  mine ? 'bg-[#008FD5] text-white' : 'bg-white text-slate-800 shadow-sm'
                }`}>
                  <p className={`text-[11px] font-semibold ${mine ? 'text-white/80' : 'text-slate-500'}`}>
                    {mine ? 'You' : (item.actorName || 'Unknown')} · {fmtDate(item.createdAt)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-5">{item.body}</p>
                </div>
              </div>
            );
          })
        ) : (
          <p className="px-2 py-4 text-center text-sm text-slate-500">
            No comments yet. Ask a question here if you need clarification before approving.
          </p>
        )}
      </div>

      {canComment ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="Write a question or reply. This does not change the approval stage."
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#DBEAFE]"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                void post();
              }
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-slate-500">Ctrl+Enter to send. The other party is notified in-app and by email.</p>
            <button
              type="button"
              disabled={busy || !draft.trim()}
              onClick={() => void post()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#008FD5] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Send comment
            </button>
          </div>
          {message ? <p className="text-xs text-slate-600">{message}</p> : null}
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-500">
          Comments are read-only unless you are the initiator or the current approver on a pending request.
        </p>
      )}
    </section>
  );
}
