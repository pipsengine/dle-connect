import React, { useEffect, useState } from 'react';
import { Clock3, LayoutDashboard, CalendarRange, Users, ScanLine, Moon, Ship, CheckSquare2, Wrench, BarChart3, Settings2, ClipboardCheck, Menu, Bell, Search, Home, ChevronLeft, ChevronRight } from 'lucide-react';
import { usePortalData } from '../portal-data';

const nav = [['Dashboard', LayoutDashboard], ['Timesheet Entry', Clock3], ['Timesheet Review', ClipboardCheck], ['Timesheet Periods', CalendarRange], ['Crew & Assignments', Users], ['Attendance Reconciliation', ScanLine], ['OVT & Night Work', Moon], ['Offshore & Mobilization', Ship], ['Approvals', CheckSquare2], ['Corrections & Adjustments', Wrench], ['Reports', BarChart3], ['Configuration', Settings2]];
const SIDEBAR_KEY = 'dle-ts-sidebar';

export default function Layout({ page, setPage, children }) {
  const { snapshot } = usePortalData();
  const canManagePeriods = Boolean(snapshot?.viewer?.canManagePeriods);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(window.localStorage.getItem(SIDEBAR_KEY) === '1');
  }, []);
  useEffect(() => {
    document.documentElement.dataset.dlePage = page;
    window.dispatchEvent(new Event('dle-page'));
    return () => { delete document.documentElement.dataset.dlePage; };
  }, [page]);
  const toggleSidebar = () => {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0');
      return next;
    });
  };
  const items = nav.filter(([name]) => name !== 'Timesheet Periods' || canManagePeriods);
  return (
    <div className={collapsed ? 'shell collapsed' : 'shell'}>
      <aside>
        <div className="brand">
          <a href="/" title="DLE Connect home">
            <img className="brandLogo" src="/brand/dorman-long-logo.jpg" alt="Dorman Long Engineering Limited" />
          </a>
        </div>
        <div className="moduleTag">TIMESHEET MANAGEMENT</div>
        <nav>{items.map(([n, I]) => <button key={n} title={n} className={page === n ? 'on' : ''} onClick={() => setPage(n)}><I size={17} /><span>{n}</span></button>)}</nav>
        <button type="button" className="collapseBtn" onClick={toggleSidebar} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
        <div className="user"><div className="avatar">CO</div><div><b>Chris Ogbaisi</b><span>Timesheet Administrator</span></div></div>
      </aside>
      <main>
        <header>
          <a className="homeBtn" href="/"><Home size={15} />Home</a>
          <button className="icon" type="button" onClick={toggleSidebar} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}><Menu size={18} /></button>
          <div className="crumb"><a href="/">DLE Connect</a> <b>/ Timesheet Management</b></div>
          <div className="headerRight"><div className="search"><Search size={15} /><input placeholder="Search employee, project, period..." /></div><button className="icon" type="button"><Bell size={18} /></button><div className="avatar sm">CO</div></div>
        </header>
        <section className="content">{children}</section>
      </main>
    </div>
  );
}
