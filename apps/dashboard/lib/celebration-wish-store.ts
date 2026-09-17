import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  celebrationEmployeeKey,
  codesMatch,
  normalizeEmployeeCode,
  todayIsoLocal,
  type CelebrationKind,
  type CelebrationMoment,
} from '@/lib/celebration-moments';

export type CelebrationWish = {
  wishId: string;
  celebrationDate: string;
  honoreeCode: string;
  honoreeKind: CelebrationKind;
  honoreeName: string;
  authorCode: string;
  authorName: string;
  message: string;
  createdAt: string;
  updatedAt?: string;
};

export type CelebrationSendLedger = {
  date: string;
  honoreeKeys: string[];
  recipientEmailsSent: string[];
  sentCount: number;
  failedCount: number;
  completedAt?: string;
  lastError?: string;
};

type CelebrationStoreFile = {
  schemaVersion: number;
  wishes: CelebrationWish[];
  sendLedger: CelebrationSendLedger[];
};

const compact = (value: unknown) => String(value || '').trim();
const nowIso = () => new Date().toISOString();
const MAX_MESSAGE = 400;
const MAX_LEDGER_DAYS = 400;
const MAX_WISH_DAYS = 400;

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  return /[\\/]apps[\\/]dashboard$/i.test(cwd) ? cwd : path.join(cwd, 'apps', 'dashboard');
};

const storePath = () => {
  const override = compact(process.env.DLE_CELEBRATIONS_PATH);
  if (override) return override;
  return path.join(
    process.env.DLE_HRIS_DATA_DIR || path.join(resolveDashboardRoot(), 'data', 'enterprise'),
    'celebrations.json',
  );
};

let writeChain: Promise<unknown> = Promise.resolve();

const withStoreLock = async <T>(fn: () => Promise<T>) => {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(() => undefined, () => undefined);
  return run;
};

const emptyStore = (): CelebrationStoreFile => ({ schemaVersion: 1, wishes: [], sendLedger: [] });

const readStore = async (): Promise<CelebrationStoreFile> => {
  try {
    const parsed = JSON.parse(await readFile(storePath(), 'utf8')) as CelebrationStoreFile;
    return {
      schemaVersion: Number(parsed.schemaVersion || 1),
      wishes: Array.isArray(parsed.wishes) ? parsed.wishes : [],
      sendLedger: Array.isArray(parsed.sendLedger) ? parsed.sendLedger : [],
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return emptyStore();
    throw error;
  }
};

const pruneStore = (store: CelebrationStoreFile, today = todayIsoLocal()): CelebrationStoreFile => {
  const cutoff = new Date(`${today}T00:00:00`);
  cutoff.setDate(cutoff.getDate() - MAX_WISH_DAYS);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  return {
    schemaVersion: 1,
    wishes: store.wishes.filter((item) => compact(item.celebrationDate) >= cutoffIso),
    sendLedger: store.sendLedger
      .filter((item) => compact(item.date) >= cutoffIso)
      .slice(-MAX_LEDGER_DAYS),
  };
};

const writeStore = async (store: CelebrationStoreFile) => {
  const target = storePath();
  await mkdir(path.dirname(target), { recursive: true });
  const pruned = pruneStore(store);
  await writeFile(target, `${JSON.stringify(pruned, null, 2)}\n`, 'utf8');
  return pruned;
};

export const listCelebrationWishesForDate = async (date = todayIsoLocal(), honoreeCode?: string, kind?: CelebrationKind) => {
  const store = await readStore();
  const day = compact(date).slice(0, 10);
  const code = normalizeEmployeeCode(honoreeCode);
  return store.wishes
    .filter((item) => item.celebrationDate === day)
    .filter((item) => !code || codesMatch(item.honoreeCode, code))
    .filter((item) => !kind || item.honoreeKind === kind)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
};

export const upsertCelebrationWish = async (input: {
  celebrationDate: string;
  honoree: Pick<CelebrationMoment, 'employeeCode' | 'employeeId' | 'fullName' | 'kind'>;
  authorCode: string;
  authorName: string;
  message: string;
}) => withStoreLock(async () => {
  const message = compact(input.message).replace(/\s+/g, ' ');
  if (message.length < 3) throw new Error('Please write a short wish before sending.');
  if (message.length > MAX_MESSAGE) throw new Error(`Wishes must be ${MAX_MESSAGE} characters or fewer.`);
  const authorCode = normalizeEmployeeCode(input.authorCode);
  const honoreeCode = normalizeEmployeeCode(input.honoree.employeeCode || input.honoree.employeeId);
  if (!authorCode) throw new Error('Your employee profile is not linked.');
  if (!honoreeCode) throw new Error('This celebration could not be found.');
  if (codesMatch(authorCode, honoreeCode)) throw new Error('You cannot post a wish on your own celebration.');
  const celebrationDate = compact(input.celebrationDate).slice(0, 10) || todayIsoLocal();
  const store = await readStore();
  const existing = store.wishes.find((item) =>
    item.celebrationDate === celebrationDate
    && item.honoreeKind === input.honoree.kind
    && codesMatch(item.honoreeCode, honoreeCode)
    && codesMatch(item.authorCode, authorCode),
  );
  const now = nowIso();
  if (existing) {
    existing.message = message;
    existing.updatedAt = now;
    existing.authorName = compact(input.authorName) || existing.authorName;
    await writeStore(store);
    return existing;
  }
  const wish: CelebrationWish = {
    wishId: `wish-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    celebrationDate,
    honoreeCode,
    honoreeKind: input.honoree.kind,
    honoreeName: compact(input.honoree.fullName),
    authorCode,
    authorName: compact(input.authorName) || 'Colleague',
    message,
    createdAt: now,
  };
  store.wishes.push(wish);
  await writeStore(store);
  return wish;
});

export const readCelebrationSendLedger = async (date = todayIsoLocal()) => {
  const store = await readStore();
  return store.sendLedger.find((item) => item.date === date) || null;
};

export const beginCelebrationSendDay = async (input: {
  date: string;
  honoreeKeys: string[];
}) => withStoreLock(async () => {
  const store = await readStore();
  const existing = store.sendLedger.find((item) => item.date === input.date);
  if (existing) return existing;
  const ledger: CelebrationSendLedger = {
    date: input.date,
    honoreeKeys: [...input.honoreeKeys],
    recipientEmailsSent: [],
    sentCount: 0,
    failedCount: 0,
  };
  store.sendLedger.push(ledger);
  await writeStore(store);
  return ledger;
});

export const recordCelebrationSendProgress = async (input: {
  date: string;
  sentEmails?: string[];
  sentDelta?: number;
  failedDelta?: number;
  completed?: boolean;
  lastError?: string;
}) => withStoreLock(async () => {
  const store = await readStore();
  let ledger = store.sendLedger.find((item) => item.date === input.date);
  if (!ledger) {
    ledger = {
      date: input.date,
      honoreeKeys: [],
      recipientEmailsSent: [],
      sentCount: 0,
      failedCount: 0,
    };
    store.sendLedger.push(ledger);
  }
  const extra = (input.sentEmails || []).map((email) => compact(email).toLowerCase()).filter(Boolean);
  const seen = new Set(ledger.recipientEmailsSent.map((email) => email.toLowerCase()));
  for (const email of extra) {
    if (!seen.has(email)) {
      ledger.recipientEmailsSent.push(email);
      seen.add(email);
    }
  }
  ledger.sentCount += Math.max(0, input.sentDelta || 0);
  ledger.failedCount += Math.max(0, input.failedDelta || 0);
  if (input.lastError) ledger.lastError = input.lastError;
  if (input.completed) ledger.completedAt = nowIso();
  await writeStore(store);
  return ledger;
});

export const remainingCelebrationRecipients = (ledger: CelebrationSendLedger | null, emails: string[]) => {
  const sent = new Set((ledger?.recipientEmailsSent || []).map((email) => email.toLowerCase()));
  return emails.filter((email) => !sent.has(email.toLowerCase()));
};

export const honoreeKeysForMoments = (moments: CelebrationMoment[]) =>
  moments.map((item) => celebrationEmployeeKey(item));
