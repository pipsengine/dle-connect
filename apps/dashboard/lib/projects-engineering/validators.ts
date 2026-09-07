import {
  PROJECT_HEALTH_OPTIONS,
  PROJECT_STATUS_OPTIONS,
  type Health,
  type ProjectStatus,
} from '@/lib/projects-engineering/types';

export type ProjectCreateInput = {
  code: string;
  name: string;
  clientId?: string;
  clientName?: string;
  projectType: 'EPC' | 'ENGINEERING' | 'FABRICATION' | 'CONSTRUCTION' | 'MAINTENANCE';
  currency: 'NGN' | 'USD' | 'EUR' | 'GBP';
  contractValue: number;
  plannedStart: string;
  plannedFinish: string;
  projectManagerId: string;
  projectManagerName?: string;
  projectManagerEmployeeCode?: string;
  projectManagerUsername?: string;
  businessUnit?: string;
  location?: string;
  description: string;
  status?: ProjectStatus;
  health?: Health;
  phase?: string;
  plannedProgress?: number;
  actualProgress?: number;
  schedulePerformance?: number;
  costPerformance?: number;
};

export type ProjectUpdateInput = Partial<ProjectCreateInput> & {
  status?: ProjectStatus;
  health?: Health;
  phase?: string;
  plannedProgress?: number;
  actualProgress?: number;
  schedulePerformance?: number;
  costPerformance?: number;
};

const asObject = (body: unknown) => {
  if (!body || typeof body !== 'object') return null;
  return body as Record<string, unknown>;
};

const parseStatus = (value: unknown): ProjectStatus | undefined => {
  const status = String(value || '').trim();
  return PROJECT_STATUS_OPTIONS.includes(status as ProjectStatus) ? (status as ProjectStatus) : undefined;
};

const parseHealth = (value: unknown): Health | undefined => {
  const health = String(value || '').trim();
  return PROJECT_HEALTH_OPTIONS.includes(health as Health) ? (health as Health) : undefined;
};

const parseOptionalNumber = (value: unknown) => {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

export const parseProjectCreate = (body: unknown): { data?: ProjectCreateInput; error?: string } => {
  const input = asObject(body);
  if (!input) return { error: 'Invalid project payload' };

  const code = String(input.code || '').trim().toUpperCase();
  const name = String(input.name || '').trim();
  const projectType = String(input.projectType || '').trim().toUpperCase();
  const currency = String(input.currency || 'NGN').trim().toUpperCase();
  const description = String(input.description || '').trim();
  const projectManagerId = String(input.projectManagerId || input.projectManagerEmployeeCode || '').trim();
  const projectManagerName = String(input.projectManagerName || input.projectManager || '').trim();
  const projectManagerEmployeeCode = String(input.projectManagerEmployeeCode || '').trim().toUpperCase();
  const projectManagerUsername = String(input.projectManagerUsername || '').trim();
  const plannedStart = String(input.plannedStart || '').trim();
  const plannedFinish = String(input.plannedFinish || '').trim();
  const contractValue = Number(input.contractValue);
  const clientName = String(input.clientName || input.client || '').trim();
  const businessUnit = String(input.businessUnit || '').trim();
  const location = String(input.location || '').trim();
  const status = parseStatus(input.status);
  const health = parseHealth(input.health);
  const phase = String(input.phase || '').trim();
  const plannedProgress = parseOptionalNumber(input.plannedProgress ?? input.planned);
  const actualProgress = parseOptionalNumber(input.actualProgress ?? input.actual);
  const schedulePerformance = parseOptionalNumber(input.schedulePerformance);
  const costPerformance = parseOptionalNumber(input.costPerformance);

  if (!/^[A-Z0-9-]{3,30}$/.test(code)) return { error: 'Project code must be 3–30 characters (A-Z, 0-9, -)' };
  if (name.length < 3 || name.length > 200) return { error: 'Project name must be 3–200 characters' };
  if (!['EPC', 'ENGINEERING', 'FABRICATION', 'CONSTRUCTION', 'MAINTENANCE'].includes(projectType)) {
    return { error: 'Unsupported project type' };
  }
  if (!['NGN', 'USD', 'EUR', 'GBP'].includes(currency)) return { error: 'Unsupported currency' };
  if (!Number.isFinite(contractValue) || contractValue < 0) return { error: 'Contract value must be non-negative' };
  if (!plannedStart || !plannedFinish) return { error: 'Planned start and finish are required' };
  if (Number.isNaN(Date.parse(plannedStart)) || Number.isNaN(Date.parse(plannedFinish))) {
    return { error: 'Planned dates must be valid' };
  }
  if (new Date(plannedFinish) < new Date(plannedStart)) return { error: 'Finish date must be on or after start date' };
  if (!projectManagerId && !projectManagerEmployeeCode && !projectManagerName) {
    return { error: 'Project manager is required (select an employee)' };
  }
  if (!projectManagerEmployeeCode && !projectManagerName) {
    return { error: 'Select a Project Manager from the employee directory' };
  }
  if (description.length < 10 || description.length > 4000) return { error: 'Description must be 10–4000 characters' };
  if (!clientName) return { error: 'Client is required' };
  if (!location) return { error: 'Project location / site is required' };
  if (plannedProgress !== undefined && (plannedProgress < 0 || plannedProgress > 100)) {
    return { error: 'Planned progress must be 0–100' };
  }
  if (actualProgress !== undefined && (actualProgress < 0 || actualProgress > 100)) {
    return { error: 'Actual progress must be 0–100' };
  }

  return {
    data: {
      code,
      name,
      clientId: input.clientId ? String(input.clientId) : undefined,
      clientName,
      projectType: projectType as ProjectCreateInput['projectType'],
      currency: currency as ProjectCreateInput['currency'],
      contractValue,
      plannedStart,
      plannedFinish,
      projectManagerId: projectManagerId || projectManagerEmployeeCode || projectManagerName,
      projectManagerName: projectManagerName || undefined,
      projectManagerEmployeeCode: projectManagerEmployeeCode || undefined,
      projectManagerUsername: projectManagerUsername || undefined,
      businessUnit: businessUnit || undefined,
      location,
      description,
      status,
      health,
      phase: phase || undefined,
      plannedProgress,
      actualProgress,
      schedulePerformance,
      costPerformance,
    },
  };
};

export const parseProjectUpdate = (body: unknown): { data?: ProjectUpdateInput; error?: string } => {
  const input = asObject(body);
  if (!input) return { error: 'Invalid project payload' };

  const data: ProjectUpdateInput = {};
  if (input.code !== undefined) data.code = String(input.code || '').trim().toUpperCase();
  if (input.name !== undefined) data.name = String(input.name || '').trim();
  if (input.clientName !== undefined || input.client !== undefined) {
    data.clientName = String(input.clientName || input.client || '').trim();
  }
  if (input.projectType !== undefined) {
    data.projectType = String(input.projectType || '').trim().toUpperCase() as ProjectCreateInput['projectType'];
  }
  if (input.currency !== undefined) {
    data.currency = String(input.currency || 'NGN').trim().toUpperCase() as ProjectCreateInput['currency'];
  }
  if (input.contractValue !== undefined) data.contractValue = Number(input.contractValue);
  if (input.plannedStart !== undefined) data.plannedStart = String(input.plannedStart || '').trim();
  if (input.plannedFinish !== undefined) data.plannedFinish = String(input.plannedFinish || '').trim();
  if (input.projectManagerId !== undefined) data.projectManagerId = String(input.projectManagerId || '').trim();
  if (input.projectManagerName !== undefined || input.projectManager !== undefined) {
    data.projectManagerName = String(input.projectManagerName || input.projectManager || '').trim();
  }
  if (input.projectManagerEmployeeCode !== undefined) {
    data.projectManagerEmployeeCode = String(input.projectManagerEmployeeCode || '').trim().toUpperCase();
  }
  if (input.projectManagerUsername !== undefined) {
    data.projectManagerUsername = String(input.projectManagerUsername || '').trim();
  }
  if (input.businessUnit !== undefined) data.businessUnit = String(input.businessUnit || '').trim();
  if (input.location !== undefined) data.location = String(input.location || '').trim();
  if (input.description !== undefined) data.description = String(input.description || '').trim();
  if (input.phase !== undefined) data.phase = String(input.phase || '').trim();
  if (input.status !== undefined) {
    const status = parseStatus(input.status);
    if (!status) return { error: 'Invalid project status' };
    data.status = status;
  }
  if (input.health !== undefined) {
    const health = parseHealth(input.health);
    if (!health) return { error: 'Invalid project health' };
    data.health = health;
  }
  if (input.plannedProgress !== undefined || input.planned !== undefined) {
    data.plannedProgress = parseOptionalNumber(input.plannedProgress ?? input.planned);
  }
  if (input.actualProgress !== undefined || input.actual !== undefined) {
    data.actualProgress = parseOptionalNumber(input.actualProgress ?? input.actual);
  }
  if (input.schedulePerformance !== undefined) {
    data.schedulePerformance = parseOptionalNumber(input.schedulePerformance);
  }
  if (input.costPerformance !== undefined) {
    data.costPerformance = parseOptionalNumber(input.costPerformance);
  }

  if (data.code && !/^[A-Z0-9-]{3,30}$/.test(data.code)) {
    return { error: 'Project code must be 3–30 characters (A-Z, 0-9, -)' };
  }
  if (data.name !== undefined && (data.name.length < 3 || data.name.length > 200)) {
    return { error: 'Project name must be 3–200 characters' };
  }
  if (data.projectType && !['EPC', 'ENGINEERING', 'FABRICATION', 'CONSTRUCTION', 'MAINTENANCE'].includes(data.projectType)) {
    return { error: 'Unsupported project type' };
  }
  if (data.currency && !['NGN', 'USD', 'EUR', 'GBP'].includes(data.currency)) {
    return { error: 'Unsupported currency' };
  }
  if (data.contractValue !== undefined && (!Number.isFinite(data.contractValue) || data.contractValue < 0)) {
    return { error: 'Contract value must be non-negative' };
  }
  if (data.plannedStart && Number.isNaN(Date.parse(data.plannedStart))) return { error: 'Planned start must be valid' };
  if (data.plannedFinish && Number.isNaN(Date.parse(data.plannedFinish))) return { error: 'Planned finish must be valid' };
  if (data.description !== undefined && (data.description.length < 10 || data.description.length > 4000)) {
    return { error: 'Description must be 10–4000 characters' };
  }
  if (data.plannedProgress !== undefined && (data.plannedProgress < 0 || data.plannedProgress > 100)) {
    return { error: 'Planned progress must be 0–100' };
  }
  if (data.actualProgress !== undefined && (data.actualProgress < 0 || data.actualProgress > 100)) {
    return { error: 'Actual progress must be 0–100' };
  }
  if (Object.keys(data).length === 0) return { error: 'No updatable fields provided' };

  return { data };
};
