export const VISITOR_STATUSES = [
  'Draft',
  'Pending Approval',
  'More Info Requested',
  'Pending Security Check-in',
  'Pending Reception Check-in',
  'Waiting for Host',
  'Checked In',
  'Pending Reception Check-out',
  'Pending Security Check-out',
  'Checked Out',
  'Rejected',
  'Blacklisted',
  'Cancelled',
] as const;

export type VisitorStatus = (typeof VISITOR_STATUSES)[number];
export type VisitorPriority = 'Low' | 'Medium' | 'High';

export type VisitorTimelineEvent = {
  time: string;
  action: string;
  actor: string;
  note?: string;
};

export type VisitorAttachment = {
  name: string;
  type: string;
  size?: string;
};

export type VisitorVisit = {
  id: string;
  visitorName: string;
  phone: string;
  email: string;
  company: string;
  visitorType: string;
  nationality: string;
  visitDate: string;
  visitTime: string;
  duration: string;
  purpose: string;
  hostName: string;
  hostEmployeeCode: string;
  department: string;
  location: string;
  meetingRoom: string;
  floor: string;
  hostPhone: string;
  idType: string;
  idNumber: string;
  itemsCarried: string;
  vehicleRegistered: string | null;
  notes: string;
  priority: VisitorPriority;
  status: VisitorStatus;
  approvalNote: string;
  idVerified: boolean;
  badgeNumber: string | null;
  badgeStatus: string;
  badgeTemplate: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  isVip: boolean;
  blacklisted: boolean;
  attachments: VisitorAttachment[];
  timeline: VisitorTimelineEvent[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  requesterEmail: string;
  requesterEmployeeCode: string;
};

export type VisitorVisitInput = Partial<Omit<VisitorVisit, 'timeline' | 'attachments' | 'createdAt' | 'updatedAt'>> & {
  visitorName?: string;
  attachments?: VisitorAttachment[];
  timeline?: VisitorTimelineEvent[];
};

export type DirectoryEmployee = {
  code: string;
  name: string;
  department: string;
  title: string;
  location: string;
  phone: string;
  extension: string;
  email: string;
};

export type VisitorDirectories = {
  departments: string[];
  locations: string[];
  companies: string[];
  employeeCount: number;
};

export type VisitorArtifact = {
  id: string;
  kind: string;
  name: string;
  payload: Record<string, unknown>;
  updatedAt: string;
};

export type VisitorWorkspace = {
  visits: VisitorVisit[];
  directories: VisitorDirectories;
  artifacts: VisitorArtifact[];
  access: {
    seesAll: boolean;
    canSecurity: boolean;
    canReception: boolean;
    employeeCode: string;
    name: string;
    department: string;
  };
};

export const emptyDirectories = (): VisitorDirectories => ({
  departments: [],
  locations: [],
  companies: [],
  employeeCount: 0,
});
