import { readEmployeeDirectoryFromDb, readEmployeePhotoFromDb, type DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import {
  celebrationPhotoCid,
  listTodaysCelebrationMoments,
  todayIsoLocal,
  type CelebrationMoment,
} from '@/lib/celebration-moments';
import { generateCelebrationFlyerCopy } from '@/lib/celebration-copy';
import { buildCelebrationEmail } from '@/lib/celebration-email';
import {
  beginCelebrationSendDay,
  honoreeKeysForMoments,
  readCelebrationSendLedger,
  recordCelebrationSendProgress,
  remainingCelebrationRecipients,
  resetCelebrationSendDay,
} from '@/lib/celebration-wish-store';
import {
  employeeEmailAddress,
  resolveMailProvider,
  sendTransactionalEmail,
} from '@/lib/mail-service';
import { resolveWorkflowLinkOrigin } from '@/lib/public-app-url';

const compact = (value: unknown) => String(value || '').trim();
const MAX_PHOTO_BYTES = Number(process.env.DLE_CELEBRATION_MAX_PHOTO_BYTES || 350_000);
const SEND_CONCURRENCY = Math.max(1, Number(process.env.DLE_CELEBRATION_SEND_CONCURRENCY || 3));

const loadDirectory = async (): Promise<DleEmployeeDirectoryRow[]> => {
  const fromDb = await readEmployeeDirectoryFromDb();
  if (fromDb?.length) return fromDb;
  const payroll = await readPayrollEmployees();
  return payroll.employees || [];
};

const mapPool = async <T, R>(items: T[], limit: number, mapper: (item: T, index: number) => Promise<R>) => {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) || 1 }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
};

const loadPhotoAttachments = async (moments: CelebrationMoment[]) => {
  const uniqueCodes = [...new Set(moments.filter((item) => item.hasPhoto).map((item) => item.employeeCode))];
  const attachments: Array<{ filename: string; contentType: string; content: Buffer; cid: string }> = [];
  const photoCids: string[] = [];
  await mapPool(uniqueCodes, 4, async (code) => {
    try {
      const photo = await readEmployeePhotoFromDb(code);
      if (!photo?.data?.length || photo.data.length > MAX_PHOTO_BYTES) return;
      const cid = celebrationPhotoCid(code);
      photoCids.push(cid);
      attachments.push({
        filename: compact(photo.fileName) || `${code}.jpg`,
        contentType: compact(photo.mimeType) || 'image/jpeg',
        content: photo.data,
        cid,
      });
    } catch (error) {
      console.warn('[celebration-email] Photo embed skipped.', {
        employeeCode: code,
        reason: error instanceof Error ? error.message : 'photo read failed',
      });
    }
  });
  return { attachments, photoCids };
};

const mailboxFor = async (employee: DleEmployeeDirectoryRow) =>
  employeeEmailAddress(employee);

export const processDailyCelebrationEmails = async (input?: { date?: string; force?: boolean; resend?: boolean }) => {
  const date = compact(input?.date).slice(0, 10) || todayIsoLocal();
  if (!resolveMailProvider()) {
    return { skipped: true as const, reason: 'Mail provider not configured.', date, honorees: 0, sent: 0, failed: 0 };
  }

  const directory = await loadDirectory();
  const moments = listTodaysCelebrationMoments(directory, date);
  if (!moments.length) {
    await beginCelebrationSendDay({ date, honoreeKeys: [] });
    await recordCelebrationSendProgress({ date, completed: true });
    return { skipped: true as const, reason: 'No birthdays or anniversaries today.', date, honorees: 0, sent: 0, failed: 0 };
  }

  if (input?.resend) {
    await resetCelebrationSendDay(date);
  }

  const existing = await readCelebrationSendLedger(date);
  if (existing?.completedAt && !input?.force) {
    return {
      skipped: true as const,
      reason: 'Already sent for today.',
      date,
      honorees: moments.length,
      sent: existing.sentCount,
      failed: existing.failedCount,
    };
  }

  const ledger = existing || await beginCelebrationSendDay({ date, honoreeKeys: honoreeKeysForMoments(moments) });
  const recipients: Array<{ employee: DleEmployeeDirectoryRow; email: string }> = [];
  const seen = new Set<string>();
  for (const employee of directory.filter((item) => !/inactive|terminated|resigned|retired|deceased|exit/i.test(compact(item.status)))) {
    const email = compact(await mailboxFor(employee)).toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    recipients.push({ employee, email });
  }

  const pending = remainingCelebrationRecipients(ledger, recipients.map((item) => item.email));
  const pendingSet = new Set(pending.map((email) => email.toLowerCase()));
  const queue = recipients.filter((item) => pendingSet.has(item.email));
  console.info('[celebration-email] Recipient queue ready.', {
    date,
    honorees: moments.length,
    withEmailOnFile: recipients.length,
    pending: queue.length,
  });
  if (!queue.length) {
    await recordCelebrationSendProgress({ date, completed: true });
    return { skipped: false as const, date, honorees: moments.length, sent: ledger.sentCount, failed: ledger.failedCount, remaining: 0 };
  }

  const { attachments, photoCids } = await loadPhotoAttachments(moments);
  const flyerCopy = await generateCelebrationFlyerCopy(moments);
  const baseUrl = resolveWorkflowLinkOrigin();
  let sent = 0;
  let failed = 0;
  let lastError = '';

  console.info('[celebration-email] Sending daily celebration emails.', {
    date,
    honorees: moments.length,
    recipients: queue.length,
    photos: photoCids.length,
    copySource: flyerCopy.source,
  });

  await mapPool(queue, SEND_CONCURRENCY, async (recipient) => {
    const mail = buildCelebrationEmail({
      moments,
      recipient: recipient.employee,
      recipientName: compact(recipient.employee.preferredName || recipient.employee.firstName || recipient.employee.fullName) || 'Colleague',
      baseUrl,
      photoCids,
      copy: flyerCopy,
    });
    const result = await sendTransactionalEmail({
      to: recipient.email,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      inlineAttachments: attachments,
    });
    if (result.sent) {
      sent += 1;
      await recordCelebrationSendProgress({ date, sentEmails: [recipient.email], sentDelta: 1 });
      return;
    }
    failed += 1;
    lastError = result.reason || 'Send failed.';
    await recordCelebrationSendProgress({ date, failedDelta: 1, lastError });
  });

  const refreshed = await readCelebrationSendLedger(date);
  const remaining = remainingCelebrationRecipients(refreshed, recipients.map((item) => item.email));
  if (remaining.length === 0) {
    await recordCelebrationSendProgress({ date, completed: true, lastError: lastError || undefined });
  }

  console.info('[celebration-email] Daily celebration send finished.', {
    date,
    honorees: moments.length,
    sentThisRun: sent,
    failedThisRun: failed,
    sentTotal: refreshed?.sentCount || 0,
    remaining: remaining.length,
  });

  return {
    skipped: false as const,
    date,
    honorees: moments.length,
    sent: (refreshed?.sentCount || 0),
    failed: (refreshed?.failedCount || 0),
    remaining: remaining.length,
  };
};
