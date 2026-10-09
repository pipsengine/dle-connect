import {
  FolderKanban,
  LayoutDashboard,
  type LucideIcon,
} from 'lucide-react';

export type TenderNavChild = {
  id: string;
  label: string;
  href: string;
};

export type TenderNavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  children?: TenderNavChild[];
};

export const TENDER_NAV: TenderNavItem[] = [
  { id: 'home', label: 'Dashboard', href: '/commercial/tenders', icon: LayoutDashboard },
  {
    id: 'tender-management',
    label: 'Tender Management',
    href: '/commercial/tenders/opportunities',
    icon: FolderKanban,
    children: [
      { id: 'dashboard', label: 'Dashboard', href: '/commercial/tenders' },
      { id: 'enquiries', label: 'Enquiries', href: '/commercial/tenders/enquiries' },
      { id: 'opportunities', label: 'Tender Opportunities', href: '/commercial/tenders/opportunities' },
      { id: 'workspace', label: 'Tender Workspace', href: '/commercial/tenders/workspace' },
      { id: 'bid', label: 'Bid Preparation', href: '/commercial/tenders/bid-preparation' },
      { id: 'evaluation', label: 'Tender Evaluation', href: '/commercial/tenders/evaluation' },
      { id: 'approvals', label: 'Approvals', href: '/commercial/tenders/approvals' },
      { id: 'submission', label: 'Submission & Tracking', href: '/commercial/tenders/submission' },
      { id: 'awards', label: 'Awards & Contracts', href: '/commercial/tenders/awards' },
      { id: 'reports', label: 'Reports & Intelligence', href: '/commercial/tenders/reports' },
      { id: 'administration', label: 'Administration', href: '/commercial/tenders/administration' },
    ],
  },
];
