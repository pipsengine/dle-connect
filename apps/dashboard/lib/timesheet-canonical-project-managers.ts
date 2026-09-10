/** Known project-manager assignments that must not be missing at timesheet submit. */

export const CANONICAL_TIMESHEET_PROJECT_MANAGERS: Record<string, string> = {
  DL0062: 'P0442 - Mrs TEMITOPE ABIODUN ODULATE',
};

export const canonicalProjectManagerForCode = (projectCode?: string | null) =>
  CANONICAL_TIMESHEET_PROJECT_MANAGERS[String(projectCode || '').trim().toUpperCase()] || '';

export const withCanonicalProjectManager = <T extends { code: string; projectManager?: string | null }>(project: T): T => {
  const canonical = canonicalProjectManagerForCode(project.code);
  if (!canonical) return project;
  if (String(project.projectManager || '').trim() === canonical) return project;
  return { ...project, projectManager: canonical };
};
