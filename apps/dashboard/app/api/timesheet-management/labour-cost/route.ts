import { NextResponse } from 'next/server';
import { hasPermission } from '@/lib/auth/permission-match';
import { resolveAccessContext } from '@/lib/hris-access';
import { buildLabourPdf, buildLabourWorkbook, type LabourExportMeta } from '@/lib/project-labour-export';
import { canViewProjectLabourReport, type LabourReport } from '@/lib/project-labour-cost';
import { labourAccess, readProjectLabourReport, saveLabourAdjustment, saveLabourBudget, saveLabourRate, type LabourFilters, type LabourViewer } from '@/lib/project-labour-report-store';

const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const canUse = (request: Request) => {
  const permissions = (request.headers.get('x-auth-permissions') || '').split(',').map((item) => item.trim()).filter(Boolean);
  return hasPermission(permissions, 'view_timesheet_management') || request.headers.get('x-auth-global-admin') === '1';
};

const viewerFrom = (request: Request): LabourViewer => {
  const access = resolveAccessContext(request);
  return {
    actor: access.actor || 'Timesheet User',
    employeeCode: request.headers.get('x-auth-employee-code')?.trim() || '',
    roles: `${request.headers.get('x-auth-roles') || ''} ${access.role || ''}`,
    department: request.headers.get('x-auth-department') || '',
    unit: request.headers.get('x-auth-unit') || '',
    globalAdmin: request.headers.get('x-auth-global-admin') === '1',
  };
};

const filtersFrom = (params: URLSearchParams): LabourFilters => ({
  periodId: params.get('periodId') || '',
  from: params.get('from') || '',
  to: params.get('to') || '',
  project: params.get('project') || '',
  projectManager: params.get('projectManager') || '',
  department: params.get('department') || '',
  supervisor: params.get('supervisor') || '',
  location: params.get('location') || '',
  workCenter: params.get('workCenter') || '',
  employee: params.get('employee') || '',
  employeeType: params.get('employeeType') || '',
  approval: params.get('approval') || '',
  category: params.get('category') || '',
  groupBy: params.get('groupBy') || '',
  projectPage: Number(params.get('projectPage') || 1),
  linePage: Number(params.get('linePage') || 1),
  pageSize: Number(params.get('pageSize') || 25),
});

const redact = (report: LabourReport, viewer: LabourViewer): LabourReport => {
  const access = labourAccess(viewer);
  if (access.canSeeCosts && access.canSeeRates) return report;
  const hideMoney = <T extends { regularCostKobo: number | null; ovtCostKobo: number | null; nightLabourKobo: number | null; nightAllowanceKobo: number | null; otherAllowanceKobo: number | null; approvedCostKobo?: number | null; provisionalCostKobo?: number | null; totalCostKobo?: number | null; labourBudgetKobo?: number | null; varianceKobo?: number | null; remainingBudgetKobo?: number | null; forecastKobo?: number | null }>(row: T): T => {
    if (access.canSeeCosts) return row;
    return {
      ...row,
      regularCostKobo: null,
      ovtCostKobo: null,
      nightLabourKobo: null,
      nightAllowanceKobo: null,
      otherAllowanceKobo: null,
      approvedCostKobo: null,
      provisionalCostKobo: null,
      totalCostKobo: null,
      labourBudgetKobo: null,
      varianceKobo: null,
      remainingBudgetKobo: null,
      forecastKobo: null,
    };
  };
  return {
    ...report,
    lines: report.lines.map((line) => ({
      ...hideMoney(line),
      appliedRateKobo: access.canSeeRates ? line.appliedRateKobo : null,
      rateVersion: access.canSeeRates ? line.rateVersion : null,
      method: access.canSeeRates ? line.method : null,
      adjustmentKobo: access.canSeeCosts ? line.adjustmentKobo : 0,
    })),
    projects: report.projects.map((project) => hideMoney(project)),
    overview: access.canSeeCosts ? report.overview : {
      ...report.overview,
      approvedCostKobo: null,
      provisionalCostKobo: null,
      labourBudgetKobo: null,
      budgetVarianceKobo: null,
      nightAllowanceKobo: null,
    },
    trend: report.trend.map((point) => access.canSeeCosts ? point : { ...point, approvedCostKobo: null, provisionalCostKobo: null }),
  };
};

export async function GET(request: Request) {
  if (!canUse(request)) return err(403, 'You do not have permission to open project labour cost.');
  try {
    const viewer = viewerFrom(request);
    if (!canViewProjectLabourReport(viewer)) return err(403, 'Project Man-Hours & Labour Cost is available to Finance, Project, IT, Sales, Proposal, and the global super administrator.');
    const params = new URL(request.url).searchParams;
    const loaded = await readProjectLabourReport(filtersFrom(params), viewer);
    const format = params.get('format');
    if (format === 'xlsx' || format === 'pdf') {
      const meta: LabourExportMeta = {
        title: 'Project Man-Hours and Labour Cost',
        period: loaded.view.period?.name || '',
        from: loaded.view.from,
        to: loaded.view.to,
        filters: params.toString() || 'Period default',
        generatedAt: loaded.view.generatedAt,
        generatedBy: loaded.view.generatedBy,
      };
      const report = redact(loaded.report, viewer);
      const body = format === 'xlsx' ? buildLabourWorkbook(report, meta) : buildLabourPdf(report, meta);
      const filename = format === 'xlsx' ? 'DLE_Project_Labour_Cost.xlsx' : 'DLE_Project_Labour_Cost.pdf';
      return new NextResponse(new Uint8Array(body), {
        status: 200,
        headers: {
          'Content-Type': format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }
    return NextResponse.json({ status: 'success', data: loaded.view });
  } catch (error) {
    console.error('[project-labour-cost]', error);
    return err(500, error instanceof Error ? error.message : 'Unable to build the labour cost report.');
  }
}

export async function POST(request: Request) {
  if (!canUse(request)) return err(403, 'You do not have permission to update project labour cost.');
  const viewer = viewerFrom(request);
  if (!canViewProjectLabourReport(viewer)) return err(403, 'Project Man-Hours & Labour Cost is available to Finance, Project, IT, Sales, Proposal, and the global super administrator.');
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action || '');
    if (action === 'save-rate') await saveLabourRate(body, viewer);
    else if (action === 'save-adjustment') await saveLabourAdjustment(body, viewer);
    else if (action === 'save-budget') await saveLabourBudget(body, viewer);
    else return err(400, 'Unknown labour cost action.');
    const filters = (body.filters || {}) as LabourFilters;
    const loaded = await readProjectLabourReport(filters, viewer);
    return NextResponse.json({ status: 'success', data: loaded.view });
  } catch (error) {
    console.error('[project-labour-cost] update', error);
    return err(400, error instanceof Error ? error.message : 'The labour cost update was not saved.');
  }
}
