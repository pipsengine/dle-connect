'use client';

import { useEffect, useState } from 'react';

/** Full labelled nav is comfortable at 1920px+. Laptop CSS width is often 1280–1536 (including 125% scaling). */
export const SIDEBAR_COMFORT_MQ = '(min-width: 1920px)';

export function useViewportSidebarOpen() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(window.matchMedia(SIDEBAR_COMFORT_MQ).matches);
  }, []);

  return [open, setOpen] as const;
}

export function useViewportRailCollapsed() {
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    setCollapsed(!window.matchMedia(SIDEBAR_COMFORT_MQ).matches);
  }, []);

  return [collapsed, setCollapsed] as const;
}
