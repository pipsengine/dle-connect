'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, ChevronLeft, ChevronRight, Eye, Filter, LogOut, Monitor, MonitorCog, MoreVertical, RefreshCw, RotateCcw, Search, Smartphone, UserRound, Users, Cog } from 'lucide-react';
import './user-sessions.css';

type LiveSession = {
  sessionKey: string;
  username: string;
  fullName: string;
  roles: string;
  module: string;
  page: string;
  path: string;
  location: string;
  ipAddress: string;
  device: string;
  loggedInAt: string;
  lastSeenAt: string;
  status: 'Online' | 'Idle' | 'Disconnected';
};

type Row = LiveSession & {
  displayStatus: 'Online' | 'Away' | 'Offline';
  os: string;
  browser: string;
  kind: 'desktop' | 'mobile' | 'none';
  initials: string;
  loginLabel: string;
  activityLabel: string;
  duration: string;
};

const emptyFilters = { q: '', status: 'All', module: 'All Modules', location: 'All Locations', device: 'All Devices' };

const parseDevice = (ua: string) => {
  const text = ua || '';
  if (!text || text === 'Not recorded' || text === '—') return { os: '—', browser: '—', kind: 'none' as const };
  const mobile = /Android|iPhone|iPad|Mobile/i.test(text);
  let os = 'Unknown device';
  if (/Windows/i.test(text)) os = 'Windows';
  else if (/Android\s([\d.]+)/i.test(text)) os = `Android ${(text.match(/Android\s([\d.]+)/i) || [])[1]?.split('.')[0] || ''}`.trim();
  else if (/iPhone|iPad|iOS/i.test(text)) os = 'iOS';
  else if (/Mac OS/i.test(text)) os = 'macOS';
  let browser = 'Browser';
  const edge = text.match(/Edg\/([\d.]+)/);
  const chrome = text.match(/Chrome\/([\d.]+)/);
  const firefox = text.match(/Firefox\/([\d.]+)/);
  const safari = /Safari/i.test(text) && !chrome;
  if (edge) browser = `Edge ${edge[1].split('.')[0]}`;
  else if (chrome) browser = `Chrome ${chrome[1].split('.')[0]}${mobile ? ' (Mobile)' : ''}`;
  else if (firefox) browser = `Firefox ${firefox[1].split('.')[0]}`;
  else if (safari) browser = mobile ? 'Safari Mobile' : 'Safari';
  return { os, browser, kind: mobile ? 'mobile' as const : 'desktop' as const };
};

const stamp = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() === 0) return '—';
  return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const duration = (from: string, to: string) => {
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const mins = Math.max(1, Math.floor(ms / 60000));
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'U';

const isAdmin = (roles: string) => /admin/i.test(roles);

export default function UserSessionsClient() {
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [filters, setFilters] = useState(emptyFilters);
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<Row | null>(null);
  const [card, setCard] = useState('');

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/user-sessions', { cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Unable to load user sessions.');
    setSessions(body.data?.sessions || []);
    setError('');
  }, []);

  useEffect(() => {
    load().catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Unable to load user sessions.'));
    const timer = window.setInterval(() => { load().catch(() => undefined); }, 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  const rows = useMemo<Row[]>(() => sessions.map((session) => {
    const device = parseDevice(session.device);
    const displayStatus = session.status === 'Online' ? 'Online' : session.status === 'Idle' ? 'Away' : 'Offline';
    return {
      ...session,
      displayStatus,
      ...device,
      kind: displayStatus === 'Offline' ? 'none' : device.kind,
      initials: initials(session.fullName || session.username),
      loginLabel: stamp(session.loggedInAt),
      activityLabel: stamp(session.lastSeenAt),
      duration: duration(session.loggedInAt, session.lastSeenAt),
    };
  }), [sessions]);

  const modules = Array.from(new Set(rows.map((row) => row.module).filter(Boolean)));
  const locations = Array.from(new Set(rows.map((row) => row.location).filter((item) => item && item !== 'Not recorded')));

  const matchesCard = (row: Row) => {
    if (card === 'Active Sessions') return row.displayStatus !== 'Offline';
    if (card === 'Employees Online') return row.displayStatus === 'Online';
    if (card === 'Administrators Online') return row.displayStatus !== 'Offline' && isAdmin(row.roles);
    if (card === 'Windows PCs') return row.kind === 'desktop';
    if (card === 'Mobile Devices') return row.kind === 'mobile';
    return true;
  };

  const filtered = rows.filter((row) => {
    const query = filters.q.trim().toLowerCase();
    return matchesCard(row)
      && (!query || `${row.fullName} ${row.username} ${row.roles}`.toLowerCase().includes(query))
      && (filters.status === 'All' || row.displayStatus === filters.status)
      && (filters.module === 'All Modules' || row.module === filters.module)
      && (filters.location === 'All Locations' || row.location === filters.location)
      && (filters.device === 'All Devices' || row.kind === filters.device);
  });

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages);
  const start = (safePage - 1) * pageSize;
  const visible = filtered.slice(start, start + pageSize);
  const active = rows.filter((row) => row.displayStatus !== 'Offline').length;
  const online = rows.filter((row) => row.displayStatus === 'Online').length;
  const admins = rows.filter((row) => row.displayStatus !== 'Offline' && isAdmin(row.roles)).length;
  const pcs = rows.filter((row) => row.kind === 'desktop').length;
  const mobiles = rows.filter((row) => row.kind === 'mobile').length;
  const allChecked = visible.length > 0 && visible.every((row) => selected.includes(row.sessionKey));

  const terminate = async (keys: string[]) => {
    const live = keys.filter((key) => rows.find((row) => row.sessionKey === key)?.displayStatus !== 'Offline');
    if (!live.length) return;
    if (!window.confirm(`Terminate ${live.length} session${live.length > 1 ? 's' : ''}? Those people will be signed out.`)) return;
    setBusy(true);
    try {
      for (const sessionKey of live) {
        const response = await fetch('/api/admin/user-sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'disconnect', sessionKey }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Unable to terminate the session.');
      }
      setSelected([]);
      setToast(`${live.length} session${live.length > 1 ? 's' : ''} terminated`);
      window.setTimeout(() => setToast(''), 2200);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to terminate the session.');
    } finally {
      setBusy(false);
    }
  };

  const cards = [
    [active, 'Active Sessions', 'Users currently online', Users, 'blue'],
    [online, 'Employees Online', 'Across all modules', UserRound, 'green'],
    [admins, 'Administrators Online', 'Including Super Admins', Cog, 'orange'],
    [pcs, 'Windows PCs', 'Most used device', Monitor, 'purple'],
    [mobiles, 'Mobile Devices', 'Android / iOS', Smartphone, 'red'],
  ] as const;

  return (
    <div className="us-pro">
      <div className="page-head">
        <div className="title-wrap">
          <div className="title-icon"><MonitorCog size={28} /></div>
          <div>
            <h1>User Sessions</h1>
            <p>People signed in now, the module and page they are on, and the device they are using.</p>
          </div>
        </div>
        <div className="head-actions">
          <span className="live"><i />Live (Auto refresh 30s)</span>
          <button type="button" className="refresh" onClick={() => load().then(() => setToast('Sessions refreshed')).catch((loadError) => setError(loadError.message))}><RefreshCw size={18} /></button>
          <button type="button" className="terminate" disabled={!selected.length || busy} onClick={() => terminate(selected)}><Ban size={18} />Terminate Selected{selected.length ? ` (${selected.length})` : ''}</button>
        </div>
      </div>
      {error ? <div className="error">{error}</div> : null}
      <section className="stats">
        {cards.map(([count, title, subtitle, Icon, tone]) => (
          <button type="button" className={`stat ${tone}${card === title ? ' selected' : ''}`} key={title} aria-pressed={card === title} onClick={() => { setCard((current) => current === title ? '' : title); setPage(1); }}>
            <div className="stat-icon"><Icon size={28} /></div>
            <div><b>{count}</b><strong>{title}</strong><small>{subtitle}</small></div>
          </button>
        ))}
      </section>
      {card ? <p className="card-note">Showing the {filtered.length} session{filtered.length === 1 ? '' : 's'} counted in {card}. Click the card again to clear.</p> : null}
      <section className="filters">
        <label className="search-field"><span>Search User</span><div><Search size={17} /><input value={filters.q} onChange={(event) => { setFilters({ ...filters, q: event.target.value }); setPage(1); }} placeholder="Search by name, employee ID..." /></div></label>
        <label><span>Status</span><select value={filters.status} onChange={(event) => { setFilters({ ...filters, status: event.target.value }); setPage(1); }}><option>All</option><option>Online</option><option>Away</option><option>Offline</option></select></label>
        <label><span>Module</span><select value={filters.module} onChange={(event) => { setFilters({ ...filters, module: event.target.value }); setPage(1); }}><option>All Modules</option>{modules.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>Location</span><select value={filters.location} onChange={(event) => { setFilters({ ...filters, location: event.target.value }); setPage(1); }}><option>All Locations</option>{locations.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>Device Type</span><select value={filters.device} onChange={(event) => { setFilters({ ...filters, device: event.target.value }); setPage(1); }}><option>All Devices</option><option value="desktop">Desktop</option><option value="mobile">Mobile</option></select></label>
        <button type="button" className="apply"><Filter size={17} />Apply Filters</button>
        <button type="button" className="reset" onClick={() => { setFilters(emptyFilters); setCard(''); setPage(1); }}><RotateCcw size={17} />Reset</button>
      </section>
      {detail ? (
        <div className="detail">
          <div><span>User</span><b>{detail.fullName || detail.username}</b></div>
          <div><span>Role</span><b>{detail.roles || '—'}</b></div>
          <div><span>Page</span><b>{detail.page}</b></div>
          <div><span>Path</span><b>{detail.path}</b></div>
          <div><span>Location</span><b>{detail.location}</b></div>
          <div><span>IP address</span><b>{detail.ipAddress}</b></div>
          <div><span>Device</span><b>{detail.os} · {detail.browser}</b></div>
          <div><span>Signed in</span><b>{detail.loginLabel}</b></div>
        </div>
      ) : null}
      <div className="table-shell">
        <table>
          <thead>
            <tr>
              <th><input type="checkbox" checked={allChecked} onChange={() => setSelected(allChecked ? selected.filter((key) => !visible.some((row) => row.sessionKey === key)) : Array.from(new Set([...selected, ...visible.map((row) => row.sessionKey)])))} /></th>
              {['User', 'Status', 'Module', 'Page / Feature', 'Location', 'IP Address', 'Device', 'Login Time', 'Last Activity', 'Duration', 'Actions'].map((heading) => <th key={heading}>{heading.toUpperCase()}</th>)}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.sessionKey}>
                <td><input type="checkbox" checked={selected.includes(row.sessionKey)} onChange={() => setSelected((current) => current.includes(row.sessionKey) ? current.filter((key) => key !== row.sessionKey) : [...current, row.sessionKey])} /></td>
                <td><div className="usercell"><div className="avatar">{row.initials}</div><div><strong>{row.fullName || row.username}</strong><small>{row.username}{row.roles ? ` · ${row.roles}` : ''}</small></div></div></td>
                <td><span className={`status ${row.displayStatus.toLowerCase()}`}><i />{row.displayStatus}</span></td>
                <td>{row.module}</td>
                <td><div className="pagecell"><strong>{row.page}</strong><small>{row.path}</small></div></td>
                <td>{row.location}</td>
                <td>{row.ipAddress}</td>
                <td><div className="devicecell">{row.kind === 'mobile' ? <Smartphone size={22} /> : row.kind === 'desktop' ? <Monitor size={22} /> : null}<div><span>{row.os}</span><small>{row.browser}</small></div></div></td>
                <td className="date">{row.loginLabel}</td>
                <td className="date">{row.activityLabel}</td>
                <td>{row.duration}</td>
                <td>
                  <div className="action-wrap">
                    <button type="button" className="more" title="Session actions"><MoreVertical size={18} /></button>
                    <div className="action-menu">
                      <button type="button" onClick={() => setDetail(row)}><Eye size={15} />View details</button>
                      {row.displayStatus !== 'Offline' ? <button type="button" onClick={() => terminate([row.sessionKey])}><LogOut size={15} />Terminate</button> : null}
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length ? <div className="empty">No sessions match the selected filters.</div> : null}
      </div>
      <div className="pagination">
        <span>Showing {filtered.length ? start + 1 : 0} to {Math.min(start + pageSize, filtered.length)} of {filtered.length} sessions</span>
        <div>
          <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={10}>10 per page</option><option value={25}>25 per page</option></select>
          <button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}><ChevronLeft size={18} /></button>
          <button type="button" className="page active">{safePage}</button>
          <button type="button" disabled={safePage >= pages} onClick={() => setPage(safePage + 1)}><ChevronRight size={18} /></button>
        </div>
      </div>
      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}
