import { processOverduePaymentApprovalReminders } from '@/lib/finance-intelligence/payment-approval-reminder-service';

const TICK_MS = Number(process.env.DLE_PAYMENT_REMINDER_INTERVAL_MS || 15 * 60_000);

let started = false;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let tickInFlight = false;
let lastTickAt: string | null = null;
let lastTickSummary = '';

export const getPaymentReminderSchedulerStatus = () => ({
  started,
  tickIntervalMs: TICK_MS,
  lastTickAt,
  lastTickSummary,
  tickInFlight,
  disabled: process.env.DLE_PAYMENT_REMINDER_SCHEDULER_DISABLED === '1',
});

export const runPaymentReminderSchedulerTick = async () => {
  if (tickInFlight) {
    return { tickSkipped: true as const, reason: 'Tick already in progress.' };
  }
  if (process.env.DLE_PAYMENT_REMINDER_SCHEDULER_DISABLED === '1') {
    return { tickSkipped: true as const, reason: 'Scheduler disabled.' };
  }
  tickInFlight = true;
  lastTickAt = new Date().toISOString();
  try {
    const result = await processOverduePaymentApprovalReminders();
    lastTickSummary = `scanned=${result.scanned} reminded=${result.reminded} skipped=${result.skipped}`;
    return { tickSkipped: false as const, ...result };
  } catch (error) {
    lastTickSummary = error instanceof Error ? error.message : 'Reminder tick failed.';
    return { tickSkipped: false as const, error: lastTickSummary };
  } finally {
    tickInFlight = false;
  }
};

export const ensurePaymentReminderSchedulerStarted = () => {
  if (started || process.env.DLE_PAYMENT_REMINDER_SCHEDULER_DISABLED === '1') return;
  started = true;
  void runPaymentReminderSchedulerTick();
  tickTimer = setInterval(() => {
    void runPaymentReminderSchedulerTick();
  }, TICK_MS);
  if (typeof tickTimer.unref === 'function') tickTimer.unref();
};
