export const INSPECTION_TYPES = [
  'Hardware condition',
  'Workplace / site',
  'Safety compliance',
  'Software licence',
  'Network / infrastructure',
  'Preventive maintenance',
] as const;

export const INSPECTION_STATUSES = ['Scheduled', 'In Progress', 'Completed', 'Cancelled'] as const;
export const INSPECTION_RESULTS = ['Pass', 'Pass with findings', 'Fail'] as const;
export const SCHEDULE_FREQUENCIES = ['Weekly', 'Monthly', 'Quarterly', 'Annual'] as const;
export const FINDING_SEVERITIES = ['Low', 'Medium', 'High', 'Critical'] as const;
export const FINDING_STATUSES = ['Open', 'In Progress', 'Closed'] as const;

export type InspectionSchedule = {
  scheduleId: string;
  title: string;
  inspectionType: string;
  location: string | null;
  department: string | null;
  frequency: string;
  nextDueDate: string | null;
  ownerName: string | null;
  status: string;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type InspectionRecord = {
  inspectionId: string;
  scheduleId: string | null;
  title: string;
  inspectionType: string;
  location: string | null;
  department: string | null;
  inspectorName: string | null;
  scheduledDate: string | null;
  completedDate: string | null;
  status: string;
  result: string | null;
  notes: string | null;
  locationId: string | null;
  visitType: string | null;
  checklist: InspectionChecklistItem[];
  createdAt: string | null;
  updatedAt: string | null;
};

export type InspectionFinding = {
  findingId: string;
  inspectionId: string;
  title: string;
  severity: string;
  status: string;
  ownerName: string | null;
  dueDate: string | null;
  description: string | null;
  resolution: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type InspectionDirectoryOption = {
  value: string;
  label: string;
  hint?: string;
};

export type InspectionDirectory = {
  departments: InspectionDirectoryOption[];
  locations: InspectionDirectoryOption[];
  employees: InspectionDirectoryOption[];
};

export type InspectionAssetOption = {
  assetId: string;
  assetTag: string;
  name: string;
  serialNumber: string | null;
  category: string;
  subCategory: string | null;
  location: string | null;
  model: string | null;
};

export type InspectionWorkspace = {
  schedules: InspectionSchedule[];
  inspections: InspectionRecord[];
  findings: InspectionFinding[];
  directory: InspectionDirectory;
  locations: ImsLocation[];
  actions: ImsAction[];
  hazid: HazidReport[];
  bbs: BbsObservation[];
  drills: EmergencyDrill[];
  ewaste: EWasteRecord[];
  assets: InspectionAssetOption[];
};

export const IMS_VISIT_TYPES = ['Scheduled', 'Ad-hoc', 'Follow-up', 'Audit'] as const;
export const IMS_CHECK_STATUSES = ['Compliant', 'Minor', 'Non-Compliant'] as const;
export const IMS_RISKS = ['Low', 'Medium', 'High', 'Critical'] as const;
export const IMS_ACTION_STATUSES = ['Open', 'In Progress', 'Closed'] as const;
export const IMS_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const;
export const IMS_FREQUENCIES = ['Monthly', 'Quarterly', 'Bi-Annual', 'Annual'] as const;
export const HAZID_CATEGORIES = ['Unsafe Conditions', 'Unsafe Acts', 'Ergonomic Hazards', 'Environmental Concerns'] as const;
export const DRILL_TYPES = [
  'Fire Drill',
  'Evacuation Drill',
  'Emergency Response Drill',
  'Business Continuity Drill',
  'Disaster Recovery Drill',
  'Cybersecurity Incident Simulation',
] as const;
export const EWASTE_TYPES = [
  'Computers',
  'Laptops',
  'Printers',
  'UPS Systems',
  'Batteries',
  'Monitors',
  'Servers',
  'Network Equipment',
  'Mobile Devices',
  'Storage Media',
  'Peripherals',
] as const;
export const EWASTE_STATUSES = ['Pending', 'Approved', 'Rejected', 'Completed'] as const;

export type ChecklistCategory = {
  id: string;
  name: string;
  items: Array<{ id: string; name: string; description: string }>;
};

export type InspectionChecklistItem = {
  categoryId: string;
  categoryName: string;
  itemId: string;
  itemName: string;
  itemDescription: string;
  status: string;
  comment: string;
  risk: string;
};

export type ImsLocation = {
  locationId: string;
  name: string;
  frequency: string;
  lastInspectionDate: string | null;
  nextInspectionDate: string | null;
  categories: ChecklistCategory[];
};

export type ImsAction = {
  actionId: string;
  inspectionId: string;
  locationName: string;
  description: string;
  assignedTo: string | null;
  priority: string;
  status: string;
  dueDate: string | null;
  closureDate: string | null;
  verificationComments: string | null;
};

export type HazidReport = {
  reportId: string;
  date: string | null;
  reporter: string | null;
  category: string;
  description: string;
  riskLevel: string;
  correctiveAction: string | null;
  status: string;
  location: string | null;
};

export type BbsObservation = {
  observationId: string;
  observer: string | null;
  date: string | null;
  safeBehaviour: string | null;
  unsafeBehaviour: string | null;
  comments: string | null;
  recommendedAction: string | null;
  status: string;
  department: string | null;
};

export type EmergencyDrill = {
  drillId: string;
  date: string | null;
  drillType: string;
  participants: number;
  assignedPersonnel: number;
  outcome: string | null;
  findings: string | null;
  correctiveActions: string | null;
  duration: number;
  location: string | null;
};

export type EWasteRecord = {
  recordId: string;
  assetTag: string;
  serialNumber: string | null;
  assetDescription: string;
  assetType: string;
  location: string | null;
  disposalReason: string | null;
  disposalDate: string | null;
  approvalStatus: string;
  vendor: string | null;
  certificateNumber: string | null;
  workflowStep: number;
};
