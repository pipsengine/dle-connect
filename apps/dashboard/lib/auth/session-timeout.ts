/** Absolute session lifetime from login (seconds). */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

/** Logout after this many seconds without activity (sliding window). */
export const SESSION_IDLE_TIMEOUT_SECONDS = 10 * 60;

/** Extra idle time while completing first-login / forced password change. */
export const SESSION_PASSWORD_CHANGE_GRACE_SECONDS = 30 * 60;
