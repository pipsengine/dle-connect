import { runFrontDeskDeadlineNotices } from '@/lib/corporate-office/front-desk-notify';

const TICK_MS = Number(process.env.DLE_FRONT_DESK_REMINDER_INTERVAL_MS || 60 * 60_000);

let started = false;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let tickInFlight = false;

export const runFrontDeskDeadlineSchedulerTick = async () => {
  if (tickInFlight || process.env.DLE_FRONT_DESK_REMINDER_SCHEDULER_DISABLED === '1') return;
  tickInFlight = true;
  try {
    await runFrontDeskDeadlineNotices();
  } catch (error) {
    console.warn('[front-desk] Deadline reminder tick failed.', error);
  } finally {
    tickInFlight = false;
  }
};

export const ensureFrontDeskDeadlineSchedulerStarted = () => {
  if (started || process.env.DLE_FRONT_DESK_REMINDER_SCHEDULER_DISABLED === '1') return;
  started = true;
  void runFrontDeskDeadlineSchedulerTick();
  tickTimer = setInterval(() => {
    void runFrontDeskDeadlineSchedulerTick();
  }, TICK_MS);
  if (typeof tickTimer.unref === 'function') tickTimer.unref();
};
