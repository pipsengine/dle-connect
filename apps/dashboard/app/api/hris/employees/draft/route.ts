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
  const canCreate = role === 'Super Admin' || role === 'HR Director' || role === 'HR Manager' || role === 'HR Officer' || role === 'Admin Officer';
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

/** POST /api/hris/employees/draft — create draft (static path beats [id]/[...resource]). */
export async function POST(request: Request) {
  const role = await getRole(request);
  const perms = permissions(role);
  if (!perms.canCreate) return jsonErr(403, 'Permission denied');
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
  await saveEmployeeDraftToDb(rec);
  return jsonOk({ draftId, status: rec.status, updatedAt: rec.updatedAt });
}
