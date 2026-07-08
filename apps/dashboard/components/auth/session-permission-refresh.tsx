'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/** Keep the auth cookie permissions in sync with Access Control Centre grants. */
export function SessionPermissionRefresh() {
  const pathname = usePathname();

  useEffect(() => {
    void fetch('/api/auth/me', { cache: 'no-store' }).catch(() => undefined);
  }, [pathname]);

  return null;
}
