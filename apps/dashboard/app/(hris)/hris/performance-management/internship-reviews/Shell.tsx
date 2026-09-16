'use client';

import Link from 'next/link';
import {
  BarChart3,
  CheckSquare,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  Settings,
  UserPlus,
  Users,
} from 'lucide-react';
import { internshipReviewHref } from '@/lib/internship-performance-review-constants';

const nav = [
  ['Overview', '', LayoutDashboard],
  ['Initiate Review', 'new', UserPlus],
  ['My Tasks', 'my-tasks', CheckSquare],
  ['Review Register', '', ClipboardList],
  ['Reports & Analytics', 'reports', BarChart3],
  ['Configuration', 'settings', Settings],
] as const;

export default function InternshipReviewShell({
  children,
  title = 'Internship Performance',
  activeHref = '',
}: {
  children: React.ReactNode;
  title?: string;
  activeHref?: string;
}) {
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <b>Internship Review</b>
          <span>Performance Management</span>
        </div>
        <div className="sideLabel">WORKFLOW</div>
        {nav.map(([label, sub, Icon]) => {
          const href = internshipReviewHref(sub);
          const active = activeHref === sub || (sub === '' && (activeHref === '' || activeHref === 'register'));
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
            <b>Performance Management</b>
            <small>Internship → Trainee workflow</small>
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
