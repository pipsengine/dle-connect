'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { AppShell, PageHeader, Tabs } from '@/components/recruitment/AppShell';

/** Matches enterprise-v2 form/detail chrome; wire fields to API as each entity gains write actions. */
export default function EnterpriseFormShell({
  active,
  title,
  subtitle,
  primary,
  backHref,
  tabs,
  children,
}: {
  active: string;
  title: string;
  subtitle: string;
  primary: string;
  backHref: string;
  tabs: string[];
  children: ReactNode;
}) {
  return (
    <AppShell active={active}>
      <PageHeader title={title} subtitle={subtitle} primary={primary} />
      <div className="card">
        <Tabs items={tabs} />
        {children}
        <div className="stickyFooter">
          <Link className="btn" href={backHref}>Cancel</Link>
          <button type="button" className="btn">Save Draft</button>
          <button type="button" className="btn primary">{primary}</button>
        </div>
      </div>
    </AppShell>
  );
}
