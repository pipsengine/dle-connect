import { promises as fs } from 'fs';
import path from 'path';
import type { Project } from '@/lib/projects-engineering/types';
import { projects as seedProjects } from '@/lib/projects-engineering/data';
import type { ProjectCreateInput } from '@/lib/projects-engineering/validators';

type ProjectFile = {
  schemaVersion: number;
  projects: Project[];
};

const compact = (value: unknown) => String(value ?? '').trim();

const projectsCandidatePaths = () => {
  const override = compact(process.env.DLE_PM_PROJECTS_PATH);
  if (override) return [override];
  const cwd = process.cwd();
  const dashboardRoot = /[\\/]apps[\\/]dashboard$/i.test(cwd) ? cwd : path.join(cwd, 'apps', 'dashboard');
  return [
    path.join(dashboardRoot, 'data', 'enterprise', 'pm-projects.json'),
    path.join(cwd, 'data', 'enterprise', 'pm-projects.json'),
  ];
};

const isStorageAccessError = (error: unknown) => {
  const code = (error as NodeJS.ErrnoException).code;
  return code === 'EPERM' || code === 'EACCES' || code === 'EROFS';
};

const readStoredProjects = async (): Promise<Project[]> => {
  for (const file of projectsCandidatePaths()) {
    try {
      const raw = await fs.readFile(file, 'utf8');
      const parsed = JSON.parse(raw) as ProjectFile;
      return Array.isArray(parsed.projects) ? parsed.projects : [];
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') continue;
      if (isStorageAccessError(error)) continue;
      throw error;
    }
  }
  return [];
};

const writeStoredProjects = async (projects: Project[]) => {
  const payload = `${JSON.stringify({ schemaVersion: 1, projects }, null, 2)}\n`;
  for (const file of projectsCandidatePaths()) {
    try {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, payload, 'utf8');
      return true;
    } catch (error) {
      if (isStorageAccessError(error)) continue;
      throw error;
    }
  }
  return false;
};

const slugFromCode = (code: string) =>
  code
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || `prj-${Date.now()}`;

export const listAllProjects = async (): Promise<Project[]> => {
  const stored = await readStoredProjects();
  const byId = new Map<string, Project>();
  for (const project of seedProjects) byId.set(project.id, project);
  for (const project of stored) byId.set(project.id, project);
  return [...byId.values()].sort((a, b) => a.code.localeCompare(b.code));
};

export const getProjectById = async (id: string): Promise<Project | null> => {
  const all = await listAllProjects();
  return all.find((project) => project.id === id || project.code.toLowerCase() === id.toLowerCase()) || null;
};

export const createProjectRecord = async (
  input: ProjectCreateInput,
  actor: { username?: string; fullName?: string },
): Promise<Project> => {
  const all = await listAllProjects();
  if (all.some((project) => project.code.toUpperCase() === input.code.toUpperCase())) {
    throw new Error(`Project code ${input.code} already exists`);
  }

  const idBase = slugFromCode(input.code);
  let id = idBase;
  let n = 1;
  while (all.some((project) => project.id === id)) {
    id = `${idBase}-${n}`;
    n += 1;
  }

  const phaseByType: Record<string, string> = {
    EPC: 'Initiation',
    ENGINEERING: 'Detailed Engineering',
    FABRICATION: 'Fabrication',
    CONSTRUCTION: 'Construction',
    MAINTENANCE: 'Maintenance',
  };

  const record: Project = {
    id,
    code: input.code,
    name: input.name,
    client: input.clientName || 'Client TBD',
    manager: input.projectManagerName || 'Unassigned',
    managerEmployeeCode: input.projectManagerEmployeeCode || input.projectManagerId,
    managerEmployeeId: input.projectManagerId,
    managerUsername: input.projectManagerUsername,
    contractValue: input.contractValue,
    currency: input.currency,
    start: input.plannedStart.slice(0, 10),
    finish: input.plannedFinish.slice(0, 10),
    planned: 0,
    actual: 0,
    costPerformance: 1,
    schedulePerformance: 1,
    phase: phaseByType[input.projectType] || 'Draft',
    status: 'Draft',
    health: 'Healthy',
    location: input.location || 'TBD',
    businessUnit: input.businessUnit || 'Projects & Engineering',
    description: input.description,
    projectType: input.projectType,
    createdBy: actor.username || actor.fullName || 'system',
    createdAt: new Date().toISOString(),
  };

  const stored = await readStoredProjects();
  stored.unshift(record);
  const wrote = await writeStoredProjects(stored);
  if (!wrote) {
    console.warn('[pm-projects] Unable to persist project file; returning in-memory record only.');
  }
  return record;
};
