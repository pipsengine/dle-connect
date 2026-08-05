import { NextResponse } from 'next/server';
import { getEmployeeDraftFromDb, saveEmployeeDraftToDb } from '@/lib/dle-enterprise-db';

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

type DocumentDraft = {
  id: string;
  category: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  expiresAt: string;
  status: string;
};

type DraftRecord = {
  draftId: string;
  status: 'draft' | 'submitted' | 'approved' | 'created' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  draft: { documents?: DocumentDraft[]; [key: string]: unknown };
  audit: Array<{ id: string; at: string; action: string; performedBy: string; reason?: string }>;
};

const jsonOk = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const jsonErr = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });
const nowIso = () => new Date().toISOString();
const normalize = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

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

const canCreate = (role: Role) =>
  role === 'Super Admin' || role === 'HR Director' || role === 'HR Manager' || role === 'HR Officer' || role === 'Admin Officer';

const loadDraftRecord = async (draftId: string): Promise<DraftRecord | null> => {
  const rec = storeDrafts.get(draftId) || ((await getEmployeeDraftFromDb(draftId)) as DraftRecord | null);
  if (rec) storeDrafts.set(draftId, rec);
  return rec;
};

const validateDoc = (d: any) => {
  const mime = normalize(d.mimeType);
  const size = typeof d.sizeBytes === 'number' ? d.sizeBytes : 0;
  const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
  if (!allowed.includes(mime)) return 'File type not allowed';
  if (size > 15 * 1024 * 1024) return 'File size limit exceeded';
  return null;
};

/** POST /api/hris/employees/documents/upload — static path beats [id]/[...resource]. */
export async function POST(request: Request) {
  const role = getRole(request);
  if (!canCreate(role)) return jsonErr(403, 'Permission denied');
  const body = (await request.json().catch(() => null)) as any;
  const draftId = normalize(body?.draftId);
  const docs = Array.isArray(body?.documents) ? body.documents : null;
  if (!draftId) return jsonErr(400, 'draftId is required');
  if (!docs) return jsonErr(400, 'documents is required');
  const rec = await loadDraftRecord(draftId);
  if (!rec) return jsonErr(404, 'Draft not found');
  let uploaded = 0;
  const nextDocs = [...(rec.draft.documents || [])];
  for (const d of docs) {
    const err = validateDoc(d);
    if (err) return jsonErr(400, err);
    const id = normalize(d.id) || `doc-${Math.random().toString(16).slice(2)}`;
    const item: DocumentDraft = {
      id,
      category: normalize(d.category) || 'Document',
      fileName: normalize(d.fileName) || 'file',
      mimeType: normalize(d.mimeType) || 'application/octet-stream',
      sizeBytes: typeof d.sizeBytes === 'number' ? d.sizeBytes : 0,
      expiresAt: normalize(d.expiresAt),
      status: 'Uploaded',
    };
    const idx = nextDocs.findIndex((x) => x.id === id);
    if (idx >= 0) nextDocs[idx] = item;
    else nextDocs.unshift(item);
    uploaded++;
  }
  rec.draft.documents = nextDocs;
  rec.updatedAt = nowIso();
  rec.audit.unshift({
    id: `audit-${Math.random().toString(16).slice(2)}`,
    at: nowIso(),
    action: 'Document uploaded',
    performedBy: role,
  });
  await saveEmployeeDraftToDb(rec);
  return jsonOk({ uploaded });
}
