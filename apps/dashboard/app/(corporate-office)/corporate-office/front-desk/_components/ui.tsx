'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

export function PageHeader({
  icon,
  iconColor,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  iconColor: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconColor}`}>{icon}</span>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-950">{title}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

export function KPICard({
  title,
  value,
  subtitle,
  icon,
  color,
  onClick,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode;
  color: string;
  onClick?: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-indigo-200 hover:shadow">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
          <div className="mt-2 text-2xl font-bold text-slate-950">{value}</div>
          {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
        </div>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>{icon}</span>
      </div>
    </button>
  );
}

export function KPICardSkeleton() {
  return <div className="h-[108px] animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />;
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white py-16 text-sm text-slate-500">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600" />
      {label}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center">
      <span className="text-slate-300">{icon}</span>
      <h3 className="mt-3 text-base font-semibold text-slate-800">{title}</h3>
      {description ? <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p> : null}
      {action ? (
        <button type="button" onClick={action.onClick} className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

export function Modal({
  isOpen,
  onClose,
  title,
  size = 'md',
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);
  if (!isOpen) return null;
  const width = size === 'sm' ? 'max-w-md' : size === 'lg' ? 'max-w-4xl' : 'max-w-2xl';
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 p-4 sm:p-8">
      <button type="button" className="absolute inset-0" aria-label="Close dialog" onClick={onClose} />
      <div className={`relative z-10 w-full ${width} rounded-2xl bg-white p-5 shadow-xl`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100">Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDeleteModal({
  isOpen,
  onClose,
  itemLabel,
  onConfirm,
}: {
  isOpen: boolean;
  onClose: () => void;
  itemLabel: string;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Delete this item?" size="sm">
      <p className="text-sm text-slate-600">
        Delete <span className="font-medium text-slate-900">{itemLabel}</span> from the register? This removes the record and its documents from the database.
      </p>
      <div className="mt-5 flex justify-end gap-3">
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50">Cancel</button>
        <button
          type="button"
          onClick={() => {
            void Promise.resolve(onConfirm()).finally(onClose);
          }}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          Delete
        </button>
      </div>
    </Modal>
  );
}

type Toast = { id: string; message: string; tone: 'success' | 'error' };

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismissToast = (id: string) => setToasts((current) => current.filter((toast) => toast.id !== id));
  const addToast = (message: string, tone: Toast['tone'] = 'success') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => dismissToast(id), 4200);
  };
  return { toasts, addToast, dismissToast };
}

export function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[60] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => onDismiss(toast.id)}
          className={`rounded-xl px-4 py-3 text-left text-sm font-medium text-white shadow-lg ${toast.tone === 'error' ? 'bg-red-600' : 'bg-slate-900'}`}
        >
          {toast.message}
        </button>
      ))}
    </div>
  );
}
