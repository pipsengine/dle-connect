import { NextResponse } from 'next/server';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import {
  deleteEmployeeDraftFromDb,
  getEmployeeDraftFromDb,
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

const audit = (rec: DraftRecord, role: Role, action: string, extra?: { oldValue?: string; newValue?: string }) => {
  rec.audit.unshift({
    id: `audit-${Math.random().toString(16).slice(2)}`,
    at: nowIso(),
    action,
    performedBy: role,
    ...extra,
  });
};

type Ctx = { params: Promise<{ draftId: string }> };

/** GET /api/hris/employees/draft/[draftId] */
export async function GET(request: Request, ctx: Ctx) {
  const { draftId } = await ctx.params;
  if (!draftId?.trim()) return jsonErr(404, 'Draft not found');
  const rec = await loadDraftRecord(draftId.trim());
  if (!rec) return jsonErr(404, 'Draft not found');
  return jsonOk({
    draft: rec.draft,
    meta: { draftId: rec.draftId, status: rec.status, updatedAt: rec.updatedAt },
  });
}

/** PATCH /api/hris/employees/draft/[draftId] */
export async function PATCH(request: Request, ctx: Ctx) {
  const role = await getRole(request);
  const perms = permissions(role);
  if (!perms.canCreate) return jsonErr(403, `Permission denied for role "${role}". HR/Admin/Payroll/IT access is required to update employee drafts.`);
  const { draftId: rawId } = await ctx.params;
  const draftId = String(rawId || '').trim();
  if (!draftId) return jsonErr(404, 'Draft not found');
  const body = (await request.json().catch(() => null)) as { draft?: Record<string, unknown> } | null;
  if (!body || typeof body !== 'object') return jsonErr(400, 'Invalid JSON body');
  const draft = body.draft;
  if (!draft || typeof draft !== 'object') return jsonErr(400, 'draft is required');
  const rec = await loadDraftRecord(draftId);
  if (!rec) return jsonErr(404, 'Draft not found');
  const prev = rec.updatedAt;
  rec.draft = draft;
  rec.updatedAt = nowIso();
  audit(rec, role, 'Draft updated', { oldValue: prev, newValue: rec.updatedAt });
  storeDrafts.set(draftId, rec);
  let dbError: string | null = null;
  try {
    await saveEmployeeDraftToDb(rec);
  } catch (error) {
    dbError = error instanceof Error ? error.message : String(error);
    console.warn('[draft] PATCH saveEmployeeDraftToDb failed (in-memory retained):', dbError);
  }
  return jsonOk({
    draftId: rec.draftId,
    status: rec.status,
    updatedAt: rec.updatedAt,
    serverNote: dbError ? `Draft updated in memory only (DB save skipped): ${dbError.slice(0, 200)}` : undefined,
  });
}

/** DELETE /api/hris/employees/draft/[draftId] */
export async function DELETE(request: Request, ctx: Ctx) {
  const role = await getRole(request);
  const perms = permissions(role);
  if (!perms.canCreate) return jsonErr(403, `Permission denied for role "${role}". HR/Admin/Payroll/IT access is required to delete employee drafts.`);
  const { draftId: rawId } = await ctx.params;
  const draftId = String(rawId || '').trim();
  if (!draftId) return jsonErr(404, 'Draft not found');
  const rec = await loadDraftRecord(draftId);
  if (!rec) return jsonOk({ deleted: true, serverNote: 'Draft not found (already removed).' });
  storeDrafts.delete(draftId);
  try {
    await deleteEmployeeDraftFromDb(draftId);
  } catch (error) {
    const dbError = error instanceof Error ? error.message : String(error);
    console.warn('[draft] deleteEmployeeDraftFromDb failed (memory-only):', dbError);
    return jsonOk({ deleted: true, serverNote: `Draft deleted from memory only (DB delete skipped): ${dbError.slice(0, 200)}` });
  }
  return jsonOk({ deleted: true });
}
