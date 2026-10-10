export type TenderOpportunity = {
  id: string;
  referenceNo: string;
  enquiryRef: string;
  title: string;
  description: string;
  opportunityType: string;
  source: string;
  tenderType: string;
  category: string;
  subCategory: string;
  businessUnit: string;
  status: string;
  stage: string;
  priority: string;
  bidDecision: string;
  clientName: string;
  clientAddress: string;
  contactPerson: string;
  designation: string;
  email: string;
  phone: string;
  department: string;
  location: string;
  site: string;
  estimatedValue: number;
  currency: string;
  contractType: string;
  projectLocation: string;
  contractDuration: number | null;
  durationUnit: string;
  allowJv: boolean;
  retentions: boolean;
  scopeSummary: string;
  submissionDeadline: string;
  closingDate: string;
  invitationDate: string;
  siteVisitDate: string;
  clarificationDeadline: string;
  ownerName: string;
  teamNotes: string;
  approvalNotes: string;
  watchlisted: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

export type TenderOpportunityInput = Partial<TenderOpportunity> & {
  title: string;
  clientName: string;
  saveMode?: 'draft' | 'submit';
};

export type TenderDocument = {
  id: string;
  opportunityId: string;
  fileName: string;
  category: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedAt: string;
};

export type TenderLine = {
  id: string;
  opportunityId: string;
  section: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  markupPct: number;
  sell: number;
  createdAt: string;
  createdBy: string;
};

export type TenderApproval = {
  id: string;
  opportunityId: string;
  stage: string;
  decision: string;
  actor: string;
  comments: string;
  createdAt: string;
};

export type TenderSubmission = {
  id: string;
  opportunityId: string;
  channel: string;
  receiptReference: string;
  submittedBy: string;
  submittedAt: string;
  notes: string;
};

export type TenderAward = {
  id: string;
  opportunityId: string;
  contractRef: string;
  awardedValue: number;
  awardDate: string;
  handoverOwner: string;
  handoverNotes: string;
  createdAt: string;
  createdBy: string;
};

export type TenderItem = {
  id: string;
  opportunityId: string;
  kind: string;
  title: string;
  details: string;
  status: string;
  assignee: string;
  dueAt: string;
  createdAt: string;
  createdBy: string;
};

export type TenderAuditEvent = {
  id: number;
  opportunityId: string;
  actor: string;
  action: string;
  details: string;
  createdAt: string;
};

export type TenderLookupOption = {
  id: string;
  name: string;
  code: string;
  region?: string;
};

export type TenderLookups = {
  departments: TenderLookupOption[];
  locations: TenderLookupOption[];
  sites: TenderLookupOption[];
  businessUnits: string[];
};

export type TenderPipelineStage = {
  label: string;
  count: number;
  value: number;
};

export type TenderWinLoss = {
  won: number;
  lost: number;
  withdrawn: number;
};

export type TenderDashboardDeadline = {
  id: string;
  referenceNo: string;
  title: string;
  clientName: string;
  submissionDate: string;
  daysLeft: number;
  statusLabel: 'In Progress' | 'Review' | 'Drafting';
};

export type TenderDashboardAction = {
  id: string;
  opportunityId: string;
  referenceNo: string;
  title: string;
  detail: string;
  tone: 'urgent' | 'pending' | 'due' | 'open' | 'ready';
  badge: string;
};

export type TenderCommandBoard = {
  enquiries: number;
  enquiriesDeltaPct: number | null;
  qualified: number;
  qualifiedDeltaPct: number | null;
  activeTenders: number;
  activeDeltaPct: number | null;
  potentialValue: number;
  potentialDeltaPct: number | null;
  contractsWon: number;
  contractsWonDeltaPct: number | null;
  winRateValuePct: number | null;
  winRateValueDeltaPct: number | null;
  funnel: Array<{ label: string; count: number; pct: number }>;
  valueByStage: Array<{ label: string; value: number }>;
  categories: Array<{ label: string; count: number }>;
  clients: Array<{ name: string; value: number }>;
  regions: Array<{ name: string; value: number }>;
  deadlines: Array<{ id: string; date: string; title: string; client: string; stage: string; daysLeft: number }>;
  approvals: Array<{ id: string; title: string; value: number; stage: string; priority: string }>;
  recent: Array<{ id: string; date: string; title: string; client: string; status: string }>;
  winLossValue: {
    thisYear: { won: number; lost: number; withdrawn: number; pending: number };
    last12: { won: number; lost: number; withdrawn: number; pending: number };
  };
  activityRolling: Array<{ month: string; enquiries: number; submissions: number; awards: number }>;
  insights: { oilGasWinPct: number | null; qualifiedValue: number; highRisk: number };
  actionCount: number;
};

export type TenderDashboard = {
  total: number;
  enquiries: number;
  openTenders: number;
  invitations: number;
  prequalification: number;
  closingSoon: number;
  pipelineValue: number;
  awardedValue: number;
  winRatePct: number | null;
  activeTenders: number;
  activeDeltaPct: number | null;
  pipelineDeltaPct: number | null;
  winRateDeltaPct: number | null;
  awaitingApproval: number;
  awaitingNewThisWeek: number;
  pipelineStages: TenderPipelineStage[];
  activity: Array<{ month: string; opportunities: number; submissions: number; awards: number }>;
  winLoss: { last12: TenderWinLoss; thisYear: TenderWinLoss };
  deadlines: TenderDashboardDeadline[];
  actions: TenderDashboardAction[];
  board: TenderCommandBoard;
  monthDelta: {
    total: number | null;
    enquiries: number | null;
    openTenders: number | null;
    invitations: number | null;
    prequalification: number | null;
  };
  byType: Array<{ label: string; count: number; value: number }>;
  byStage: Array<{ label: string; count: number; value: number }>;
  byStatus: Array<{ label: string; count: number }>;
  latest: TenderOpportunity[];
};
