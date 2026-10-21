'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, DetailModal, Field, SearchCombo, Table, Tabs } from '../components/UI';

const TABS = ['Overview', 'Man-Hour Utilization', 'Project Labour Cost', 'Employee Cost Breakdown', 'Budget vs Actual', 'Reports & Export'];
const APPROVALS = ['', 'Draft', 'Submitted', 'Supervisor Approved', 'Cost Control Approved', 'PM Partially Approved', 'PM Approved', 'HR Approved', 'Payroll Ready', 'Payroll Posted', 'Returned'];
const CATEGORIES = ['', 'Regular', 'Overtime', 'Saturday', 'Sunday', 'Public Holiday', 'Night Work', 'Night Allowance', 'Other Allowances'];
const EMPTY = {
  periodId: '', from: '', to: '', project: '', projectManager: '', department: '', supervisor: '', location: '', workCenter: '', employee: '', employeeType: '', approval: '', category: '', groupBy: 'employee-project',
};

const money = (value, empty = 'Not Available') => {
  if (value == null || value === '') return empty;
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 }).format(Number(value));
};
const hours = (value) => (value == null || value === '' ? '—' : Number(value).toLocaleString('en-NG', { maximumFractionDigits: 2 }));
const percent = (value) => (value == null ? 'Not Available' : `${Number(value).toLocaleString('en-NG', { maximumFractionDigits: 2 })}%`);
const toneFor = (status) => {
  if (/over budget/i.test(status)) return 'red';
  if (/approaching|incomplete|provisional|pending/i.test(status)) return 'amber';
  if (/within|approved|ready|posted/i.test(status)) return 'green';
  return 'slate';
};

const queryOf = (filters, extra = {}) => {
  const params = new URLSearchParams();
  Object.entries({ ...filters, ...extra }).forEach(([key, value]) => {
    if (value !== '' && value != null) params.set(key, String(value));
  });
  return params.toString();
};

export default function LabourCost() {
  const [draft, setDraft] = useState(EMPTY);
  const [filters, setFilters] = useState(EMPTY);
  const [tab, setTab] = useState(TABS[0]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [linePage, setLinePage] = useState(1);
  const [projectPage, setProjectPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [exporting, setExporting] = useState('');

  const load = async (next, page = linePage) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/timesheet-management/labour-cost?${queryOf(next, { linePage: page, pageSize: 25 })}`, { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.status === 'error') throw new Error(body.error || 'The labour report could not be loaded.');
      setData(body.data);
      if (!next.periodId && body.data?.period?.id) {
        const seeded = { ...next, periodId: body.data.period.id, from: body.data.from, to: body.data.to };
        setDraft(seeded);
        setFilters(seeded);
      }
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(EMPTY, 1); }, []);

  const apply = (override) => {
    const next = override && override.periodId !== undefined ? override : draft;
    setDraft(next);
    setFilters(next);
    setLinePage(1);
    setProjectPage(1);
    load(next, 1);
  };
  const reset = () => {
    const cleared = { ...EMPTY, periodId: data?.period?.id || '', from: data?.period?.startDate || '', to: data?.period?.endDate || '' };
    setDraft(cleared);
    setFilters(cleared);
    setLinePage(1);
    load(cleared, 1);
  };
  const changePage = (page) => { setLinePage(page); load(filters, page); };
  const setField = (key, value) => setDraft((current) => ({ ...current, [key]: value || '' }));

  const download = async (format) => {
    setExporting(format);
    setError('');
    try {
      const response = await fetch(`/api/timesheet-management/labour-cost?${queryOf(filters, { format, linePage: 1, pageSize: 25 })}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Export failed.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = format === 'pdf' ? 'DLE_Project_Labour_Cost.pdf' : 'DLE_Project_Labour_Cost.xlsx';
      link.click();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError.message);
    } finally {
      setExporting('');
    }
  };

  const saveAction = async (payload) => {
    setNotice('');
    setError('');
    const response = await fetch('/api/timesheet-management/labour-cost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, filters }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.status === 'error') throw new Error(body.error || 'Save failed.');
    setData(body.data);
    setNotice('Saved. The report is using the updated costing record.');
  };

  const projects = data?.projects || [];
  const projectSlice = projects.slice((projectPage - 1) * 25, projectPage * 25);
  const projectPages = Math.max(1, Math.ceil(projects.length / 25));
  const linePages = Math.max(1, Math.ceil((data?.lineTotal || 0) / (data?.pageSize || 25)));
  const topHours = useMemo(() => [...projects].sort((left, right) => right.uniqueHours - left.uniqueHours).slice(0, 10), [projects]);
  const topCost = useMemo(() => [...projects].filter((project) => project.approvedCost != null).sort((left, right) => right.approvedCost - left.approvedCost).slice(0, 10), [projects]);
  const maxHours = topHours[0]?.uniqueHours || 1;
  const maxCost = topCost[0]?.approvedCost || 1;

  return <>
    <div className="pageTitle">
      <div>
        <span className="eyebrow">PROJECT CONTROLS</span>
        <h1>Project Man-Hours & Labour Cost</h1>
        <p>Hours come from timesheet project allocations. Cost is calculated only where a project labour cost rate or a locked payroll snapshot exists.</p>
      </div>
      <div className="actions">
        <Button kind="secondary" disabled={!!exporting} onClick={() => download('xlsx')}>{exporting === 'xlsx' ? 'Preparing Excel…' : 'Export Excel'}</Button>
        <Button kind="secondary" disabled={!!exporting} onClick={() => download('pdf')}>{exporting === 'pdf' ? 'Preparing PDF…' : 'Export PDF'}</Button>
      </div>
    </div>
    {error && <div className="labourAlert bad">{error}</div>}
    {notice && <div className="success">{notice}</div>}
    <FilterBar draft={draft} setField={setField} options={data?.options || {}} periods={data?.periods || []} onApply={apply} onReset={reset} />
    {loading && !data ? <div className="panel feature"><h3>Loading project labour</h3><p>Reading timesheet allocations for the selected period.</p></div> : null}
    {data && <>
      <div className="kpis compact">
        <Card label="Total Man-Hours" value={hours(data.overview.totalHours)} sub={`${hours(data.overview.approvedHours)} approved · ${hours(data.overview.provisionalHours)} provisional`} onClick={() => setDetail(projectDetail(data, 'Total man-hours', (row) => row.uniqueHours > 0, ['Project', 'Name', 'Hours', 'Employees'], (row) => [row.projectCode, row.projectName, hours(row.uniqueHours), row.employees]))} />
        <Card label="Regular Hours" value={hours(data.overview.regularHours)} sub="Weekday regular" onClick={() => setDetail(projectDetail(data, 'Regular hours', (row) => row.weekdayRegular > 0, ['Project', 'Name', 'Weekday REG', 'Employees'], (row) => [row.projectCode, row.projectName, hours(row.weekdayRegular), row.employees]))} />
        <Card label="Overtime Hours" value={hours(data.overview.overtimeHours)} sub="Booked OVT, kept separate from regular" onClick={() => setDetail(projectDetail(data, 'Overtime hours', (row) => row.weekdayOvt + row.saturdayOvt + row.sundayOvt + row.phOvt > 0, ['Project', 'Weekday', 'Saturday', 'Sunday', 'PH'], (row) => [row.projectCode, hours(row.weekdayOvt), hours(row.saturdayOvt), hours(row.sundayOvt), hours(row.phOvt)]))} />
        <Card label="Night Work Hours" value={hours(data.overview.nightHours)} sub={`${data.overview.nightSessions} night sessions`} onClick={() => setDetail(projectDetail(data, 'Night work', (row) => row.nightHours > 0, ['Project', 'Name', 'Night hours'], (row) => [row.projectCode, row.projectName, hours(row.nightHours)]))} />
        <Card label="Employees Utilized" value={String(data.overview.employees)} sub="Distinct employees with project bookings" onClick={() => setDetail({ title: 'Employees utilized', note: 'One row is one employee on one project.', headers: ['Code', 'Employee', 'Project', 'Hours', 'Approval'], rows: (data.employeeProjects || []).map((row) => [row.employeeCode, row.employeeName, row.projectCode, hours(row.uniqueHours), row.approval]) })} />
        <Card label="Active Projects" value={String(data.overview.projects)} sub="Projects with labour activity" onClick={() => setDetail(projectDetail(data, 'Active projects', () => true, ['Project', 'Name', 'Manager', 'Hours', 'Status'], (row) => [row.projectCode, row.projectName, row.projectManager || '—', hours(row.uniqueHours), row.status]))} />
        <Card label="Total Labour Cost" value={money(data.overview.approvedCost)} sub="Approved actual only" tone="good" onClick={() => setDetail(projectDetail(data, 'Approved labour cost', (row) => row.approvedCost != null, ['Project', 'Approved cost', 'Status'], (row) => [row.projectCode, money(row.approvedCost), row.status]))} />
        <Card label="Provisional Cost" value={money(data.overview.provisionalCost)} sub="Pending timesheets, not final" tone="warn" onClick={() => setDetail(projectDetail(data, 'Provisional labour cost', (row) => row.provisionalCost != null, ['Project', 'Provisional cost', 'Status'], (row) => [row.projectCode, money(row.provisionalCost), row.status]))} />
        <Card label="Labour Budget" value={data.overview.budgetConfigured ? money(data.overview.labourBudget) : 'Budget Not Configured'} sub="Approved labour budget" onClick={() => setDetail(projectDetail(data, 'Labour budget', () => true, ['Project', 'Budget', 'Status'], (row) => [row.projectCode, row.labourBudget == null ? 'Budget Not Configured' : money(row.labourBudget), row.status]))} />
        <Card label="Budget Variance" value={money(data.overview.budgetVariance)} sub="Budget minus approved actual" tone={Number(data.overview.budgetVariance) < 0 ? 'bad' : ''} onClick={() => setDetail(projectDetail(data, 'Budget variance', (row) => row.variance != null, ['Project', 'Budget', 'Approved', 'Variance'], (row) => [row.projectCode, money(row.labourBudget), money(row.approvedCost), money(row.variance)]))} />
        <Card label="Man-Hour Utilization" value={percent(data.overview.projectUtilization)} sub="Actual hours ÷ planned hours" onClick={() => setDetail(projectDetail(data, 'Man-hour utilization', () => true, ['Project', 'Actual hours', 'Planned hours', 'Utilization'], (row) => [row.projectCode, hours(row.uniqueHours), row.plannedHours == null ? 'Not Available' : hours(row.plannedHours), percent(row.utilization)]))} />
        <Card label="Workforce Utilization" value={percent(data.overview.workforceUtilization)} sub={data.overview.capacityHours ? `${hours(data.overview.capacityHours)} available hours` : 'Capacity not available'} onClick={() => setDetail({ title: 'Workforce utilization', note: 'Available hours are active employees in the selection, multiplied by weekdays in the window and the 8-hour day.', headers: ['Measure', 'Value'], rows: [['Actual project hours', hours(data.overview.totalHours)], ['Available hours', data.overview.capacityHours == null ? 'Not Available' : hours(data.overview.capacityHours)], ['Utilization', percent(data.overview.workforceUtilization)]] })} />
      </div>
      <Tabs items={TABS} active={tab} setActive={setTab} />
      {tab === 'Overview' && <Overview data={data} topHours={topHours} topCost={topCost} maxHours={maxHours} maxCost={maxCost} onProject={(project) => { setSelected(project); }} />}
      {tab === 'Man-Hour Utilization' && <ProjectTable rows={projectSlice} mode="hours" page={projectPage} pages={projectPages} total={projects.length} onPage={setProjectPage} onOpen={setSelected} />}
      {tab === 'Project Labour Cost' && <ProjectTable rows={projectSlice} mode="cost" page={projectPage} pages={projectPages} total={projects.length} onPage={setProjectPage} onOpen={setSelected} />}
      {tab === 'Employee Cost Breakdown' && <EmployeeTable data={data} filters={filters} draft={draft} setField={setField} onApply={apply} page={linePage} pages={linePages} onPage={changePage} onOpen={setSelected} />}
      {tab === 'Budget vs Actual' && <BudgetTable rows={projectSlice} page={projectPage} pages={projectPages} total={projects.length} onPage={setProjectPage} trend={data.trend} />}
      {tab === 'Reports & Export' && <ReportTools data={data} filters={filters} onExport={download} exporting={exporting} onSave={saveAction} />}
    </>}
    {selected && <ProjectDrawer project={selected} lines={(data?.employeeProjects || []).filter((line) => line.projectCode === selected.projectCode)} onClose={() => setSelected(null)} onLines={() => { const next = { ...draft, project: selected.projectCode, groupBy: 'employee-project' }; setDraft(next); setFilters(next); setTab('Employee Cost Breakdown'); setLinePage(1); load(next, 1); setSelected(null); }} />}
    {detail && <DetailModal title={detail.title} note={detail.note} headers={detail.headers} rows={detail.rows} onClose={() => setDetail(null)} />}
  </>;
}

const projectDetail = (data, title, include, headers, cells) => ({
  title,
  note: 'Projects in the current filter.',
  headers,
  rows: (data.projects || []).filter(include).map(cells),
});

function FilterBar({ draft, setField, options, periods, onApply, onReset }) {
  const searchList = (list) => (query) => (list || []).filter((item) => item.toLowerCase().includes(query.toLowerCase())).slice(0, 30);
  return <div className="labourFilters">
    <Field label="Timesheet Period"><select value={draft.periodId} onChange={(event) => {
      const period = periods.find((item) => item.id === event.target.value);
      setField('periodId', event.target.value);
      if (period) { setField('from', period.startDate); setField('to', period.endDate); }
    }}>{periods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}{!periods.length && <option value="">No periods</option>}</select></Field>
    <Field label="Date From"><input type="date" value={draft.from} onChange={(event) => setField('from', event.target.value)} /></Field>
    <Field label="Date To"><input type="date" value={draft.to} onChange={(event) => setField('to', event.target.value)} /></Field>
    <SearchCombo label="Project" placeholder="Code or name" value={draft.project} clearable search={searchList(options.projects)} labelOf={(item) => item} onSelect={(item) => setField('project', item || '')} />
    <SearchCombo label="Project Manager" placeholder="Code or name" value={draft.projectManager} clearable search={searchList(options.managers)} labelOf={(item) => item} onSelect={(item) => setField('projectManager', item || '')} />
    <Field label="Department"><select value={draft.department} onChange={(event) => setField('department', event.target.value)}><option value="">All</option>{(options.departments || []).map((item) => <option key={item}>{item}</option>)}</select></Field>
    <SearchCombo label="Supervisor" placeholder="Code or name" value={draft.supervisor} clearable search={searchList(options.supervisors)} labelOf={(item) => item} onSelect={(item) => setField('supervisor', item || '')} />
    <Field label="Location / Site"><select value={draft.location} onChange={(event) => setField('location', event.target.value)}><option value="">All</option>{(options.locations || []).map((item) => <option key={item}>{item}</option>)}</select></Field>
    <Field label="Work Centre"><select value={draft.workCenter} onChange={(event) => setField('workCenter', event.target.value)}><option value="">All</option>{(options.workCenters || []).map((item) => <option key={item}>{item}</option>)}</select></Field>
    <SearchCombo label="Employee" placeholder="Code or name" value={draft.employee} clearable search={searchList(options.employees)} labelOf={(item) => item} onSelect={(item) => setField('employee', item || '')} />
    <Field label="Employee Type"><select value={draft.employeeType} onChange={(event) => setField('employeeType', event.target.value)}><option value="">All</option>{(options.types || []).map((item) => <option key={item}>{item}</option>)}</select></Field>
    <Field label="Approval Status"><select value={draft.approval} onChange={(event) => setField('approval', event.target.value)}>{APPROVALS.map((item) => <option key={item || 'all'} value={item}>{item || 'All statuses'}</option>)}</select></Field>
    <Field label="Cost Category"><select value={draft.category} onChange={(event) => setField('category', event.target.value)}>{CATEGORIES.map((item) => <option key={item || 'all'} value={item}>{item || 'All categories'}</option>)}</select></Field>
    <div className="labourActions"><Button onClick={onApply}>Apply Filters</Button><Button kind="secondary" onClick={onReset}>Reset Filters</Button></div>
  </div>;
}

function Overview({ data, topHours, topCost, maxHours, maxCost, onProject }) {
  const budgetRows = data.projects.filter((project) => project.labourBudget != null);
  return <div className="labourGrid">
    <section className="panel"><div className="panelHead"><div><h3>Man-hours by day</h3><p>Booked project hours in the selected window.</p></div></div><Trend points={data.trend} /></section>
    <section className="panel"><div className="panelHead"><div><h3>Top projects by hours</h3><p>Click a project to see its cost position.</p></div></div><BarList rows={topHours} max={maxHours} value={(row) => row.uniqueHours} label={(row) => `${row.uniqueHours} h`} onOpen={onProject} /></section>
    <section className="panel"><div className="panelHead"><div><h3>Top projects by approved cost</h3><p>Provisional cost is excluded from this ranking.</p></div></div>{topCost.length ? <BarList rows={topCost} max={maxCost} value={(row) => row.approvedCost} label={(row) => money(row.approvedCost)} onOpen={onProject} /> : <p className="labourEmpty">No approved labour cost for this selection.</p>}</section>
    <section className="panel"><div className="panelHead"><div><h3>Budget position</h3><p>Projects without a labour budget are omitted here.</p></div></div>
      {budgetRows.length ? <Table headers={['Project', 'Budget', 'Approved', 'Variance', 'Status']} rows={budgetRows.slice(0, 8).map((project) => [project.projectCode, money(project.labourBudget, 'Budget Not Configured'), money(project.approvedCost), money(project.variance), <Badge tone={toneFor(project.status)}>{project.status}</Badge>])} /> : <p className="labourEmpty">Budget Not Configured for the projects in this selection.</p>}
    </section>
    <section className="panel labourWide"><div className="panelHead"><div><h3>Exceptions</h3><p>{data.exceptionTotal} checks. These do not change the source timesheets.</p></div></div>
      <Table headers={['Exception', 'Employee', 'Project', 'Date']} rows={(data.exceptions || []).slice(0, 12).map((item) => [item.message, item.employeeCode, item.projectCode, item.workDate])} empty="No exceptions in this selection." />
    </section>
  </div>;
}

function Trend({ points }) {
  const max = Math.max(1, ...(points || []).map((point) => point.hours));
  if (!points?.length) return <p className="labourEmpty">No booked project hours in this selection.</p>;
  return <div className="labourTrend">{points.map((point) => <div key={point.date} title={`${point.date}: ${point.hours} h`}><i style={{ height: `${Math.max(4, (point.hours / max) * 100)}%` }} /><span>{point.date.slice(8)}</span></div>)}</div>;
}

function BarList({ rows, max, value, label, onOpen }) {
  if (!rows.length) return <p className="labourEmpty">Nothing to chart for this selection.</p>;
  return <div className="labourBars">{rows.map((row) => <button type="button" key={row.projectCode} onClick={() => onOpen(row)}><b>{row.projectCode}</b><span><i style={{ width: `${Math.max(2, (value(row) / max) * 100)}%` }} /></span><em>{label(row)}</em></button>)}</div>;
}

function ProjectTable({ rows, mode, page, pages, total, onPage, onOpen }) {
  const headers = mode === 'hours'
    ? ['Project', 'Name', 'Manager', 'Employees', 'Weekday REG', 'Weekday OVT', 'Sat', 'Sat OVT', 'Sun', 'Sun OVT', 'PH', 'PH OVT', 'Night', 'Unique Hours', 'Planned', 'Utilization', 'Variance', 'Status']
    : ['Project', 'Manager', 'Employees', 'REG Hours', 'OVT Hours', 'Unique Hours', 'REG Cost', 'OVT Cost', 'Night Allowance', 'Other Allowances', 'Approved Cost', 'Budget', 'Variance', 'Status'];
  const body = mode === 'hours'
    ? rows.map((row) => [<button type="button" className="link" onClick={() => onOpen(row)}>{row.projectCode}</button>, row.projectName, row.projectManager || '—', row.employees, hours(row.weekdayRegular), hours(row.weekdayOvt), hours(row.saturdayHours), hours(row.saturdayOvt), hours(row.sundayHours), hours(row.sundayOvt), hours(row.phHours), hours(row.phOvt), hours(row.nightHours), hours(row.uniqueHours), row.plannedHours == null ? 'Not Available' : hours(row.plannedHours), percent(row.utilization), row.hourVariance == null ? 'Not Available' : hours(row.hourVariance), <Badge tone={toneFor(row.status)}>{row.status}</Badge>])
    : rows.map((row) => [<button type="button" className="link" onClick={() => onOpen(row)}>{row.projectCode}</button>, row.projectManager || '—', row.employees, hours(row.weekdayRegular + row.saturdayHours + row.sundayHours + row.phHours), hours(row.weekdayOvt + row.saturdayOvt + row.sundayOvt + row.phOvt), hours(row.uniqueHours), money(row.regularCost), money(row.ovtCost), money(row.nightAllowance), money(row.otherAllowance), money(row.approvedCost), row.labourBudget == null ? 'Budget Not Configured' : money(row.labourBudget), money(row.variance), <Badge tone={toneFor(row.status)}>{row.status}</Badge>]);
  return <div className="panel reportSheet"><div className="panelHead"><div><h3>{mode === 'hours' ? 'Project man-hours' : 'Project labour cost'}</h3><p>Provisional cost is not included in approved cost.</p></div></div>
    <Table headers={headers} rows={body} empty="No project allocations match these filters." />
    <Pager page={page} pages={pages} total={total} onPage={onPage} />
  </div>;
}

function EmployeeTable({ data, filters, setField, onApply, page, pages, onPage }) {
  return <div className="panel reportSheet">
    <div className="panelHead"><div><h3>Employee cost breakdown</h3><p>Each employee is totalled once for each project across the selected dates.</p></div>
      <Field label="Group by"><select value={filters.groupBy || 'employee-project'} onChange={(event) => { const next = { ...filters, groupBy: event.target.value }; setField('groupBy', event.target.value); onApply(next); }}><option value="employee-project">Employee per project</option><option value="employee">Employee</option><option value="project">Project</option><option value="detail">Employee / project / date</option><option value="department">Department</option><option value="supervisor">Supervisor</option><option value="workDate">Work date</option><option value="period">Timesheet period</option></select></Field>
    </div>
    <Table headers={['Code', 'Employee', 'Type', 'Department', 'Supervisor', 'Project', 'Date', 'REG', 'OVT', 'Saturday', 'Sunday', 'PH', 'Night', 'Sessions', 'Rate', 'REG Cost', 'OVT Cost', 'Allowances', 'Total', 'Approval']} rows={(data.lines || []).map((line) => [line.employeeCode, line.employeeName, line.employeeType || '—', line.department || '—', line.supervisor || '—', line.projectCode, line.workDate, hours(line.weekdayRegular), hours(line.weekdayOvt), hours(line.saturdayHours), hours(line.sundayHours), hours(line.phHours), hours(line.nightHours), line.nightSessions, line.appliedRate == null ? (line.method === 'Restricted' ? 'Restricted' : 'Not Available') : money(line.appliedRate), money(line.regularCost), money(line.ovtCost), money(line.nightAllowance == null && line.otherAllowance == null ? null : Number(line.nightAllowance || 0) + Number(line.otherAllowance || 0)), money(line.totalCost), <Badge tone={line.provisional ? 'amber' : 'green'}>{line.approval}</Badge>])} empty="No employee allocations match these filters." />
    <Pager page={page} pages={pages} total={data.lineTotal} onPage={onPage} />
  </div>;
}

function BudgetTable({ rows, page, pages, total, onPage, trend }) {
  const max = Math.max(1, ...rows.map((row) => row.budgetUtilization || 0));
  return <div className="labourGrid">
    <section className="panel labourWide"><div className="panelHead"><div><h3>Budget versus actual</h3><p>Forecast uses the straight-line elapsed-weekday method shown on each row. Finance and project budget records are not overwritten.</p></div></div>
      <Table headers={['Project', 'Labour Budget', 'Planned Hours', 'Actual Hours', 'Actual Cost', 'Remaining', 'Variance', 'Utilization', 'Forecast', 'Status']} rows={rows.map((row) => [row.projectCode, row.labourBudget == null ? 'Budget Not Configured' : money(row.labourBudget), row.plannedHours == null ? 'Not Available' : hours(row.plannedHours), hours(row.uniqueHours), money(row.approvedCost), money(row.remainingBudget), money(row.variance), percent(row.budgetUtilization), row.forecast == null ? 'Not Available' : money(row.forecast), <Badge tone={toneFor(row.status)}>{row.status}</Badge>])} empty="No projects in this selection." />
      <Pager page={page} pages={pages} total={total} onPage={onPage} />
    </section>
    <section className="panel"><div className="panelHead"><div><h3>Budget consumption</h3><p>Approved cost as a percentage of the labour budget.</p></div></div><BarList rows={rows.filter((row) => row.budgetUtilization != null).slice(0, 8)} max={max} value={(row) => row.budgetUtilization} label={(row) => percent(row.budgetUtilization)} onOpen={() => undefined} /></section>
    <section className="panel"><div className="panelHead"><div><h3>Approved cost trend</h3><p>Daily approved labour cost.</p></div></div><Trend points={(trend || []).map((point) => ({ ...point, hours: point.approvedCost || 0 }))} /></section>
  </div>;
}

function ReportTools({ data, filters, onExport, exporting, onSave }) {
  const [rate, setRate] = useState({ employeeCode: '', method: 'hourly', amount: '', currency: 'NGN', effectiveFrom: data.from || '', weekdayOvt: '1.5', saturday: '2', saturdayOvt: '2', sunday: '2', sundayOvt: '2', publicHoliday: '2', publicHolidayOvt: '2' });
  const [budget, setBudget] = useState({ projectCode: '', labourBudget: '' });
  const [adjustment, setAdjustment] = useState({ allocationId: '', projectCode: '', employeeCode: '', workDate: '', originalAmount: '', correctedAmount: '', reason: '' });
  const [formError, setFormError] = useState('');
  const submit = async (action, payload) => {
    setFormError('');
    try { await onSave({ action, ...payload }); }
    catch (saveError) { setFormError(saveError.message); }
  };
  return <div className="labourGrid">
    <section className="panel labourWide"><div className="panelHead"><div><h3>Reports</h3><p>Excel and PDF use the same filtered totals as this screen. Version {data.version}. Generated {data.generatedAt} by {data.generatedBy}.</p></div></div>
      <div className="labourReportList">
        {['Project Man-Hour Summary', 'Project Labour Cost Summary', 'Employee Man-Hour Detail', 'Employee Labour Cost Detail', 'Project OVT Cost', 'Saturday/Sunday/PH Labour Cost', 'Night Work & Allowance Cost', 'Department Man-Hour Utilization', 'Supervisor Man-Hour Utilization', 'Budget vs Actual', 'Labour Cost Variance', 'Pending/Unapproved Labour Cost', 'Project Labour Cost Audit'].map((name) => <div key={name}><b>{name}</b><span>{filters.periodId ? 'Included in the workbook for the current filters' : 'Choose a period'}</span></div>)}
      </div>
      <div className="labourActions"><Button disabled={!!exporting} onClick={() => onExport('xlsx')}>Export Excel</Button><Button kind="secondary" disabled={!!exporting} onClick={() => onExport('pdf')}>Export PDF</Button></div>
      <ul className="labourNotes">{(data.assumptions || []).map((item) => <li key={item}>{item}</li>)}</ul>
    </section>
    {formError && <div className="labourAlert bad labourWide">{formError}</div>}
    {data.access?.canManageRates && <section className="panel"><div className="panelHead"><div><h3>Project labour cost rate</h3><p>This is the internal project rate, not the payroll salary.</p></div></div>
      <form className="labourForm" onSubmit={(event) => { event.preventDefault(); submit('save-rate', rate); }}>
        <Field label="Employee code"><input value={rate.employeeCode} onChange={(event) => setRate({ ...rate, employeeCode: event.target.value })} required /></Field>
        <Field label="Method"><select value={rate.method} onChange={(event) => setRate({ ...rate, method: event.target.value })}><option value="hourly">Hourly</option><option value="daily">Daily rate</option><option value="monthly">Monthly cost</option><option value="lumpsum">Lumpsum</option><option value="expatriate">Expatriate</option></select></Field>
        <Field label="Amount"><input type="number" min="0" step="0.01" value={rate.amount} onChange={(event) => setRate({ ...rate, amount: event.target.value })} required /></Field>
        <Field label="Currency"><input value={rate.currency} onChange={(event) => setRate({ ...rate, currency: event.target.value })} /></Field>
        <Field label="Effective from"><input type="date" value={rate.effectiveFrom} onChange={(event) => setRate({ ...rate, effectiveFrom: event.target.value })} required /></Field>
        <Field label="Weekday OVT multiplier"><input value={rate.weekdayOvt} onChange={(event) => setRate({ ...rate, weekdayOvt: event.target.value })} /></Field>
        <Button>Save rate</Button>
      </form>
    </section>}
    {data.access?.canSetBudget && <section className="panel"><div className="panelHead"><div><h3>Labour reporting budget</h3><p>Stored for this report only. Project and finance budgets stay unchanged.</p></div></div>
      <form className="labourForm" onSubmit={(event) => { event.preventDefault(); submit('save-budget', budget); }}>
        <Field label="Project code"><input value={budget.projectCode} onChange={(event) => setBudget({ ...budget, projectCode: event.target.value })} required /></Field>
        <Field label="Labour budget (NGN)"><input type="number" min="0" step="0.01" value={budget.labourBudget} onChange={(event) => setBudget({ ...budget, labourBudget: event.target.value })} required /></Field>
        <Button>Save budget</Button>
      </form>
    </section>}
    {data.access?.canAdjust && <section className="panel"><div className="panelHead"><div><h3>Locked cost adjustment</h3><p>Original and corrected amounts are both kept. The timesheet booking is not edited.</p></div></div>
      <form className="labourForm" onSubmit={(event) => { event.preventDefault(); submit('save-adjustment', adjustment); }}>
        <Field label="Allocation"><input value={adjustment.allocationId} onChange={(event) => setAdjustment({ ...adjustment, allocationId: event.target.value })} required /></Field>
        <Field label="Project"><input value={adjustment.projectCode} onChange={(event) => setAdjustment({ ...adjustment, projectCode: event.target.value })} required /></Field>
        <Field label="Employee"><input value={adjustment.employeeCode} onChange={(event) => setAdjustment({ ...adjustment, employeeCode: event.target.value })} required /></Field>
        <Field label="Work date"><input type="date" value={adjustment.workDate} onChange={(event) => setAdjustment({ ...adjustment, workDate: event.target.value })} required /></Field>
        <Field label="Original"><input type="number" step="0.01" value={adjustment.originalAmount} onChange={(event) => setAdjustment({ ...adjustment, originalAmount: event.target.value })} required /></Field>
        <Field label="Corrected"><input type="number" step="0.01" value={adjustment.correctedAmount} onChange={(event) => setAdjustment({ ...adjustment, correctedAmount: event.target.value })} required /></Field>
        <Field label="Reason"><input value={adjustment.reason} onChange={(event) => setAdjustment({ ...adjustment, reason: event.target.value })} required /></Field>
        <Button>Save adjustment</Button>
      </form>
    </section>}
  </div>;
}

function ProjectDrawer({ project, lines, onClose, onLines }) {
  return <div className="labourDrawer"><div className="labourDrawerCard">
    <div className="modalHead"><h3>{project.projectCode} · {project.projectName}</h3><button type="button" onClick={onClose}>×</button></div>
    <div className="modalBody">
      <p>{project.projectManager || 'Project manager not set'} · {project.employees} employees · {hours(project.uniqueHours)} unique hours</p>
      <p>Approved cost {money(project.approvedCost)} · Provisional {money(project.provisionalCost)} · {project.forecastMethod}</p>
      <Table headers={['Employee', 'Dates', 'Hours', 'Cost', 'Approval']} rows={lines.map((line) => [line.employeeName, line.workDate, hours(line.uniqueHours), money(line.totalCost), line.approval])} empty="No employee totals for this project." />
      <div className="labourActions"><Button onClick={onLines}>Open employee lines</Button><Button kind="secondary" onClick={onClose}>Close</Button></div>
    </div>
  </div></div>;
}

function Pager({ page, pages, total, onPage }) {
  return <div className="crewPager"><span>{total} records</span><div><button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹</button><span>{page} / {pages}</span><button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>›</button></div></div>;
}
