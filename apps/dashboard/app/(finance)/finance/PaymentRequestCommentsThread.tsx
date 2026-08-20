'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MessageSquare, Send, X } from 'lucide-react';
import type { PaymentRequestCommentRow } from '@/lib/finance-intelligence/payment-requests-service';

const fmtTime = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const codesEqual = (left?: string | null, right?: string | null) =>
  String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase()
  && Boolean(String(left || '').trim());

type Props = {
  open: boolean;
  onClose: () => void;
  requestId: string;
  requestNumber?: string;
  comments?: PaymentRequestCommentRow[];
  canComment?: boolean;
  actorCode?: string;
  onCommentsChange?: (comments: PaymentRequestCommentRow[]) => void;
};

export default function PaymentRequestCommentsThread({
  open,
  onClose,
  requestId,
  requestNumber,
  comments: commentsProp,
  canComment = false,
  actorCode,
  onCommentsChange,
}: Props) {
  const [comments, setComments] = useState<PaymentRequestCommentRow[]>(commentsProp || []);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [canType, setCanType] = useState(canComment);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const onCommentsChangeRef = useRef(onCommentsChange);
  onCommentsChangeRef.current = onCommentsChange;

  useEffect(() => {
    setCanType(canComment);
  }, [canComment]);

  useEffect(() => {
    if (commentsProp !== undefined) setComments(commentsProp);
  }, [commentsProp]);

  useEffect(() => {
    if (!open || !requestId) return;
    let cancelled = false;
    setMessage('');
    setLoading(true);
    void (async () => {
      try {
        const response = await fetch(`/api/finance/payment-requests?requestId=${encodeURIComponent(requestId)}`, {
          cache: 'no-store',
        });
        const json = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (response.ok && json.status === 'success') {
          if (Array.isArray(json.data?.comments)) {
            const next = json.data.comments as PaymentRequestCommentRow[];
            setComments(next);
            onCommentsChangeRef.current?.(next);
          }
          if (typeof json.data?.viewer?.canComment === 'boolean') {
            setCanType(Boolean(json.data.viewer.canComment));
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, requestId]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [open, comments.length, loading]);

  const sorted = useMemo(
    () => [...comments].sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt))),
    [comments],
  );

  const post = async () => {
    const body = draft.trim();
    if (!body) return;
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
      const json = await response.json().catch(() => ({ status: 'error', error: 'Unable to send.' }));
      if (!response.ok || json.status !== 'success') {
        throw new Error(json.error || 'Unable to send.');
      }
      const next = Array.isArray(json.data?.comments)
        ? (json.data.comments as PaymentRequestCommentRow[])
        : [...comments, json.data?.comment as PaymentRequestCommentRow].filter(Boolean);
      setComments(next);
      onCommentsChange?.(next);
      setDraft('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to send.');
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-end bg-slate-950/40 p-0 sm:p-5"
      onClick={onClose}
    >
      <div
        id="payment-comments"
        role="dialog"
        aria-modal="true"
        aria-label="Clarification chat"
        onClick={(event) => event.stopPropagation()}
        className="flex h-[min(100dvh,100%)] w-full flex-col bg-white shadow-2xl sm:h-[540px] sm:w-[400px] sm:rounded-2xl sm:border sm:border-slate-200"
      >
        <header className="flex items-center gap-3 bg-[#008FD5] px-4 py-3 text-white sm:rounded-t-2xl">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
            <MessageSquare className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{requestNumber || 'Payment request'}</p>
            <p className="truncate text-[11px] text-white/80">Clarification chat · does not change approval</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/90 hover:bg-white/15"
            aria-label="Close chat"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto bg-[#E8EEF4] px-3 py-3">
          {loading && !sorted.length ? (
            <div className="flex h-full items-center justify-center text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : sorted.length ? (
            sorted.map((item) => {
              const mine = codesEqual(item.actorCode, actorCode);
              return (
                <div key={item.commentId} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[82%] rounded-2xl px-3 py-2 shadow-sm ${
                    mine ? 'rounded-br-md bg-[#008FD5] text-white' : 'rounded-bl-md bg-white text-slate-800'
                  }`}>
                    <p className={`text-[10px] font-semibold ${mine ? 'text-white/80' : 'text-slate-500'}`}>
                      {mine ? 'You' : (item.actorName || 'Unknown')}
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm leading-5">{item.body}</p>
                    <p className={`mt-1 text-right text-[10px] ${mine ? 'text-white/70' : 'text-slate-400'}`}>
                      {fmtTime(item.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
              No messages yet. Ask a question here if you need clarification before approving.
            </div>
          )}
        </div>

        {canType ? (
          <div className="border-t border-slate-200 bg-white px-3 py-2 sm:rounded-b-2xl">
            {message ? <p className="mb-1 text-[11px] text-rose-600">{message}</p> : null}
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={1}
                maxLength={4000}
                placeholder="Type a message"
                className="max-h-28 min-h-[40px] flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-[#008FD5] focus:bg-white focus:ring-2 focus:ring-[#DBEAFE]"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void post();
                  }
                }}
              />
              <button
                type="button"
                disabled={busy || !draft.trim()}
                onClick={() => void post()}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#008FD5] text-white disabled:opacity-40"
                aria-label="Send"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1 text-[10px] text-slate-400">Enter to send · Shift+Enter for a new line</p>
          </div>
        ) : (
          <p className="border-t border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 sm:rounded-b-2xl">
            This chat is read-only. Only the initiator and current approver can send messages while the request is pending.
          </p>
        )}
      </div>
    </div>
  );
}
