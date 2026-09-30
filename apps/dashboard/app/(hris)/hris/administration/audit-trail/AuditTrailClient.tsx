'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ClipboardList, Copy, Database, Download, FileBarChart, FileText, Gauge, Globe2, LockKeyhole, MapPin, Monitor, RefreshCw, Search, ShieldCheck, TriangleAlert, UserRound, Users, X } from 'lucide-react';
import './audit-trail.css';

type Risk = 'Informational' | 'Normal' | 'Sensitive' | 'High' | 'Critical';
type EventStatus = 'Success' | 'Failed' | 'Warning';
type Tab = 'Overview' | 'Activity Logs' | 'Security Events' | 'User Sessions' | 'Data Changes' | 'Reports';

type AuditEvent = {
  id: string;
  at: string;
  user: string;
  code: string;
  department: string;
  role: string;
  event: string;
  description: string;
  module: string;
  page: string;
  path: string;
  location: string;
  ip: string;
  os: string;
  browser: string;
  userAgent: string;
  risk: Risk;
  status: EventStatus;
  category: Tab;
  before?: string;
  after?: string;
};

const tabs: Array<[typeof Gauge, Tab]> = [
  [Gauge, 'Overview'],
  [ClipboardList, 'Activity Logs'],
  [ShieldCheck, 'Security Events'],
  [UserRound, 'User Sessions'],
  [Database, 'Data Changes'],
  [FileBarChart, 'Reports'],
];

const emptyFilters = { query: '', dateFrom: '', dateTo: '', user: '', module: '', risk: '', status: '', location: '', ip: '', device: '' };

const parseDevice = (ua: string) => {
  const text = ua || '';
  const mobile = /Android|iPhone|iPad|Mobile/i.test(text);
  let os = text ? 'Unknown' : '—';
  if (/Windows/i.test(text)) os = 'Windows';
  else if (/Android/i.test(text)) os = 'Android';
  else if (/iPhone|iPad/i.test(text)) os = 'iOS';
  else if (/Mac OS/i.test(text)) os = 'macOS';
  let browser = '—';
  const edge = text.match(/Edg\/([\d.]+)/);
  const chrome = text.match(/Chrome\/([\d.]+)/);
  const firefox = text.match(/Firefox\/([\d.]+)/);
  if (edge) browser = `Edge ${edge[1].split('.')[0]}`;
  else if (chrome) browser = `Chrome ${chrome[1].split('.')[0]}${mobile ? ' Mobile' : ''}`;
  else if (firefox) browser = `Firefox ${firefox[1].split('.')[0]}`;
  else if (/Safari/i.test(text)) browser = 'Safari';
  return { os, browser, device: mobile ? 'Mobile' : 'Desktop', userAgent: text || 'Not recorded' };
};

const classify = (action: string, statusText = ''): { risk: Risk; status: EventStatus; category: Tab } => {
  const text = `${action} ${statusText}`.toLowerCase();
  if (/fail|denied|forbidden/.test(text)) return { risk: 'High', status: 'Failed', category: 'Security Events' };
  if (/disconnect|removed|password|role|permission|session/.test(text)) return { risk: 'Sensitive', status: 'Success', category: /session|disconnect|login|logout/.test(text) ? 'User Sessions' : 'Security Events' };
  if (/export|report/.test(text)) return { risk: 'Normal', status: 'Success', category: 'Reports' };
  if (/clicked|opened|navigation|page/.test(text)) return { risk: 'Informational', status: 'Success', category: 'Activity Logs' };
  return { risk: 'Normal', status: 'Success', category: 'Activity Logs' };
};

const stamp = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-US');
};

export default function AuditTrailClient() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [tab, setTab] = useState<Tab>('Overview');
  const [filters, setFilters] = useState(emptyFilters);
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch('/api/admin/audit', { cache: 'no-store' })
      .then((response) => response.json().then((json) => ({ response, json })))
      .then(({ response, json }) => {
        if (!response.ok) throw new Error(json.error || 'Unable to load audit log');
        const activity = (json.data?.activity || []).map((item: Record<string, string>) => {
          const device = parseDevice(item.device);
          const kind = classify(item.action);
          return {
            id: item.id,
            at: item.at,
            user: item.fullName || item.username,
            code: item.username,
            department: item.location || 'Not recorded',
            role: '',
            event: item.action,
            description: `${item.action} in ${item.module || 'DLE Connect'}`,
            module: item.module || 'Application',
            page: item.page || item.path || '—',
            path: item.path || '',
            location: item.location || 'Not recorded',
            ip: item.ipAddress || 'Not recorded',
            ...device,
            ...kind,
          } satisfies AuditEvent;
        });
        const security = (json.data?.audit || []).map((item: Record<string, string>) => {
          const device = parseDevice(item.device);
          const kind = classify(item.action);
          return {
            id: item.id,
            at: item.at,
            user: item.user,
            code: item.performedBy || item.user,
            department: 'Not recorded',
            role: '',
            event: item.action,
            description: item.newValue || item.action,
            module: 'Security',
            page: 'Administration',
            path: '',
            location: 'Not recorded',
            ip: item.ipAddress || 'Not recorded',
            ...device,
            ...kind,
            category: kind.category === 'Activity Logs' ? 'Security Events' : kind.category,
            before: item.oldValue || undefined,
            after: item.newValue || undefined,
          } satisfies AuditEvent;
        });
        const logins = (json.data?.loginHistory || []).map((item: Record<string, string>) => {
          const device = parseDevice(item.device);
          const failed = /fail/i.test(item.status || '');
          return {
            id: item.id,
            at: item.at,
            user: item.username,
            code: item.username,
            department: 'Not recorded',
            role: '',
            event: failed ? 'Failed Login' : 'User Login',
            description: item.reason || item.status || 'Login',
            module: 'Authentication',
            page: 'Login',
            path: '/login',
            location: 'Not recorded',
            ip: item.ipAddress || 'Not recorded',
            ...device,
            risk: failed ? 'High' as const : 'Normal' as const,
            status: failed ? 'Failed' as const : 'Success' as const,
            category: 'Security Events' as const,
          } satisfies AuditEvent;
        });
        const merged = [...activity, ...security, ...logins].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
        setEvents(merged);
        setError('');
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Unable to load audit log'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => events.filter((event) => {
    if (tab !== 'Overview' && event.category !== tab && !(tab === 'Data Changes' && (event.before || event.after))) return false;
    const query = filters.query.trim().toLowerCase();
    const at = new Date(event.at).getTime();
    const from = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00`).getTime() : 0;
    const to = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59`).getTime() : Number.POSITIVE_INFINITY;
    const haystack = `${event.user} ${event.code} ${event.event} ${event.module} ${event.page} ${event.location} ${event.ip}`.toLowerCase();
    return (!query || haystack.includes(query))
      && (!filters.user || event.user.toLowerCase().includes(filters.user.toLowerCase()) || event.code.toLowerCase().includes(filters.user.toLowerCase()))
      && (!filters.module || event.module === filters.module)
      && (!filters.risk || event.risk === filters.risk)
      && (!filters.status || event.status === filters.status)
      && (!filters.location || event.location.toLowerCase().includes(filters.location.toLowerCase()))
      && (!filters.ip || event.ip.includes(filters.ip))
      && (!filters.device || `${event.os} ${event.browser}`.toLowerCase().includes(filters.device.toLowerCase()))
      && at >= from && at <= to;
  }), [events, filters, tab]);

  const today = new Date().toDateString();
  const todayEvents = events.filter((event) => new Date(event.at).toDateString() === today);
  const kpis = [
    ['Events Today', todayEvents.length, FileText, 'k0'],
    ['Active Users', new Set(todayEvents.map((event) => event.user)).size, Users, 'k1'],
    ['Failed Logins', todayEvents.filter((event) => event.status === 'Failed').length, LockKeyhole, 'k2'],
    ['Sensitive Actions', todayEvents.filter((event) => event.risk === 'Sensitive' || event.risk === 'High').length, AlertCircle, 'k3'],
    ['Unique IPs', new Set(todayEvents.map((event) => event.ip).filter((ip) => ip && ip !== 'Not recorded')).size, Globe2, 'k4'],
    ['Security Alerts', todayEvents.filter((event) => event.risk === 'High' || event.risk === 'Critical').length, TriangleAlert, 'k5'],
  ] as const;

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages);
  const start = (safePage - 1) * pageSize;
  const visible = filtered.slice(start, start + pageSize);
  const modules = Array.from(new Set(events.map((event) => event.module).filter(Boolean)));
  const set = (key: keyof typeof emptyFilters, value: string) => { setFilters((current) => ({ ...current, [key]: value })); setPage(1); };

  const exportCsv = () => {
    const header = ['Timestamp', 'User', 'Event', 'Module', 'Page', 'Location', 'IP', 'Device', 'Risk', 'Status'];
    const lines = filtered.map((event) => [stamp(event.at), event.user, event.event, event.module, event.page, event.location, event.ip, `${event.os} ${event.browser}`, event.risk, event.status].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'dle-audit-trail.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="audit-pro">
      <div className={selected ? 'layout' : 'layout closed'}>
        <div>
          <div className="breadcrumbs">Administration › Security › Audit Trail</div>
          <div className="page-title">
            <div className="shield"><ShieldCheck /></div>
            <div>
              <h1>Security Audit Trail</h1>
              <p>Monitor and review all system activities, security events, data changes and user actions across DLE Digital Enterprise.</p>
            </div>
          </div>
          <div className="tabs">
            {tabs.map(([Icon, label]) => <button type="button" key={label} className={tab === label ? 'active' : ''} onClick={() => { setTab(label); setPage(1); }}><Icon size={16} /> {label}</button>)}
          </div>
          {error ? <div className="error">{error}</div> : null}
          <div className="kpis">
            {kpis.map(([label, value, Icon, tone]) => (
              <div className={`kpi ${tone}`} key={label}><div className="kicon"><Icon size={20} /></div><div><span>{label}</span><strong>{value.toLocaleString('en-GB')}</strong><small>today</small></div></div>
            ))}
          </div>
          <div className="content-card">
            <div className="section-head">
              <div><b>{tab === 'Overview' ? 'Activity Logs' : tab}</b><span>Detailed record of all user activities, system events and data changes.</span></div>
              <div className="head-actions">
                <label><Search size={16} /><input value={filters.query} onChange={(event) => set('query', event.target.value)} placeholder="Search logs..." /></label>
                <button type="button" className="primary">Search</button>
                <button type="button" onClick={() => { setFilters(emptyFilters); setPage(1); }}>Reset</button>
                <button type="button" onClick={exportCsv}><Download size={16} /> Export</button>
                <button type="button" onClick={load}><RefreshCw size={16} /></button>
              </div>
            </div>
            <div className="filters">
              <label className="field"><span>Date From</span><input type="date" value={filters.dateFrom} onChange={(event) => set('dateFrom', event.target.value)} /></label>
              <label className="field"><span>Date To</span><input type="date" value={filters.dateTo} onChange={(event) => set('dateTo', event.target.value)} /></label>
              <label className="field"><span>User</span><input placeholder="All Users" value={filters.user} onChange={(event) => set('user', event.target.value)} /></label>
              <label className="field"><span>Module</span><select value={filters.module} onChange={(event) => set('module', event.target.value)}><option value="">All Modules</option>{modules.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="field"><span>Severity</span><select value={filters.risk} onChange={(event) => set('risk', event.target.value)}><option value="">All Severities</option>{['Informational', 'Normal', 'Sensitive', 'High', 'Critical'].map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="field"><span>Status</span><select value={filters.status} onChange={(event) => set('status', event.target.value)}><option value="">All Statuses</option><option>Success</option><option>Failed</option><option>Warning</option></select></label>
              <label className="field"><span>Location</span><input placeholder="Department or site" value={filters.location} onChange={(event) => set('location', event.target.value)} /></label>
              <label className="field"><span>IP Address</span><input placeholder="e.g. 102.89.68.106" value={filters.ip} onChange={(event) => set('ip', event.target.value)} /></label>
              <label className="field"><span>Device / Browser</span><input placeholder="All Devices" value={filters.device} onChange={(event) => set('device', event.target.value)} /></label>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr>{['Timestamp', 'User', 'Event', 'Module / Page', 'Record / Reference', 'Location', 'IP Address', 'Device', 'Risk', 'Status', 'Actions'].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead>
                <tbody>
                  {loading ? <tr><td colSpan={11}>Loading audit events…</td></tr> : visible.map((event) => (
                    <tr key={event.id} className={selected?.id === event.id ? 'selected' : ''} onClick={() => setSelected(event)}>
                      <td>{stamp(event.at)}</td>
                      <td><b>{event.user}</b><small>{event.code}</small></td>
                      <td><b>{event.event}</b></td>
                      <td>{event.module}<small>{event.page}</small></td>
                      <td>{event.path || '—'}</td>
                      <td>{event.location}</td>
                      <td>{event.ip}</td>
                      <td>{event.os}<small>{event.browser}</small></td>
                      <td><span className={`badge ${event.risk.toLowerCase()}`}>{event.risk}</span></td>
                      <td><span className={`badge ${event.status.toLowerCase()}`}>{event.status}</span></td>
                      <td><button type="button" className="view" onClick={() => setSelected(event)}>View</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && !visible.length ? <p className="empty" style={{ padding: 16 }}>No audit events match these filters.</p> : null}
              <div className="pager">
                <span>Showing {filtered.length ? start + 1 : 0} to {Math.min(start + pageSize, filtered.length)} of {filtered.length} records</span>
                <div>
                  <button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>‹</button>
                  <button type="button" className="current">{safePage}</button>
                  <button type="button" disabled={safePage >= pages} onClick={() => setPage(safePage + 1)}>›</button>
                </div>
                <label>Rows per page <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={50}>50</option><option value={100}>100</option></select></label>
              </div>
            </div>
          </div>
        </div>
        {selected ? (
          <aside className="drawer">
            <div className="drawer-title"><b>Audit Event Details</b><button type="button" onClick={() => setSelected(null)}><X size={18} /></button></div>
            <div className="event-title"><div className="event-icon"><UserRound /></div><div><b>{selected.event}</b><span className={`badge ${selected.risk.toLowerCase()}`}>{selected.risk}</span></div></div>
            <div className="event-id"><span>Event ID</span><b>{selected.id}</b><button type="button" onClick={() => navigator.clipboard?.writeText(selected.id)}><Copy size={14} /></button></div>
            <section className="drawer-section"><h4><ShieldCheck size={15} /> Event Information</h4><div className="rows">{[['Timestamp', stamp(selected.at)], ['Event Type', selected.event], ['Module', selected.module], ['Page', selected.page], ['Status', selected.status], ['Risk Level', selected.risk], ['Description', selected.description]].map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div></section>
            <section className="drawer-section"><h4><UserRound size={15} /> User Information</h4><div className="rows">{[['Name', selected.user], ['Account', selected.code]].map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div></section>
            <section className="drawer-section"><h4><MapPin size={15} /> Location</h4><div className="rows">{[['Work location', selected.location], ['Source', 'Department and unit on the user account'], ['IP address', selected.ip]].map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div></section>
            <section className="drawer-section"><h4><Monitor size={15} /> Device & Browser</h4><div className="rows">{[['Device', selected.os], ['Browser', selected.browser], ['User agent', selected.userAgent]].map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div></section>
            {selected.before || selected.after ? <section className="drawer-section"><h4><Database size={15} /> Data Changes</h4><div className="rows">{selected.before ? <div><span>Before</span><b>{selected.before}</b></div> : null}{selected.after ? <div><span>After</span><b>{selected.after}</b></div> : null}</div></section> : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
