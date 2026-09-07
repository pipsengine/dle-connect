import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { withResolvedAccess } from '@/lib/auth/resolve-access-session';
import { canAccessProjectsEngineeringPortal } from '@/lib/access/projects-engineering-access';
import { readEmployeeDirectoryFromDb } from '@/lib/dle-enterprise-db';
import { listAllProjects } from '@/lib/projects-engineering/project-store';
import { readSystemTimesheetLocations } from '@/lib/timesheet-entry-store';

const getSession = async (request: NextRequest) => {
  const session = await verifySessionToken(request.cookies.get(AUTH_COOKIE)?.value);
  return session ? withResolvedAccess(session) : null;
};

const compact = (value: unknown) => String(value ?? '').trim();

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ status: 'error', error: 'Unauthenticated' }, { status: 401 });
  if (!canAccessProjectsEngineeringPortal(session.permissions, session.isGlobalAdmin, session.roles, session.sub)) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }

  const section = compact(request.nextUrl.searchParams.get('section') || 'employees').toLowerCase();
  const q = compact(request.nextUrl.searchParams.get('q')).toLowerCase();
  const limit = Math.max(1, Math.min(40, Number(request.nextUrl.searchParams.get('limit') || 12) || 12));

  try {
    if (section === 'employees') {
      const rows = (await readEmployeeDirectoryFromDb()) || [];
      const active = rows.filter((row) => {
        const status = compact(row.status).toLowerCase();
        return !status || /active|confirmed|permanent|probation|contract/i.test(status);
      });
      const filtered = active.filter((row) => {
        if (!q) return true;
        return [row.fullName, row.employeeCode, row.employeeId, row.department, row.jobTitle, row.officialEmail, row.email]
          .map(compact)
          .join(' ')
          .toLowerCase()
          .includes(q);
      });
      const employees = filtered.slice(0, limit).map((row) => ({
        employeeCode: compact(row.employeeCode),
        employeeId: compact(row.employeeId || row.id),
        fullName: compact(row.fullName),
        department: compact(row.department),
        jobTitle: compact(row.jobTitle || row.designation),
        location: compact(row.workLocation || row.officeLocation || row.location || row.projectSite),
        email: compact(row.officialEmail || row.email || row.personalEmail),
        username: compact((row as { username?: string }).username || ''),
      }));
      return NextResponse.json({
        status: 'success',
        data: { employees, source: 'DLE_Enterprise employee directory' },
      });
    }

    if (section === 'locations') {
      const locations = await readSystemTimesheetLocations();
      const sites = Array.from(
        new Set(
          locations
            .flatMap((location) => [location.site, location.name, location.code])
            .map(compact)
            .filter((site) => site && site !== 'Unassigned Location'),
        ),
      )
        .filter((site) => !q || site.toLowerCase().includes(q))
        .sort((a, b) => a.localeCompare(b))
        .slice(0, limit)
        .map((site) => ({ id: site, label: site }));
      return NextResponse.json({
        status: 'success',
        data: { locations: sites, source: 'DLE_Enterprise.hris.TimesheetLocations' },
      });
    }

    if (section === 'clients') {
      const projects = await listAllProjects();
      const clients = Array.from(
        new Set(projects.map((project) => compact(project.client)).filter(Boolean)),
      )
        .filter((client) => !q || client.toLowerCase().includes(q))
        .sort((a, b) => a.localeCompare(b))
        .slice(0, limit)
        .map((client) => ({ id: client, label: client }));
      return NextResponse.json({
        status: 'success',
        data: { clients, source: 'DLE_Enterprise project registry' },
      });
    }

    return NextResponse.json({ status: 'error', error: 'Unsupported lookup section' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unable to load lookup data',
      },
      { status: 500 },
    );
  }
}
