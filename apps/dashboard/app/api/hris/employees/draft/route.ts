import { NextResponse } from 'next/server';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import {
  deleteEmployeeDraftFromDb,
  getEmployeeDraftFromDb,
  listEmployeeDraftsByStatusFromDb,
  saveEmployeeDraftToDb,
} from '@/lib/dle-enterprise-db';

type Role =
  | 'Super Admin'
  | 'HR Director'
  | 'HR Manager'
  | 'HR Officer'
  | 'Admin Officer'
  | 'Payroll Officer'
  | 'Department Head'
  | 'Line Manager'
  | 'IT Administrator'
  | 'HSE Officer'
  | 'Auditor'
  | 'Manager'
  | 'Employee';

type DraftRecord = {
  draftId: string;
  status: 'draft' | 'submitted' | 'approved' | 'created' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  draft: Record<string, unknown>;
  audit: Array<{ id: string; at: string; action: string; performedBy: string; reason?: string; oldValue?: string; newValue?: string }>;
};

const jsonOk = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const jsonErr = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const nowIso = () => new Date().toISOString();
const draftIdGen = () => `DRAFT-${Math.random().toString(16).slice(2, 8).toUpperCase()}${Math.random().toString(16).slice(2, 6).toUpperCase()}`;

const storeDrafts = (() => {
  const g = globalThis as unknown as { __dleHrisEmployeeDrafts?: Map<string, DraftRecord> };
  if (!g.__dleHrisEmployeeDrafts) g.__dleHrisEmployeeDrafts = new Map();
  return g.__dleHrisEmployeeDrafts;
})();

const ROLE_BY_CANONICAL: Record<string, Role> = {
  SUPERADMIN: 'Super Admin',
  HRDIRECTOR: 'HR Director',
  HRMANAGER: 'HR Manager',
  HROFFICER: 'HR Officer',
  ADMINOFFICER: 'Admin Officer',
  PAYROLLOFFICER: 'Payroll Officer',
  DEPARTMENTHEAD: 'Department Head',
  LINEMANAGER: 'Line Manager',
  ITADMINISTRATOR: 'IT Administrator',
  HSEOFFICER: 'HSE Officer',
  AUDITOR: 'Auditor',
  MANAGER: 'Manager',
  EMPLOYEE: 'Employee',
};

const normalizeRole = (roles: string[] | undefined | null, headerRole: string): Role => {
  const fromSession = (roles || [])
    .map((role) => String(role || '').toUpperCase().replace(/[^A-Z]/g, ''))
    .filter(Boolean)
    .map((canonical) => ROLE_BY_CANONICAL[canonical])
    .find(Boolean);
  if (fromSession) return fromSession;
  const fromHeader = String(headerRole || '').trim();
  if (fromHeader) {
    const key = fromHeader.toUpperCase().replace(/[^A-Z]/g, '');
    if (ROLE_BY_CANONICAL[key]) return ROLE_BY_CANONICAL[key];
  }
  return 'Employee';
};

const readAuthCookie = (request: Request) => {
  const cookieHeader = request.headers.get('cookie') || '';
  const pair = cookieHeader
    .split(';')
    .map((chunk) => chunk.trim())
    .find((chunk) => chunk.startsWith(`${AUTH_COOKIE}=`));
  if (!pair) return '';
  return decodeURIComponent(pair.split('=').slice(1).join('='));
};

const getRole = async (request: Request): Promise<Role> => {
  const session = await verifySessionToken(readAuthCookie(request)).catch(() => null);
  const header = String(request.headers.get('x-hris-role') || '').trim();
  if (!session) {
    const key = header.toUpperCase().replace(/[^A-Z]/g, '');
    return ROLE_BY_CANONICAL[key] || 'Employee';
  }
  return normalizeRole(session.roles, header);
};

const permissions = (role: Role) => {
  const canCreate = [
    'Super Admin',
    'HR Director',
    'HR Manager',
    'HR Officer',
    'Admin Officer',
    'Payroll Officer',
    'IT Administrator',
  ].includes(role);
  return { canCreate };
};

const loadDraftRecord = async (draftId: string): Promise<DraftRecord | null> => {
  const rec = storeDrafts.get(draftId) || ((await getEmployeeDraftFromDb(draftId)) as DraftRecord | null);
  if (rec) storeDrafts.set(draftId, rec);
  return rec;
};

const audit = (rec: DraftRecord, role: Role, action: string) => {
  rec.audit.unshift({
    id: `audit-${Math.random().toString(16).slice(2)}`,
    at: nowIso(),
    action,
    performedBy: role,
  });
};

const stripDraftForList = (rec: DraftRecord) => {
  const draft = (rec.draft || {}) as Record<string, any>;
  const personal = draft.personal || {};
  const employment = draft.employment || {};
  const job = draft.job || {};
  const contact = draft.contact || {};
  return {
    draftId: rec.draftId,
    status: rec.status,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    employeeCode: employment?.employeeId || null,
    employmentType: employment?.employmentType || null,
    firstName: personal?.firstName || null,
    lastName: personal?.lastName || null,
    fullName: [personal?.firstName || '', personal?.lastName || ''].join(' ').trim() || null,
    jobTitle: job?.jobTitle || null,
    department: job?.department || null,
    officialEmail: contact?.officialEmail || null,
    primaryPhone: contact?.primaryPhone || null,
    editUrl: `/hris/employees/add-new-employee?draftId=${encodeURIComponent(rec.draftId)}`,
  };
};

/**
 * GET /api/hris/employees/draft
 *   ?search=  — fuzzy search over employee code, name, email, job title, department
 *   ?status=  — comma-separated: draft,submitted,approved,created,cancelled (default: draft,submitted,approved)
 *   ?employeeCode= — exact match (e.g. C2827)
 * Returns up to 200 drafts.
 */
export async function GET(request: Request) {
  const role = await getRole(request);
  const perms = permissions(role);
  if (!perms.canCreate) {
    return jsonErr(403, `Permission denied for role "${role}". HR/Admin/Payroll/IT access is required to list employee drafts.`);
  }
  const url = new URL(request.url);
  const searchRaw = (url.searchParams.get('search') || '').trim().toLowerCase();
  const statusesRaw = (url.searchParams.get('status') || 'draft,submitted,approved')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean) as Array<'draft' | 'submitted' | 'approved' | 'created' | 'cancelled'>;
  const employeeCodeRaw = (url.searchParams.get('employeeCode') || '').trim().toUpperCase();

  const fromDb: DraftRecord[] = (await listEmployeeDraftsByStatusFromDb(statusesRaw as unknown as string[])).map(
    (r) => r as DraftRecord,
  );
  const dbMap = new Map<string, DraftRecord>();
  for (const r of fromDb) dbMap.set(r.draftId, r);
  for (const r of storeDrafts.values()) {
    const statusLower = r.status.toLowerCase() as 'draft' | 'submitted' | 'approved' | 'created' | 'cancelled';
    if (!statusesRaw.includes(statusLower)) continue;
    dbMap.set(r.draftId, r);
  }
  let results: DraftRecord[] = Array.from(dbMap.values());

  if (employeeCodeRaw) {
    results = results.filter((r) => {
      const code = String(((r.draft || {} as any).employment || {} as any).employeeId || '').trim().toUpperCase();
      return code === employeeCodeRaw;
    });
  }
  if (searchRaw) {
    results = results.filter((r) => {
      const d = (r.draft || {}) as Record<string, any>;
      const p = d.personal || {};
      const e = d.employment || {};
      const j = d.job || {};
      const c = d.contact || {};
      const hay = [
        e.employeeId,
        p.firstName,
        p.lastName,
        p.middleName,
        j.jobTitle,
        j.department,
        c.officialEmail,
        c.personalEmail,
        c.primaryPhone,
        r.draftId,
      ]
        .map((x) => String(x || '').toLowerCase())
        .join(' | ');
      return hay.includes(searchRaw);
    });
  }

  results.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const trimmed = results.slice(0, 200);

  return jsonOk({
    total: results.length,
    count: trimmed.length,
    drafts: trimmed.map(stripDraftForList),
  });
}

/** POST /api/hris/employees/draft — create draft (static path beats [id]/[...resource]). */
export async function POST(request: Request) {
  const role = await getRole(request);
  const perms = permissions(role);
  if (!perms.canCreate) return jsonErr(403, `Permission denied for role "${role}". HR/Admin/Payroll/IT access is required to create new employee drafts.`);
  const body = (await request.json().catch(() => null)) as { draft?: Record<string, unknown> } | null;
  if (!body || typeof body !== 'object') return jsonErr(400, 'Invalid JSON body');
  const draft = body.draft;
  if (!draft || typeof draft !== 'object') return jsonErr(400, 'draft is required');
  const draftId = draftIdGen();
  const rec: DraftRecord = {
    draftId,
    status: 'draft',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    draft,
    audit: [],
  };
  audit(rec, role, 'Draft created');
  storeDrafts.set(draftId, rec);
  let dbError: string | null = null;
  try {
    await saveEmployeeDraftToDb(rec);
  } catch (error) {
    dbError = error instanceof Error ? error.message : String(error);
    console.warn('[draft] saveEmployeeDraftToDb failed (in-memory retained):', dbError);
  }
  return jsonOk({ draftId, status: rec.status, updatedAt: rec.updatedAt, serverNote: dbError ? `Draft saved in memory only (DB save skipped): ${dbError.slice(0, 200)}` : undefined });
}
