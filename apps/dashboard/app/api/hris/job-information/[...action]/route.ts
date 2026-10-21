import { NextResponse } from 'next/server';

import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { listOrganizationJobTitleOptions, type OrganizationJobTitleOption } from '@/lib/job-titles-store';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';

type Role =
  | 'Super Admin'
  | 'HR Director'
  | 'HR Manager'
  | 'HR Officer'
  | 'Department Head'
  | 'Line Manager'
  | 'Payroll Officer'
  | 'Auditor'
  | 'Employee'
  | 'Executive Management';

const jsonOk = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const jsonErr = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const getRole = (request: Request): Role => {
  const v = request.headers.get('x-hris-role');
  const all: Role[] = [
    'Super Admin',
    'HR Director',
    'HR Manager',
    'HR Officer',
    'Department Head',
    'Line Manager',
    'Payroll Officer',
    'Auditor',
    'Employee',
    'Executive Management',
  ];
  return (all.includes(v as Role) ? (v as Role) : 'HR Manager') as Role;
};

const uniqueSorted = (values: Array<string | undefined | null>) =>
  Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));

const buildFormOptions = (rows: DleEmployeeDirectoryRow[], includeEmployees: boolean, catalog: OrganizationJobTitleOption[] = []) => {
  const projects = uniqueSorted(rows.map((row) => row.projectSite)).map((name) => ({
    name,
    code: '',
    location: rows.find((row) => row.projectSite === name)?.location || '',
    client: '',
  }));

  return {
    departments: uniqueSorted(rows.map((row) => row.department)),
    businessUnits: uniqueSorted(rows.map((row) => row.businessUnit)),
    divisions: uniqueSorted(rows.map((row) => row.division)),
    locations: uniqueSorted(rows.flatMap((row) => [row.location, row.workLocation, row.officeLocation])),
    jobTitles: uniqueSorted([...catalog.map((item) => item.label), ...rows.map((row) => row.jobTitle)]),
    designations: uniqueSorted([...catalog.map((item) => item.code), ...rows.map((row) => row.designation)]),
    jobGrades: uniqueSorted(rows.map((row) => row.jobGrade)),
    jobLevels: uniqueSorted(rows.map((row) => row.salaryGrade)),
    costCenters: uniqueSorted(rows.map((row) => row.costCenter)),
    workModes: uniqueSorted(rows.map((row) => (row.remoteWorker ? 'Remote' : row.workLocation ? 'Onsite' : ''))),
    shiftPatterns: uniqueSorted(rows.map((row) => row.shift)),
    staffCategories: uniqueSorted(rows.map((row) => row.staffCategory)),
    employeeCategories: uniqueSorted(rows.map((row) => row.employeeCategory)),
    projectStatuses: [],
    projects,
    employees: includeEmployees
      ? rows.map((row) => ({
          employeeId: row.employeeId,
          fullName: row.fullName,
          department: row.department,
          jobTitle: row.jobTitle,
          manager: row.managerName || '',
          location: row.location,
        }))
      : [],
  };
};

export async function GET(request: Request, ctx: { params: Promise<{ action: string[] }> }) {
  const { action } = await ctx.params;
  const role = getRole(request);
  const seg0 = action[0] || '';

  if (seg0 === 'form-options') {
    const url = new URL(request.url);
    const includeEmployees = url.searchParams.get('includeEmployees') === '1';
    const rows = (await readPayrollEmployees()).employees;
    const catalog = await listOrganizationJobTitleOptions().catch(() => [] as OrganizationJobTitleOption[]);
    return jsonOk(buildFormOptions(rows, includeEmployees, catalog));
  }

  if (seg0 === 'summary') {
    if (role === 'Employee') return jsonErr(403, 'Permission denied');
    const rows = (await readPayrollEmployees()).employees;
    const totalEmployees = rows.length;
    const gradeDistribution = uniqueSorted(rows.map((row) => row.jobGrade)).map((grade) => ({
      grade,
      count: rows.filter((row) => row.jobGrade === grade).length,
    }));
    const departmentDistribution = uniqueSorted(rows.map((row) => row.department)).map((department) => ({
      department,
      count: rows.filter((row) => row.department === department).length,
    }));
    const roleProfileComplete = rows.filter((row) => row.jobTitle && row.jobGrade && row.department && row.managerName).length;
    const projectAssigned = rows.filter((row) => row.projectSite).length;

    return jsonOk({
      totalEmployees,
      gradeDistribution,
      departmentDistribution,
      pendingJobChangeRequests: 0,
      roleProfileCompliancePct: totalEmployees ? Math.round((roleProfileComplete / totalEmployees) * 100) : 0,
      projectAssignmentCoveragePct: totalEmployees ? Math.round((projectAssigned / totalEmployees) * 100) : 0,
      lastUpdatedAt: new Date().toISOString(),
    });
  }

  return jsonErr(404, 'Not found');
}
