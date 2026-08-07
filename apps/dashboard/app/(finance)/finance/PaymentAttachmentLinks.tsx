'use client';

import { Download, Eye, Paperclip } from 'lucide-react';

export type PaymentAttachmentLinkFile = {
  id?: string;
  fileName: string;
  originalName?: string;
  mimeType?: string;
  kind?: string;
};

const attachmentHref = (
  requestId: string,
  file: PaymentAttachmentLinkFile,
  mode: 'view' | 'download',
) => {
  const params = new URLSearchParams({
    requestId,
    fileName: file.fileName,
  });
  if (mode === 'view') params.set('view', '1');
  return `/api/finance/payment-requests/attachments?${params.toString()}`;
};

const canPreview = (file: PaymentAttachmentLinkFile) => {
  const mime = String(file.mimeType || '').toLowerCase();
  const name = String(file.originalName || file.fileName || '').toLowerCase();
  if (mime.startsWith('image/') || mime === 'application/pdf' || mime === 'text/plain') return true;
  return /\.(pdf|png|jpe?g|gif|webp|txt)$/i.test(name);
};

type Props = {
  requestId: string;
  files: PaymentAttachmentLinkFile[];
  emptyLabel?: string;
  tone?: string;
};

export default function PaymentAttachmentLinks({
  requestId,
  files,
  emptyLabel = 'No documents attached.',
  tone = 'border-slate-200 bg-slate-50',
}: Props) {
  if (!files.length) {
    return <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-2">
      {files.map((file) => {
        const label = file.originalName || file.fileName;
        const preview = canPreview(file);
        return (
          <li
            key={file.id || file.fileName}
            className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm ${tone}`}
          >
            <span className="inline-flex min-w-0 items-center gap-2 font-medium text-slate-800">
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="truncate">{label}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {preview ? (
                <a
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#008FD5] hover:underline"
                  href={attachmentHref(requestId, file, 'view')}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Eye className="h-3.5 w-3.5" />
                  View
                </a>
              ) : null}
              <a
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#008FD5] hover:underline"
                href={attachmentHref(requestId, file, 'download')}
                target="_blank"
                rel="noreferrer"
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </a>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
