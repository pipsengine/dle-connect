import { NextRequest, NextResponse } from 'next/server';
import { effectivePermissionsForUser } from '@/lib/auth/access-control-store';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import {
  canFormallyApproveOwnPrep,
  telephoneAllowanceCapabilities,
} from '@/lib/telephone-allowance-access';
import {
  approveHr,
  approveMd,
  authorizeCfo,
  buildApprovalsPayload,
  buildDashboardPayload,
  buildPaymentReportingPayload,
  compareCycles,
  completeHrReview,
  createNextCycle,
  generatePaymentSchedule,
  getCycle,
  getCurrentCycle,
  hrAddEmployee,
  hrAdjustAmount,
  hrRemoveEmployee,
  importHistoricalSchedule,
  initiateApproval,
  listAudits,
  listCycles,
  listEntitlements,
  listExceptions,
  recordPayment,
  resolveException,
  returnForCorrection,
  saveCycleDraft,
  searchDirectoryEmployees,
  sendToHrReview,
  upsertEntitlement,
  validateCycleForApproval,
} from '@/lib/telephone-allowance-store';
import { buildExcelWorkbookXml } from '@/lib/excel-export';
import { maskAccount } from '@/lib/telephone-allowance-cycle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ok = (data: unknown) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const sessionFrom = async (request: NextRequest) => verifySessionToken(request.cookies.get(AUTH_COOKIE)?.value);

const permissionsFrom = async (session: NonNullable<Awaited<ReturnType<typeof sessionFrom>>>) => {
  if (session.isGlobalAdmin || session.sub === 'global-admin') return ['*'];
  return effectivePermissionsForUser(session.sub, session.roles);
};

const actorFrom = (session: NonNullable<Awaited<ReturnType<typeof sessionFrom>>>) =>
  session.fullName || session.username || 'User';

const guardView = async (request: NextRequest) => {
  const session = await sessionFrom(request);
  if (!session) return { error: err(401, 'Unauthenticated.') } as const;
  const permissions = await permissionsFrom(session);
  const caps = telephoneAllowanceCapabilities(permissions, session.isGlobalAdmin, session.roles);
  if (!caps.canView) return { error: err(403, 'Forbidden.') } as const;
  return { session, permissions, caps, actor: actorFrom(session) } as const;
};

const clientIp = (request: NextRequest) =>
  request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  || request.headers.get('x-real-ip')
  || null;

export async function GET(request: NextRequest) {
  try {
    const base = await guardView(request);
    if ('error' in base) return base.error;
    const { caps, actor, session } = base;
    const url = new URL(request.url);
    const view = url.searchParams.get('view') || 'dashboard';
    const cycleId = url.searchParams.get('cycleId') || undefined;
    const format = url.searchParams.get('format');

    if (view === 'dashboard') return ok(await buildDashboardPayload(actor, caps));
    if (view === 'entitlements') return ok({ entitlements: await listEntitlements(), capabilities: caps });
    if (view === 'cycles') return ok({ cycles: await listCycles(), capabilities: caps });
    if (view === 'cycle') {
      const cycle = cycleId ? await getCycle(cycleId) : await getCurrentCycle();
      if (!cycle) return ok({ cycle: null, capabilities: caps });
      const sanitized = caps.canSeeFullBank
        ? cycle
        : {
            ...cycle,
            employees: cycle.employees.map((e) => ({
              ...e,
              accountNo: maskAccount(e.accountNo),
            })),
          };
      return ok({
        cycle: sanitized,
        validation: validateCycleForApproval(cycle),
        capabilities: caps,
      });
    }
    if (view === 'approvals') return ok(await buildApprovalsPayload(actor, caps));
    if (view === 'payment') return ok(await buildPaymentReportingPayload(caps));
    if (view === 'exceptions') return ok({ exceptions: await listExceptions(cycleId), capabilities: caps });
    if (view === 'audit') return ok({ audits: await listAudits(cycleId), capabilities: caps });
    if (view === 'compare') {
      const previousId = url.searchParams.get('previousId');
      if (!cycleId || !previousId) return err(400, 'cycleId and previousId are required.');
      return ok(await compareCycles(cycleId, previousId));
    }
    if (view === 'directory-search') {
      const q = url.searchParams.get('q') || '';
      return ok({ employees: await searchDirectoryEmployees(q) });
    }
    if (view === 'export-payment' && format === 'xls') {
      if (!caps.canExport && !caps.canTreasury) return err(403, 'Export denied.');
      const payload = await buildPaymentReportingPayload(caps);
      const payment = cycleId
        ? payload.payments.find((p: { cycleId: string }) => p.cycleId === cycleId) || payload.payments[0]
        : payload.payments[0];
      if (!payment) return err(404, 'No payment schedule found.');
      const columns = [
        'TRANSACTION REFERENCE',
        'Staff ID Number',
        'SURNAME',
        'FIRST NAME',
        'AMOUNT',
        'PAYMENT DUE DATE',
        'BENEFICIARY CODE',
        'BENEFICIARY ACC NO',
        'ROUTING BANK CODE',
        'STATUS',
      ];
      const rows = (payment.items || []).map((item: {
        employeeCode: string;
        employeeName: string;
        amount: number;
        accountNoMasked?: string;
        accountNoFull?: string | null;
        bankName: string;
        sortCode: string;
        status: string;
        id: string;
      }) => {
        const parts = String(item.employeeName || '').trim().split(/\s+/);
        const first = parts[0] || '';
        const surname = parts.slice(1).join(' ') || parts[0] || '';
        return [
          item.id,
          item.employeeCode,
          surname,
          first,
          item.amount,
          payment.paymentDate || '',
          item.employeeCode,
          caps.canSeeFullBank ? (item.accountNoFull || item.accountNoMasked || '') : (item.accountNoMasked || ''),
          item.sortCode || '',
          item.status,
        ];
      });
      return new Response(
        buildExcelWorkbookXml({
          worksheets: [{
            title: `Telephone Allowance ${payment.cycleCode}`,
            subtitle: `Authorized ${payment.authorizedAmount} · ${payment.beneficiaryCount} beneficiaries`,
            sheetName: 'CALL CARDS',
            columns,
            rows,
          }],
        }),
        {
          headers: {
            'content-type': 'application/vnd.ms-excel',
            'content-disposition': `attachment; filename="call-credit-${payment.cycleCode}.xls"`,
          },
        },
      );
    }

    return err(400, `Unknown view: ${view}`);
  } catch (error) {
    console.error('[TelephoneAllowance GET]', error);
    return err(500, error instanceof Error ? error.message : 'Telephone allowance request failed.');
  }
}

export async function POST(request: NextRequest) {
  try {
    const base = await guardView(request);
    if ('error' in base) return base.error;
    const { caps, actor, session } = base;
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || '');
    const cycleId = String(body.cycleId || '');
    const rowVersion = Number(body.rowVersion || 0);
    const ip = clientIp(request);
    void ip;
    void session;

    const require = (allowed: boolean) => {
      if (!allowed) throw Object.assign(new Error('Permission denied for this action.'), { status: 403 });
    };

    switch (action) {
      case 'create-cycle': {
        require(caps.canPrepare);
        const cycle = await createNextCycle(actor, {
          year: body.year ? Number(body.year) : undefined,
          pairCode: body.pairCode || undefined,
        });
        return ok({ cycle, message: `Cycle ${cycle.cycleCode} created.` });
      }
      case 'save-draft': {
        require(caps.canPrepare);
        const cycle = await saveCycleDraft(cycleId, rowVersion, body.patch || {}, actor);
        return ok({ cycle, message: 'Draft saved.' });
      }
      case 'send-to-hr': {
        require(caps.canPrepare);
        const cycle = await sendToHrReview(cycleId, rowVersion, actor);
        return ok({ cycle, message: 'Sent to HR for review.' });
      }
      case 'hr-add-employee': {
        require(caps.canHrReview);
        const cycle = await hrAddEmployee(cycleId, rowVersion, body, actor);
        return ok({ cycle, message: 'Employee added.' });
      }
      case 'hr-remove-employee': {
        require(caps.canHrReview);
        const cycle = await hrRemoveEmployee(cycleId, rowVersion, body, actor);
        return ok({ cycle, message: 'Employee removed from cycle.' });
      }
      case 'hr-adjust-amount': {
        require(caps.canHrReview);
        const cycle = await hrAdjustAmount(cycleId, rowVersion, body, actor);
        return ok({ cycle, message: 'Entitlement adjusted.' });
      }
      case 'complete-hr-review': {
        require(caps.canHrReview);
        const cycle = await completeHrReview(cycleId, rowVersion, actor, body.comment);
        return ok({ cycle, message: 'HR review completed and returned to IT.' });
      }
      case 'initiate-approval': {
        require(caps.canPrepare);
        const cycle = await initiateApproval(cycleId, rowVersion, actor);
        return ok({ cycle, message: 'Approval initiated. Schedule locked.' });
      }
      case 'approve-hr': {
        require(caps.canHrApprove);
        const cycle = await getCycle(cycleId);
        if (!cycle) return err(404, 'Cycle not found.');
        const canOwn = canFormallyApproveOwnPrep(cycle.preparedBy, actor, session.username || '');
        const updated = await approveHr(cycleId, rowVersion, actor, body.comment, canOwn);
        return ok({ cycle: updated, message: 'HR approved.' });
      }
      case 'approve-md': {
        require(caps.canMdApprove);
        const cycle = await getCycle(cycleId);
        if (!cycle) return err(404, 'Cycle not found.');
        const canOwn = canFormallyApproveOwnPrep(cycle.preparedBy, actor, session.username || '');
        const updated = await approveMd(cycleId, rowVersion, actor, body.comment, canOwn);
        return ok({ cycle: updated, message: 'MD approved.' });
      }
      case 'authorize-cfo': {
        require(caps.canCfoAuthorize);
        const cycle = await getCycle(cycleId);
        if (!cycle) return err(404, 'Cycle not found.');
        const canOwn = canFormallyApproveOwnPrep(cycle.preparedBy, actor, session.username || '');
        const updated = await authorizeCfo(cycleId, rowVersion, actor, body.comment, canOwn);
        return ok({ cycle: updated, message: 'Authorized for payment.' });
      }
      case 'return-correction': {
        if (!(caps.canHrApprove || caps.canMdApprove || caps.canCfoAuthorize)) require(false);
        const cycle = await getCycle(cycleId);
        if (!cycle) return err(404, 'Cycle not found.');
        const canOwn = canFormallyApproveOwnPrep(cycle.preparedBy, actor, session.username || '');
        const reasonText = [String(body.reason || 'Other'), body.comment].filter(Boolean).join(' — ');
        const updated = await returnForCorrection(cycleId, rowVersion, actor, reasonText, canOwn);
        return ok({ cycle: updated, message: 'Returned for correction.' });
      }
      case 'generate-payment-schedule': {
        require(caps.canTreasury || caps.canPrepare);
        const payment = await generatePaymentSchedule(cycleId, actor);
        return ok({ payment, message: 'Payment schedule generated.' });
      }
      case 'record-payment': {
        require(caps.canTreasury);
        const payment = await recordPayment(cycleId, body, actor);
        return ok({ payment, message: 'Payment recorded.' });
      }
      case 'resolve-exception': {
        require(caps.canPrepare || caps.canTreasury || caps.canHrReview);
        const exception = await resolveException(String(body.exceptionId || ''), String(body.resolution || ''), actor);
        return ok({ exception, message: 'Exception resolved.' });
      }
      case 'upsert-entitlement': {
        require(caps.canPrepare);
        const entitlement = await upsertEntitlement(body, actor);
        return ok({ entitlement, message: 'Entitlement saved.' });
      }
      case 'import-historical': {
        require(caps.canImport);
        const result = await importHistoricalSchedule(
          body.rows || [],
          body.mode || 'bimonthly',
          body.cycleMeta || {},
          actor,
        );
        return ok({ ...result, message: 'Historical schedule imported.' });
      }
      default:
        return err(400, `Unknown action: ${action}`);
    }
  } catch (error) {
    const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status: number }).status) : 500;
    console.error('[TelephoneAllowance POST]', error);
    return err(status >= 400 && status < 600 ? status : 500, error instanceof Error ? error.message : 'Action failed.');
  }
}
