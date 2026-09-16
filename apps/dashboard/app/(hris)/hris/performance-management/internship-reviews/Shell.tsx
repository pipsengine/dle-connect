'use client';

import Link from 'next/link';
import {
  BarChart3,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  Settings,
  UserPlus,
  Users,
} from 'lucide-react';
import { internshipReviewHref } from '@/lib/internship-performance-review-constants';

export default function InternshipReviewShell({
  children,
  title = 'Internship Performance',
  activeHref = '',
  onInitiate,
  onSettings,
}: {
  children: React.ReactNode;
  title?: string;
  activeHref?: string;
  onInitiate?: () => void;
  onSettings?: () => void;
}) {
  const items = [
    { label: 'Overview', sub: '', Icon: LayoutDashboard, kind: 'link' as const },
    { label: 'Initiate Review', sub: 'new', Icon: UserPlus, kind: 'initiate' as const },
    { label: 'Review Register', sub: '', Icon: ClipboardList, kind: 'link' as const },
    { label: 'Reports & Analytics', sub: 'reports', Icon: BarChart3, kind: 'link' as const },
    { label: 'Configuration', sub: 'settings', Icon: Settings, kind: 'settings' as const },
  ];

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <b>Internship Review</b>
          <span>HR initiation workspace</span>
        </div>
        <div className="sideLabel">HRIS CONTROL</div>
        {items.map(({ label, sub, Icon, kind }) => {
          const href = internshipReviewHref(sub);
          const active = activeHref === sub || (sub === '' && (activeHref === '' || activeHref === 'register'));
          if (kind === 'initiate' && onInitiate) {
            return (
              <button type="button" className="nav" key={label} data-active={active ? 'true' : 'false'} onClick={onInitiate}>
                <Icon size={17} />
                <span>{label}</span>
                <ChevronRight size={14} />
              </button>
            );
          }
          if (kind === 'settings' && onSettings) {
            return (
              <button type="button" className="nav" key={label} data-active={active ? 'true' : 'false'} onClick={onSettings}>
                <Icon size={17} />
                <span>{label}</span>
                <ChevronRight size={14} />
              </button>
            );
          }
          return (
            <Link className="nav" href={href} key={`${label}-${sub || 'home'}`} data-active={active ? 'true' : 'false'}>
              <Icon size={17} />
              <span>{label}</span>
              <ChevronRight size={14} />
            </Link>
          );
        })}
        <div className="sideFoot">
          <Users size={18} />
          <div>
            <b>ESS completes the rest</b>
            <small>Line managers and approvers work in Workforce Portal</small>
          </div>
        </div>
      </aside>
      <main>
        <header className="top">
          <div>
            <span className="crumb">Human Resources / Performance Management /</span>
            <b>{title}</b>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
