/**
 * Recruitment directory lookups — departments, locations, employees, projects from HRIS DB sources.
 * Server-only.
 */
import { readSystemDepartmentsFromOrganizationDb } from '@/lib/organization-departments-store';
import { syncSageLocationsToOrganizationDb } from '@/lib/organization-locations-store';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import { readProjects } from '@/lib/timesheet-entry-store';
import type { RecruitmentEmployeeOption, RecruitmentLookups } from '@/lib/recruitment-shared';

export type { RecruitmentEmployeeOption, RecruitmentLookups } from '@/lib/recruitment-shared';

const compact = (value: unknown) => String(value || '').trim();
const uniqueSorted = (values: string[]) =>
  Array.from(new Set(values.map(compact).filter(Boolean))).sort((a, b) => a.localeCompare(b));

const projectLabel = (code: string, name: string) => {
  const c = compact(code);
  const n = compact(name);
  if (c && n && c.toLowerCase() !== n.toLowerCase()) return `${c} – ${n}`;
  return c || n;
};

export const readRecruitmentLookups = async (): Promise<RecruitmentLookups> => {
  const [deptPayload, locPayload, employeeSource, projects] = await Promise.all([
    readSystemDepartmentsFromOrganizationDb().catch(() => null),
    syncSageLocationsToOrganizationDb().catch(() => null),
    readPayrollEmployees().catch(() => null),
    readProjects().catch(() => []),
  ]);

  const employees = employeeSource?.employees || [];
  const orgDepartments = (deptPayload?.departments || []).map((d) => compact(d.name));
  const empDepartments = employees.map((e) => compact(e.department));
  const orgLocations = (locPayload?.records || []).map((r) => compact(r.name));
  const empLocations = employees.flatMap((e) => [
    compact(e.location),
    compact((e as { workLocation?: string }).workLocation),
    compact((e as { officeLocation?: string }).officeLocation),
  ]);

  const orgCostCentres = (deptPayload?.departments || []).map((d) => compact(d.costCenter || d.code || d.name));
  const systemProjects = (projects || [])
    .filter((project) => {
      const status = compact(project.status).toLowerCase();
      return !status || status === 'active' || status === 'open' || status === 'bookable';
    })
    .map((project) => projectLabel(project.code, project.name));

  return {
    departments: uniqueSorted([...orgDepartments, ...empDepartments]),
    locations: uniqueSorted([...orgLocations, ...empLocations]),
    costCentres: uniqueSorted([
      ...orgCostCentres,
      ...employees.map((e) => compact((e as { costCenter?: string }).costCenter)),
    ]),
    projects: uniqueSorted(systemProjects),
    jobTitles: uniqueSorted(employees.flatMap((e) => [
      compact(e.jobTitle),
      compact((e as { designation?: string }).designation),
    ])),
    grades: uniqueSorted(employees.map((e) => compact((e as { jobGrade?: string }).jobGrade))),
    employmentTypes: uniqueSorted([
      'Permanent',
      'Contract',
      'Lumpsum',
      'Daily Rate',
      'NYSC',
      'IT',
      'Intern',
      ...employees.map((e) => compact(e.employmentType)),
    ]),
  };
};

export const searchRecruitmentEmployees = async (query: string, limit = 15): Promise<RecruitmentEmployeeOption[]> => {
  const q = compact(query).toLowerCase();
  if (q.length < 2) return [];
  const source = await readPayrollEmployees();
  return (source.employees || [])
    .filter((row) => {
      const hay = `${row.fullName} ${row.employeeCode} ${row.employeeId} ${row.department} ${row.jobTitle}`.toLowerCase();
      return hay.includes(q);
    })
    .slice(0, limit)
    .map((row) => ({
      employeeId: compact(row.employeeId),
      employeeCode: compact(row.employeeCode),
      employeeName: compact(row.fullName),
      department: compact(row.department),
      jobTitle: compact(row.jobTitle),
      email: compact(row.officialEmail || row.email),
      workLocation: compact(row.location || (row as { workLocation?: string }).workLocation),
      status: compact(row.status),
    }));
};
