import { access, constants, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const compact = (value: unknown) => String(value || '').trim();

/**
 * Durable payment-attachment storage.
 *
 * Canonical location (survives IIS republish):
 *   {siteRoot}/data/finance/payment-attachments/<requestId>/<file>
 *
 * Nested apps/dashboard/data is wiped/replaced on publish, so it is only a
 * secondary mirror / legacy read path.
 */
const isDashboardCwd = (cwd: string) => {
  const normalized = cwd.replace(/\\/g, '/');
  return /\/apps\/dashboard$/i.test(normalized);
};

const siteRootFromCwd = (cwd: string) => {
  if (isDashboardCwd(cwd)) return path.resolve(cwd, '..', '..');
  // IIS site root or repo root both expose apps/dashboard.
  if (path.basename(cwd).toLowerCase() === 'site') return cwd;
  return cwd;
};

export const resolveFinanceDataRootCandidates = (): string[] => {
  const candidates: string[] = [];
  const push = (value?: string | null) => {
    const next = compact(value);
    if (!next) return;
    const resolved = path.resolve(next);
    if (!candidates.includes(resolved)) candidates.push(resolved);
  };

  const cwd = process.cwd();
  const siteRoot = siteRootFromCwd(cwd);

  // 1) Explicit override (preferred).
  if (process.env.DLE_FINANCE_DATA_DIR) {
    push(path.resolve(process.env.DLE_FINANCE_DATA_DIR));
  }

  // 2) Durable site/repo root data/finance (publish-backed).
  push(path.join(siteRoot, 'data', 'finance'));

  // 3) Sibling of durable HRIS/auth roots when those point at site/data/*.
  for (const envKey of ['DLE_HRIS_DATA_DIR', 'DLE_AUTH_DATA_DIR'] as const) {
    const raw = compact(process.env[envKey]);
    if (!raw) continue;
    const resolved = path.resolve(raw);
    // If env is relative ".\data\hris" under apps/dashboard cwd, climb to site data.
    if (/[\\/]apps[\\/]dashboard[\\/]data[\\/]/i.test(resolved)) {
      push(path.join(siteRoot, 'data', 'finance'));
    } else {
      push(path.join(path.dirname(resolved), 'finance'));
    }
  }

  // 4) Nested dashboard data (legacy / local-dev mirror).
  if (isDashboardCwd(cwd)) {
    push(path.join(cwd, 'data', 'finance'));
  } else {
    push(path.join(cwd, 'apps', 'dashboard', 'data', 'finance'));
  }

  return candidates;
};

export const resolveFinanceDataRoot = () =>
  resolveFinanceDataRootCandidates()[0] || path.join(siteRootFromCwd(process.cwd()), 'data', 'finance');

export const paymentAttachmentsRoot = () => path.join(resolveFinanceDataRoot(), 'payment-attachments');

export const paymentAttachmentRootCandidates = () =>
  resolveFinanceDataRootCandidates().map((root) => path.join(root, 'payment-attachments'));

export const safeAttachmentFileName = (fileName: string) =>
  String(fileName || 'attachment.bin').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'attachment.bin';

export const ensurePaymentAttachmentsStorage = async () => {
  const roots = paymentAttachmentRootCandidates();
  for (const root of roots) {
    await mkdir(root, { recursive: true });
  }
  return roots[0];
};

const fileExists = async (target: string) => {
  try {
    await access(target, constants.R_OK);
    return true;
  } catch {
    return false;
  }
};

export const savePaymentAttachmentFile = async (
  requestId: string,
  fileName: string,
  bytes: Buffer,
) => {
  const safeRequestId = compact(requestId);
  const safeName = safeAttachmentFileName(fileName);
  if (!safeRequestId || !safeName || safeName.includes('..')) {
    throw new Error('Invalid attachment path.');
  }
  if (!bytes?.length) throw new Error('Attachment content is empty.');

  const roots = paymentAttachmentRootCandidates();
  if (!roots.length) throw new Error('No payment attachment storage root is configured.');

  await ensurePaymentAttachmentsStorage();

  const written: string[] = [];
  let primaryError: unknown = null;

  for (let index = 0; index < roots.length; index += 1) {
    const root = roots[index];
    const directory = path.join(root, safeRequestId);
    const target = path.join(directory, safeName);
    try {
      await mkdir(directory, { recursive: true });
      await writeFile(target, bytes);
      // Verify write landed before treating it as success.
      const verify = await readFile(target);
      if (verify.length !== bytes.length) {
        throw new Error(`Attachment verify failed at ${target}`);
      }
      written.push(target);
    } catch (error) {
      if (index === 0) primaryError = error;
      // Primary must succeed; mirrors are best-effort.
      if (index === 0) break;
    }
  }

  if (!written.length) {
    const detail = primaryError instanceof Error ? primaryError.message : 'unknown write error';
    throw new Error(`Unable to store payment attachment under ${roots[0]}: ${detail}`);
  }

  return {
    fileName: safeName,
    primaryPath: written[0],
    mirroredPaths: written.slice(1),
    roots,
  };
};

export const readPaymentAttachmentFile = async (requestId: string, fileName: string) => {
  const safeRequestId = compact(requestId);
  const safeName = safeAttachmentFileName(fileName);
  if (!safeRequestId || !safeName || safeName.includes('..')) {
    throw new Error('Invalid attachment path.');
  }

  const roots = paymentAttachmentRootCandidates();
  const tried: string[] = [];

  for (const root of roots) {
    const exact = path.join(root, safeRequestId, safeName);
    tried.push(exact);
    if (await fileExists(exact)) {
      return { bytes: await readFile(exact), fileName: safeName, path: exact };
    }

    const alt = path.join(root, safeRequestId, path.basename(fileName));
    if (!tried.includes(alt) && (await fileExists(alt))) {
      tried.push(alt);
      return { bytes: await readFile(alt), fileName: path.basename(alt), path: alt };
    }
  }

  // Fuzzy match inside each request folder (sanitized / original variants).
  const needle = safeName.toLowerCase();
  const originalNeedle = path.basename(fileName).toLowerCase();
  for (const root of roots) {
    const dir = path.join(root, safeRequestId);
    try {
      const entries = await readdir(dir);
      const match = entries.find((entry) => {
        const lower = entry.toLowerCase();
        return lower === needle
          || lower === originalNeedle
          || lower.endsWith(originalNeedle)
          || (originalNeedle.length > 8 && lower.includes(originalNeedle.slice(-24)));
      });
      if (match) {
        const target = path.join(dir, match);
        tried.push(target);
        return { bytes: await readFile(target), fileName: match, path: target };
      }
    } catch {
      // folder missing in this root
    }
  }

  throw new Error(
    `Attachment file not found for ${safeRequestId}/${safeName}. `
    + `Primary store: ${roots[0] || '(none)'}. `
    + `Checked: ${tried.slice(0, 4).join(' | ')}. `
    + 'If this request was uploaded before durable storage, re-upload the file.',
  );
};

export const describePaymentAttachmentStorage = () => ({
  primaryRoot: paymentAttachmentsRoot(),
  roots: paymentAttachmentRootCandidates(),
  financeDataDir: process.env.DLE_FINANCE_DATA_DIR || null,
  cwd: process.cwd(),
});
