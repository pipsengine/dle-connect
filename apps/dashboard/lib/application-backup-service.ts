import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseRetentionDays } from '@/lib/backup-schedule';

const resolveDashboardRoot = () => {
  if (process.env.DLE_DASHBOARD_ROOT) return path.resolve(process.env.DLE_DASHBOARD_ROOT);
  if (process.env.DLE_AUTH_DATA_DIR) return path.dirname(path.dirname(process.env.DLE_AUTH_DATA_DIR));
  const cwd = process.cwd();
  if (path.basename(cwd).toLowerCase() === 'site') return cwd;
  if (path.basename(cwd).toLowerCase() === 'dashboard') return cwd;
  return path.join(cwd, 'apps', 'dashboard');
};

const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

const existingDir = async (candidate: string) => {
  try {
    const info = await stat(candidate);
    return info.isDirectory() ? candidate : null;
  } catch {
    return null;
  }
};

const resolveSources = async (kind: 'application' | 'document' | 'configuration' | 'snapshot') => {
  const root = resolveDashboardRoot();
  const authDir = process.env.DLE_AUTH_DATA_DIR
    ? path.resolve(process.env.DLE_AUTH_DATA_DIR)
    : path.join(root, 'data', 'auth');
  const hrisDir = process.env.DLE_HRIS_DATA_DIR
    ? path.resolve(process.env.DLE_HRIS_DATA_DIR)
    : path.join(root, 'data', 'hris');
  const dataRoot = path.join(root, 'data');
  const runtimeData = path.basename(root).toLowerCase() === 'site'
    ? path.join(path.dirname(root), 'runtime-data')
    : path.join(root, 'runtime-data');

  const sources: Array<{ label: string; path: string }> = [];
  const pushIfExists = async (label: string, candidate: string) => {
    const found = await existingDir(candidate);
    if (found) sources.push({ label, path: found });
  };

  if (kind === 'configuration' || kind === 'snapshot' || kind === 'application') {
    await pushIfExists('auth', authDir);
  }
  if (kind === 'application' || kind === 'document' || kind === 'snapshot') {
    await pushIfExists('hris', hrisDir);
  }
  if (kind === 'document' || kind === 'snapshot') {
    await pushIfExists('documents', path.join(dataRoot, 'documents'));
    await pushIfExists('uploads', path.join(dataRoot, 'uploads'));
    await pushIfExists('files', path.join(dataRoot, 'files'));
  }
  if (kind === 'snapshot') {
    await pushIfExists('data', dataRoot);
    await pushIfExists('runtime-data', runtimeData);
  }
  if (kind === 'configuration') {
    await pushIfExists('config', path.join(root, 'config'));
  }

  // De-duplicate by absolute path.
  const seen = new Set<string>();
  return sources.filter((item) => {
    const key = path.resolve(item.path).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const applicationBackupDirectory = (primaryLocation: string, kind: string) => {
  const base = primaryLocation.trim().replace(/[\\/]+$/, '');
  const folder = kind.replace(/[^a-z0-9_-]+/gi, '_');
  return `${base}\\Application\\${folder}`;
};

export const runApplicationFileBackup = async (options: {
  primaryLocation: string;
  kind: 'application' | 'document' | 'configuration' | 'snapshot';
  retention: string;
}) => {
  const sources = await resolveSources(options.kind);
  if (!sources.length) {
    throw new Error(`No local ${options.kind} data directories found to back up.`);
  }

  const rootDir = applicationBackupDirectory(options.primaryLocation, options.kind);
  const targetDir = path.join(rootDir, stamp());
  await mkdir(targetDir, { recursive: true });

  const copied: string[] = [];
  for (const source of sources) {
    const destination = path.join(targetDir, source.label);
    await cp(source.path, destination, {
      recursive: true,
      force: true,
      filter: (src) => {
        const name = path.basename(src).toLowerCase();
        if (name === 'node_modules' || name === '.next' || name === '.git') return false;
        return true;
      },
    });
    copied.push(source.label);
  }

  const days = parseRetentionDays(options.retention);
  if (days && days > 0) {
    try {
      const entries = await readdir(rootDir, { withFileTypes: true });
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      await Promise.all(entries.map(async (entry) => {
        if (!entry.isDirectory()) return;
        const full = path.join(rootDir, entry.name);
        try {
          const info = await stat(full);
          if (info.mtimeMs < cutoff) await rm(full, { recursive: true, force: true });
        } catch {
          // ignore retention cleanup errors
        }
      }));
    } catch {
      // ignore
    }
  }

  return {
    targetDir,
    copied,
    message: `${options.kind} backup wrote ${copied.join(', ')} to ${targetDir}`,
  };
};
