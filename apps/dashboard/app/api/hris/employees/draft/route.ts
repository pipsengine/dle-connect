import { NextResponse } from 'next/server';
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

const getRole = (request: Request): Role => {
  const header = String(request.headers.get('x-hris-role') || '').trim();
  if (header) return header as Role;
  return 'HR Officer';
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
  const role = getRole(request);
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
