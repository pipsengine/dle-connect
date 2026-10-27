import { extractSupervisorEmployeeCode } from '@/lib/timesheet-agege-blasting';
import { timesheetLocationsMatch } from '@/lib/timesheet-agege-blasting';
import { canonicalProjectManagerForCode } from '@/lib/timesheet-canonical-project-managers';

const text = (value: unknown) => String(value ?? '').trim();

export type ProjectManagerCandidate = {
  label: string;
  employeeCode?: string;
  jobTitle?: string;
};

export type LocationProjectManagerRow = {
  site: string;
  manager: string;
  employeeCode?: string;
  jobTitle?: string;
};

export const looksLikeProjectManagerRole = (jobTitle?: string | null) =>
  /\b(senior\s+project\s+manager|project\s+manager|general\s+manager)\b/i.test(text(jobTitle));

export const looksLikeCrewSupervisorRole = (jobTitle?: string | null) => {
  const title = text(jobTitle);
  if (!title || looksLikeProjectManagerRole(title)) return false;
  return /\b(supervisor|foreman|site lead)\b/i.test(title);
};

export const formatProjectManagerLabel = (code?: string | null, name?: string | null) => {
  const employeeCode = text(code).toUpperCase();
  const displayName = text(name);
  if (employeeCode && displayName) return `${employeeCode} - ${displayName}`;
  return displayName || employeeCode;
};

export const isEligibleTimesheetProjectManager = (candidate: ProjectManagerCandidate) => {
  const label = text(candidate.label);
  if (!label || /not set/i.test(label)) return false;
  if (looksLikeProjectManagerRole(candidate.jobTitle)) return true;
  if (looksLikeCrewSupervisorRole(candidate.jobTitle)) return false;
  const code = (extractSupervisorEmployeeCode(label) || text(candidate.employeeCode)).toUpperCase();
  return /^P\d+/i.test(code);
};

export const pickLocationProjectManager = (location: string, rows: LocationProjectManagerRow[]) => {
  const site = text(location);
  if (!site) return '';
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!timesheetLocationsMatch(site, row.site)) continue;
    if (!looksLikeProjectManagerRole(row.jobTitle)) continue;
    if (!isEligibleTimesheetProjectManager({
      label: row.manager,
      employeeCode: row.employeeCode,
      jobTitle: row.jobTitle,
    })) continue;
    const label = text(row.manager);
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] || '';
};

export const resolveAssignedProjectManager = (input: {
  projectCode?: string | null;
  catalogManager?: string | null;
  locationManager?: string | null;
  storedManager?: string | null;
  catalogEligible?: boolean;
  storedEligible?: boolean;
}) => {
  const canonical = canonicalProjectManagerForCode(input.projectCode);
  if (canonical) return canonical;
  if (input.catalogEligible && text(input.catalogManager)) return text(input.catalogManager);
  if (text(input.locationManager)) return text(input.locationManager);
  if (input.storedEligible && text(input.storedManager)) return text(input.storedManager);
  return '';
};

export const assignedProjectApproverName = (projectManager?: string | null) => {
  const name = text(projectManager);
  return !name || /not set/i.test(name) ? '' : name;
};
