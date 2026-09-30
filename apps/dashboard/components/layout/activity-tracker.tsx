'use client';

import { useEffect } from 'react';
import { clearStoredSessionActivity } from '@/components/layout/auth-session-guard';

const PUBLIC_PREFIXES = ['/login', '/change-password', '/access-denied'];

const isPublicPath = (pathname: string) =>
  PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

const forceLogout = async () => {
  clearStoredSessionActivity();
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', cache: 'no-store' });
  } catch {
    // Redirect even if logout cannot be reached.
  }
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.replace(next && next !== '/' ? `/login?next=${encodeURIComponent(next)}` : '/login');
};

export function ActivityTracker() {
  useEffect(() => {
    let lastSignature = '';
    const send = async (body: { kind: 'page' | 'action' | 'heartbeat'; path: string; page: string; action?: string }) => {
      if (isPublicPath(window.location.pathname)) return;
      try {
        const response = await fetch('/api/auth/activity', {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (response.status !== 401) return;
        const payload = await response.json().catch(() => ({}));
        if (payload?.code === 'session-revoked') await forceLogout();
      } catch {
        // A failed beacon must not interrupt the page the user is working on.
      }
    };

    const currentPage = () => document.documentElement.dataset.dlePage || document.title || window.location.pathname;
    const pageView = () => {
      const path = `${window.location.pathname}${window.location.search}`;
      const page = currentPage();
      const signature = `page:${path}:${page}`;
      if (signature === lastSignature) return;
      lastSignature = signature;
      void send({ kind: 'page', path, page });
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest('button, a, [role="button"]') : null;
      if (!target) return;
      const label = (target.textContent || target.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 140);
      if (label.length < 2) return;
      const path = `${window.location.pathname}${window.location.search}`;
      void send({ kind: 'action', path, page: currentPage(), action: label });
    };

    pageView();
    const timer = window.setInterval(() => {
      const path = `${window.location.pathname}${window.location.search}`;
      const page = currentPage();
      const signature = `page:${path}:${page}`;
      if (signature !== lastSignature) {
        pageView();
        return;
      }
      void send({ kind: 'heartbeat', path, page });
    }, 20000);
    window.addEventListener('click', onClick, true);
    window.addEventListener('popstate', pageView);
    window.addEventListener('dle-page', pageView);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', pageView);
      window.removeEventListener('dle-page', pageView);
    };
  }, []);

  return null;
}
