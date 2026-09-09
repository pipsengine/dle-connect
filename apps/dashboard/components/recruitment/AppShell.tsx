'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { recruitmentNavItems, recruitmentRoutes } from '@/lib/recruitment-shared';
import './recruitment.css';

const slugFromPath = (pathname: string) => {
  const match = pathname.match(/\/hris\/recruitment\/([^/]+)/);
  return match?.[1] || 'recruitment-dashboard';
};

/** Workspace shell — uses DLE HRIS chrome; does not render the package's duplicate sidebar. */
export function AppShell({ children, active }: { children: ReactNode; active?: string }) {
  const pathname = usePathname();
  const current = active || slugFromPath(pathname || '');
  return (
    <div className="rec-enterprise">
      <div className="workspace">
        <nav className="filters" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
          {recruitmentNavItems.map((item) => {
            const slug = item.route.split('/').pop() || '';
            return (
              <Link
                key={item.route}
                href={item.route}
                className={`btn ${current === slug ? 'primary' : ''}`}
              >
                {item.title}
              </Link>
            );
          })}
        </nav>
        {children}
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  primary,
  primaryHref,
  onPrimary,
  onRefresh,
  children,
}: {
  title: string;
  subtitle: string;
  primary?: string;
  primaryHref?: string;
  onPrimary?: () => void;
  onRefresh?: () => void;
  children?: ReactNode;
}) {
  return (
    <>
      <div className="crumb">Recruitment › {title}</div>
      <div className="pageHead">
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="actions">
          {children}
          {onRefresh ? (
            <button type="button" className="btn" onClick={onRefresh}>Refresh</button>
          ) : null}
          <button type="button" className="btn">Export</button>
          {primary ? (
            primaryHref ? (
              <Link className="btn primary" href={primaryHref}>{`＋ ${primary}`}</Link>
            ) : (
              <button type="button" className="btn primary" onClick={onPrimary}>{`＋ ${primary}`}</button>
            )
          ) : null}
        </div>
      </div>
    </>
  );
}

export function Badge({ children, tone = 'blue' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge b${tone}`}>{children}</span>;
}

export function KPI({
  label,
  value,
  meta,
  trend,
  tone = 'blue',
}: {
  label: string;
  value: string | number;
  meta: string;
  trend?: string;
  tone?: string;
}) {
  return (
    <div className={`card kpi ${tone}`}>
      <div className="kpiLabel">{label}</div>
      <div className="kpiValue">{value}</div>
      <div className="kpiMeta">{meta}</div>
      {trend ? <div className="kpiTrend">{trend}</div> : null}
    </div>
  );
}

export function Tabs({ items, active = 0 }: { items: string[]; active?: number }) {
  return (
    <div className="tabs">
      {items.map((x, i) => (
        <div className={`tab ${i === active ? 'active' : ''}`} key={x}>{x}</div>
      ))}
    </div>
  );
}

export function Pipeline({ stages }: { stages?: Array<{ stage: string; count: number }> }) {
  const arr = stages?.length
    ? stages.map((s) => [s.stage, String(s.count)] as [string, string])
    : ([
      ['Manpower', '0'],
      ['Requisition', '0'],
      ['Posted', '0'],
      ['Screening', '0'],
      ['Interview', '0'],
      ['Offer', '0'],
      ['Checks', '0'],
      ['Approved', '0'],
    ] as Array<[string, string]>);
  return (
    <div className="pipeline">
      {arr.map((x, i) => (
        <div className={`pipe ${i < 4 ? 'done' : ''}`} key={x[0]}>
          <div className="dot">{i < 4 ? '✓' : i + 1}</div>
          <div className="pipeName">{x[0]}</div>
          <div className="pipeCount">{x[1]}</div>
        </div>
      ))}
    </div>
  );
}

export function statusTone(value: string): string {
  const v = String(value || '');
  if (/Approved|Live|Qualified|Cleared|Hired|Accepted/i.test(v)) return 'green';
  if (/Pending|Review|Submitted|Draft|Progress|Verification/i.test(v)) return 'amber';
  if (/Rejected|Blocked|Failed|Declined/i.test(v)) return 'red';
  if (/Interview|Offer|Screen/i.test(v)) return 'purple';
  return 'blue';
}

export { recruitmentRoutes };
