'use client';

import type { CSSProperties, ReactNode } from 'react';

/** Prevent page-level horizontal blowouts inside nested flex/grid shells. */
export function PageFrame({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-w-0 w-full max-w-full space-y-4 ${className}`.trim()}>
      {children}
    </div>
  );
}

/**
 * Horizontal scroll frame for wide data tables.
 * Always set a minWidth so the table does not crush columns on narrow screens —
 * overflow-x-auto alone is not enough when the table is min-w-full.
 */
export function ScrollTable({
  children,
  minWidth = 1100,
  className = '',
  hint = true,
}: {
  children: ReactNode;
  minWidth?: number | string;
  className?: string;
  /** Show a subtle “scroll for more” cue on small screens */
  hint?: boolean;
}) {
  const style = {
    minWidth: typeof minWidth === 'number' ? `${minWidth}px` : minWidth,
  } as CSSProperties;

  return (
    <div className={`relative min-w-0 ${className}`.trim()}>
      {hint ? (
        <p className="px-3 pb-1 text-[10px] font-medium text-slate-400 md:hidden">
          Swipe sideways to see all columns
        </p>
      ) : null}
      <div className="dle-scroll-x overflow-x-auto overscroll-x-contain">
        <div style={style}>{children}</div>
      </div>
    </div>
  );
}

/** Filter / search toolbars that stack on phones and sit in a row on larger screens. */
export function FilterToolbar({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col gap-2 border-b border-slate-100 px-3 py-3 sm:px-4 md:flex-row md:flex-wrap md:items-center ${className}`.trim()}
    >
      {children}
    </div>
  );
}

/** Bulk / primary action rows that wrap cleanly on every breakpoint. */
export function ActionToolbar({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`.trim()}>
      {children}
    </div>
  );
}

/** Mobile-first card list companion to ScrollTable (show below md, hide table). */
export function MobileCardList({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-3 p-3 md:hidden ${className}`.trim()}>
      {children}
    </div>
  );
}

export function DesktopOnlyTable({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`hidden md:block ${className}`.trim()}>
      {children}
    </div>
  );
}
