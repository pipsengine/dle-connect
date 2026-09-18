import { processDailyCelebrationEmails } from '@/lib/celebration-notification-service';

const TICK_MS = Number(process.env.DLE_CELEBRATION_SCHEDULER_INTERVAL_MS || 30 * 60_000);
const SEND_AFTER_HOUR = Math.max(0, Math.min(23, Number(process.env.DLE_CELEBRATION_SEND_AFTER_HOUR || 7)));

let started = false;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let tickInFlight = false;
let lastTickAt: string | null = null;
let lastTickSummary = '';

export const getCelebrationSchedulerStatus = () => ({
  started,
  tickIntervalMs: TICK_MS,
  sendAfterHour: SEND_AFTER_HOUR,
  lastTickAt,
  lastTickSummary,
  tickInFlight,
  disabled: process.env.DLE_CELEBRATION_SCHEDULER_DISABLED === '1',
});

const withinSendWindow = (now = new Date()) => now.getHours() >= SEND_AFTER_HOUR;

export const runCelebrationSchedulerTick = async (input?: { force?: boolean; resend?: boolean }) => {
  if (tickInFlight) {
    return { tickSkipped: true as const, reason: 'Tick already in progress.' };
  }
  if (process.env.DLE_CELEBRATION_SCHEDULER_DISABLED === '1') {
    return { tickSkipped: true as const, reason: 'Scheduler disabled.' };
  }
  if (!input?.force && !withinSendWindow()) {
    lastTickAt = new Date().toISOString();
    lastTickSummary = `waiting until ${String(SEND_AFTER_HOUR).padStart(2, '0')}:00 local time`;
    return { tickSkipped: true as const, reason: lastTickSummary };
  }
  tickInFlight = true;
  lastTickAt = new Date().toISOString();
  try {
    const result = await processDailyCelebrationEmails({ resend: input?.resend });
    lastTickSummary = result.skipped
      ? `${result.reason} honorees=${result.honorees} sent=${result.sent}`
      : `honorees=${result.honorees} sent=${result.sent} failed=${result.failed} remaining=${result.remaining}`;
    return { tickSkipped: false as const, ...result };
  } catch (error) {
    lastTickSummary = error instanceof Error ? error.message : 'Celebration tick failed.';
    return { tickSkipped: false as const, error: lastTickSummary };
  } finally {
    tickInFlight = false;
  }
};

export const ensureCelebrationSchedulerStarted = () => {
  if (started || process.env.DLE_CELEBRATION_SCHEDULER_DISABLED === '1') return;
  started = true;
  void runCelebrationSchedulerTick();
  tickTimer = setInterval(() => {
    void runCelebrationSchedulerTick();
  }, TICK_MS);
  if (typeof tickTimer.unref === 'function') tickTimer.unref();
};
