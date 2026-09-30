'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ClipboardList, Copy, Database, Download, FileBarChart, FileText, Gauge, Globe2, LockKeyhole, MapPin, Monitor, RefreshCw, Search, ShieldCheck, TriangleAlert, UserRound, Users, X } from 'lucide-react';
import './audit-trail.css';

type Risk = 'Informational' | 'Normal' | 'Sensitive' | 'High' | 'Critical';
type EventStatus = 'Success' | 'Failed' | 'Warning';
type Tab = 'Overview' | 'Activity Logs' | 'Security Events' | 'User Sessions' | 'Data Changes' | 'Reports';

type IpPlace = {
  country: string;
  region: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  source: 'IP Geolocation' | 'Corporate Network' | 'Unavailable';
  note: string;
};

type BrowserPlace = {
  latitude: number;
  longitude: number;
  accuracyM: number;
  source: 'Browser GPS';
  state?: string;
  city?: string;
  lga?: string;
  street?: string;
};

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
  ipPlace?: IpPlace | null;
  browserPlace?: BrowserPlace | null;
};

const optionalNumber = (value: unknown) => {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const readIpPlace = (value: unknown): IpPlace | null => {
  if (!value || typeof value !== 'object') return null;
  const place = value as IpPlace;
  if (place.source !== 'IP Geolocation' && place.source !== 'Corporate Network' && place.source !== 'Unavailable') return null;
  return {
    country: String(place.country || ''),
    region: String(place.region || ''),
    city: String(place.city || ''),
    latitude: optionalNumber(place.latitude),
    longitude: optionalNumber(place.longitude),
    source: place.source,
    note: String(place.note || ''),
  };
};

const readBrowserPlace = (value: unknown): BrowserPlace | null => {
  if (!value || typeof value !== 'object') return null;
  const place = value as BrowserPlace;
  const latitude = optionalNumber(place.latitude);
  const longitude = optionalNumber(place.longitude);
  const accuracyM = optionalNumber(place.accuracyM);
  if (place.source !== 'Browser GPS' || latitude == null || longitude == null || accuracyM == null || accuracyM <= 0) return null;
  return {
    latitude,
    longitude,
    accuracyM,
    source: 'Browser GPS',
    state: String(place.state || ''),
    city: String(place.city || ''),
    lga: String(place.lga || ''),
    street: String(place.street || ''),
  };
};

const devicePlaceLabel = (place?: BrowserPlace | null) => {
  if (!place) return '';
  const city = [place.city, place.lga].filter((part, index, list) => part && list.indexOf(part) === index).join(' / ');
  return [place.street, city, place.state].filter(Boolean).join(', ');
};

const approximatePlace = (event: AuditEvent) => {
  const place = event.ipPlace;
  if (!place || place.source === 'Unavailable') return 'IP location unavailable';
  if (place.source === 'Corporate Network') return 'Private network';
  return [place.city, place.region, place.country].filter(Boolean).join(', ') || 'Approximate IP location';
};

const approximateCue = (event: AuditEvent) => {
  if (event.ipPlace?.source === 'IP Geolocation') return 'Approximate, from source IP';
  if (event.ipPlace?.source === 'Corporate Network') return 'Private network address';
  if (event.ipPlace?.source === 'Unavailable') return 'Source IP recorded; place lookup unavailable';
  return event.location || 'Work location only';
};

const coordinateText = (latitude: number | null | undefined, longitude: number | null | undefined) => (
  latitude == null || longitude == null ? 'Not available' : `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
);

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

const stampShort = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const ipHost = (ip: string) => ip.replace(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/, '$1');

export default function AuditTrailClient() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [tab, setTab] = useState<Tab>('Overview');
  const [filters, setFilters] = useState(emptyFilters);
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [card, setCard] = useState('');

  const load = () => {
    setLoading(true);
    fetch('/api/admin/audit', { cache: 'no-store' })
      .then((response) => response.json().then((json) => ({ response, json })))
      .then(({ response, json }) => {
        if (!response.ok) throw new Error(json.error || 'Unable to load audit log');
        const text = (value: unknown) => String(value || '');
        const activity = ((json.data?.activity || []) as Record<string, unknown>[]).map((item) => {
          const device = parseDevice(text(item.device));
          const kind = classify(text(item.action));
          return {
            id: text(item.id),
            at: text(item.at),
            user: text(item.fullName) || text(item.username),
            code: text(item.username),
            department: text(item.location) || 'Not recorded',
            role: '',
            event: text(item.action),
            description: `${text(item.action)} in ${text(item.module) || 'DLE Connect'}`,
            module: text(item.module) || 'Application',
            page: text(item.page) || text(item.path) || '—',
            path: text(item.path),
            location: text(item.location) || 'Not recorded',
            ip: text(item.ipAddress) || 'Not recorded',
            ...device,
            ...kind,
            ipPlace: readIpPlace(item.ipPlace),
            browserPlace: readBrowserPlace(item.browserPlace),
          } satisfies AuditEvent;
        });
        const security = ((json.data?.audit || []) as Record<string, unknown>[]).map((item) => {
          const device = parseDevice(text(item.device));
          const kind = classify(text(item.action));
          return {
            id: text(item.id),
            at: text(item.at),
            user: text(item.user),
            code: text(item.performedBy) || text(item.user),
            department: 'Not recorded',
            role: '',
            event: text(item.action),
            description: text(item.newValue) || text(item.action),
            module: 'Security',
            page: 'Administration',
            path: '',
            location: 'Not recorded',
            ip: text(item.ipAddress) || 'Not recorded',
            ...device,
            ...kind,
            category: kind.category === 'Activity Logs' ? 'Security Events' : kind.category,
            before: text(item.oldValue) || undefined,
            after: text(item.newValue) || undefined,
            ipPlace: readIpPlace(item.ipPlace),
          } satisfies AuditEvent;
        });
        const logins = ((json.data?.loginHistory || []) as Record<string, unknown>[]).map((item) => {
          const device = parseDevice(text(item.device));
          const failed = /fail/i.test(text(item.status));
          return {
            id: text(item.id),
            at: text(item.at),
            user: text(item.username),
            code: text(item.username),
            department: 'Not recorded',
            role: '',
            event: failed ? 'Failed Login' : 'User Login',
            description: text(item.reason) || text(item.status) || 'Login',
            module: 'Authentication',
            page: 'Login',
            path: '/login',
            location: 'Not recorded',
            ip: text(item.ipAddress) || 'Not recorded',
            ...device,
            risk: failed ? 'High' as const : 'Normal' as const,
            status: failed ? 'Failed' as const : 'Success' as const,
            category: 'Security Events' as const,
            ipPlace: readIpPlace(item.ipPlace),
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

  useEffect(() => {
    if (!selected) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const filtered = useMemo(() => {
    const todayName = new Date().toDateString();
    const isToday = (event: AuditEvent) => new Date(event.at).toDateString() === todayName;
    let source = events;
    if (card === 'Events Today') source = events.filter(isToday);
    else if (card === 'Active Users') {
      const seen = new Set<string>();
      source = events.filter(isToday).filter((event) => {
        const key = event.user || event.code;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    } else if (card === 'Failed Logins') source = events.filter((event) => isToday(event) && event.status === 'Failed');
    else if (card === 'Sensitive Actions') source = events.filter((event) => isToday(event) && (event.risk === 'Sensitive' || event.risk === 'High'));
    else if (card === 'Unique IPs') {
      const seen = new Set<string>();
      source = events.filter(isToday).filter((event) => {
        if (!event.ip || event.ip === 'Not recorded' || seen.has(event.ip)) return false;
        seen.add(event.ip);
        return true;
      });
    } else if (card === 'Security Alerts') source = events.filter((event) => isToday(event) && (event.risk === 'High' || event.risk === 'Critical'));
    return source.filter((event) => {
      if (!card && tab !== 'Overview' && event.category !== tab && !(tab === 'Data Changes' && (event.before || event.after))) return false;
      const query = filters.query.trim().toLowerCase();
      const at = new Date(event.at).getTime();
      const from = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00`).getTime() : 0;
      const to = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59`).getTime() : Number.POSITIVE_INFINITY;
      const place = approximatePlace(event);
      const haystack = `${event.user} ${event.code} ${event.event} ${event.module} ${event.page} ${event.location} ${place} ${event.ip}`.toLowerCase();
      return (!query || haystack.includes(query))
        && (!filters.user || event.user.toLowerCase().includes(filters.user.toLowerCase()) || event.code.toLowerCase().includes(filters.user.toLowerCase()))
        && (!filters.module || event.module === filters.module)
        && (!filters.risk || event.risk === filters.risk)
        && (!filters.status || event.status === filters.status)
        && (!filters.location || `${event.location} ${place}`.toLowerCase().includes(filters.location.toLowerCase()))
        && (!filters.ip || event.ip.includes(filters.ip))
        && (!filters.device || `${event.os} ${event.browser}`.toLowerCase().includes(filters.device.toLowerCase()))
        && at >= from && at <= to;
    });
  }, [events, filters, tab, card]);

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
    const header = ['Timestamp', 'User', 'Event', 'Module', 'Page', 'Work location', 'Approximate place', 'Location source', 'Approximate coordinates', 'Device location', 'Device accuracy (m)', 'IP', 'Device', 'Risk', 'Status'];
    const lines = filtered.map((event) => [stamp(event.at), event.user, event.event, event.module, event.page, event.location, approximatePlace(event), event.ipPlace?.source || '', coordinateText(event.ipPlace?.latitude, event.ipPlace?.longitude), event.browserPlace ? coordinateText(event.browserPlace.latitude, event.browserPlace.longitude) : '', event.browserPlace ? String(event.browserPlace.accuracyM) : '', event.ip, `${event.os} ${event.browser}`, event.risk, event.status].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','));
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
            {tabs.map(([Icon, label]) => <button type="button" key={label} className={tab === label ? 'active' : ''} onClick={() => { setTab(label); setCard(''); setPage(1); }}><Icon size={16} /> {label}</button>)}
          </div>
          {error ? <div className="error">{error}</div> : null}
          <div className="kpis">
            {kpis.map(([label, value, Icon, tone]) => (
              <button type="button" className={`kpi ${tone}${card === label ? ' selected' : ''}`} key={label} aria-pressed={card === label} onClick={() => { setCard((current) => current === label ? '' : label); setPage(1); }}><div className="kicon"><Icon size={20} /></div><div><span>{label}</span><strong>{value.toLocaleString('en-GB')}</strong><small>today</small></div></button>
            ))}
          </div>
          {card ? <p className="card-note">Showing the {filtered.length} record{filtered.length === 1 ? '' : 's'} behind {card}. Click the card again to clear.</p> : null}
          <div className="content-card">
            <div className="section-head">
              <div><b>{tab === 'Overview' ? 'Activity Logs' : tab}</b><span>Detailed record of all user activities, system events and data changes.</span></div>
              <div className="head-actions">
                <label><Search size={16} /><input value={filters.query} onChange={(event) => set('query', event.target.value)} placeholder="Search logs..." /></label>
                <button type="button" className="primary">Search</button>
                <button type="button" onClick={() => { setFilters(emptyFilters); setCard(''); setPage(1); }}>Reset</button>
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
              <label className="field"><span>Location</span><input placeholder="City, department, or site" value={filters.location} onChange={(event) => set('location', event.target.value)} /></label>
              <label className="field"><span>IP Address</span><input placeholder="e.g. 102.89.68.106" value={filters.ip} onChange={(event) => set('ip', event.target.value)} /></label>
              <label className="field"><span>Device / Browser</span><input placeholder="All Devices" value={filters.device} onChange={(event) => set('device', event.target.value)} /></label>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th className="col-time">Time</th>
                    <th className="col-user">User</th>
                    <th className="col-event">Event</th>
                    <th className="col-module">Module / Page</th>
                    <th className="col-path">Record / Reference</th>
                    <th className="col-place">Approximate location</th>
                    <th className="col-ip">IP Address</th>
                    <th className="col-device">Device</th>
                    <th className="col-risk">Risk</th>
                    <th className="col-status">Status</th>
                    <th className="col-action"> </th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? <tr><td colSpan={11}>Loading audit events…</td></tr> : visible.map((event) => (
                    <tr key={event.id} className={selected?.id === event.id ? 'selected' : ''} onClick={() => setSelected(event)}>
                      <td className="col-time">{stampShort(event.at)}</td>
                      <td className="col-user"><b className="clip" title={event.user}>{event.user}</b><small className="clip">{event.code}</small></td>
                      <td className="col-event"><b className="clip" title={event.event}>{event.event}</b></td>
                      <td className="col-module"><span className="clip">{event.module}</span><small className="clip" title={event.page}>{event.page}</small></td>
                      <td className="col-path"><span className="clip" title={event.path}>{event.path || '—'}</span></td>
                      <td className="col-place"><b className="clip" title={approximatePlace(event)}>{approximatePlace(event)}</b><small className="clip">{approximateCue(event)}</small>{devicePlaceLabel(event.browserPlace) ? <small className="clip" title={devicePlaceLabel(event.browserPlace)}>Device GPS: {devicePlaceLabel(event.browserPlace)}</small> : null}</td>
                      <td className="col-ip"><span className="clip" title={event.ip}>{ipHost(event.ip)}</span></td>
                      <td className="col-device">{event.os}<small className="clip">{event.browser}</small></td>
                      <td className="col-risk"><span className={`badge ${event.risk.toLowerCase()}`}>{event.risk}</span></td>
                      <td className="col-status"><span className={`badge ${event.status.toLowerCase()}`}>{event.status}</span></td>
                      <td className="col-action"><button type="button" className="view" onClick={() => setSelected(event)}>View</button></td>
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
          <div className="modal-backdrop" onClick={() => setSelected(null)} role="presentation">
            <div className="modal" role="dialog" aria-modal="true" aria-labelledby="audit-event-title" onClick={(event) => event.stopPropagation()}>
              <div className="drawer-title"><b id="audit-event-title">Audit Event Details</b><button type="button" aria-label="Close" onClick={() => setSelected(null)}><X size={18} /></button></div>
              <div className="event-title"><div className="event-icon"><UserRound /></div><div><b>{selected.event}</b><span className={`badge ${selected.risk.toLowerCase()}`}>{selected.risk}</span></div></div>
              <div className="event-id"><span>Event ID</span><b>{selected.id}</b><button type="button" aria-label="Copy event ID" onClick={() => navigator.clipboard?.writeText(selected.id)}><Copy size={14} /></button></div>
              <div className="modal-grid">
                <section className="drawer-section"><h4><ShieldCheck size={15} /> Event Information</h4><div className="rows">{[['Timestamp', stamp(selected.at)], ['Event Type', selected.event], ['Module', selected.module], ['Page', selected.page], ['Record', selected.path || '—'], ['Status', selected.status], ['Risk Level', selected.risk], ['Description', selected.description]].map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div></section>
                <section className="drawer-section">
                  <h4><UserRound size={15} /> User Information</h4>
                  <div className="rows">{[['Name', selected.user], ['Account', selected.code]].map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div>
                  <h4><Monitor size={15} /> Device & Browser</h4>
                  <div className="rows">{[['Device', selected.os], ['Browser', selected.browser], ['User agent', selected.userAgent]].map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div>
                </section>
                <section className="drawer-section span"><h4><MapPin size={15} /> Approximate location from source IP</h4><div className="rows">{[['Place', approximatePlace(selected)], ['Source', selected.ipPlace?.source || 'Not recorded'], ['Coordinates', coordinateText(selected.ipPlace?.latitude, selected.ipPlace?.longitude)], ['Accuracy', selected.ipPlace?.source === 'IP Geolocation' ? 'City-level approximation. Not an exact physical location.' : selected.ipPlace?.note || 'Not derived'], ['Source IP', selected.ip]].map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div></section>
                {selected.browserPlace ? <section className="drawer-section span"><h4><MapPin size={15} /> Device location</h4><div className="rows">{[['Street', selected.browserPlace.street || 'Not returned for this GPS fix'], ['City / local government', [selected.browserPlace.city, selected.browserPlace.lga].filter((part, index, list) => part && list.indexOf(part) === index).join(' / ') || 'Not returned'], ['State', selected.browserPlace.state || 'Not returned'], ['Coordinates', coordinateText(selected.browserPlace.latitude, selected.browserPlace.longitude)], ['Accuracy', `${selected.browserPlace.accuracyM} metres`], ['Source', selected.browserPlace.source]].map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div></section> : null}
                <section className="drawer-section"><h4><MapPin size={15} /> Work location</h4><div className="rows">{[['Department / unit', selected.location], ['Source', 'Department and unit on the user account']].map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div></section>
                {selected.before || selected.after ? <section className="drawer-section"><h4><Database size={15} /> Data Changes</h4><div className="rows">{selected.before ? <div><span>Before</span><b>{selected.before}</b></div> : null}{selected.after ? <div><span>After</span><b>{selected.after}</b></div> : null}</div></section> : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
