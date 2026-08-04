'use client';

import Link from 'next/link';
import { Building2 } from 'lucide-react';

type EnterpriseHomeButtonProps = {
  className?: string;
  /** When true, always show the label (default: hide label only on very small screens). */
  alwaysShowLabel?: boolean;
};

/**
 * Global control to return to the enterprise landing page (`/`) from any portal.
 */
export function EnterpriseHomeButton({
  className = '',
  alwaysShowLabel = false,
}: EnterpriseHomeButtonProps) {
  return (
    <Link
      href="/"
      aria-label="Go to enterprise landing page"
      title="Enterprise Home"
      className={`inline-flex h-10 items-center gap-2 rounded-xl border border-slate-900 bg-white px-3 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 ${className}`.trim()}
    >
      <Building2 className="h-4 w-4 shrink-0" aria-hidden />
      <span className={alwaysShowLabel ? undefined : 'hidden sm:inline'}>Enterprise Home</span>
    </Link>
  );
}
