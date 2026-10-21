export const DEPARTMENTS = [
  "MD's Office",
  'Legal',
  'Finance',
  'Security',
  'HSE',
  'Quality',
  'Human Resources',
  'Procurement',
  'Operations',
  'IT',
] as const;

export const CORRESPONDENCE_TYPES = [
  'Letter',
  'Invitation',
  'Notice / Demand',
  'Court Process',
  'Invoice / Bill',
  'Tax / Regulatory',
  'Other',
] as const;

export const SENDER_CATEGORIES = [
  'Government / Regulators',
  'Vendors',
  'Clients',
  'Others',
] as const;

export const WORKFLOW_STATUSES = ['New', 'Assigned', 'In Progress', 'Closed', 'Archived'] as const;
export const DISPLAY_STATUSES = ['New', 'Assigned', 'In Progress', 'Overdue', 'Closed'] as const;
export const DIRECTIONS = ['Incoming', 'Outgoing'] as const;
export const PRIORITIES = ['High', 'Medium', 'Low'] as const;
export const ROUTE_STATUSES = ['Pending', 'Acknowledged', 'In Progress', 'Completed', 'Waived'] as const;

export type Department = string;
export type CorrespondenceType = (typeof CORRESPONDENCE_TYPES)[number];
export type SenderCategory = (typeof SENDER_CATEGORIES)[number];
export type CorrespondenceStatus = 'Open' | 'Closed';
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];
export type DisplayStatus = (typeof DISPLAY_STATUSES)[number];
export type CorrespondenceDirection = (typeof DIRECTIONS)[number];
export type Priority = (typeof PRIORITIES)[number];
export type RouteStatus = (typeof ROUTE_STATUSES)[number];

export interface DepartmentRouteInput {
  department: string;
  lead: boolean;
  assigneeCode?: string;
  assigneeName?: string;
  hodCode?: string;
  hodName?: string;
  actionRequired?: string;
  priority: Priority;
  dueDate?: string;
  status?: RouteStatus;
}

export interface DepartmentRoute extends DepartmentRouteInput {
  id: string;
  status: RouteStatus;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  progressNote?: string;
  completedAt?: string;
  completedBy?: string;
  waivedAt?: string;
  waivedBy?: string;
  waiveReason?: string;
}

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  addedAt: string;
}

export interface CorrespondenceEvent {
  id: string;
  action: string;
  actor: string;
  detail?: string;
  createdAt: string;
}

export interface CorrespondenceRecipient {
  id: string;
  employeeCode?: string;
  name: string;
  acknowledgedAt?: string;
}

export interface Correspondence {
  id: string;
  referenceNo: string;
  direction: CorrespondenceDirection;
  dateReceived: string;
  dateSent?: string;
  subject: string;
  description: string;
  senderCompany: string;
  senderCategory: SenderCategory;
  addressedTo: string;
  addressedEmployeeCode?: string;
  department: Department;
  location?: string;
  type: CorrespondenceType;
  copies: number;
  remarks?: string;
  priority: Priority;
  dueDate?: string;
  attachments: Attachment[];
  status: CorrespondenceStatus;
  workflowStatus: WorkflowStatus;
  assignedEmployeeCode?: string;
  assignedEmployeeName?: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  recipients: CorrespondenceRecipient[];
  history: CorrespondenceEvent[];
  routes?: DepartmentRoute[];
  closedBy?: string;
  dateClosed?: string;
  createdAt: string;
}

export type CorrespondenceInput = Omit<
  Correspondence,
  'id' | 'referenceNo' | 'createdAt' | 'status' | 'workflowStatus' | 'closedBy' | 'dateClosed' | 'history' | 'recipients' | 'acknowledgedAt' | 'acknowledgedBy' | 'routes'
> & {
  recipients?: Array<{ employeeCode?: string; name: string }>;
  routes?: DepartmentRouteInput[];
};

export const ACCEPTED_ATTACHMENT_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
