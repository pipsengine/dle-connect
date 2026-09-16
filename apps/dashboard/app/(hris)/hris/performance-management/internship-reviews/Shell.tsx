'use client';

import Link from 'next/link';
import {
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  Settings,
  UserPlus,
} from 'lucide-react';
import { internshipReviewHref } from '@/lib/internship-performance-review-constants';

export default function InternshipReviewShell({
  children,
  activeHref = '',
  onInitiate,
  onSettings,
}: {
  children: React.ReactNode;
  activeHref?: string;
  onInitiate?: () => void;
  onSettings?: () => void;
}) {
  const items = [
    { label: 'Overview', sub: '', Icon: LayoutDashboard, kind: 'link' as const },
    { label: 'Initiate Review', sub: 'new', Icon: UserPlus, kind: 'initiate' as const },
    { label: 'Review Register', sub: 'register', Icon: ClipboardList, kind: 'link' as const },
    { label: 'Reports & Analytics', sub: 'reports', Icon: BarChart3, kind: 'link' as const },
    { label: 'Configuration', sub: 'settings', Icon: Settings, kind: 'settings' as const },
  ];

  return (
    <div className="shell">
      <div className="tabs" role="tablist" aria-label="Internship performance review">
        {items.map(({ label, sub, Icon, kind }) => {
          const href = internshipReviewHref(sub);
          const active = activeHref === sub || (sub === '' && (activeHref === '' || activeHref === 'dashboard'));
          if (kind === 'initiate' && onInitiate) {
            return (
              <button type="button" role="tab" aria-selected={false} key={label} onClick={onInitiate}>
                <Icon size={16} />
                {label}
              </button>
            );
          }
          if (kind === 'settings' && onSettings) {
            return (
              <button type="button" role="tab" aria-selected={false} key={label} onClick={onSettings}>
                <Icon size={16} />
                {label}
              </button>
            );
          }
          return (
            <Link role="tab" aria-selected={active} href={href} key={`${label}-${sub || 'home'}`} data-active={active ? 'true' : 'false'}>
              <Icon size={16} />
              {label}
            </Link>
          );
        })}
      </div>
      {children}
    </div>
  );
}
