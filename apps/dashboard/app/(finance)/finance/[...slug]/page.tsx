import { notFound } from 'next/navigation';
import { FINANCE_PAGES, resolveFinancePage } from '@/lib/finance-intelligence/nav';
import { buildFinanceCommandCentre } from '@/lib/finance-intelligence/store';
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

  const childLinks = page.kind === 'section-dashboard' || page.features?.length
    ? childLinksFor(page.href)
    : [];

  // Prefer explicit child routes when available; otherwise map feature labels to known pages under this section.
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
      childLinks={childLinks.length ? childLinks : featureLinks}
    />
  );
}
