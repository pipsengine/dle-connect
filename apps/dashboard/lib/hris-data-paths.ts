/**
 * Resolve durable HRIS JSON data directories.
 * Prefer repo-root data/hris (sibling of finance) over IIS package copies under
 * deployment/.../site which are often locked or read-only after publish (EPERM).
 */
import { chmod, mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { constants, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const compact = (value: unknown) => String(value || '').trim();

const normalizePathKey = (value: string) => value.replace(/\\/g, '/').toLowerCase();

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
    const key = normalizePathKey(resolved);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(resolved);
  }
  return out;
};

/** True when path sits inside the deployed IIS site package (wiped/locked on publish). */
export const isIisPackageDataPath = (value: string) => {
  const normalized = normalizePathKey(path.resolve(value));
  return /\/deployment\/[^/]+\/site(\/|$)/.test(normalized)
    || /\/apps\/dashboard\/data\/hris(\/|$)/.test(normalized);
};

/**
 * Walk up from the running app to the git/repo root that owns durable `data/`
 * (e.g. F:\Dorman-Long\dle-connect), skipping deployment/.../site packages.
 */
export const resolveRepoRoot = () => {
  let dir = path.resolve(process.cwd());
  for (let i = 0; i < 12; i += 1) {
    const normalized = normalizePathKey(dir);
    const inSitePackage = /\/deployment\/[^/]+\/site(\/|$)/.test(normalized);
    if (!inSitePackage) {
      const hasDeployment = existsSync(path.join(dir, 'deployment'));
      const hasData = existsSync(path.join(dir, 'data'));
      const hasAppsDashboard = existsSync(path.join(dir, 'apps', 'dashboard'));
      if (hasDeployment && (hasData || hasAppsDashboard)) return dir;
    }
    if (/\/deployment$/i.test(normalized)) {
      const parent = path.dirname(dir);
      if (existsSync(path.join(parent, 'data')) || existsSync(path.join(parent, 'apps'))) return parent;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return '';
};

export const resolveDurableHrisDataDir = () => {
  const repoRoot = resolveRepoRoot();
  if (repoRoot) return path.join(repoRoot, 'data', 'hris');
  const programData = compact(process.env.PROGRAMDATA);
  if (programData) return path.join(programData, 'DLE-Connect', 'hris');
  return '';
};

/** Candidate HRIS data directories for reads (durable first, package last). */
export const resolveHrisDataDirCandidates = () => {
  const dashboardRoot = resolveDashboardRoot();
  const durable = resolveDurableHrisDataDir();
  const hrisEnv = compact(process.env.DLE_HRIS_DATA_DIR);
  const hrisEnvResolved = hrisEnv ? path.resolve(hrisEnv) : '';
  const financeEnv = compact(process.env.DLE_FINANCE_DATA_DIR);
  const financeSibling = financeEnv
    ? path.join(path.dirname(path.resolve(financeEnv)), 'hris')
    : '';
  const sitePackageHris = path.join(dashboardRoot, '..', '..', 'data', 'hris');
  const nestedPackageHris = path.join(dashboardRoot, 'data', 'hris');
  const cwdHris = path.join(process.cwd(), 'data', 'hris');
  const programData = compact(process.env.PROGRAMDATA)
    ? path.join(process.env.PROGRAMDATA as string, 'DLE-Connect', 'hris')
    : '';

  return uniqueResolved([
    durable,
    financeSibling && !isIisPackageDataPath(financeSibling) ? financeSibling : '',
    hrisEnvResolved && !isIisPackageDataPath(hrisEnvResolved) ? hrisEnvResolved : '',
    programData,
    sitePackageHris,
    hrisEnvResolved,
    nestedPackageHris,
    cwdHris,
  ]);
};

/** Write targets only — never the locked apps/dashboard/data/hris package copy. */
export const resolveHrisDataWriteDirCandidates = () => {
  const durable = resolveDurableHrisDataDir();
  const programData = compact(process.env.PROGRAMDATA)
    ? path.join(process.env.PROGRAMDATA as string, 'DLE-Connect', 'hris')
    : '';
  const financeEnv = compact(process.env.DLE_FINANCE_DATA_DIR);
  const financeSibling = financeEnv
    ? path.join(path.dirname(path.resolve(financeEnv)), 'hris')
    : '';
  const hrisEnv = compact(process.env.DLE_HRIS_DATA_DIR);
  const hrisEnvResolved = hrisEnv ? path.resolve(hrisEnv) : '';

  return uniqueResolved([
    durable,
    financeSibling && !isIisPackageDataPath(financeSibling) ? financeSibling : '',
    hrisEnvResolved && !isIisPackageDataPath(hrisEnvResolved) ? hrisEnvResolved : '',
    programData,
  ]).filter(Boolean);
};

export const hrisDataFileCandidates = (fileName: string) =>
  resolveHrisDataDirCandidates().map((dir) => path.join(dir, fileName));

export const hrisDataWriteFileCandidates = (fileName: string) =>
  resolveHrisDataWriteDirCandidates().map((dir) => path.join(dir, fileName));

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
 * Write UTF-8 text to the first writable durable HRIS path.
 * Overwrites in place (no unlink/rename) to avoid Windows EPERM on locked package files.
 */
export const writeHrisDataFile = async (fileName: string, contents: string, preferredPath?: string) => {
  const preferred = compact(preferredPath);
  const candidates = uniqueResolved([
    preferred && !isIisPackageDataPath(preferred) ? preferred : '',
    ...hrisDataWriteFileCandidates(fileName),
    // Last resort: allow preferred even if nested, then any remaining write dirs.
    preferred,
  ]).filter(Boolean);

  if (!candidates.length) {
    throw new Error(`No durable HRIS data path available for ${fileName}.`);
  }

  const attempted: string[] = [];
  let lastError: unknown = null;

  for (const target of candidates) {
    attempted.push(target);
    try {
      await mkdir(path.dirname(target), { recursive: true });
      await clearReadOnlyBestEffort(target);
      // Direct overwrite — unlink+rename fails with EPERM on IIS package files.
      await writeFile(target, contents, 'utf8');
      return target;
    } catch (error) {
      lastError = error;
      continue;
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError || 'unknown error');
  throw new Error(
    `Unable to write ${fileName} under a writable HRIS data directory (tried: ${attempted.join(' | ')}): ${detail}`,
  );
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

export const resolvePreferredHrisDataFile = (fileName: string, preferredPath?: string) => {
  const preferred = compact(preferredPath);
  if (preferred && !isIisPackageDataPath(preferred)) return path.resolve(preferred);
  return hrisDataWriteFileCandidates(fileName)[0]
    || uniqueResolved([preferred, ...hrisDataFileCandidates(fileName)])[0]
    || '';
};
