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
  const role = getRole(request);
  const perms = permissions(role);
  if (!perms.canCreate) return jsonErr(403, 'Permission denied');
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
  await saveEmployeeDraftToDb(rec);
  return jsonOk({ draftId: rec.draftId, status: rec.status, updatedAt: rec.updatedAt });
}

/** DELETE /api/hris/employees/draft/[draftId] */
export async function DELETE(request: Request, ctx: Ctx) {
  const role = getRole(request);
  const perms = permissions(role);
  if (!perms.canCreate) return jsonErr(403, 'Permission denied');
  const { draftId: rawId } = await ctx.params;
  const draftId = String(rawId || '').trim();
  if (!draftId) return jsonErr(404, 'Draft not found');
  const rec = await loadDraftRecord(draftId);
  if (!rec) return jsonErr(404, 'Draft not found');
  storeDrafts.delete(draftId);
  await deleteEmployeeDraftFromDb(draftId);
  return jsonOk({ deleted: true });
}
