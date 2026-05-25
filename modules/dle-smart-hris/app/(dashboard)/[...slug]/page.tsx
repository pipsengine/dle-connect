import { PageTemplate } from '../../../components/layout/page-template';
import { navigationConfig, NavItem, SubMenu } from '../../../lib/config/navigation';
import { FileUp, Target, Plus, AlertCircle } from 'lucide-react';
import { notFound } from 'next/navigation';

export default async function GenericModulePage({ params }: { params: Promise<{ slug: string[] }> }) {
  const HRIS_BASE = '/hris';
  const resolvedParams = await params;
  const path = `/${resolvedParams.slug.join('/')}`;
  const toHref = (route?: string) => {
    if (!route) return '#';
    if (route.startsWith(HRIS_BASE)) return route;
    return `${HRIS_BASE}${route.startsWith('/') ? route : `/${route}`}`;
  };
  
  // Find the requested item in config
  let currentGroup: NavItem | undefined;
  let currentItem: SubMenu | NavItem | undefined;

  for (const group of navigationConfig) {
    if (group.route === path) {
      currentGroup = group;
      currentItem = group;
      break;
    }
    const foundSub = group.subItems?.find(sub => sub.route === path);
    if (foundSub) {
      currentGroup = group;
      currentItem = foundSub;
      break;
    }
  }

  if (!currentItem || !currentGroup) {
    notFound();
  }

  const breadcrumbs: { label: string; href?: string }[] = [
    { label: currentGroup.label, href: toHref(currentGroup.route) },
  ];

  if (currentItem !== currentGroup) {
    breadcrumbs.push({ label: (currentItem as any).title || (currentItem as any).label });
  }

  const title = (currentItem as any).title || (currentItem as any).label;

  return (
    <PageTemplate
      title={title}
      description={`Enterprise module for managing ${title.toLowerCase()} operations. AI integration ready.`}
      breadcrumbs={breadcrumbs}
      primaryAction={{ label: `New ${title}`, icon: Plus, onClick: () => console.log('Create') }}
      secondaryAction={{ label: 'Export', icon: FileUp, onClick: () => console.log('Export') }}
    >
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-12 flex flex-col items-center justify-center text-center min-h-[400px]">
        <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center mb-6 text-slate-300">
          <Target className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 mb-2">No Active Records Found</h3>
        <p className="text-slate-500 max-w-md text-sm leading-relaxed mb-6">
          This module is ready for deployment. To start utilizing the {title} tracking and AI intelligence, initialize the first record or connect a data source.
        </p>
        <button className="px-5 py-2.5 bg-dle-blue text-white rounded-lg text-sm font-medium hover:bg-dle-blue-deep transition-colors shadow-sm inline-flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Initialize {title}
        </button>
      </div>

      {/* Placeholder Audit Info */}
      <div className="mt-8 flex items-center gap-2 text-xs text-slate-400 bg-slate-50 border border-slate-100 rounded-lg px-4 py-3">
        <AlertCircle className="w-4 h-4 text-slate-400" />
        <span>Module access logged. Required Permissions: <span className="font-mono text-slate-500">{currentItem.permissionKey}</span></span>
      </div>
    </PageTemplate>
  );
}
