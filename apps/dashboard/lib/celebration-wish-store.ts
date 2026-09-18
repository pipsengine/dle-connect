import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
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

let celebrationSendSchemaPromise: Promise<boolean> | null = null;

const celebrationDb = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) return null;
  if (!celebrationSendSchemaPromise) {
    celebrationSendSchemaPromise = pool.request().query(`
IF SCHEMA_ID(N'hris') IS NULL EXEC(N'CREATE SCHEMA [hris]');
IF OBJECT_ID(N'[hris].[CelebrationSendDays]', N'U') IS NULL
CREATE TABLE [hris].[CelebrationSendDays] (
  [SendDate] DATE NOT NULL CONSTRAINT [PK_CelebrationSendDays] PRIMARY KEY,
  [HonoreeKeysJson] NVARCHAR(MAX) NOT NULL CONSTRAINT [DF_CelebrationSendDays_Honorees] DEFAULT N'[]',
  [SentCount] INT NOT NULL CONSTRAINT [DF_CelebrationSendDays_Sent] DEFAULT 0,
  [FailedCount] INT NOT NULL CONSTRAINT [DF_CelebrationSendDays_Failed] DEFAULT 0,
  [CompletedAt] DATETIME2(0) NULL,
  [LastError] NVARCHAR(600) NULL,
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_CelebrationSendDays_UpdatedAt] DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'[hris].[CelebrationSendRecipients]', N'U') IS NULL
CREATE TABLE [hris].[CelebrationSendRecipients] (
  [SendDate] DATE NOT NULL,
  [Email] NVARCHAR(320) NOT NULL,
  [Status] NVARCHAR(20) NOT NULL,
  [ClaimedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_CelebrationSendRecipients_ClaimedAt] DEFAULT SYSUTCDATETIME(),
  [SentAt] DATETIME2(0) NULL,
  CONSTRAINT [PK_CelebrationSendRecipients] PRIMARY KEY ([SendDate], [Email])
);
`).then(() => true).catch((error) => {
      celebrationSendSchemaPromise = null;
      console.warn('[celebration-email] Could not ensure send ledger tables.', error instanceof Error ? error.message : error);
      return false;
    });
  }
  const ready = await celebrationSendSchemaPromise;
  return ready ? pool : null;
};

const parseHonoreeKeys = (value: unknown) => {
  if (Array.isArray(value)) return value.map((item) => compact(item)).filter(Boolean);
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed.map((item) => compact(item)).filter(Boolean) : [];
  } catch {
    return [] as string[];
  }
};

const readSqlLedger = async (date: string): Promise<CelebrationSendLedger | null> => {
  const pool = await celebrationDb();
  if (!pool) return null;
  const day = compact(date).slice(0, 10);
  const header = await pool.request()
    .input('SendDate', sql.VarChar(10), day)
    .query(`SELECT * FROM [hris].[CelebrationSendDays] WHERE [SendDate]=CAST(@SendDate AS DATE)`);
  const row = header.recordset[0] as {
    HonoreeKeysJson?: string;
    SentCount?: number;
    FailedCount?: number;
    CompletedAt?: Date | string | null;
    LastError?: string | null;
  } | undefined;
  if (!row) return null;
  const recipients = await pool.request()
    .input('SendDate', sql.VarChar(10), day)
    .query(`SELECT [Email], [Status] FROM [hris].[CelebrationSendRecipients] WHERE [SendDate]=CAST(@SendDate AS DATE)`);
  const blocked = (recipients.recordset as Array<{ Email?: string; Status?: string }>)
    .filter((item) => {
      const status = compact(item.Status).toLowerCase();
      return status === 'sent' || status === 'claimed' || status === 'failed';
    })
    .map((item) => compact(item.Email).toLowerCase())
    .filter(Boolean);
  return {
    date: day,
    honoreeKeys: parseHonoreeKeys(row.HonoreeKeysJson),
    recipientEmailsSent: [...new Set(blocked)],
    sentCount: Number(row.SentCount || 0),
    failedCount: Number(row.FailedCount || 0),
    completedAt: row.CompletedAt ? new Date(row.CompletedAt).toISOString() : undefined,
    lastError: compact(row.LastError) || undefined,
  };
};

const upsertSqlDay = async (ledger: CelebrationSendLedger) => {
  const pool = await celebrationDb();
  if (!pool) return;
  await pool.request()
    .input('SendDate', sql.VarChar(10), ledger.date)
    .input('HonoreeKeysJson', sql.NVarChar(sql.MAX), JSON.stringify(ledger.honoreeKeys || []))
    .input('SentCount', sql.Int, ledger.sentCount || 0)
    .input('FailedCount', sql.Int, ledger.failedCount || 0)
    .input('CompletedAt', sql.DateTime2, ledger.completedAt ? new Date(ledger.completedAt) : null)
    .input('LastError', sql.NVarChar(600), ledger.lastError || null)
    .query(`
MERGE [hris].[CelebrationSendDays] AS target
USING (SELECT CAST(@SendDate AS DATE) AS [SendDate]) AS source
ON target.[SendDate]=source.[SendDate]
WHEN MATCHED THEN UPDATE SET
  [HonoreeKeysJson]=@HonoreeKeysJson,
  [SentCount]=@SentCount,
  [FailedCount]=@FailedCount,
  [CompletedAt]=@CompletedAt,
  [LastError]=@LastError,
  [UpdatedAt]=SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT ([SendDate],[HonoreeKeysJson],[SentCount],[FailedCount],[CompletedAt],[LastError])
VALUES (source.[SendDate],@HonoreeKeysJson,@SentCount,@FailedCount,@CompletedAt,@LastError);
`);
};

const mergeLedgers = (primary: CelebrationSendLedger | null, secondary: CelebrationSendLedger | null) => {
  if (!primary) return secondary;
  if (!secondary) return primary;
  const emails = [...new Set([
    ...(primary.recipientEmailsSent || []).map((email) => email.toLowerCase()),
    ...(secondary.recipientEmailsSent || []).map((email) => email.toLowerCase()),
  ].filter(Boolean))];
  return {
    date: primary.date,
    honoreeKeys: [...new Set([...(primary.honoreeKeys || []), ...(secondary.honoreeKeys || [])])],
    recipientEmailsSent: emails,
    sentCount: Math.max(primary.sentCount || 0, secondary.sentCount || 0, emails.length),
    failedCount: Math.max(primary.failedCount || 0, secondary.failedCount || 0),
    completedAt: primary.completedAt || secondary.completedAt,
    lastError: primary.lastError || secondary.lastError,
  };
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

const readJsonLedger = async (date: string) => {
  const store = await readStore();
  return store.sendLedger.find((item) => item.date === date) || null;
};

const markSqlRecipient = async (date: string, email: string, status: 'sent' | 'failed') => {
  const pool = await celebrationDb();
  if (!pool) return;
  const mailbox = compact(email).toLowerCase();
  if (!mailbox) return;
  await pool.request()
    .input('SendDate', sql.VarChar(10), date)
    .input('Email', sql.NVarChar(320), mailbox)
    .input('Status', sql.NVarChar(20), status)
    .query(`
MERGE [hris].[CelebrationSendRecipients] AS target
USING (SELECT CAST(@SendDate AS DATE) AS [SendDate], @Email AS [Email]) AS source
ON target.[SendDate] = source.[SendDate] AND target.[Email] = source.[Email]
WHEN MATCHED THEN UPDATE SET
  [Status] = @Status,
  [SentAt] = CASE WHEN @Status = N'sent' THEN SYSUTCDATETIME() ELSE [SentAt] END
WHEN NOT MATCHED THEN INSERT ([SendDate], [Email], [Status], [ClaimedAt], [SentAt])
VALUES (source.[SendDate], source.[Email], @Status, SYSUTCDATETIME(), CASE WHEN @Status = N'sent' THEN SYSUTCDATETIME() ELSE NULL END);
`);
};

const sqlClaimRecipient = async (date: string, email: string) => {
  const pool = await celebrationDb();
  if (!pool) return null;
  try {
    await pool.request()
      .input('SendDate', sql.VarChar(10), date)
      .input('Email', sql.NVarChar(320), email)
      .query(`
INSERT INTO [hris].[CelebrationSendRecipients] ([SendDate], [Email], [Status], [ClaimedAt])
VALUES (CAST(@SendDate AS DATE), @Email, N'claimed', SYSUTCDATETIME());
`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/primary key|duplicate|unique|violation/i.test(message)) return false;
    throw error;
  }
};

export const readCelebrationSendLedger = async (date = todayIsoLocal()) => {
  const day = compact(date).slice(0, 10);
  const [jsonLedger, sqlLedger] = await Promise.all([
    readJsonLedger(day),
    readSqlLedger(day).catch((error) => {
      console.warn('[celebration-email] Send ledger SQL read failed.', error instanceof Error ? error.message : error);
      return null;
    }),
  ]);
  return mergeLedgers(sqlLedger, jsonLedger);
};

export const beginCelebrationSendDay = async (input: {
  date: string;
  honoreeKeys: string[];
}) => {
  const day = compact(input.date).slice(0, 10);
  const existing = await readCelebrationSendLedger(day);
  if (existing) {
    if (!existing.honoreeKeys.length && input.honoreeKeys.length) {
      existing.honoreeKeys = [...input.honoreeKeys];
      await upsertSqlDay(existing).catch(() => undefined);
    }
    return existing;
  }
  const ledger: CelebrationSendLedger = {
    date: day,
    honoreeKeys: [...input.honoreeKeys],
    recipientEmailsSent: [],
    sentCount: 0,
    failedCount: 0,
  };
  await withStoreLock(async () => {
    const store = await readStore();
    if (!store.sendLedger.some((item) => item.date === day)) {
      store.sendLedger.push({ ...ledger, honoreeKeys: [...ledger.honoreeKeys] });
      await writeStore(store);
    }
  });
  await upsertSqlDay(ledger).catch((error) => {
    console.warn('[celebration-email] Send ledger SQL begin failed.', error instanceof Error ? error.message : error);
  });
  return ledger;
};

export const resetCelebrationSendDay = async (date: string) => {
  const day = compact(date).slice(0, 10);
  const ledger = await withStoreLock(async () => {
    const store = await readStore();
    let dayLedger = store.sendLedger.find((item) => item.date === day);
    if (!dayLedger) {
      dayLedger = {
        date: day,
        honoreeKeys: [],
        recipientEmailsSent: [],
        sentCount: 0,
        failedCount: 0,
      };
      store.sendLedger.push(dayLedger);
    } else {
      dayLedger.recipientEmailsSent = [];
      dayLedger.sentCount = 0;
      dayLedger.failedCount = 0;
      delete dayLedger.completedAt;
      delete dayLedger.lastError;
    }
    await writeStore(store);
    return { ...dayLedger, honoreeKeys: [...dayLedger.honoreeKeys], recipientEmailsSent: [] };
  });
  const pool = await celebrationDb().catch(() => null);
  if (pool) {
    await pool.request()
      .input('SendDate', sql.VarChar(10), day)
      .query(`
DELETE FROM [hris].[CelebrationSendRecipients] WHERE [SendDate] = CAST(@SendDate AS DATE);
DELETE FROM [hris].[CelebrationSendDays] WHERE [SendDate] = CAST(@SendDate AS DATE);
`);
  }
  await upsertSqlDay(ledger).catch(() => undefined);
  return ledger;
};

export const recordCelebrationSendProgress = async (input: {
  date: string;
  sentEmails?: string[];
  sentDelta?: number;
  failedDelta?: number;
  completed?: boolean;
  lastError?: string;
  recipientStatus?: 'sent' | 'failed';
}) => {
  const day = compact(input.date).slice(0, 10);
  const extra = (input.sentEmails || []).map((email) => compact(email).toLowerCase()).filter(Boolean);
  const ledger = await withStoreLock(async () => {
    const store = await readStore();
    let dayLedger = store.sendLedger.find((item) => item.date === day);
    if (!dayLedger) {
      dayLedger = {
        date: day,
        honoreeKeys: [],
        recipientEmailsSent: [],
        sentCount: 0,
        failedCount: 0,
      };
      store.sendLedger.push(dayLedger);
    }
    const seen = new Set(dayLedger.recipientEmailsSent.map((email) => email.toLowerCase()));
    for (const email of extra) {
      if (!seen.has(email)) {
        dayLedger.recipientEmailsSent.push(email);
        seen.add(email);
      }
    }
    dayLedger.sentCount += Math.max(0, input.sentDelta || 0);
    dayLedger.failedCount += Math.max(0, input.failedDelta || 0);
    if (input.lastError) dayLedger.lastError = input.lastError;
    if (input.completed) dayLedger.completedAt = nowIso();
    await writeStore(store);
    return {
      ...dayLedger,
      honoreeKeys: [...dayLedger.honoreeKeys],
      recipientEmailsSent: [...dayLedger.recipientEmailsSent],
    };
  });
  const status = input.recipientStatus || (input.sentDelta ? 'sent' : undefined);
  if (status) {
    await Promise.all(extra.map((email) => markSqlRecipient(day, email, status).catch(() => undefined)));
  }
  await upsertSqlDay(ledger).catch((error) => {
    console.warn('[celebration-email] Send ledger SQL write failed.', error instanceof Error ? error.message : error);
  });
  return ledger;
};

export const claimCelebrationRecipient = async (date: string, email: string) => {
  const day = compact(date).slice(0, 10);
  const mailbox = compact(email).toLowerCase();
  if (!day || !mailbox) return false;

  const jsonLedger = await readJsonLedger(day);
  if ((jsonLedger?.recipientEmailsSent || []).some((item) => item.toLowerCase() === mailbox)) {
    await markSqlRecipient(day, mailbox, 'sent').catch(() => undefined);
    return false;
  }

  try {
    const sqlClaimed = await sqlClaimRecipient(day, mailbox);
    if (sqlClaimed === false) return false;
  } catch (error) {
    console.warn('[celebration-email] Recipient claim SQL failed.', error instanceof Error ? error.message : error);
  }

  return withStoreLock(async () => {
    const store = await readStore();
    let dayLedger = store.sendLedger.find((item) => item.date === day);
    if (!dayLedger) {
      dayLedger = {
        date: day,
        honoreeKeys: [],
        recipientEmailsSent: [],
        sentCount: 0,
        failedCount: 0,
      };
      store.sendLedger.push(dayLedger);
    }
    const already = dayLedger.recipientEmailsSent.some((item) => item.toLowerCase() === mailbox);
    if (already) return false;
    dayLedger.recipientEmailsSent.push(mailbox);
    await writeStore(store);
    return true;
  });
};

export const remainingCelebrationRecipients = (ledger: CelebrationSendLedger | null, emails: string[]) => {
  const sent = new Set((ledger?.recipientEmailsSent || []).map((email) => email.toLowerCase()));
  return emails.filter((email) => !sent.has(email.toLowerCase()));
};

export const honoreeKeysForMoments = (moments: CelebrationMoment[]) =>
  moments.map((item) => celebrationEmployeeKey(item));
