import type { SessionPayload } from '@/lib/auth/session';
import { runTenderDeadlineReminders } from '@/lib/commercial/tender-reminder-service';

const TICK_MS = Number(process.env.DLE_TENDER_REMINDER_INTERVAL_MS || 60 * 60_000);

let started = false;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let tickInFlight = false;

const systemSession = (): SessionPayload => ({
  sub: 'tender-deadline-service',
  username: 'tender-deadline-service',
  fullName: 'Tender deadline service',
  roles: ['System'],
  permissions: [],
  status: 'Active',
  firstLoginRequired: false,
  passwordResetRequired: false,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
});

export const runTenderDeadlineSchedulerTick = async () => {
  if (tickInFlight || process.env.DLE_TENDER_REMINDER_SCHEDULER_DISABLED === '1') return;
  tickInFlight = true;
  try {
    await runTenderDeadlineReminders(systemSession());
  } catch (error) {
    console.warn('[tender-deadlines] Reminder tick failed.', error);
  } finally {
    tickInFlight = false;
  }
};

export const ensureTenderDeadlineSchedulerStarted = () => {
  if (started || process.env.DLE_TENDER_REMINDER_SCHEDULER_DISABLED === '1') return;
  started = true;
  void runTenderDeadlineSchedulerTick();
  tickTimer = setInterval(() => {
    void runTenderDeadlineSchedulerTick();
  }, TICK_MS);
  if (typeof tickTimer.unref === 'function') tickTimer.unref();
};
