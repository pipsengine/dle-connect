import { notFound } from 'next/navigation';
import { FINANCE_PAGES, resolveFinancePage } from '@/lib/finance-intelligence/nav';
import { buildFinanceApprovalCentre, buildFinanceCommandCentre } from '@/lib/finance-intelligence/store';
import { buildCashAdvanceControlsWorkspace, buildPaymentRequestsWorkspace } from '@/lib/finance-intelligence/payment-requests-service';
import { buildApprovalMatrixWorkspace } from '@/lib/finance-intelligence/approval-matrix-service';
import FinanceWorkspaceClient from '../FinanceWorkspaceClient';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ slug?: string[] }>;
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

  const commandCentre = page.kind === 'command-centre'
    ? await buildFinanceCommandCentre().catch(() => null)
    : null;
  const approvalCentre = page.kind === 'approvals-dashboard'
    ? await buildFinanceApprovalCentre().catch(() => null)
    : null;

  let paymentType: string | undefined;
  if (pathname.includes('cash-advance') || pathname.endsWith('/cash-advances')) paymentType = 'Cash Advance Payment';
  if (pathname.includes('supplier')) paymentType = 'Supplier Invoice Payment';

  const paymentRequests = page.kind === 'payment-requests'
    ? await buildPaymentRequestsWorkspace({ paymentType }).catch(() => null)
    : null;

  const cashAdvanceControls = page.kind === 'cash-advance-controls'
    ? await buildCashAdvanceControlsWorkspace().catch(() => ({
      generatedAt: new Date().toISOString(),
      outstanding: [],
      activeWaivers: [],
      summary: {
        outstandingCount: 0,
        awaitingRetirement: 0,
        activeWaivers: 0,
        blockedEmployees: 0,
      },
    }))
    : null;

  const approvalMatrix = page.kind === 'approval-matrix' || page.kind === 'approval-limits'
    ? await buildApprovalMatrixWorkspace().catch(() => ({
      generatedAt: new Date().toISOString(),
      source: 'DLE Enterprise · finance.ApprovalMatrix',
      summary: {
        pathTypes: 0,
        activeRules: 0,
        approvalLevels: 0,
        pendingChanges: 0,
        coveragePct: 0,
        dualControlRules: 0,
        companyCoveragePct: 0,
        compliancePct: 0,
        nonProjectRules: 0,
        projectRules: 0,
      },
      rules: [],
      audit: [],
      fxRates: [],
    }))
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

  return (
    <FinanceWorkspaceClient
      page={page}
      commandCentre={commandCentre}
      approvalCentre={approvalCentre}
      paymentRequests={paymentRequests}
      approvalMatrix={approvalMatrix}
      cashAdvanceControls={cashAdvanceControls}
      childLinks={childLinks.length ? childLinks : featureLinks}
    />
  );
}
