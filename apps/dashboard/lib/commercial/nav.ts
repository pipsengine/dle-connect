import {
  Award,
  BarChart3,
  ClipboardList,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  Send,
  ShieldCheck,
  SquareCheckBig,
  type LucideIcon,
} from 'lucide-react';

export type TenderNavChild = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
};

export type TenderNavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  children?: TenderNavChild[];
};

export const TENDER_NAV: TenderNavItem[] = [
  {
    id: 'tender-management',
    label: 'Tender Management',
    href: '/commercial/tenders',
    icon: FolderKanban,
    children: [
      { id: 'dashboard', label: 'Dashboard', href: '/commercial/tenders', icon: LayoutDashboard },
      { id: 'enquiries', label: 'Enquiries', href: '/commercial/tenders/enquiries', icon: Inbox },
      { id: 'opportunities', label: 'Tender Opportunities', href: '/commercial/tenders/opportunities', icon: ClipboardList },
      { id: 'workspace', label: 'Tender Workspace', href: '/commercial/tenders/workspace', icon: FolderKanban },
      { id: 'bid', label: 'Bid Preparation', href: '/commercial/tenders/bid-preparation', icon: ClipboardList },
      { id: 'evaluation', label: 'Tender Evaluation', href: '/commercial/tenders/evaluation', icon: SquareCheckBig },
      { id: 'approvals', label: 'Approvals', href: '/commercial/tenders/approvals', icon: ShieldCheck },
      { id: 'submission', label: 'Submission & Tracking', href: '/commercial/tenders/submission', icon: Send },
      { id: 'awards', label: 'Awards & Contracts', href: '/commercial/tenders/awards', icon: Award },
      { id: 'reports', label: 'Reports & Intelligence', href: '/commercial/tenders/reports', icon: BarChart3 },
    ],
  },
];
