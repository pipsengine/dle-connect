'use client';

import { useEffect, useState } from 'react';

/** Full labelled nav is comfortable at 1920px+. Laptop CSS width is often 1280–1536 (including 125% scaling). */
export const SIDEBAR_COMFORT_MQ = '(min-width: 1920px)';

const RAIL_STORAGE_KEY = 'dle-portal-rail-collapsed';

export function useViewportSidebarOpen() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(window.matchMedia(SIDEBAR_COMFORT_MQ).matches);
  }, []);

  return [open, setOpen] as const;
}

export function useViewportRailCollapsed() {
  const [collapsed, setCollapsedState] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(RAIL_STORAGE_KEY);
      if (stored === '1' || stored === '0') {
        setCollapsedState(stored === '1');
      } else {
        setCollapsedState(!window.matchMedia(SIDEBAR_COMFORT_MQ).matches);
      }
    } catch {
      setCollapsedState(!window.matchMedia(SIDEBAR_COMFORT_MQ).matches);
    }
    setHydrated(true);
  }, []);

  const setCollapsed = (value: boolean | ((current: boolean) => boolean)) => {
    setCollapsedState((current) => {
      const next = typeof value === 'function' ? value(current) : value;
      try {
        window.localStorage.setItem(RAIL_STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore quota / private mode */
      }
      return next;
    });
  };

  // Keep SSR/client first paint stable until preference is read.
  return [hydrated ? collapsed : true, setCollapsed] as const;
}
