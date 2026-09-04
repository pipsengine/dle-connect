import { NextResponse } from 'next/server';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { isHrPortalUser } from '@/lib/access/route-access';
import { getUiPermissions, resolveAccessContext } from '@/lib/hris-access';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import { readProjects, upsertTimesheetWorkCenter } from '@/lib/timesheet-entry-store';
import { readSupervisorAssignments } from '@/lib/supervisor-assignment-store';
import { OFFSHORE_LOCATION_NAME, offshoreWorkCenterName } from '@/lib/timesheet-entry-shared';
import {
  cancelTimesheetMobilization,
  createTimesheetMobilizations,
  demobilizeTimesheetMobilization,
  readTimesheetMobilizations,
} from '@/lib/timesheet-mobilization-store';
import {
  extractEmployeeCodesFromText,
  extractEmployeeCodesFromXlsx,
  matchCrewUploadCodes,
} from '@/lib/crew-mobilization-upload';

const ok = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const tokenFrom = (request: Request) =>
  request.headers.get('cookie')?.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${AUTH_COOKIE}=`))?.split('=').slice(1).join('=');
const sessionFrom = (request: Request) =>
  verifySessionToken(tokenFrom(request) ? decodeURIComponent(tokenFrom(request) || '') : '');

const clean = (value: unknown) => String(value || '').trim();

async function requireHrActor(request: Request) {
  const session = await sessionFrom(request);
  if (!session || !isHrPortalUser(session)) {
    throw Object.assign(new Error('Only HR can manage crew mobilization.'), { status: 403 });
  }
  const access = resolveAccessContext(request);
  const uiPermissions = getUiPermissions(access);
  return {
    session,
    actor: session.fullName || session.username || uiPermissions.actor || 'HR',
    role: uiPermissions.role,
  };
}

export async function GET(request: Request) {
  try {
    const { actor, role } = await requireHrActor(request);
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || undefined;
    const supervisorId = searchParams.get('supervisorId') || undefined;
    const projectCode = searchParams.get('projectCode') || undefined;
    const status = (searchParams.get('status') || 'Active') as 'Active' | 'Planned' | 'Mobilized' | 'Demobilized' | 'Cancelled';

    const [mobilizations, payroll, projects, assignments] = await Promise.all([
      readTimesheetMobilizations({ date, supervisorId, projectCode, status }),
      readPayrollEmployees(),
      readProjects(),
      readSupervisorAssignments().catch(() => []),
    ]);

    const activeEmployees = payroll.employees.filter((employee) => !['Resigned', 'Terminated', 'Retired'].includes(employee.status));
    const supervisors = new Map<string, { value: string; label: string; employeeCode: string; fullName: string }>();
    for (const assignment of assignments) {
      const code = clean(assignment.supervisorEmployeeCode);
      const name = clean(assignment.supervisorName);
      if (!code || assignment.matchedStatus === 'Unresolved') continue;
      const value = `${code} - ${name || code}`;
      supervisors.set(value, { value, label: value, employeeCode: code, fullName: name || code });
    }
    for (const employee of activeEmployees) {
      const manager = clean(employee.managerName);
      if (!manager) continue;
      if (!supervisors.has(manager)) {
        const code = manager.split(' - ')[0] || manager;
        supervisors.set(manager, { value: manager, label: manager, employeeCode: code, fullName: manager.includes(' - ') ? manager.split(' - ').slice(1).join(' - ') : manager });
      }
    }

    return ok({
      generatedAt: new Date().toISOString(),
      permissions: { actor, role, canManage: true },
      mobilizations,
      options: {
        employees: activeEmployees
          .map((employee) => ({
            employeeCode: employee.employeeCode,
            employeeName: employee.fullName || employee.employeeCode,
            jobTitle: employee.jobTitle || '',
            department: employee.department || '',
            homeWorkCenterName: employee.department || employee.businessUnit || employee.location || null,
          }))
          .sort((a, b) => a.employeeName.localeCompare(b.employeeName)),
        supervisors: Array.from(supervisors.values()).sort((a, b) => a.label.localeCompare(b.label)),
        projects: projects
          .filter((project) => ['Active', 'Approved', 'Open'].includes(project.status))
          .map((project) => ({ code: project.code, name: project.name, site: project.site })),
      },
    });
  } catch (error) {
    const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status?: number }).status) || 500 : 500;
    console.error('Crew mobilization API Error:', error);
    return err(status, error instanceof Error ? error.message : 'Unable to load crew mobilization.');
  }
}

export async function POST(request: Request) {
  try {
    const { actor } = await requireHrActor(request);
    const body = await request.json() as {
      action?: 'CREATE' | 'DEMOBILIZE' | 'CANCEL' | 'PARSE_CODES';
      id?: string;
      endDate?: string | null;
      employeeCodes?: string[];
      employees?: Array<{ employeeCode: string; employeeName?: string; homeWorkCenterName?: string | null }>;
      supervisorId?: string;
      supervisorName?: string;
      projectCode?: string;
      projectName?: string;
      startDate?: string;
      reason?: string | null;
      fileName?: string;
      fileBase64?: string;
      text?: string;
    };

    if (body.action === 'PARSE_CODES') {
      const fileName = clean(body.fileName) || 'crew-upload.csv';
      let uploadedCodes: string[] = [];
      if (clean(body.text)) {
        uploadedCodes = extractEmployeeCodesFromText(body.text || '');
      } else {
        const raw = clean(body.fileBase64);
        if (!raw) return err(400, 'Upload a CSV or Excel file with employee codes.');
        const payload = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw;
        const buffer = Buffer.from(payload, 'base64');
        if (!buffer.length) return err(400, 'Upload file is empty.');
        if (buffer.length > MAX_UPLOAD_BYTES) return err(400, 'Upload is larger than 4 MB.');
        if (/\.xlsx$/i.test(fileName)) {
          uploadedCodes = extractEmployeeCodesFromXlsx(buffer);
        } else if (/\.csv$/i.test(fileName) || /\.txt$/i.test(fileName)) {
          uploadedCodes = extractEmployeeCodesFromText(buffer.toString('utf8'));
        } else {
          return err(400, 'Upload a .csv or .xlsx file with an Employee Code column.');
        }
      }
      if (!uploadedCodes.length) return err(400, 'No employee codes found in the upload.');
      const payroll = await readPayrollEmployees();
      const knownCodes = payroll.employees
        .filter((employee) => !['Resigned', 'Terminated', 'Retired'].includes(employee.status))
        .map((employee) => employee.employeeCode);
      const match = matchCrewUploadCodes(uploadedCodes, knownCodes);
      return ok({
        message: `Matched ${match.matchedCodes.length} of ${match.uploadedCount} uploaded codes.`,
        ...match,
      });
    }

    if (body.action === 'DEMOBILIZE') {
      if (!body.id) return err(400, 'Mobilization ID is required.');
      await demobilizeTimesheetMobilization(body.id, actor, body.endDate);
      return ok({ message: 'Crew demobilized. They return to their home work centre from the next day.' });
    }
    if (body.action === 'CANCEL') {
      if (!body.id) return err(400, 'Mobilization ID is required.');
      await cancelTimesheetMobilization(body.id, actor);
      return ok({ message: 'Mobilization cancelled.' });
    }

    const projectCode = clean(body.projectCode).toUpperCase();
    const supervisorId = clean(body.supervisorId);
    if (!projectCode) return err(400, 'Project is required.');
    if (!supervisorId) return err(400, 'Host supervisor is required.');

    const created = await createTimesheetMobilizations({
      employeeCodes: body.employeeCodes || [],
      employees: body.employees,
      supervisorId,
      supervisorName: clean(body.supervisorName) || supervisorId,
      projectCode,
      projectName: clean(body.projectName) || projectCode,
      startDate: clean(body.startDate),
      endDate: body.endDate,
      reason: body.reason,
      actor,
    });

    await upsertTimesheetWorkCenter({
      name: offshoreWorkCenterName(projectCode),
      location: OFFSHORE_LOCATION_NAME,
      site: OFFSHORE_LOCATION_NAME,
      status: 'Active',
      sourceSystem: 'HRIS',
    });

    return ok({
      message: `Mobilized ${created.length} crew to ${offshoreWorkCenterName(projectCode)} under ${clean(body.supervisorName) || supervisorId}.`,
      mobilizations: created,
    });
  } catch (error) {
    const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status?: number }).status) || 500 : 500;
    console.error('Crew mobilization API Error:', error);
    return err(status === 500 && error instanceof Error && /required|already mobilized|not found/i.test(error.message) ? 400 : status, error instanceof Error ? error.message : 'Unable to save crew mobilization.');
  }
}
