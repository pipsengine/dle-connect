/**
 * Resolve durable HRIS JSON data directories.
 * Prefer env / finance-sibling (repo-root data/hris) over the IIS package copy under apps/dashboard/data/hris,
 * which is often locked or read-only after publish (EPERM on write).
 */
import { chmod, mkdir, rename, unlink, writeFile, readFile, access } from 'node:fs/promises';
import { constants, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const compact = (value: unknown) => String(value || '').trim();

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const uniqueResolved = (paths: string[]) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of paths) {
    const value = compact(raw);
    if (!value) continue;
    const resolved = path.resolve(value);
    const key = resolved.replace(/\\/g, '/').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(resolved);
  }
  return out;
};

/** Candidate HRIS data directories, preferred first (durable before IIS package). */
export const resolveHrisDataDirCandidates = () => {
  const dashboardRoot = resolveDashboardRoot();
  const hrisEnv = compact(process.env.DLE_HRIS_DATA_DIR);
  const hrisEnvResolved = hrisEnv ? path.resolve(hrisEnv) : '';
  const financeEnv = compact(process.env.DLE_FINANCE_DATA_DIR);
  const financeSibling = financeEnv
    ? path.join(path.dirname(path.resolve(financeEnv)), 'hris')
    : '';
  const sitePackageHris = path.join(dashboardRoot, '..', '..', 'data', 'hris');
  const nestedPackageHris = path.join(dashboardRoot, 'data', 'hris');
  const cwdHris = path.join(process.cwd(), 'data', 'hris');

  const envLooksNested = /[\\/]apps[\\/]dashboard[\\/]data[\\/]hris$/i.test(hrisEnvResolved.replace(/\\/g, '/'));

  // Prefer durable roots first so Apply/payroll writes do not hit locked package files.
  const ordered: string[] = [];
  if (financeSibling) ordered.push(financeSibling);
  if (hrisEnvResolved && !envLooksNested) ordered.push(hrisEnvResolved);
  ordered.push(sitePackageHris);
  if (hrisEnvResolved && envLooksNested) ordered.push(hrisEnvResolved);
  ordered.push(nestedPackageHris, cwdHris);

  return uniqueResolved(ordered);
};

export const hrisDataFileCandidates = (fileName: string) =>
  resolveHrisDataDirCandidates().map((dir) => path.join(dir, fileName));

export const isStorageAccessError = (error: unknown) => {
  const code = (error as NodeJS.ErrnoException)?.code;
  return code === 'EPERM' || code === 'EACCES' || code === 'EROFS';
};

const clearReadOnlyBestEffort = async (filePath: string) => {
  try {
    if (!existsSync(filePath)) return;
    await chmod(filePath, 0o666);
  } catch {
    /* ignore */
  }
};

/**
 * Write UTF-8 JSON (or any text) to the first writable HRIS candidate path.
 * Uses temp+rename; clears read-only; falls through on EPERM/EACCES.
 */
export const writeHrisDataFile = async (fileName: string, contents: string, preferredPath?: string) => {
  const candidates = uniqueResolved([
    compact(preferredPath),
    ...hrisDataFileCandidates(fileName),
  ]);
  if (!candidates.length) {
    throw new Error(`No HRIS data path available for ${fileName}.`);
  }

  let lastError: unknown = null;
  for (const target of candidates) {
    const dir = path.dirname(target);
    const temp = path.join(dir, `.${path.basename(target)}.${process.pid}.${Date.now()}.tmp`);
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(temp, contents, 'utf8');
      await clearReadOnlyBestEffort(target);
      try {
        await unlink(target);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException)?.code;
        if (code !== 'ENOENT') {
          if (isStorageAccessError(error)) throw error;
        }
      }
      await rename(temp, target);
      return target;
    } catch (error) {
      lastError = error;
      try {
        await unlink(temp);
      } catch {
        /* ignore */
      }
      if (!isStorageAccessError(error)) {
        // Non-permission failures (disk full, etc.) should not silently skip.
        const code = (error as NodeJS.ErrnoException)?.code;
        if (code && code !== 'ENOENT') {
          // Keep trying other roots for rename races; otherwise rethrow unusual errors after loop.
        }
      }
      continue;
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError || 'unknown error');
  throw new Error(`Unable to write ${fileName} under a writable HRIS data directory: ${detail}`);
};

/** Read the first existing candidate; prefer newest mtime when several exist. */
export const readHrisDataFile = async (fileName: string, preferredPath?: string) => {
  const candidates = uniqueResolved([
    compact(preferredPath),
    ...hrisDataFileCandidates(fileName),
  ]);
  let best: { path: string; mtime: number; text: string } | null = null;
  let lastAccessError: unknown = null;

  for (const candidate of candidates) {
    try {
      await access(candidate, constants.R_OK);
      const text = await readFile(candidate, 'utf8');
      const mtime = existsSync(candidate) ? (statSync(candidate) as { mtimeMs: number }).mtimeMs : 0;
      if (!best || mtime >= best.mtime) {
        best = { path: candidate, mtime, text };
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT') continue;
      if (isStorageAccessError(error)) {
        lastAccessError = error;
        continue;
      }
      throw error;
    }
  }

  if (best) return best;
  if (lastAccessError) {
    console.warn(`[hris-data] Unable to read ${fileName}; continuing empty.`, lastAccessError);
  }
  return null;
};

export const hrisDataFileMtime = (fileName: string, preferredPath?: string) => {
  const candidates = uniqueResolved([
    compact(preferredPath),
    ...hrisDataFileCandidates(fileName),
  ]);
  let best = 0;
  for (const candidate of candidates) {
    try {
      if (!existsSync(candidate)) continue;
      best = Math.max(best, (statSync(candidate) as { mtimeMs: number }).mtimeMs || 0);
    } catch {
      /* ignore */
    }
  }
  return best;
};

export const resolvePreferredHrisDataFile = (fileName: string, preferredPath?: string) =>
  uniqueResolved([compact(preferredPath), ...hrisDataFileCandidates(fileName)])[0] || '';
