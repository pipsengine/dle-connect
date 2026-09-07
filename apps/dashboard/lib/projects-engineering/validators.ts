export type ProjectCreateInput = {
  code: string;
  name: string;
  clientId?: string;
  projectType: 'EPC' | 'ENGINEERING' | 'FABRICATION' | 'CONSTRUCTION' | 'MAINTENANCE';
  currency: 'NGN' | 'USD' | 'EUR' | 'GBP';
  contractValue: number;
  plannedStart: string;
  plannedFinish: string;
  projectManagerId: string;
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
  const projectManagerId = String(input.projectManagerId || '').trim();
  const plannedStart = String(input.plannedStart || '').trim();
  const plannedFinish = String(input.plannedFinish || '').trim();
  const contractValue = Number(input.contractValue);

  if (!/^[A-Z0-9-]{3,30}$/.test(code)) return { error: 'Project code must be 3–30 characters (A-Z, 0-9, -)' };
  if (name.length < 5 || name.length > 200) return { error: 'Project name must be 5–200 characters' };
  if (!['EPC', 'ENGINEERING', 'FABRICATION', 'CONSTRUCTION', 'MAINTENANCE'].includes(projectType)) {
    return { error: 'Unsupported project type' };
  }
  if (!['NGN', 'USD', 'EUR', 'GBP'].includes(currency)) return { error: 'Unsupported currency' };
  if (!Number.isFinite(contractValue) || contractValue < 0) return { error: 'Contract value must be non-negative' };
  if (!plannedStart || !plannedFinish) return { error: 'Planned start and finish are required' };
  if (new Date(plannedFinish) <= new Date(plannedStart)) return { error: 'Finish date must be after start date' };
  if (!projectManagerId) return { error: 'Project manager is required' };
  if (description.length < 20 || description.length > 4000) return { error: 'Description must be 20–4000 characters' };

  return {
    data: {
      code,
      name,
      clientId: input.clientId ? String(input.clientId) : undefined,
      projectType: projectType as ProjectCreateInput['projectType'],
      currency: currency as ProjectCreateInput['currency'],
      contractValue,
      plannedStart,
      plannedFinish,
      projectManagerId,
      description,
    },
  };
};
