import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveRepoRoot } from '@/lib/finance-intelligence/payment-attachment-storage';

export type PrAttachment = {
  id: string;
  name: string;
  size: number;
  contentType: string;
  storedName?: string;
  uploadedAt?: string;
};

const compact = (value: unknown) => String(value ?? '').trim();

export const safePrAttachmentName = (fileName: string) =>
  String(fileName || 'attachment.bin').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'attachment.bin';

const prAttachmentsRoot = () => path.join(resolveRepoRoot(), 'data', 'procurement', 'pr-attachments');

export const savePrAttachmentFile = async (prId: string, fileName: string, bytes: Buffer) => {
  const safeId = compact(prId).replace(/[^a-zA-Z0-9._-]/g, '_');
  const safeName = safePrAttachmentName(fileName);
  if (!safeId || safeName.includes('..')) throw new Error('Invalid attachment path.');
  if (!bytes?.length) throw new Error('Attachment content is empty.');
  const directory = path.join(prAttachmentsRoot(), safeId);
  await mkdir(directory, { recursive: true });
  const target = path.join(directory, safeName);
  await writeFile(target, bytes);
  return { fileName: safeName, path: target };
};

export const parsePrAttachments = (value: unknown): PrAttachment[] => {
  if (Array.isArray(value)) return value as PrAttachment[];
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as PrAttachment[]) : [];
  } catch {
    return [];
  }
};
