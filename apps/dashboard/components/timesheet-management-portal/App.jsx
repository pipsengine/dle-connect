'use client';
import React, { Component, Suspense, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Layout from './components/Layout';
import { PortalDataProvider, usePortalData } from './portal-data';
import Dashboard from './pages/Dashboard';
import Entry from './pages/Entry';
import Review from './pages/Review';
import Periods from './pages/Periods';
import Reports from './pages/Reports';
import CrewAssignments from './pages/CrewAssignments';
import AttendanceReconciliation from './pages/AttendanceReconciliation';
import OvtNightWork from './pages/OvtNightWork';
import OffshoreMobilization from './pages/OffshoreMobilization';
import Approvals from './pages/Approvals';
import CorrectionsAdjustments from './pages/CorrectionsAdjustments';
import Configuration from './pages/Configuration';

const pages = {
  Dashboard,
  'Timesheet Entry': Entry,
  'Timesheet Review': Review,
  'Timesheet Periods': Periods,
  'Crew & Assignments': CrewAssignments,
  'Attendance Reconciliation': AttendanceReconciliation,
  'OVT & Night Work': OvtNightWork,
  'Offshore & Mobilization': OffshoreMobilization,
  Approvals,
  'Corrections & Adjustments': CorrectionsAdjustments,
  Reports,
  Configuration,
};

const pageSlugs = {
  Dashboard: 'dashboard',
  'Timesheet Entry': 'entry',
  'Timesheet Review': 'review',
  'Timesheet Periods': 'periods',
  'Crew & Assignments': 'crew',
  'Attendance Reconciliation': 'attendance',
  'OVT & Night Work': 'overtime',
  'Offshore & Mobilization': 'offshore',
  Approvals: 'approvals',
  'Corrections & Adjustments': 'corrections',
  Reports: 'reports',
  Configuration: 'configuration',
};

const pageFromSlug = Object.fromEntries(Object.entries(pageSlugs).map(([name, slug]) => [slug, name]));

const pageFromSearch = (params) => {
  if (params.get('section') === 'crew-removal') return 'Crew & Assignments';
  const requested = params.get('page') || '';
  return pages[requested] ? requested : (pageFromSlug[requested] || 'Dashboard');
};

class PortalErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error('[timesheet-portal]', error); }
  render() {
    if (!this.state.error) return this.props.children;
    return <div className="panel" style={{ margin: 24, padding: 24 }}><h1>Timesheet page could not be shown</h1><p>{this.state.error.message || 'Unexpected error'}</p><button type="button" onClick={() => this.setState({ error: null })}>Try again</button></div>;
  }
}

function PortalShell() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { snapshot } = usePortalData();
  const page = pageFromSearch(searchParams);
  const setPage = (next) => {
    const resolved = pages[next] ? next : 'Dashboard';
    if (resolved === page) return;
    const params = new URLSearchParams(searchParams.toString());
    if (resolved === 'Dashboard') params.delete('page');
    else params.set('page', pageSlugs[resolved]);
    if (params.get('section') === 'crew-removal' && resolved !== 'Crew & Assignments') params.delete('section');
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  useEffect(() => {
    if (snapshot?.viewer && page === 'Timesheet Periods' && !snapshot.viewer.canManagePeriods) setPage('Dashboard');
  }, [snapshot, page]);
  const Current = pages[page] || Dashboard;
  return (
    <Layout page={page} setPage={setPage}>
      <PortalErrorBoundary key={page}><Current setPage={setPage} /></PortalErrorBoundary>
    </Layout>
  );
}

export default function App() {
  return <PortalDataProvider><Suspense fallback={null}><PortalShell /></Suspense></PortalDataProvider>;
}
