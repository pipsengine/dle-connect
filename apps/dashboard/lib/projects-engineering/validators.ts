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
};

export const parseProjectCreate = (body: unknown): { data?: ProjectCreateInput; error?: string } => {
  if (!body || typeof body !== 'object') return { error: 'Invalid project payload' };
  const input = body as Record<string, unknown>;
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

  if (!/^[A-Z0-9-]{3,30}$/.test(code)) return { error: 'Project code must be 3–30 characters (A-Z, 0-9, -)' };
  if (name.length < 5 || name.length > 200) return { error: 'Project name must be 5–200 characters' };
  if (!['EPC', 'ENGINEERING', 'FABRICATION', 'CONSTRUCTION', 'MAINTENANCE'].includes(projectType)) {
    return { error: 'Unsupported project type' };
  }
  if (!['NGN', 'USD', 'EUR', 'GBP'].includes(currency)) return { error: 'Unsupported currency' };
  if (!Number.isFinite(contractValue) || contractValue < 0) return { error: 'Contract value must be non-negative' };
  if (!plannedStart || !plannedFinish) return { error: 'Planned start and finish are required' };
  if (Number.isNaN(Date.parse(plannedStart)) || Number.isNaN(Date.parse(plannedFinish))) {
    return { error: 'Planned dates must be valid' };
  }
  if (new Date(plannedFinish) <= new Date(plannedStart)) return { error: 'Finish date must be after start date' };
  if (!projectManagerId && !projectManagerEmployeeCode && !projectManagerName) {
    return { error: 'Project manager is required (employee code or name)' };
  }
  if (description.length < 20 || description.length > 4000) return { error: 'Description must be 20–4000 characters' };
  if (!clientName) return { error: 'Client is required' };

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
      location: location || undefined,
      description,
    },
  };
};
