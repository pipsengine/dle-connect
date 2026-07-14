'use client';

import { useEffect, useRef } from 'react';
import { SESSION_IDLE_TIMEOUT_SECONDS } from '@/lib/auth/session-timeout';

const PUBLIC_PREFIXES = ['/login', '/change-password', '/access-denied'];
const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
const IDLE_MS = SESSION_IDLE_TIMEOUT_SECONDS * 1000;
const ACTIVITY_THROTTLE_MS = 30_000;
export const LAST_ACTIVITY_KEY = 'dle_session_last_activity';

const isPublicPath = (pathname: string) =>
  PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

const readStoredActivity = () => {
  try {
    const raw = window.sessionStorage.getItem(LAST_ACTIVITY_KEY);
    const value = raw ? Number(raw) : 0;
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
};

const writeStoredActivity = (at: number) => {
  try {
    window.sessionStorage.setItem(LAST_ACTIVITY_KEY, String(at));
  } catch {
    // Ignore storage failures (private mode quotas, etc.).
  }
};

export const clearStoredSessionActivity = () => {
  try {
    window.sessionStorage.removeItem(LAST_ACTIVITY_KEY);
  } catch {
    // ignore
  }
};

const redirectToLogin = () => {
  if (isPublicPath(window.location.pathname)) return;
  const next = `${window.location.pathname}${window.location.search}`;
  const loginUrl = next && next !== '/' ? `/login?next=${encodeURIComponent(next)}` : '/login';
  window.location.replace(loginUrl);
};

const forceLogout = async () => {
  clearStoredSessionActivity();
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', cache: 'no-store' });
  } catch {
    // Still redirect even if logout API is unreachable.
  }
  redirectToLogin();
};

export function AuthSessionGuard() {
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTouchRef = useRef(Date.now());
  const lastRefreshRef = useRef(0);
  const sessionReadyRef = useRef(false);

  useEffect(() => {
    // Always clear idle markers on public auth pages so a fresh login is not
    // immediately kicked out by a previous tab's idle timestamp.
    if (isPublicPath(window.location.pathname)) {
      clearStoredSessionActivity();
      return;
    }

    const clearIdleTimer = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    };

    const armIdleTimer = () => {
      clearIdleTimer();
      idleTimerRef.current = setTimeout(() => {
        void forceLogout();
      }, IDLE_MS);
    };

    const markActivity = (at = Date.now()) => {
      lastTouchRef.current = at;
      writeStoredActivity(at);
    };

    const verifySession = async (options?: { refresh?: boolean }) => {
      if (isPublicPath(window.location.pathname)) return false;
      try {
        const response = await fetch('/api/auth/me', { cache: 'no-store', credentials: 'same-origin' });
        if (response.status === 401) {
          clearStoredSessionActivity();
          redirectToLogin();
          return false;
        }
        sessionReadyRef.current = true;
        if (options?.refresh) {
          lastRefreshRef.current = Date.now();
          markActivity();
        }
        return true;
      } catch {
        // Network errors should not force logout; middleware protects server routes.
        return sessionReadyRef.current;
      }
    };

    const onActivity = () => {
      if (isPublicPath(window.location.pathname)) return;
      const now = Date.now();
      markActivity(now);
      armIdleTimer();
      if (now - lastRefreshRef.current >= ACTIVITY_THROTTLE_MS) {
        lastRefreshRef.current = now;
        void verifySession({ refresh: true });
      }
    };

    const checkResume = async () => {
      const stored = readStoredActivity();
      const baseline = stored || lastTouchRef.current;
      if (Date.now() - baseline < IDLE_MS) return true;
      // Client idle marker is stale — confirm with the server before logging out.
      // A brand-new login cookie must not be destroyed by an old sessionStorage value.
      const ok = await verifySession({ refresh: true });
      if (!ok) return false;
      markActivity();
      return true;
    };

    const onPageShow = () => {
      void (async () => {
        if (!(await checkResume())) return;
        armIdleTimer();
      })();
    };

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      void (async () => {
        if (!(await checkResume())) return;
        armIdleTimer();
      })();
    };

    // Fresh mount after login: start a new activity window. Never logout solely
    // from a leftover sessionStorage timestamp — that blocks re-login after idle.
    clearStoredSessionActivity();
    markActivity(Date.now());
    armIdleTimer();
    void verifySession({ refresh: true });

    ACTIVITY_EVENTS.forEach((eventName) => window.addEventListener(eventName, onActivity, { passive: true }));
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearIdleTimer();
      ACTIVITY_EVENTS.forEach((eventName) => window.removeEventListener(eventName, onActivity));
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return null;
}
