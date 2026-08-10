import { access, constants, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const compact = (value: unknown) => String(value || '').trim();
const norm = (value: string) => value.replace(/\\/g, '/');

/**
 * Durable payment-attachment storage.
 *
 * Canonical location (survives IIS republish of deployment/iis/site):
 *   {repoRoot}/data/finance/payment-attachments/<requestId>/<file>
 *
 * On the live server that is:
 *   F:\Dorman-Long\dle-connect\data\finance\payment-attachments
 *
 * Nested apps/dashboard/data and deployment/iis/site/data are legacy / mirror
 * read paths only — they are wiped or replaced on publish.
 */
const isDashboardCwd = (cwd: string) => /\/apps\/dashboard$/i.test(norm(cwd));
const isIisSiteRoot = (cwd: string) => /\/deployment\/iis\/site$/i.test(norm(cwd));

export const resolveRepoRoot = (cwd = process.cwd()) => {
  const resolved = path.resolve(cwd);
  if (isDashboardCwd(resolved)) {
    const upTwo = path.resolve(resolved, '..', '..');
    // IIS package: .../deployment/iis/site/apps/dashboard → climb to repo root
    // site = .../deployment/iis/site → ../../.. = repo root
    if (isIisSiteRoot(upTwo)) return path.resolve(upTwo, '..', '..', '..');
    return upTwo;
  }
  // .../deployment/iis/site → ../../.. = repo root
  if (isIisSiteRoot(resolved)) return path.resolve(resolved, '..', '..', '..');
  return resolved;
};

export const resolveIisSiteRoot = (cwd = process.cwd()) => {
  const resolved = path.resolve(cwd);
  if (isDashboardCwd(resolved)) {
    const upTwo = path.resolve(resolved, '..', '..');
    if (isIisSiteRoot(upTwo)) return upTwo;
  }
  if (isIisSiteRoot(resolved)) return resolved;
  const packaged = path.join(resolveRepoRoot(resolved), 'deployment', 'iis', 'site');
  return packaged;
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
  const repoRoot = resolveRepoRoot(cwd);
  const siteRoot = resolveIisSiteRoot(cwd);

  // 1) Explicit override (preferred). Publish sets this to {repoRoot}/data/finance.
  if (process.env.DLE_FINANCE_DATA_DIR) {
    push(path.resolve(process.env.DLE_FINANCE_DATA_DIR));
  }

  // 2) Durable repo-root store — never wiped by IIS site republish.
  push(path.join(repoRoot, 'data', 'finance'));

  // 3) Legacy site package store (older deploys wrote here).
  push(path.join(siteRoot, 'data', 'finance'));

  // 4) Nested dashboard data (local-dev / pre-durable mirror).
  if (isDashboardCwd(cwd)) {
    push(path.join(cwd, 'data', 'finance'));
  } else {
    push(path.join(cwd, 'apps', 'dashboard', 'data', 'finance'));
    push(path.join(siteRoot, 'apps', 'dashboard', 'data', 'finance'));
  }

  // 5) Sibling of durable HRIS/auth roots when those point at site/data/*.
  for (const envKey of ['DLE_HRIS_DATA_DIR', 'DLE_AUTH_DATA_DIR'] as const) {
    const raw = compact(process.env[envKey]);
    if (!raw) continue;
    const resolved = path.resolve(raw);
    if (/[\\/]apps[\\/]dashboard[\\/]data[\\/]/i.test(norm(resolved))) {
      push(path.join(repoRoot, 'data', 'finance'));
    } else {
      push(path.join(path.dirname(resolved), 'finance'));
    }
  }

  return candidates;
};

export const resolveFinanceDataRoot = () =>
  resolveFinanceDataRootCandidates()[0] || path.join(resolveRepoRoot(), 'data', 'finance');

export const paymentAttachmentsRoot = () => path.join(resolveFinanceDataRoot(), 'payment-attachments');

export const paymentAttachmentRootCandidates = () =>
  resolveFinanceDataRootCandidates().map((root) => path.join(root, 'payment-attachments'));

export const safeAttachmentFileName = (fileName: string) =>
  String(fileName || 'attachment.bin').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'attachment.bin';

export const ensurePaymentAttachmentsStorage = async () => {
  const roots = paymentAttachmentRootCandidates();
  // Always ensure the durable primary root exists.
  if (roots[0]) await mkdir(roots[0], { recursive: true });
  // Best-effort mirrors.
  for (const root of roots.slice(1)) {
    try {
      await mkdir(root, { recursive: true });
    } catch {
      // ignore mirror mkdir failures
    }
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
      const verify = await readFile(target);
      if (verify.length !== bytes.length) {
        throw new Error(`Attachment verify failed at ${target}`);
      }
      written.push(target);
    } catch (error) {
      if (index === 0) {
        primaryError = error;
        break;
      }
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
    + `Checked: ${tried.slice(0, 6).join(' | ')}. `
    + 'Upload the file again if it was stored before the durable repo-root folder was configured.',
  );
};

export const describePaymentAttachmentStorage = () => ({
  primaryRoot: paymentAttachmentsRoot(),
  roots: paymentAttachmentRootCandidates(),
  financeDataDir: process.env.DLE_FINANCE_DATA_DIR || null,
  repoRoot: resolveRepoRoot(),
  cwd: process.cwd(),
});
