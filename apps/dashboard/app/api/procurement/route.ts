import { NextRequest, NextResponse } from 'next/server';
import { effectivePermissionsForUser } from '@/lib/auth/access-control-store';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import {
  canApproveProcurement,
  canCreateProcurement,
  canEditProcurement,
  canViewProcurement,
} from '@/lib/access/procurement-access';
import {
  addCbeAudit,
  addCbeDocument,
  addNegotiationRound,
  buildProcurementDashboard,
  buildProcurementReports,
  createCbe,
  getCbeDetail,
  listCbes,
  listContracts,
  listPurchaseOrders,
  listPurchaseRequisitions,
  listRfqs,
  listSettings,
  listSuppliers,
  saveCbeBidMatrix,
  saveCbeTechnical,
  submitRecommendation,
  updateApprovalStep,
  updateCbeHeader,
  upsertContract,
  upsertPurchaseOrder,
  upsertPurchaseRequisition,
  upsertRfq,
  upsertSetting,
  upsertSupplier,
} from '@/lib/procurement-store';

const ok = (data: unknown) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const sessionFrom = async (request: NextRequest) => verifySessionToken(request.cookies.get(AUTH_COOKIE)?.value);

const permissionsFrom = async (session: NonNullable<Awaited<ReturnType<typeof sessionFrom>>>) => {
  if (session.isGlobalAdmin || session.sub === 'global-admin') return ['*'];
  return effectivePermissionsForUser(session.sub, session.roles);
};

const actorFrom = (session: NonNullable<Awaited<ReturnType<typeof sessionFrom>>>) =>
  session.fullName || session.username || 'Procurement User';

export async function GET(request: NextRequest) {
  const session = await sessionFrom(request);
  if (!session) return err(401, 'Unauthorized');
  const permissions = await permissionsFrom(session);
  if (!canViewProcurement(permissions, session.isGlobalAdmin)) return err(403, 'Forbidden');

  const { searchParams } = new URL(request.url);
  const resource = searchParams.get('resource') || 'dashboard';

  try {
    switch (resource) {
      case 'dashboard':
        return ok(await buildProcurementDashboard());
      case 'suppliers':
        return ok(await listSuppliers());
      case 'purchase-requisitions':
        return ok(await listPurchaseRequisitions());
      case 'rfqs':
        return ok(await listRfqs());
      case 'purchase-orders':
        return ok(await listPurchaseOrders());
      case 'contracts':
        return ok(await listContracts());
      case 'settings':
        return ok(await listSettings(searchParams.get('settingType') || undefined));
      case 'cbes':
        return ok(await listCbes());
      case 'cbe': {
        const id = searchParams.get('id');
        if (!id) return err(400, 'id required');
        const detail = await getCbeDetail(id);
        if (!detail) return err(404, 'CBE not found');
        return ok(detail);
      }
      case 'reports':
        return ok(await buildProcurementReports());
      default:
        return err(400, `Unknown resource: ${resource}`);
    }
  } catch (error) {
    console.error('[procurement GET]', error);
    return err(500, error instanceof Error ? error.message : 'Failed to load procurement data');
  }
}

export async function POST(request: NextRequest) {
  const session = await sessionFrom(request);
  if (!session) return err(401, 'Unauthorized');
  const permissions = await permissionsFrom(session);
  if (!canCreateProcurement(permissions, session.isGlobalAdmin) && !canEditProcurement(permissions, session.isGlobalAdmin)) {
    return err(403, 'Forbidden');
  }

  const actor = actorFrom(session);
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || '');

  try {
    switch (action) {
      case 'upsert-supplier':
        return ok(await upsertSupplier(body.payload || body, actor));
      case 'upsert-pr':
        return ok(await upsertPurchaseRequisition(body.payload || body, actor));
      case 'upsert-rfq':
        return ok(await upsertRfq(body.payload || body, actor));
      case 'upsert-po':
        return ok(await upsertPurchaseOrder(body.payload || body, actor));
      case 'upsert-contract':
        return ok(await upsertContract(body.payload || body, actor));
      case 'upsert-setting':
        return ok(await upsertSetting(body.payload || body, actor));
      case 'create-cbe':
        return ok(await createCbe(body.payload || body, actor));
      case 'update-cbe': {
        if (!canEditProcurement(permissions, session.isGlobalAdmin)) return err(403, 'Forbidden');
        const id = String(body.id || body.cbeId || '');
        if (!id) return err(400, 'id required');
        return ok(await updateCbeHeader(id, body.payload || body, actor));
      }
      case 'save-bid-matrix': {
        if (!canEditProcurement(permissions, session.isGlobalAdmin)) return err(403, 'Forbidden');
        const id = String(body.id || body.cbeId || '');
        if (!id) return err(400, 'id required');
        return ok(await saveCbeBidMatrix(id, body.payload || body, actor));
      }
      case 'save-technical': {
        if (!canEditProcurement(permissions, session.isGlobalAdmin)) return err(403, 'Forbidden');
        const id = String(body.id || body.cbeId || '');
        if (!id) return err(400, 'id required');
        return ok(await saveCbeTechnical(id, body.criteria || body.payload?.criteria || body.payload || [], actor));
      }
      case 'add-negotiation': {
        if (!canEditProcurement(permissions, session.isGlobalAdmin)) return err(403, 'Forbidden');
        const id = String(body.id || body.cbeId || '');
        if (!id) return err(400, 'id required');
        return ok(await addNegotiationRound(id, body.payload || body, actor));
      }
      case 'submit-recommendation': {
        if (!canApproveProcurement(permissions, session.isGlobalAdmin) && !canEditProcurement(permissions, session.isGlobalAdmin)) {
          return err(403, 'Forbidden');
        }
        const id = String(body.id || body.cbeId || '');
        if (!id) return err(400, 'id required');
        return ok(await submitRecommendation(id, body.payload || body, actor));
      }
      case 'update-approval': {
        if (!canApproveProcurement(permissions, session.isGlobalAdmin)) return err(403, 'Forbidden');
        const id = String(body.id || body.cbeId || '');
        if (!id) return err(400, 'id required');
        return ok(
          await updateApprovalStep(
            id,
            Number(body.stepNo || 0),
            String(body.status || 'Approved'),
            actor,
            body.notes ? String(body.notes) : undefined,
          ),
        );
      }
      case 'add-document': {
        const id = String(body.id || body.cbeId || '');
        if (!id) return err(400, 'id required');
        return ok(await addCbeDocument(id, body.payload || body, actor));
      }
      case 'add-audit': {
        const id = String(body.id || body.cbeId || '');
        if (!id) return err(400, 'id required');
        return ok(
          await addCbeAudit(
            id,
            String(body.actionLabel || body.auditAction || 'Update'),
            body.section ? String(body.section) : null,
            body.details ? String(body.details) : null,
            actor,
            body.role ? String(body.role) : undefined,
          ),
        );
      }
      default:
        return err(400, `Unknown action: ${action}`);
    }
  } catch (error) {
    console.error('[procurement POST]', error);
    return err(500, error instanceof Error ? error.message : 'Failed to save procurement data');
  }
}
