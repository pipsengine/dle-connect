'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/** Keep the auth cookie permissions in sync with Access Control Centre grants. */
export function SessionPermissionRefresh() {
  const pathname = usePathname();

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 12000);
    void fetch('/api/auth/me', { cache: 'no-store', signal: controller.signal })
      .catch(() => undefined)
      .finally(() => window.clearTimeout(timer));
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [pathname]);

  return null;
}
