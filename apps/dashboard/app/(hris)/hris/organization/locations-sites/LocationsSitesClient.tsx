'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Building2,
  ChevronRight,
  Download,
  Globe2,
  MapPin,
  Network,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { HealthStatus, LocationSiteRecord, StructureInsight } from '@/lib/organization-data';

type Payload = {
  generatedAt: string;
  permissions: {
    canEdit: boolean;
    canExport: boolean;
    canViewCosts: boolean;
  };
  summary: {
    totalRecords: number;
    totalLocations: number;
    totalSites: number;
    totalHeadcount: number;
    totalOpenRoles: number;
    avgSuccessionCoverage: number;
    avgAttritionRisk: number;
  };
  filterOptions: {
    recordTypes: Array<'Location' | 'Site'>;
    regions: string[];
    siteCategories: string[];
    healthStatuses: HealthStatus[];
  };
  records: LocationSiteRecord[];
  insights: StructureInsight[];
};

type TabId = 'overview' | 'location-explorer' | 'site-explorer' | 'analytics' | 'risk';

const tabs: Array<{ id?: TabId; label: string; href?: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'location-explorer', label: 'Location Explorer' },
  { id: 'site-explorer', label: 'Site Explorer' },
  { id: 'analytics', label: 'Location Analytics' },
  { label: 'Workforce Planning', href: '/hris/organization/workforce-planning' },
  { id: 'risk', label: 'Risk & Compliance' },
];

const formatNumber = (value: number) => new Intl.NumberFormat('en-US').format(value);
const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(value);

const healthTone = (status: HealthStatus) => {
  if (status === 'Critical') return 'bg-red-50 text-red-700 border-red-200';
  if (status === 'Needs Attention') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
};

const insightTone = (severity: StructureInsight['severity']) => {
  if (severity === 'high') return 'border-red-200 bg-red-50';
  if (severity === 'medium') return 'border-amber-200 bg-amber-50';
  return 'border-emerald-200 bg-emerald-50';
};

const getContinent = (country: string) => {
  const normalized = country.trim().toLowerCase();
  if (normalized.includes('nigeria') || normalized.includes('ghana') || normalized.includes('kenya')) return 'Africa';
  if (normalized.includes('united kingdom') || normalized.includes('germany') || normalized.includes('france')) return 'Europe';
  if (normalized.includes('united states') || normalized.includes('canada') || normalized.includes('mexico')) return 'North America';
  if (normalized.includes('brazil') || normalized.includes('argentina')) return 'South America';
  if (normalized.includes('china') || normalized.includes('india') || normalized.includes('singapore')) return 'Asia';
  return 'Africa';
};

export default function LocationsSitesClient() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [recordTypeFilter, setRecordTypeFilter] = useState<'All' | 'Location' | 'Site'>('All');
  const [regionFilter, setRegionFilter] = useState<'All' | string>('All');
  const [categoryFilter, setCategoryFilter] = useState<'All' | string>('All');
  const [healthFilter, setHealthFilter] = useState<'All' | HealthStatus>('All');
  const [sortBy, setSortBy] = useState<'headcount' | 'openRoles' | 'successionCoveragePct' | 'attritionRiskPct'>('headcount');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [showMapFocus, setShowMapFocus] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/hris/organization/locations-sites', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Unable to load locations and sites');
      const data = json.data as Payload;
      setPayload(data);
      setSelectedId((prev) => prev || data.records.find((record) => record.recordType === 'Location')?.id || data.records[0]?.id || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load locations and sites');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const records = payload?.records || [];

  const visibleRecords = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = records.filter((record) => {
      if (recordTypeFilter !== 'All' && record.recordType !== recordTypeFilter) return false;
      if (regionFilter !== 'All' && record.region !== regionFilter) return false;
      if (categoryFilter !== 'All' && record.siteCategory !== categoryFilter) return false;
      if (healthFilter !== 'All' && record.healthStatus !== healthFilter) return false;
      if (!q) return true;

      return [
        record.name,
        record.region,
        record.country,
        record.leader,
        record.location,
        record.description,
        record.costCenter,
        record.parentName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sortBy === 'successionCoveragePct') return b.successionCoveragePct - a.successionCoveragePct;
      if (sortBy === 'attritionRiskPct') return b.attritionRiskPct - a.attritionRiskPct;
      if (sortBy === 'openRoles') return b.openRoles - a.openRoles;
      return b.headcount - a.headcount;
    });
    return sorted;
  }, [records, query, recordTypeFilter, regionFilter, categoryFilter, healthFilter, sortBy]);

  const locationRecords = useMemo(() => records.filter((record) => record.recordType === 'Location'), [records]);
  const siteRecords = useMemo(() => records.filter((record) => record.recordType === 'Site'), [records]);

  const visibleLocations = useMemo(
    () => visibleRecords.filter((record) => record.recordType === 'Location'),
    [visibleRecords],
  );
  const visibleSites = useMemo(() => visibleRecords.filter((record) => record.recordType === 'Site'), [visibleRecords]);

  const selectedRecord = useMemo(() => {
    return visibleRecords.find((record) => record.id === selectedId) || visibleRecords[0] || null;
  }, [visibleRecords, selectedId]);

  const healthyCount = useMemo(() => records.filter((record) => record.healthStatus === 'Healthy').length, [records]);
  const needsAttentionCount = useMemo(
    () => records.filter((record) => record.healthStatus === 'Needs Attention').length,
    [records],
  );
  const criticalCount = useMemo(() => records.filter((record) => record.healthStatus === 'Critical').length, [records]);

  const geographicFootprint = useMemo(() => {
    const groups = new Map<string, { locations: number; sites: number; headcount: number }>();
    records.forEach((record) => {
      const continent = getContinent(record.country);
      const existing = groups.get(continent) || { locations: 0, sites: 0, headcount: 0 };
      if (record.recordType === 'Location') existing.locations += 1;
      else existing.sites += 1;
      existing.headcount += record.headcount;
      groups.set(continent, existing);
    });
    return Array.from(groups.entries())
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.locations - a.locations);
  }, [records]);

  const regionalRollups = useMemo(
    () =>
      [...locationRecords]
        .sort((a, b) => b.headcount - a.headcount)
        .map((record) => ({
          name: record.name,
          region: record.region,
          headcount: record.headcount,
          sites: record.relatedItems.length,
          healthStatus: record.healthStatus,
        })),
    [locationRecords],
  );

  const topLocationsByHeadcount = useMemo(
    () => [...locationRecords].sort((a, b) => b.headcount - a.headcount).slice(0, 5),
    [locationRecords],
  );

  const criticalLocations = useMemo(
    () =>
      [...records]
        .filter((record) => record.healthStatus === 'Critical' || record.healthStatus === 'Needs Attention')
        .sort((a, b) => b.attritionRiskPct - a.attritionRiskPct)
        .slice(0, 4),
    [records],
  );

  const workforceDistribution = useMemo(() => {
    if (!records.length) return [];
    const largest = [...records].sort((a, b) => b.headcount - a.headcount)[0];
    const fastestGrowing = [...records].sort((a, b) => b.openRoles - a.openRoles)[0];
    const highestAttrition = [...records].sort((a, b) => b.attritionRiskPct - a.attritionRiskPct)[0];
    const mostStable = [...records].filter((record) => record.healthStatus === 'Healthy').sort((a, b) => a.attritionRiskPct - b.attritionRiskPct)[0] || largest;
    const mostVacancies = [...records].sort((a, b) => b.openRoles - a.openRoles)[0];
    const highestSuccession = [...records].sort((a, b) => b.successionCoveragePct - a.successionCoveragePct)[0];

    return [
      { label: 'Largest Workforce Location', name: largest.name, detail: `${formatNumber(largest.headcount)} employees` },
      { label: 'Fastest Growing Location', name: fastestGrowing.name, detail: `${formatNumber(fastestGrowing.openRoles)} open roles` },
      { label: 'Highest Attrition Risk', name: highestAttrition.name, detail: `${highestAttrition.attritionRiskPct}% risk` },
      { label: 'Most Stable Location', name: mostStable.name, detail: `${100 - mostStable.attritionRiskPct}% stability` },
      { label: 'Most Vacancies', name: mostVacancies.name, detail: `${formatNumber(mostVacancies.openRoles)} vacancies` },
      { label: 'Highest Succession Coverage', name: highestSuccession.name, detail: `${highestSuccession.successionCoveragePct}% coverage` },
    ];
  }, [records]);

  const locationInsightCards = useMemo(() => {
    const immediateAttention = records.filter((record) => record.healthStatus === 'Critical').length;
    const highAttrition = records.filter((record) => record.attritionRiskPct >= 40).length;
    const strongSuccession = records.filter((record) => record.successionCoveragePct >= 70).length;
    const hiringFreeze = records.filter((record) => record.openRoles === 0 && record.headcount >= 50).length;

    return [
      { label: 'Locations Requiring Immediate Attention', value: immediateAttention, tone: 'red' as const },
      { label: 'High Attrition Risk Locations', value: highAttrition, tone: 'amber' as const },
      { label: 'Strong Succession Coverage Locations', value: strongSuccession, tone: 'emerald' as const },
      { label: 'Hiring Freeze Locations', value: hiringFreeze, tone: 'slate' as const },
    ];
  }, [records]);

  const avgSpanOfControl = useMemo(() => {
    if (!records.length) return 0;
    return Math.round((records.reduce((sum, record) => sum + record.spanOfControl, 0) / records.length) * 10) / 10;
  }, [records]);

  const utilizationRate = useMemo(() => {
    if (!payload) return 0;
    const capacity = payload.summary.totalHeadcount + payload.summary.totalOpenRoles;
    if (!capacity) return 0;
    return Math.round((payload.summary.totalHeadcount / capacity) * 1000) / 10;
  }, [payload]);

  const recentRecords = useMemo(() => [...records].sort((a, b) => b.headcount - a.headcount).slice(0, 3), [records]);

  useEffect(() => {
    if (!selectedRecord && visibleRecords.length) setSelectedId(visibleRecords[0].id);
  }, [selectedRecord, visibleRecords]);

  const resetFilters = () => {
    setQuery('');
    setRecordTypeFilter('All');
    setRegionFilter('All');
    setCategoryFilter('All');
    setHealthFilter('All');
    setSortBy('headcount');
  };

  const reviewAttentionLocations = () => {
    setHealthFilter('Needs Attention');
    setActiveTab('overview');
    const first = records.find((record) => record.healthStatus === 'Needs Attention' || record.healthStatus === 'Critical');
    if (first) setSelectedId(first.id);
  };

  const exportCsv = () => {
    if (!payload?.permissions.canExport) return;
    const rows = [
      [
        'Name',
        'Record Type',
        'Region',
        'Parent',
        'Category',
        'Leader',
        'Headcount',
        'Open Roles',
        'Divisions',
        'Business Units',
        'Departments',
        'Teams',
        'Succession Coverage %',
        'Attrition Risk %',
        'Budget NGN',
        'Payroll NGN',
      ],
      ...visibleRecords.map((record) => [
        record.name,
        record.recordType,
        record.region,
        record.parentName || '—',
        record.siteCategory,
        record.leader,
        String(record.headcount),
        String(record.openRoles),
        String(record.divisionCount),
        String(record.businessUnitCount),
        String(record.departmentCount),
        String(record.teamCount),
        String(record.successionCoveragePct),
        String(record.attritionRiskPct),
        String(record.budgetNgn),
        String(record.payrollNgn),
      ]),
    ];

    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'locations-sites.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className="border-b border-[#E5E7EB] bg-white px-6 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB]">
                <MapPin className="h-5 w-5" />
              </span>
              <h1 className="text-4xl font-bold tracking-tight">Locations & Sites</h1>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-[#64748B]">
              Monitor organizational footprint, workforce distribution, site performance, leadership accountability, and location health.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={exportCsv}
              disabled={!payload?.permissions.canExport}
              className="inline-flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export Locations
            </button>
            <button
              type="button"
              onClick={() => {
                setShowMapFocus(true);
                setActiveTab('overview');
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Globe2 className="h-4 w-4" />
              View Map
            </button>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              New Location / Site
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4 px-6 py-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <MetricCard icon={MapPin} label="Total Records" value={payload ? formatNumber(payload.summary.totalRecords) : '—'} detail="Locations and sites" />
          <MetricCard icon={Building2} label="Locations" value={payload ? formatNumber(payload.summary.totalLocations) : '—'} detail="Regional roll-up records" />
          <MetricCard icon={Network} label="Sites" value={payload ? formatNumber(payload.summary.totalSites) : '—'} detail="Physical operating footprints" />
          <MetricCard icon={Users} label="Headcount" value={payload ? formatNumber(payload.summary.totalHeadcount) : '—'} detail="Combined workforce footprint" />
          <MetricCard icon={ShieldCheck} label="Succession Coverage" value={payload ? `${payload.summary.avgSuccessionCoverage}%` : '—'} detail="Average location readiness" />
          <MetricCard icon={AlertTriangle} label="Attrition Risk" value={payload ? `${payload.summary.avgAttritionRisk}%` : '—'} detail="Average location pressure" />
        </div>

        {payload ? (
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex-1">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold">Location Health Overview</h2>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-[#10B981]">Data Status: Live</span>
                </div>
                <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-slate-100">
                  {[
                    { count: healthyCount, color: '#10B981' },
                    { count: needsAttentionCount, color: '#F59E0B' },
                    { count: criticalCount, color: '#EF4444' },
                  ].map((segment) => (
                    <div
                      key={segment.color}
                      className="h-full"
                      style={{
                        width: `${Math.max((segment.count / Math.max(payload.summary.totalRecords, 1)) * 100, segment.count ? 4 : 0)}%`,
                        backgroundColor: segment.color,
                      }}
                    />
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-4 text-sm">
                  <span className="font-semibold text-[#10B981]">Healthy Locations: {formatNumber(healthyCount)}</span>
                  <span className="font-semibold text-[#F59E0B]">Needs Attention: {formatNumber(needsAttentionCount)}</span>
                  <span className="font-semibold text-[#EF4444]">Critical Locations: {formatNumber(criticalCount)}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={reviewAttentionLocations}
                className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                View Locations Requiring Attention
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-xl border border-[#E5E7EB] bg-white p-2 shadow-sm">
          <div className="flex min-w-max flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-max gap-1">
              {tabs.map((tab) =>
                tab.href ? (
                  <Link key={tab.label} href={tab.href} className="rounded-lg px-3 py-2 text-xs font-semibold whitespace-nowrap text-slate-700 hover:bg-slate-100">
                    {tab.label}
                  </Link>
                ) : (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => tab.id && setActiveTab(tab.id)}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold whitespace-nowrap ${activeTab === tab.id ? 'bg-[#2563EB] text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                  >
                    {tab.label}
                  </button>
                ),
              )}
            </div>
            <div className="flex min-w-max flex-wrap items-center gap-2 px-1 pb-1 xl:pb-0">
              <label className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search location, site, region, leader..."
                  className="w-64 rounded-lg border border-[#E5E7EB] py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                />
              </label>
              <button type="button" onClick={resetFilters} className="rounded-lg border border-[#E5E7EB] px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                Reset Filters
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 rounded-xl border border-[#E5E7EB] bg-white p-4 md:grid-cols-2 xl:grid-cols-5">
          <Select value={regionFilter} onChange={(value) => setRegionFilter(value as 'All' | string)} options={['All', ...(payload?.filterOptions.regions || [])]} labels={{ All: 'All Regions' }} />
          <Select value={categoryFilter} onChange={(value) => setCategoryFilter(value as 'All' | string)} options={['All', ...(payload?.filterOptions.siteCategories || [])]} labels={{ All: 'All Categories' }} />
          <Select value={healthFilter} onChange={(value) => setHealthFilter(value as 'All' | HealthStatus)} options={['All', ...(payload?.filterOptions.healthStatuses || [])]} labels={{ All: 'All Health States' }} />
          <Select value={recordTypeFilter} onChange={(value) => setRecordTypeFilter(value as typeof recordTypeFilter)} options={['All', ...(payload?.filterOptions.recordTypes || [])]} labels={{ All: 'All Site Types' }} />
          <Select
            value={sortBy}
            onChange={(value) => setSortBy(value as typeof sortBy)}
            options={['headcount', 'openRoles', 'successionCoveragePct', 'attritionRiskPct']}
            labels={{ headcount: 'Headcount Range', openRoles: 'Open Roles', successionCoveragePct: 'Succession', attritionRiskPct: 'Attrition' }}
          />
        </div>

        {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">{error}</div> : null}

        {activeTab === 'overview' ? (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)_minmax(0,340px)]">
            <GeographicFootprintPanel
              geographicFootprint={geographicFootprint}
              regionalRollups={regionalRollups}
              highlighted={showMapFocus}
            />

            <div className="space-y-4">
              <LocationPerformancePanel
                payload={payload}
                avgSpanOfControl={avgSpanOfControl}
                utilizationRate={utilizationRate}
              />
              <LocationSpotlightPanel selectedRecord={selectedRecord} />
            </div>

            <div className="space-y-4">
              <TopLocationsPanel locations={topLocationsByHeadcount} onSelect={setSelectedId} />
              <LocationInsightCards cards={locationInsightCards} />
              <WorkforceDistributionPanel items={workforceDistribution} />
              <CriticalLocationsPanel locations={criticalLocations} onSelect={setSelectedId} />
              <QuickActionsPanel onExport={exportCsv} canExport={payload?.permissions.canExport ?? false} />
            </div>
          </div>
        ) : null}

        {activeTab === 'location-explorer' ? (
          <LocationWorkspaceList
            title="Location Workspaces"
            loading={loading}
            records={visibleLocations}
            selectedId={selectedRecord?.recordType === 'Location' ? selectedRecord.id : null}
            onSelect={setSelectedId}
          />
        ) : null}

        {activeTab === 'site-explorer' ? (
          <LocationWorkspaceList
            title="Site Workspaces"
            loading={loading}
            records={visibleSites}
            selectedId={selectedRecord?.recordType === 'Site' ? selectedRecord.id : null}
            onSelect={setSelectedId}
          />
        ) : null}

        {activeTab === 'analytics' ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <TopLocationsPanel locations={topLocationsByHeadcount} onSelect={setSelectedId} expanded />
            <WorkforceDistributionPanel items={workforceDistribution} expanded />
            <LocationPerformancePanel payload={payload} avgSpanOfControl={avgSpanOfControl} utilizationRate={utilizationRate} expanded />
            <GeographicFootprintPanel geographicFootprint={geographicFootprint} regionalRollups={regionalRollups} expanded />
          </div>
        ) : null}

        {activeTab === 'risk' ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
            <div className="space-y-4">
              <CriticalLocationsPanel locations={criticalLocations} onSelect={setSelectedId} expanded />
              <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
                <h3 className="text-sm font-semibold">Risk & Compliance Observations</h3>
                <div className="mt-3 space-y-3">
                  {(payload?.insights || []).map((insight) => (
                    <div key={insight.id} className={`rounded-xl border p-4 ${insightTone(insight.severity)}`}>
                      <div className="text-sm font-semibold text-slate-900">{insight.title}</div>
                      <div className="mt-1 text-xs text-slate-600">{insight.recommendation}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <LocationInsightCards cards={locationInsightCards} />
          </div>
        ) : null}

        {activeTab === 'overview' ? (
          <RecentLocationsPanel
            records={recentRecords}
            onSelect={setSelectedId}
            onViewAll={() => setActiveTab('location-explorer')}
          />
        ) : null}

        {criticalCount > 0 ? (
          <div className="flex flex-col gap-3 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-[#2563EB]" />
              <p className="text-sm font-medium text-[#0F172A]">
                AI Insight: {formatNumber(criticalCount + needsAttentionCount)} locations require review due to workforce pressure, leadership gaps, or succession risk.
              </p>
            </div>
            <button type="button" onClick={reviewAttentionLocations} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[#2563EB] hover:text-blue-700">
              View AI Recommendations
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function GeographicFootprintPanel({
  geographicFootprint,
  regionalRollups,
  highlighted = false,
  expanded = false,
}: {
  geographicFootprint: Array<{ name: string; locations: number; sites: number; headcount: number }>;
  regionalRollups: Array<{ name: string; region: string; headcount: number; sites: number; healthStatus: HealthStatus }>;
  highlighted?: boolean;
  expanded?: boolean;
}) {
  const markers = [
    { continent: 'North America', left: '18%', top: '32%' },
    { continent: 'Europe', left: '48%', top: '28%' },
    { continent: 'Africa', left: '50%', top: '52%' },
    { continent: 'Asia', left: '72%', top: '36%' },
    { continent: 'South America', left: '28%', top: '62%' },
  ];

  return (
    <div className={`rounded-xl border bg-white p-4 shadow-sm ${highlighted ? 'border-[#2563EB] ring-2 ring-[#2563EB]/20' : 'border-[#E5E7EB]'}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Geographic Footprint</h2>
          <p className="mt-1 text-xs text-[#64748B]">Locations by region, site count, and workforce distribution.</p>
        </div>
        <Globe2 className="h-5 w-5 text-[#2563EB]" />
      </div>

      <div className={`relative mt-4 overflow-hidden rounded-xl bg-gradient-to-b from-sky-50 to-blue-100 ${expanded ? 'h-72' : 'h-56'}`}>
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, #93C5FD 0%, transparent 40%), radial-gradient(circle at 70% 60%, #60A5FA 0%, transparent 35%)' }} />
        {markers.map((marker) => {
          const stats = geographicFootprint.find((item) => item.name === marker.continent);
          if (!stats) return null;
          return (
            <div key={marker.continent} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: marker.left, top: marker.top }}>
              <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-[#2563EB] text-xs font-bold text-white shadow-lg">
                {stats.locations}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 space-y-2">
        {geographicFootprint.map((region) => (
          <div key={region.name} className="flex items-center justify-between rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2 text-sm">
            <span className="font-semibold text-slate-900">{region.name}</span>
            <span className="text-slate-600">
              {formatNumber(region.locations)} locations • {formatNumber(region.headcount)} HC
            </span>
          </div>
        ))}
      </div>

      {!expanded ? (
        <div className="mt-4 space-y-2">
          {regionalRollups.slice(0, 4).map((rollup) => (
            <div key={rollup.name} className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700">{rollup.name}</span>
              <span className="text-slate-500">{formatNumber(rollup.sites)} sites</span>
            </div>
          ))}
        </div>
      ) : null}

      <button type="button" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#2563EB] hover:text-blue-700">
        View Full Map
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function LocationPerformancePanel({
  payload,
  avgSpanOfControl,
  utilizationRate,
  expanded = false,
}: {
  payload: Payload | null;
  avgSpanOfControl: number;
  utilizationRate: number;
  expanded?: boolean;
}) {
  const items = [
    { label: 'Total Headcount', value: payload ? formatNumber(payload.summary.totalHeadcount) : '—', icon: Users },
    { label: 'Open Roles', value: payload ? formatNumber(payload.summary.totalOpenRoles) : '—', icon: BriefcaseIcon },
    { label: 'Sites', value: payload ? formatNumber(payload.summary.totalSites) : '—', icon: Network },
    { label: 'Average Span Of Control', value: `${avgSpanOfControl}`, icon: TrendingUp },
    { label: 'Hiring Load', value: payload ? formatNumber(Math.round(payload.summary.totalOpenRoles * 0.75)) : '—', icon: AlertTriangle },
    { label: 'Utilization Rate', value: `${utilizationRate}%`, icon: ShieldCheck },
  ];

  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <h3 className="text-lg font-semibold">Location Performance</h3>
      <div className={`mt-4 gap-3 ${expanded ? 'grid grid-cols-2 md:grid-cols-3' : 'grid grid-cols-2 md:grid-cols-3'}`}>
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">{item.label}</span>
                <Icon className="h-4 w-4 text-[#2563EB]" />
              </div>
              <div className="mt-2 text-xl font-bold text-slate-900">{item.value}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BriefcaseIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={props.className}>
      <path d="M10 7V5a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v2" />
      <rect x="3" y="7" width="18" height="13" rx="2" />
    </svg>
  );
}

function LocationSpotlightPanel({ selectedRecord }: { selectedRecord: LocationSiteRecord | null }) {
  if (!selectedRecord) {
    return (
      <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-600">Select a location or site to view performance details.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">Location Spotlight</p>
          <h3 className="mt-1 text-xl font-semibold">{selectedRecord.name}</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">{selectedRecord.recordType}</span>
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${healthTone(selectedRecord.healthStatus)}`}>
              {selectedRecord.healthStatus}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <DetailStat label="Leader" value={selectedRecord.leader} />
        <DetailStat label="Region" value={selectedRecord.region} />
        <DetailStat label="Headcount" value={formatNumber(selectedRecord.headcount)} />
        <DetailStat label="Open Roles" value={formatNumber(selectedRecord.openRoles)} />
        <DetailStat label="Sites / Nodes" value={formatNumber(selectedRecord.relatedItems.length || selectedRecord.nodeCount)} />
        <DetailStat label="Budget" value={formatCurrency(selectedRecord.budgetNgn)} />
        <DetailStat label="Succession" value={`${selectedRecord.successionCoveragePct}%`} />
        <DetailStat label="Attrition Risk" value={`${selectedRecord.attritionRiskPct}%`} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <ProgressCard label="Succession Coverage" value={selectedRecord.successionCoveragePct} tone="emerald" />
        <ProgressCard label="Attrition Risk" value={selectedRecord.attritionRiskPct} tone="amber" />
        <ProgressCard label="Span of Control" value={Math.min(selectedRecord.spanOfControl * 10, 100)} tone="blue" display={`${selectedRecord.spanOfControl}`} />
      </div>

      <Link href="/hris/organization/units-sections" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#2563EB] hover:text-blue-700">
        Open Workspace
        <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function LocationWorkspaceList({
  title,
  loading,
  records,
  selectedId,
  onSelect,
}: {
  title: string;
  loading: boolean;
  records: LocationSiteRecord[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
      <div className="border-b border-[#E5E7EB] px-5 py-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-xs text-[#64748B]">Card-based workspace navigation for location and site drill-down.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <div className="text-sm font-medium text-slate-600">Loading records...</div>
        ) : records.length ? (
          records.map((record) => {
            const active = selectedId === record.id;
            const siteCount = record.recordType === 'Location' ? record.relatedItems.length : record.nodeCount;
            return (
              <div key={record.id} className={`rounded-xl border p-4 ${active ? 'border-[#2563EB]/30 bg-blue-50/50' : 'border-[#E5E7EB] hover:bg-slate-50'}`}>
                <button type="button" onClick={() => onSelect(record.id)} className="w-full text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{record.name}</div>
                      <div className="mt-1 text-xs text-slate-500">{record.region} • {record.leader}</div>
                    </div>
                    <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${healthTone(record.healthStatus)}`}>{record.healthStatus}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <span>Headcount: {formatNumber(record.headcount)}</span>
                    <span>Sites: {formatNumber(siteCount)}</span>
                    <span>Open Roles: {formatNumber(record.openRoles)}</span>
                  </div>
                </button>
                <button type="button" onClick={() => onSelect(record.id)} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#2563EB] hover:text-blue-700">
                  Open Workspace
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        ) : (
          <div className="text-sm font-medium text-slate-600">No records match the current filters.</div>
        )}
      </div>
    </div>
  );
}

function TopLocationsPanel({
  locations,
  onSelect,
  expanded = false,
}: {
  locations: LocationSiteRecord[];
  onSelect: (id: string) => void;
  expanded?: boolean;
}) {
  const maxHeadcount = locations[0]?.headcount || 1;

  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold">Top Locations by Headcount</h3>
      <div className={`mt-3 space-y-3 ${expanded ? 'md:grid md:grid-cols-2 md:gap-3 md:space-y-0' : ''}`}>
        {locations.map((location) => (
          <button
            key={location.id}
            type="button"
            onClick={() => onSelect(location.id)}
            className="block w-full rounded-lg border border-[#E5E7EB] p-3 text-left hover:bg-slate-50"
          >
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-semibold text-slate-900">{location.name}</span>
              <span className="text-slate-600">{formatNumber(location.headcount)} employees</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-[#2563EB]" style={{ width: `${(location.headcount / maxHeadcount) * 100}%` }} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function LocationInsightCards({
  cards,
}: {
  cards: Array<{ label: string; value: number; tone: 'red' | 'amber' | 'emerald' | 'slate' }>;
}) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold">Location Insights</h3>
      <div className="mt-3 space-y-2">
        {cards.map((card) => (
          <div
            key={card.label}
            className={`rounded-lg border p-3 ${
              card.tone === 'emerald'
                ? 'border-emerald-200 bg-emerald-50'
                : card.tone === 'amber'
                  ? 'border-amber-200 bg-amber-50'
                  : card.tone === 'red'
                    ? 'border-red-200 bg-red-50'
                    : 'border-slate-200 bg-slate-50'
            }`}
          >
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">{card.label}</div>
            <div className="mt-1 text-xl font-bold text-slate-900">{formatNumber(card.value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkforceDistributionPanel({
  items,
  expanded = false,
}: {
  items: Array<{ label: string; name: string; detail: string }>;
  expanded?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold">Workforce Distribution</h3>
      <div className={`mt-3 gap-2 ${expanded ? 'grid grid-cols-2' : 'space-y-2'}`}>
        {items.map((item) => (
          <div key={item.label} className="rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">{item.label}</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">{item.name}</div>
            <div className="text-xs text-slate-500">{item.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CriticalLocationsPanel({
  locations,
  onSelect,
  expanded = false,
}: {
  locations: LocationSiteRecord[];
  onSelect: (id: string) => void;
  expanded?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold">Critical Locations</h3>
      <div className={`mt-3 space-y-2 ${expanded ? 'md:grid md:grid-cols-2 md:gap-3 md:space-y-0' : ''}`}>
        {locations.length ? (
          locations.map((location) => (
            <div key={location.id} className="rounded-lg border border-[#E5E7EB] p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{location.name}</div>
                  <div className="text-xs text-slate-500">
                    {location.attritionRiskPct >= 40 ? 'High attrition pressure' : 'Succession and leadership review required'}
                  </div>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${healthTone(location.healthStatus)}`}>
                  {location.healthStatus}
                </span>
              </div>
              <button type="button" onClick={() => onSelect(location.id)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#2563EB] hover:text-blue-700">
                Open Workspace
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-600">No critical locations detected.</p>
        )}
      </div>
    </div>
  );
}

function QuickActionsPanel({ onExport, canExport }: { onExport: () => void; canExport: boolean }) {
  const actions = [
    { label: 'Create Location', href: '/hris/organization/locations-sites', icon: MapPin },
    { label: 'Create Site', href: '/hris/organization/locations-sites', icon: Building2 },
    { label: 'View Organization Map', href: '/hris/organization/organogram', icon: Globe2 },
    { label: 'Workforce Planning', href: '/hris/organization/workforce-planning', icon: Users },
    { label: 'Location Report', href: '/hris/organization/reporting-hierarchy', icon: Network },
  ];

  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold">Quick Actions</h3>
      <div className="mt-3 grid grid-cols-1 gap-2">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link key={action.label} href={action.href} className="flex items-center gap-3 rounded-lg border border-[#E5E7EB] px-3 py-2.5 text-sm font-semibold text-slate-700 hover:border-blue-200 hover:bg-blue-50">
              <Icon className="h-4 w-4 text-[#2563EB]" />
              {action.label}
            </Link>
          );
        })}
        <button type="button" onClick={onExport} disabled={!canExport} className="flex items-center gap-3 rounded-lg border border-[#E5E7EB] px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:border-blue-200 hover:bg-blue-50 disabled:opacity-50">
          <Download className="h-4 w-4 text-[#2563EB]" />
          Export Locations
        </button>
      </div>
    </div>
  );
}

function RecentLocationsPanel({
  records,
  onSelect,
  onViewAll,
}: {
  records: LocationSiteRecord[];
  onSelect: (id: string) => void;
  onViewAll: () => void;
}) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Recent Locations & Sites</h3>
        <button type="button" onClick={onViewAll} className="inline-flex items-center gap-1 text-xs font-semibold text-[#2563EB] hover:text-blue-700">
          View All Locations & Sites
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-3 space-y-2">
        {records.map((record) => (
          <button
            key={record.id}
            type="button"
            onClick={() => onSelect(record.id)}
            className="flex w-full items-center justify-between gap-3 rounded-lg border border-[#E5E7EB] px-3 py-3 text-left hover:bg-slate-50"
          >
            <div>
              <div className="text-sm font-semibold text-slate-900">{record.name}</div>
              <div className="text-xs text-slate-500">
                {record.recordType} • {record.region} • {record.leader}
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-slate-600">{formatNumber(record.headcount)} HC</span>
              <span className={`rounded-full border px-2 py-0.5 font-semibold ${healthTone(record.healthStatus)}`}>{record.healthStatus}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
          <div className="mt-2 text-xs text-slate-500">{detail}</div>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB]">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">{label}</div>
      <div className="mt-1 text-sm font-semibold text-[#0F172A]">{value}</div>
    </div>
  );
}

function ProgressCard({
  label,
  value,
  tone,
  display,
}: {
  label: string;
  value: number;
  tone: 'emerald' | 'amber' | 'blue';
  display?: string;
}) {
  const styles = tone === 'emerald' ? 'bg-emerald-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-blue-500';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-semibold text-slate-600">{label}</div>
      <div className="mt-1 text-lg font-bold text-slate-900">{display || `${value}%`}</div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${styles}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
  labels,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  labels?: Record<string, string>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {labels?.[option] || option}
        </option>
      ))}
    </select>
  );
}
