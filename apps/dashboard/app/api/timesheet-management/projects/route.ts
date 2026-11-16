import { NextResponse } from 'next/server';
import { canCreateProjects } from '@/lib/access/projects-engineering-access';
import { hasPermission } from '@/lib/auth/permission-match';
import { dedupeTimesheetLocationLabels, normalizeTimesheetLocationLabel } from '@/lib/timesheet-agege-blasting';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import { readProjects, readSystemTimesheetLocations, upsertProject } from '@/lib/timesheet-entry-store';
import sql from 'mssql';

const ok = <T,>(data: T, status = 200) => NextResponse.json({ status: 'success', data }, { status });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const text = (value: unknown) => String(value ?? '').trim();

const canUsePortal = (request: Request) => {
  const permissions = (request.headers.get('x-auth-permissions') || '').split(',').map((item) => item.trim()).filter(Boolean);
  return hasPermission(permissions, 'view_timesheet_management') || request.headers.get('x-auth-global-admin') === '1';
};

const sessionIdentityFrom = (request: Request) => ({
  username: request.headers.get('x-auth-user') || undefined,
  fullName: request.headers.get('x-hris-actor') || undefined,
  employeeCode: request.headers.get('x-auth-employee-code') || undefined,
  employeeId: request.headers.get('x-auth-employee-id') || undefined,
  department: request.headers.get('x-auth-department') || undefined,
  roles: (request.headers.get('x-auth-roles') || '').split(',').map((item) => item.trim()).filter(Boolean),
  permissions: (request.headers.get('x-auth-permissions') || '').split(',').map((item) => item.trim()).filter(Boolean),
  isGlobalAdmin: request.headers.get('x-auth-global-admin') === '1',
});

const assertCanManageProjects = (request: Request) => {
  if (!canUsePortal(request)) return 'You do not have permission to open Timesheet Management.';
  if (!canCreateProjects(sessionIdentityFrom(request))) {
    return 'Only IT Department employees can register or update projects.';
  }
  return null;
};

const readProjectSites = async () => {
  const locations = await readSystemTimesheetLocations();
  const normalized = locations.map((location) => {
    const name = normalizeTimesheetLocationLabel(location.name) || location.name;
    const site = normalizeTimesheetLocationLabel(location.site) || location.site;
    return { ...location, name, site };
  });
  return dedupeTimesheetLocationLabels(
    normalized
      .flatMap((location) => [location.site, location.name])
      .filter((site) => site && site !== 'Unassigned Location'),
  ).sort((a, b) => a.localeCompare(b));
};

const searchManagers = async (query: string) => {
  const pool = await getDleEnterpriseDbPool();
  const q = text(query);
  const result = await pool.request().input('q', sql.NVarChar(80), `%${q}%`).query(`
    SELECT TOP 40
      v.employee_code,
      v.full_name,
      ISNULL(v.job_title, N'') AS job_title,
      ISNULL(v.department, N'') AS department,
      COALESCE(NULLIF(v.work_location, N''), NULLIF(j.office_location, N''), N'') AS location
    FROM [hris].[EmployeeMasterView] v
    LEFT JOIN [hris].[EmployeeJobInfo] j ON j.employee_id = v.employee_id
    WHERE ISNULL(v.employee_code, N'') <> N''
      AND ISNULL(v.employment_status, N'') NOT LIKE N'%terminated%'
      AND ISNULL(v.employment_status, N'') NOT LIKE N'%inactive%'
      AND ISNULL(v.employment_status, N'') NOT LIKE N'%resigned%'
      AND ISNULL(v.employment_status, N'') NOT LIKE N'%retired%'
      AND (
        v.employee_code LIKE N'P[0-9]%'
        OR v.employee_code LIKE N'C[0-9]%'
        OR v.employee_code NOT LIKE N'%[^0-9]%'
      )
      AND (@q = N'%%' OR v.employee_code LIKE @q OR v.full_name LIKE @q OR ISNULL(v.job_title, N'') LIKE @q OR ISNULL(v.department, N'') LIKE @q)
    ORDER BY
      CASE WHEN v.employee_code LIKE N'P[0-9]%' THEN 0 ELSE 1 END,
      v.full_name
  `);
  return (result.recordset || []).map((row) => {
    const code = text(row.employee_code);
    const name = text(row.full_name);
    return {
      code,
      name,
      label: `${code} - ${name}`,
      jobTitle: text(row.job_title),
      department: text(row.department),
      location: text(row.location),
    };
  }).filter((item) => item.code && item.name);
};

export async function GET(request: Request) {
  const denied = assertCanManageProjects(request);
  if (denied) return err(403, denied);

  const url = new URL(request.url);
  const mode = url.searchParams.get('mode') || 'list';

  try {
    if (mode === 'sites') return ok({ projectSites: await readProjectSites() });
    if (mode === 'managers') return ok({ managers: await searchManagers(url.searchParams.get('q') || '') });

    const [projects, projectSites] = await Promise.all([readProjects(), readProjectSites()]);
    return ok({
      projects: projects.map((project) => ({
        id: project.id,
        code: project.code,
        name: project.name,
        clientName: project.clientName || '',
        site: project.site || '',
        projectManager: project.projectManager || '',
        status: project.status || 'Active',
      })),
      projectSites,
    });
  } catch (error) {
    console.error('[timesheet-management/projects] GET', error);
    return err(500, error instanceof Error ? error.message : 'Unable to load project registry.');
  }
}

export async function POST(request: Request) {
  const denied = assertCanManageProjects(request);
  if (denied) return err(403, denied);

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return err(400, 'Request body is required.');

    const project = (body.project && typeof body.project === 'object' ? body.project : body) as Record<string, unknown>;
    const code = text(project.code).toUpperCase();
    const name = text(project.name);
    const clientName = text(project.clientName);
    const site = text(project.site);
    const projectManager = text(project.projectManager);
    const id = text(project.id) || `prj-${Date.now()}`;
    const editing = Boolean(text(project.id));

    if (!code) return err(400, 'Project code is required.');
    if (!name) return err(400, 'Project name is required.');
    if (!clientName) return err(400, 'Client name is required.');
    if (!site) return err(400, 'Site location is required.');
    if (!projectManager) return err(400, 'Project Manager is required.');

    const saved = await upsertProject({
      id,
      code,
      name,
      clientName,
      site,
      projectManager,
      status: 'Active',
      tasks: [{ id: `task-${id}`, name: 'General Project Work' }],
    });

    const [projects, projectSites] = await Promise.all([readProjects(), readProjectSites()]);
    return ok({
      message: editing ? 'Project updated in the company registry.' : 'Project registered in the company registry.',
      project: saved,
      projects: projects.map((item) => ({
        id: item.id,
        code: item.code,
        name: item.name,
        clientName: item.clientName || '',
        site: item.site || '',
        projectManager: item.projectManager || '',
        status: item.status || 'Active',
      })),
      projectSites,
    }, editing ? 200 : 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save project.';
    console.error('[timesheet-management/projects] POST', error);
    if (/required/i.test(message)) return err(400, message);
    if (/already exists/i.test(message)) return err(409, message);
    return err(500, message);
  }
}
