import { NextRequest, NextResponse } from 'next/server';
import { effectivePermissionsForUser } from '@/lib/auth/access-control-store';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import {
  canDeleteItAssets,
  canExportItAssets,
  canManageItAssets,
  canViewItAssets,
} from '@/lib/access/it-asset-access';
import {
  assignItAsset,
  buildItAssetDashboardPayload,
  createItAsset,
  createItInventory,
  createItMaintenance,
  updateItAsset,
} from '@/lib/it-asset-management-store';
import {
  buildItAssetSectionPayload,
  createItInstalledSoftware,
  createItProcurement,
  createItSoftwareCatalog,
  createItSoftwareLicense,
  createItSoftwareRequest,
  createItVendor,
  createItWarranty,
  deleteItAsset,
  deleteItInventory,
  exportItAssetCsv,
  initializeItAssetManagementRobust,
  performItMaintenanceBatch,
  reassignItAsset,
  returnItAsset,
  scheduleItMaintenanceBatch,
  searchItEmployees,
  suggestNextAssetTag,
  updateItInventory,
  updateItMaintenance,
} from '@/lib/it-asset-management-operations';
import { importBundledItAssetRegister, importItAssetRegisterCsv } from '@/lib/it-asset-register-store';

const ok = (data: unknown) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const sessionFrom = async (request: NextRequest) => verifySessionToken(request.cookies.get(AUTH_COOKIE)?.value);

const permissionsFrom = async (session: NonNullable<Awaited<ReturnType<typeof sessionFrom>>>) => {
  if (session.isGlobalAdmin || session.sub === 'global-admin') return ['*'];
  return effectivePermissionsForUser(session.sub, session.roles);
};

const actorFrom = (session: NonNullable<Awaited<ReturnType<typeof sessionFrom>>>) => session.fullName || session.username || 'IT User';

const guardView = async (request: NextRequest) => {
  const session = await sessionFrom(request);
  if (!session) return { error: err(401, 'Unauthenticated.') } as const;
  const permissions = await permissionsFrom(session);
  if (!canViewItAssets(permissions, session.isGlobalAdmin)) return { error: err(403, 'Forbidden.') } as const;
  return { session, permissions } as const;
};

const guardManage = async (request: NextRequest) => {
  const base = await guardView(request);
  if ('error' in base) return base;
  if (!canManageItAssets(base.permissions, base.session.isGlobalAdmin)) return { error: err(403, 'Forbidden.') } as const;
  return base;
};

export async function GET(request: NextRequest) {
  try {
    const base = await guardView(request);
    if ('error' in base) return base.error;

    const section = request.nextUrl.searchParams.get('section') || 'dashboard';
    const format = request.nextUrl.searchParams.get('format');
    const page = Number(request.nextUrl.searchParams.get('page') || 1);
    const pageSize = Number(request.nextUrl.searchParams.get('pageSize') || 25);
    const category = request.nextUrl.searchParams.get('category') || undefined;
    const subCategory = request.nextUrl.searchParams.get('subCategory') || undefined;
    const search = request.nextUrl.searchParams.get('search') || undefined;
    const department = request.nextUrl.searchParams.get('department') || undefined;
    const location = request.nextUrl.searchParams.get('location') || undefined;
    const status = request.nextUrl.searchParams.get('status') || undefined;
    const manufacturer = request.nextUrl.searchParams.get('manufacturer') || undefined;
    const model = request.nextUrl.searchParams.get('model') || undefined;
    const registerStatus = request.nextUrl.searchParams.get('registerStatus') || undefined;
    const pmStatus = request.nextUrl.searchParams.get('pmStatus') || undefined;
    const condition = request.nextUrl.searchParams.get('condition') || undefined;
    const assignedTo = request.nextUrl.searchParams.get('assignedTo') || undefined;

    if (format === 'csv') {
      if (!canExportItAssets(base.permissions, base.session.isGlobalAdmin)) return err(403, 'Forbidden.');
      const csv = await exportItAssetCsv(section);
      return new NextResponse(csv, {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="it-asset-${section}.csv"`,
        },
      });
    }

    if (section === 'employees') {
      const q = request.nextUrl.searchParams.get('q') || '';
      const employees = await searchItEmployees(q, Number(request.nextUrl.searchParams.get('limit') || 20));
      return ok({ employees });
    }
    if (section === 'next-asset-tag') {
      return ok(await suggestNextAssetTag());
    }

    if (section === 'dashboard') {
      return ok(await buildItAssetDashboardPayload());
    }

    return ok(await buildItAssetSectionPayload(section, {
      page,
      pageSize,
      category,
      subCategory,
      search,
      department,
      location,
      status,
      manufacturer,
      model,
      registerStatus,
      pmStatus,
      condition,
      assignedTo,
    }));
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to load Asset Management data.');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || '').trim();
    const manageActions = new Set([
      'initialize', 'import-register', 'import-bundled-register', 'create-asset', 'update-asset', 'delete-asset', 'create-inventory', 'update-inventory', 'delete-inventory',
      'create-maintenance', 'schedule-maintenance-batch', 'perform-maintenance-batch', 'update-maintenance', 'assign-asset', 'reassign-asset', 'return-asset', 'create-vendor', 'create-warranty',
      'create-procurement', 'create-license', 'create-software-catalog', 'create-installed-software', 'create-software-request',
    ]);
    const base = manageActions.has(action) ? await guardManage(request) : await guardView(request);
    if ('error' in base) return base.error;

    const actor = actorFrom(base.session);

    if (action === 'initialize') {
      return ok(await initializeItAssetManagementRobust(actor));
    }
    if (action === 'import-bundled-register') {
      return ok(await importBundledItAssetRegister(actor));
    }
    if (action === 'import-register') {
      const csvText = String(body.csvText || '').trim();
      if (!csvText) return err(400, 'csvText is required.');
      const result = await importItAssetRegisterCsv(csvText, actor);
      return ok({ result, payload: await buildItAssetDashboardPayload() });
    }
    if (action === 'create-asset') return ok({ asset: await createItAsset(body.asset || {}, actor), payload: await buildItAssetDashboardPayload() });
    if (action === 'update-asset') {
      const assetId = String(body.assetId || '').trim();
      if (!assetId) return err(400, 'assetId is required.');
      return ok({ asset: await updateItAsset(assetId, body.asset || {}, actor), payload: await buildItAssetDashboardPayload() });
    }
    if (action === 'delete-asset') {
      if (!canDeleteItAssets(base.permissions, base.session.isGlobalAdmin)) return err(403, 'Forbidden.');
      const assetId = String(body.assetId || '').trim();
      if (!assetId) return err(400, 'assetId is required.');
      await deleteItAsset(assetId, actor);
      return ok({ payload: await buildItAssetDashboardPayload() });
    }
    if (action === 'create-inventory') return ok({ item: await createItInventory(body.inventory || {}, actor), payload: await buildItAssetDashboardPayload() });
    if (action === 'update-inventory') {
      const stockId = String(body.stockId || '').trim();
      if (!stockId) return err(400, 'stockId is required.');
      await updateItInventory(stockId, body.inventory || {}, actor);
      return ok({ payload: await buildItAssetDashboardPayload() });
    }
    if (action === 'delete-inventory') {
      if (!canDeleteItAssets(base.permissions, base.session.isGlobalAdmin)) return err(403, 'Forbidden.');
      const stockId = String(body.stockId || '').trim();
      if (!stockId) return err(400, 'stockId is required.');
      await deleteItInventory(stockId, actor);
      return ok({ payload: await buildItAssetDashboardPayload() });
    }
    if (action === 'create-maintenance') return ok({ record: await createItMaintenance(body.maintenance || {}, actor), payload: await buildItAssetDashboardPayload() });
    if (action === 'schedule-maintenance-batch') {
      return ok({
        result: await scheduleItMaintenanceBatch({
          scope: body.scope,
          intent: body.intent,
          assetId: body.assetId,
          department: body.department,
          location: body.location,
          maintenanceType: body.maintenanceType,
          category: body.category,
          scheduledDate: body.scheduledDate,
          priority: body.priority,
          assignedTo: body.assignedTo,
          notes: body.notes,
          onlyPmDue: Boolean(body.onlyPmDue),
        }, actor),
        payload: await buildItAssetDashboardPayload(),
      });
    }
    if (action === 'perform-maintenance-batch') {
      return ok({
        result: await performItMaintenanceBatch({
          operation: body.operation,
          scope: body.scope,
          maintenanceIds: body.maintenanceIds,
          department: body.department,
          location: body.location,
          statusFilter: body.statusFilter,
        }, actor),
        payload: await buildItAssetDashboardPayload(),
      });
    }
    if (action === 'update-maintenance') {
      const maintenanceId = String(body.maintenanceId || '').trim();
      if (!maintenanceId) return err(400, 'maintenanceId is required.');
      await updateItMaintenance(maintenanceId, body.maintenance || {}, actor);
      return ok({ payload: await buildItAssetDashboardPayload() });
    }
    if (action === 'assign-asset') {
      const assetId = String(body.assetId || '').trim();
      const employeeName = String(body.employeeName || '').trim();
      if (!assetId || !employeeName) return err(400, 'assetId and employeeName are required.');
      return ok({
        assignment: await assignItAsset({
          assetId,
          employeeId: body.employeeId,
          employeeName,
          assignedEmail: body.assignedEmail,
          department: body.department,
          location: body.location,
          notes: body.notes,
        }, actor),
        payload: await buildItAssetDashboardPayload(),
      });
    }
    if (action === 'reassign-asset') {
      const assetId = String(body.assetId || '').trim();
      const employeeName = String(body.employeeName || '').trim();
      if (!assetId || !employeeName) return err(400, 'assetId and employeeName are required.');
      return ok({
        assignment: await reassignItAsset({
          assetId,
          employeeId: body.employeeId,
          employeeName,
          assignedEmail: body.assignedEmail,
          department: body.department,
          location: body.location,
          notes: body.notes,
        }, actor),
        payload: await buildItAssetDashboardPayload(),
      });
    }
    if (action === 'return-asset') {
      const assignmentId = String(body.assignmentId || '').trim();
      if (!assignmentId) return err(400, 'assignmentId is required.');
      await returnItAsset(assignmentId, actor);
      return ok({ payload: await buildItAssetDashboardPayload() });
    }
    if (action === 'create-vendor') return ok({ vendorId: await createItVendor(body.vendor || {}, actor), payload: await buildItAssetDashboardPayload() });
    if (action === 'create-warranty') return ok({ warrantyId: await createItWarranty(body.warranty || {}, actor), payload: await buildItAssetDashboardPayload() });
    if (action === 'create-procurement') return ok({ orderId: await createItProcurement(body.procurement || {}, actor), payload: await buildItAssetDashboardPayload() });
    if (action === 'create-license') return ok({ licenseId: await createItSoftwareLicense(body.license || {}, actor), payload: await buildItAssetDashboardPayload() });
    if (action === 'create-software-catalog') return ok({ catalogId: await createItSoftwareCatalog(body.catalog || {}, actor), payload: await buildItAssetDashboardPayload() });
    if (action === 'create-installed-software') return ok({ installId: await createItInstalledSoftware(body.installed || {}, actor), payload: await buildItAssetDashboardPayload() });
    if (action === 'create-software-request') return ok({ requestId: await createItSoftwareRequest(body.request || {}, actor), payload: await buildItAssetDashboardPayload() });

    return err(400, 'Unsupported action.');
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to process Asset Management request.');
  }
}
