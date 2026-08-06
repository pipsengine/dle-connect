import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { FINANCE_PAGES, resolveFinancePage } from '@/lib/finance-intelligence/nav';
import { buildFinanceApprovalCentre, buildFinanceCommandCentre } from '@/lib/finance-intelligence/store';
import {
  buildCashAdvanceControlsWorkspace,
  buildEmployeePaymentDashboard,
  buildFinancePostingWorkspace,
  buildPaymentRequestsWorkspace,
  buildTreasuryWorkspace,
} from '@/lib/finance-intelligence/payment-requests-service';
import { buildApprovalMatrixWorkspace } from '@/lib/finance-intelligence/approval-matrix-service';
import { buildApprovalDelegationWorkspace } from '@/lib/finance-intelligence/approval-delegation-service';
import {
  canAccessFinancePaymentPage,
  canActOnPaymentApproval,
  canViewAllPaymentRequests,
} from '@/lib/finance-intelligence/payment-access';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { permissionsForRoles } from '@/lib/auth/rbac';
import FinanceWorkspaceClient from '../FinanceWorkspaceClient';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ slug?: string[] }>;
};

const resolveFinanceActor = async () => {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;
  const roles = session?.roles || [];
  const permissions = session?.isGlobalAdmin ? ['*'] : permissionsForRoles(roles);
  return {
    actorCode: session?.employeeCode || session?.username || session?.sub || '',
    actorName: session?.fullName || session?.username || session?.sub || '',
    roles,
    permissions,
    isGlobalAdmin: Boolean(session?.isGlobalAdmin),
  };
};

const childLinksFor = (href: string) =>
  FINANCE_PAGES
    .filter((page) => page.parentHref === href || (page.href.startsWith(`${href}/`) && page.href !== href && page.breadcrumbs.length === (FINANCE_PAGES.find((item) => item.href === href)?.breadcrumbs.length || 0) + 1))
    .map((page) => ({
      href: page.href,
      title: page.title,
      description: page.description,
    }));

export default async function FinanceCatchAllPage({ params }: Props) {
  const { slug } = await params;
  const pathname = `/finance/${(slug || []).join('/')}`.replace(/\/$/, '') || '/finance';
  const page = resolveFinancePage(pathname);
  if (!page) notFound();

  const actor = await resolveFinanceActor();
  const viewAllPayments = canViewAllPaymentRequests(actor);
  const paymentSelfService = !viewAllPayments;

  if (!viewAllPayments && !canAccessFinancePaymentPage(pathname, actor)) {
    redirect('/finance/approvals');
  }
  if (paymentSelfService && page.kind === 'command-centre') {
    redirect('/finance/approvals');
  }

  const mineOnlyPage = pathname.includes('/my-requests');

  const commandCentre = page.kind === 'command-centre' && viewAllPayments
    ? await buildFinanceCommandCentre().catch(() => null)
    : null;
  const approvalCentre = page.kind === 'approvals-dashboard' && viewAllPayments
    ? await buildFinanceApprovalCentre().catch(() => null)
    : null;
  const employeePaymentDashboard = page.kind === 'approvals-dashboard' && paymentSelfService
    ? await buildEmployeePaymentDashboard(actor.actorCode).catch(() => null)
    : null;

  let paymentType: string | undefined;
  if (pathname.includes('cash-advance') || pathname.endsWith('/cash-advances')) paymentType = 'Cash Advance Payment';
  if (pathname.includes('supplier')) paymentType = 'Supplier Invoice Payment';

  const paymentRequestsRaw = page.kind === 'payment-requests'
    ? await buildPaymentRequestsWorkspace({
      paymentType,
      mineFor: mineOnlyPage || paymentSelfService ? actor.actorCode : undefined,
      scopedToActorCode: !viewAllPayments && !mineOnlyPage ? actor.actorCode : undefined,
    }).catch(() => null)
    : null;
  const paymentRequests = paymentRequestsRaw
    ? {
      ...paymentRequestsRaw,
      viewer: {
        actorCode: actor.actorCode,
        approvableRequestIds: paymentRequestsRaw.rows
          .filter((row) => canActOnPaymentApproval(actor, row))
          .map((row) => row.requestId),
      },
    }
    : null;

  const cashAdvanceControls = page.kind === 'cash-advance-controls' && viewAllPayments
    ? await buildCashAdvanceControlsWorkspace().catch(() => null)
    : null;

  const treasuryWorkspace = page.kind === 'treasury-ops' && viewAllPayments
    ? await buildTreasuryWorkspace().catch(() => null)
    : null;

  const financePostingWorkspace = page.kind === 'finance-posting' && viewAllPayments
    ? await buildFinancePostingWorkspace().catch(() => null)
    : null;

  const approvalMatrix = (page.kind === 'approval-matrix' || page.kind === 'approval-limits') && viewAllPayments
    ? await buildApprovalMatrixWorkspace().catch(() => null)
    : null;

  const approvalDelegations = page.kind === 'delegation-rules' && viewAllPayments
    ? await buildApprovalDelegationWorkspace().catch(() => null)
    : null;

  const childLinks = page.kind === 'section-dashboard' || page.features?.length
    ? childLinksFor(page.href)
    : [];

  const featureLinks = (page.features || [])
    .map((feature) => {
      const match = FINANCE_PAGES.find(
        (item) =>
          item.title === feature
          || (item.href.startsWith(`${page.href}/`) && item.title.toLowerCase().includes(feature.toLowerCase().slice(0, 12))),
      );
      return match
        ? { href: match.href, title: feature, description: match.description }
        : null;
    })
    .filter((item): item is { href: string; title: string; description: string } => Boolean(item));

  const pageForClient = paymentSelfService && page.kind === 'approvals-dashboard'
    ? {
      ...page,
      title: 'My Payments',
      description: 'Your payment requests, cash advances, and items awaiting your approval.',
      breadcrumbs: ['Payment Approvals', 'My Payments'],
    }
    : page;

  return (
    <FinanceWorkspaceClient
      page={pageForClient}
      commandCentre={commandCentre}
      approvalCentre={approvalCentre}
      employeePaymentDashboard={employeePaymentDashboard}
      employeeName={actor.actorName}
      paymentSelfService={paymentSelfService}
      paymentRequests={paymentRequests}
      approvalMatrix={approvalMatrix}
      approvalDelegations={approvalDelegations}
      cashAdvanceControls={cashAdvanceControls}
      treasuryWorkspace={treasuryWorkspace}
      financePostingWorkspace={financePostingWorkspace}
      childLinks={childLinks.length ? childLinks : featureLinks}
    />
  );
}
