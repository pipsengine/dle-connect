import { NextResponse } from 'next/server';
import {
  insertEmployeeProfileDocumentInDb,
  readEmployeeContractsFromDb,
  readEmployeeEmergencyContactsFromDb,
  readEmployeeProfileDocumentsFromDb,
  syncHrisEmployeeProfileToDb,
} from '@/lib/dle-enterprise-db';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { readDirectoryEmployees } from '@/lib/payroll-employee-source';
import { invalidateHrisEmployeeCaches } from '@/lib/hris-employee-cache';
import { ensureEmployeeLeaveFromSage } from '@/lib/sage-leave-sync';
import { contractPayrollClassification, type ContractPayrollClassification } from '@/lib/payroll-employee-classification';
import { readEmployeeProfileExtensions } from '@/lib/employee-profile-extensions-store';

type Role =
  | 'Super Admin'
  | 'HR Director'
  | 'HR Manager'
  | 'HR Officer'
  | 'Admin Officer'
  | 'Legal Officer'
  | 'Department Head'
  | 'Line Manager'
  | 'Payroll Officer'
  | 'HSE Officer'
  | 'Compliance Officer'
  | 'Auditor'
  | 'IT Administrator'
  | 'Employee'
  | 'Executive Management';

type EmployeeStatus =
  | 'Active'
  | 'Probation'
  | 'Confirmed'
  | 'On Leave'
  | 'Suspended'
  | 'Resigned'
  | 'Terminated'
  | 'Retired'
  | 'Seconded'
  | 'Inactive'
  | 'Exited'
  | 'Reactivated'
  | 'Blacklisted'
  | 'Deceased'
  | 'Contract'
  | 'Contract Active'
  | 'Contract Expired'
  | 'Field Assignment';

type Severity = 'high' | 'medium' | 'low';

type EmployeeProfile = {
  id: string;
  employeeId: string;
  photoUrl?: string;
  fullName: string;
  jobTitle: string;
  department: string;
  businessUnit: string;
  location: string;
  employmentStatus: EmployeeStatus;
  employmentType: string;
  reportingManager: string;
  dateJoined: string;
  yearsOfService: number;
  personalInfo: Record<string, string | null>;
  employmentDetails: Record<string, string | null>;
  jobDetails: Record<string, string | null>;
  contacts: Record<string, string | null>;
};

type EmployeeOverview = {
  profileCompletionPct: number;
  leaveBalanceDays: number;
  attendanceScore: number;
  trainingCompliancePct: number;
  performanceRating: 'A' | 'B' | 'C' | 'D' | '-';
  payrollStatus: 'Verified' | 'Pending Validation' | 'Masked';
  documentStatus: 'Compliant' | 'Missing' | 'Expiring';
  assetStatus: 'Assigned' | 'None';
  currentLeaveStatus: 'None' | 'On Leave' | 'Pending';
  recentActivity: { id: string; at: string; title: string; detail: string; actor: string }[];
};

type AIInsight = { id: string; severity: Severity; confidence: number; title: string; recommendation: string; actionLabel: string; action: string };

type AuditLog = {
  id: string;
  at: string;
  action: string;
  performedBy: string;
  oldValue?: string;
  newValue?: string;
  ipAddress?: string;
  device?: string;
  reason?: string;
};

type EmergencyContact = {
  id: string;
  fullName: string;
  relationship: string;
  phoneNumber: string;
  alternativePhone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  nearestLandmark?: string | null;
  preferredContactMethod?: 'Phone Call' | 'SMS Confirmation' | 'Email Confirmation' | 'Employee Declaration' | 'HR Manual Verification' | 'Document Evidence' | 'Other' | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  isPrimary: boolean;
  isNextOfKin: boolean;
  isBeneficiary: boolean;
  beneficiaryPercentage?: number | null;
  verificationStatus?: 'Unverified' | 'Pending Verification' | 'Verified' | 'Verification Failed' | 'Update Required' | 'Expired Verification';
  lastVerifiedAt?: string | null;
  verifiedBy?: string | null;
  notes?: string | null;
};

type NextOfKinEvidence = {
  id: string;
  evidenceType: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: 'Uploaded' | 'Verified' | 'Rejected' | 'Archived';
  uploadedAt: string;
  verifiedAt?: string | null;
  verifiedBy?: string | null;
  notes?: string | null;
};

type NextOfKinBeneficiary = {
  isBeneficiary: boolean;
  beneficiaryPercentage: number | null;
  benefitCategory: string | null;
  nominationDate: string | null;
  nominationStatus: 'Draft' | 'Pending HR Review' | 'Approved' | 'Rejected';
  approvedBy: string | null;
  approvalDate: string | null;
  notes: string | null;
};

type NextOfKinRecord = {
  id: string;
  employeeId: string;
  fullName: string;
  relationship: string;
  gender?: string | null;
  dateOfBirth?: string | null;
  primaryPhone: string;
  alternatePhone?: string | null;
  email?: string | null;
  residentialAddress?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  nearestLandmark?: string | null;
  preferredContactMethod?: 'Phone Confirmation' | 'SMS Confirmation' | 'Email Confirmation' | 'Document Review' | 'Employee Declaration' | 'HR Manual Verification' | 'Compliance Review' | 'Other' | null;
  isPrimary: boolean;
  isEmergencyContact: boolean;
  verificationStatus: 'Unverified' | 'Pending Verification' | 'Verified' | 'Rejected' | 'Update Required' | 'Expired Verification';
  lastVerifiedAt?: string | null;
  verifiedBy?: string | null;
  relationshipEvidenceType?: string | null;
  evidenceStatus: 'Missing' | 'Uploaded' | 'Verified' | 'Rejected';
  evidence?: NextOfKinEvidence[] | null;
  beneficiary: NextOfKinBeneficiary;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

type DocumentItem = {
  id: string;
  category: string;
  documentTitle?: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: 'Not Required' | 'Pending Verification' | 'Verified' | 'Rejected' | 'Expired' | 'Update Required' | 'Archived' | 'Uploaded';
  complianceStatus?: 'Compliant' | 'At Risk' | 'Non-Compliant' | 'Unknown';
  confidentialityLevel?: 'Public' | 'Internal' | 'Confidential' | 'Restricted';
  issueDate?: string | null;
  uploadedAt: string;
  expiresAt?: string | null;
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  uploadedBy?: string | null;
  versionNumber?: number;
  archivedAt?: string | null;
  archiveReason?: string | null;
  notes?: string | null;
};

type LeaveSummary = {
  balances: Record<string, number>;
  balanceDetails?: Array<{
    leaveType: string;
    available: number;
    entitlement: number;
    used: number;
    pending: number;
    carryForward: number;
  }>;
  history: { id: string; type: string; start: string; end: string; days: number; status: 'Approved' | 'Pending' | 'Rejected' }[];
  sourceSystem?: string | null;
  lastUpdatedAt?: string | null;
};

type AttendanceSummary = {
  score: number;
  presentDays: number;
  absentDays: number;
  lateComing: number;
  earlyDeparture: number;
  overtimeHours: number;
  biometricLogs: { id: string; at: string; source: string; status: string }[];
};

type PayrollSummary = {
  payrollStatus: 'Verified' | 'Pending Validation' | 'Masked';
  salaryGrade: string;
  basicSalary: number | null;
  allowances: number | null;
  deductions: number | null;
  bankName: string | null;
  accountNumberMasked: string | null;
  pensionProvider: string | null;
  taxId: string | null;
  payrollGroup: string | null;
  lastPayrollProcessed: string | null;
};

type PerformanceSummary = {
  currentRating: 'A' | 'B' | 'C' | 'D' | '-';
  lastReviewAt?: string | null;
  goals: { id: string; title: string; progressPct: number; status: 'On Track' | 'At Risk' | 'Completed' }[];
  managerFeedback?: string | null;
  aiSignals: { id: string; title: string; severity: Severity; confidence: number }[];
};

type TrainingRecord = {
  id: string;
  trainingName: string;
  provider: string;
  completionDate?: string | null;
  expiryDate?: string | null;
  status: 'Completed' | 'Pending' | 'Expired';
  score?: number | null;
};

type AssetItem = {
  id: string;
  assetType: string;
  assetTag: string;
  assetName: string;
  serialNumber?: string | null;
  assignedDate: string;
  condition: 'Good' | 'Fair' | 'Needs Repair';
  returnStatus: 'Assigned' | 'Returned';
  returnDate?: string | null;
};

type MedicalHSE = {
  medicalFitnessStatus: string | null;
  bloodGroup: string | null;
  knownAllergies: string | null;
  medicalRestrictions: string | null;
  fitToWorkStatus: string | null;
  incidentHistory: { id: string; at: string; title: string; severity: Severity; status: string }[];
  hseCertifications: { id: string; name: string; expiryDate?: string | null; status: 'Valid' | 'Expired' }[];
};

type DisciplinaryRecord = {
  id: string;
  caseType: string;
  dateReported: string;
  description: string;
  actionTaken?: string | null;
  status: 'Open' | 'Closed' | 'Appealed';
  approver?: string | null;
};

type HistoryEvent = { id: string; at: string; type: string; detail: string; actor: string };

type EmployeeRecord = {
  profile: EmployeeProfile;
  overview: EmployeeOverview;
  emergencyContacts: EmergencyContact[];
  nextOfKin: NextOfKinRecord[];
  documents: DocumentItem[];
  leaveSummary: LeaveSummary;
  attendanceSummary: AttendanceSummary;
  payrollSummary: PayrollSummary;
  performanceSummary: PerformanceSummary;
  training: TrainingRecord[];
  assets: AssetItem[];
  medicalHse: MedicalHSE;
  disciplinary: DisciplinaryRecord[];
  history: HistoryEvent[];
  audit: AuditLog[];
  aiInsights: AIInsight[];
  payrollClassification?: ContractPayrollClassification;
};

type JobChangeStatus =
  | 'Draft'
  | 'Submitted'
  | 'Pending HR Review'
  | 'Pending Department Head Approval'
  | 'Pending HR Director Approval'
  | 'Approved'
  | 'Rejected'
  | 'Cancelled';

type JobChangeType =
  | 'Job Title Change'
  | 'Department Change'
  | 'Grade Change'
  | 'Reporting Manager Change'
  | 'Functional Manager Change'
  | 'Location Change'
  | 'Project Assignment Change'
  | 'Cost Center Change'
  | 'Role Profile Update';

type JobSupportingDoc = { id: string; name: string };

type JobChangeApproval = {
  id: string;
  at: string;
  stage: JobChangeStatus;
  decision: 'Approved' | 'Rejected';
  by: string;
  reason?: string | null;
};

type JobChangeRequest = {
  id: string;
  employeeId: string;
  employeeName: string;
  changeType: JobChangeType;
  status: JobChangeStatus;
  effectiveDate: string;
  reason: string;
  notes?: string | null;
  previousValues: Record<string, string | null>;
  newValues: Record<string, string | null>;
  supportingDocuments: JobSupportingDoc[];
  approvals: JobChangeApproval[];
  audit: AuditLog[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

type JobInformationPayload = {
  employeeId: string;
  employeeName: string;
  approvalStatus: JobChangeStatus;
  approvalRef?: string | null;
  lastUpdatedAt: string;
  job: Record<string, string | null>;
  employment: Record<string, string | null>;
  roleProfile: Record<string, string | null>;
  projectAssignment: Record<string, string | null>;
  requests: JobChangeRequest[];
};

type AssignmentType =
  | 'Permanent Assignment'
  | 'Temporary Assignment'
  | 'Acting Assignment'
  | 'Secondment'
  | 'Project Assignment'
  | 'Cross-Functional Assignment'
  | 'Field Assignment'
  | 'Remote Assignment';

type AssignmentStatus = 'Active' | 'Pending Approval' | 'Scheduled' | 'Expired' | 'Completed' | 'Cancelled' | 'Suspended';

type AssignmentRequestStatus =
  | 'Draft'
  | 'Submitted'
  | 'Pending Line Manager Review'
  | 'Pending Department Head Approval'
  | 'Pending HR Review'
  | 'Pending HR Director Approval'
  | 'Pending Payroll Review'
  | 'Approved'
  | 'Rejected'
  | 'Cancelled'
  | 'Completed';

type AssignmentRequestType =
  | 'Department Transfer'
  | 'Unit Transfer'
  | 'Business Unit Transfer'
  | 'Cost Center Change'
  | 'Reporting Manager Change'
  | 'Project Reassignment'
  | 'Site Reassignment'
  | 'Temporary Assignment'
  | 'Secondment'
  | 'Acting Assignment';

type AssignmentSupportingDoc = { id: string; name: string };

type AssignmentApproval = {
  id: string;
  at: string;
  stage: AssignmentRequestStatus;
  decision: 'Approved' | 'Rejected';
  by: string;
  reason?: string | null;
};

type AssignmentRequest = {
  id: string;
  employeeId: string;
  employeeName: string;
  requestType: AssignmentRequestType;
  status: AssignmentRequestStatus;
  effectiveDate: string;
  endDate?: string | null;
  reason: string;
  notes?: string | null;
  previousValues: Record<string, string | null>;
  newValues: Record<string, string | null>;
  assignmentType: AssignmentType;
  assignmentStatus: AssignmentStatus;
  supportingDocuments: AssignmentSupportingDoc[];
  approvals: AssignmentApproval[];
  audit: AuditLog[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  isBulk?: boolean;
  bulkEmployeeIds?: string[];
};

type DepartmentUnitAssignmentPayload = {
  employeeId: string;
  employeeName: string;
  assignment: Record<string, string | null>;
  reporting: Record<string, string | null>;
  project: Record<string, string | null>;
  approvalStatus: AssignmentRequestStatus;
  approvalRef?: string | null;
  lastUpdatedAt: string;
  pendingChanges: number;
  requests: AssignmentRequest[];
  aiInsights: AIInsight[];
};

type ReportingLineStatus = 'Active' | 'Pending Approval' | 'Scheduled' | 'Temporary' | 'Expired' | 'Cancelled';

type ReportingChangeStatus =
  | 'Draft'
  | 'Submitted'
  | 'Pending HR Review'
  | 'Pending Department Head Approval'
  | 'Pending HR Director Approval'
  | 'Approved'
  | 'Rejected'
  | 'Cancelled'
  | 'Completed';

type ReportingChangeType =
  | 'Manager Change'
  | 'Functional Manager Change'
  | 'Department Head Change'
  | 'Project Manager Change'
  | 'Matrix Manager Change'
  | 'Delegated Approver Change'
  | 'Temporary Reporting Assignment'
  | 'Bulk Manager Reassignment';

type DelegationScope =
  | 'Leave Approval'
  | 'Attendance Approval'
  | 'Expense Approval'
  | 'Timesheet Approval'
  | 'HR Request Approval'
  | 'Project Approval'
  | 'All Workflow Approvals';

type DelegationAssignmentType =
  | 'Acting manager assignment'
  | 'Temporary supervisor'
  | 'Delegated approver'
  | 'Leave-cover manager'
  | 'Project supervisor'
  | 'Alternate approver';

type ReportingSupportingDoc = { id: string; name: string };

type ReportingApproval = {
  id: string;
  at: string;
  stage: ReportingChangeStatus;
  decision: 'Approved' | 'Rejected';
  by: string;
  reason?: string | null;
};

type ReportingDelegation = {
  id: string;
  assignmentType: DelegationAssignmentType;
  assignedEmployee: string;
  delegatedRole: string;
  startDate: string;
  endDate: string;
  delegationReason: string;
  approvalScope: DelegationScope;
  status: 'Active' | 'Scheduled' | 'Expired' | 'Cancelled';
};

type ReportingChangeRequest = {
  id: string;
  employeeId: string;
  employeeName: string;
  changeType: ReportingChangeType;
  status: ReportingChangeStatus;
  effectiveDate: string;
  endDate?: string | null;
  reason: string;
  notes?: string | null;
  previousValues: Record<string, string | null>;
  newValues: Record<string, string | null>;
  delegations: ReportingDelegation[];
  supportingDocuments: ReportingSupportingDoc[];
  approvals: ReportingApproval[];
  audit: AuditLog[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  isBulk?: boolean;
  bulkEmployeeIds?: string[];
};

type OrgChartNode = {
  id: string;
  employeeId: string;
  name: string;
  jobTitle: string;
  department: string;
  status: string;
  directReports: number;
  level: 'employee' | 'manager' | 'departmentHead' | 'businessUnitHead' | 'projectManager' | 'matrixManager' | 'peer' | 'subordinate';
};

type OrgChartEdge = { from: string; to: string; relation: 'reports_to' | 'matrix_to' | 'dotted_to' | 'peer' };

type ApprovalChain = {
  key:
    | 'Leave Approval Chain'
    | 'Attendance Approval Chain'
    | 'Overtime Approval Chain'
    | 'Timesheet Approval Chain'
    | 'Expense Approval Chain'
    | 'Training Approval Chain'
    | 'Recruitment Approval Chain'
    | 'Employee Change Approval Chain'
    | 'Exit Approval Chain';
  level1Approver: string;
  level2Approver: string;
  level3Approver: string;
  escalationApprover: string;
  fallbackApprover: string;
  slaHours: number;
  escalationRule: string;
};

type ReportingLinePayload = {
  employeeId: string;
  employeeName: string;
  status: ReportingLineStatus;
  effectiveDate: string;
  endDate?: string | null;
  reason: string;
  line: Record<string, string | null>;
  delegations: ReportingDelegation[];
  approvalChains: ApprovalChain[];
  orgChart: { nodes: OrgChartNode[]; edges: OrgChartEdge[] };
  history: any[];
  requests: ReportingChangeRequest[];
  approvalStatus: ReportingChangeStatus;
  approvalRef?: string | null;
  lastUpdatedAt: string;
  pendingChanges: number;
  aiInsights: AIInsight[];
  auditTrail: AuditLog[];
};

const jsonOk = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const jsonErr = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const rolePermissions = (role: Role, subjectEmployeeId: string, viewerEmployeeId: string | undefined) => {
  const isSelf = viewerEmployeeId ? viewerEmployeeId === subjectEmployeeId : false;
  const canViewPayroll = role === 'Super Admin' || role === 'Payroll Officer' || role === 'HR Director' || role === 'HR Manager' || role === 'Executive Management';
  const canViewMedical = role === 'Super Admin' || role === 'HR Director' || role === 'HSE Officer' || role === 'Compliance Officer';
  const canViewDisciplinary = role === 'Super Admin' || role === 'HR Director' || role === 'HR Manager' || role === 'Compliance Officer';
  const canEdit = role === 'Super Admin' || role === 'HR Director' || role === 'HR Manager' || role === 'HR Officer' || role === 'Admin Officer';
  const canEditPayroll = canViewPayroll && (canEdit || role === 'Payroll Officer');
  const canChangeStatus = role === 'Super Admin' || role === 'HR Director' || role === 'HR Manager';
  const canViewAudit = role !== 'Employee' && role !== 'IT Administrator';
  const canViewSensitivePersonal = role !== 'Employee' && role !== 'IT Administrator' && role !== 'Auditor';
  const canViewDocuments = role !== 'IT Administrator';
  const canViewProfile = role !== 'Employee' || isSelf;
  return {
    isSelf,
    canViewProfile,
    canViewPayroll,
    canViewMedical,
    canViewDisciplinary,
    canEdit,
    canEditPayroll,
    canChangeStatus,
    canViewAudit,
    canViewSensitivePersonal,
    canViewDocuments,
  };
};

const seedFromId = (id: string) => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const createSeeded = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
};

const pick = <T,>(rng: () => number, arr: T[]) => arr[Math.floor(rng() * arr.length)];

const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const isoDate = (rng: () => number, y0: number, y1: number) => {
  const y = y0 + Math.floor(rng() * (y1 - y0 + 1));
  const m = pick(rng, months);
  const d = String(1 + Math.floor(rng() * 28)).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const maskAccount = (s: string) => {
  const digits = s.replace(/\D/g, '');
  if (digits.length < 6) return '••••••';
  const tail = digits.slice(-4);
  return `••••••${tail}`;
};

const validatePhone = (s: string) => /^[+]?[\d\s()-]{7,20}$/.test(s.trim());
const validateEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

const normalizeStr = (v: unknown, max = 200) => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
};

const nowIso = () => new Date().toISOString();

const auditEntry = (action: string, performedBy: string, extra?: Partial<AuditLog>): AuditLog => ({
  id: `audit-${Math.random().toString(16).slice(2)}`,
  at: nowIso(),
  action,
  performedBy,
  ipAddress: '10.0.12.44',
  device: 'DLE-HRIS-Web',
  ...extra,
});

const makeRecord = (employeeId: string): EmployeeRecord => {
  const emptyOverview: EmployeeOverview = {
    profileCompletionPct: 0,
    leaveBalanceDays: 0,
    attendanceScore: 0,
    trainingCompliancePct: 0,
    performanceRating: '-',
    payrollStatus: 'Pending Validation',
    documentStatus: 'Missing',
    assetStatus: 'None',
    currentLeaveStatus: 'None',
    recentActivity: [],
  };
  const emptyProfile: EmployeeProfile = {
    id: employeeId,
    employeeId,
    fullName: `Employee ${employeeId}`,
    jobTitle: 'Not assigned',
    department: 'Not assigned',
    businessUnit: 'Not assigned',
    location: 'Not assigned',
    employmentStatus: 'Active',
    employmentType: 'Not assigned',
    reportingManager: 'Not assigned',
    dateJoined: nowIso(),
    yearsOfService: 0,
    personalInfo: {
      title: null,
      firstName: null,
      middleName: null,
      lastName: null,
      preferredName: null,
      gender: null,
      dateOfBirth: null,
      maritalStatus: null,
      nationality: null,
      stateOfOrigin: null,
      localGovernmentArea: null,
      religion: null,
      languagesSpoken: null,
      personalEmail: null,
      personalPhone: null,
      residentialAddress: null,
      permanentAddress: null,
    },
    employmentDetails: {
      employeeId,
      employmentType: null,
      employmentStatus: 'Active',
      dateJoined: null,
      confirmationDate: null,
      probationStartDate: null,
      probationEndDate: null,
      contractStartDate: null,
      contractEndDate: null,
      exitDate: null,
      exitReason: null,
      rehireEligibility: null,
      workLocation: null,
      workMode: null,
      shiftPattern: null,
      staffCategory: null,
      employeeCategory: null,
      unionStatus: null,
    },
    jobDetails: {
      jobTitle: null,
      designation: null,
      jobGrade: null,
      department: null,
      division: null,
      businessUnit: null,
      costCenter: null,
      projectSite: null,
      reportingManager: null,
      functionalManager: null,
      departmentHead: null,
      hrBusinessPartner: null,
      roleProfile: null,
      jobDescription: null,
      keyResponsibilities: null,
    },
    contacts: {
      officialEmail: null,
      personalEmail: null,
      officeExtension: null,
      primaryPhone: null,
      alternativePhone: null,
      nearestBusStop: null,
      city: null,
      state: null,
      country: null,
      postalCode: null,
    },
  };

  return {
    profile: emptyProfile,
    overview: emptyOverview,
    emergencyContacts: [],
    nextOfKin: [],
    documents: [],
    leaveSummary: { balances: {}, history: [] },
    attendanceSummary: { score: 0, presentDays: 0, absentDays: 0, lateComing: 0, earlyDeparture: 0, overtimeHours: 0, biometricLogs: [] },
    payrollSummary: {
      payrollStatus: 'Pending Validation',
      salaryGrade: 'Not assigned',
      basicSalary: null,
      allowances: null,
      deductions: null,
      bankName: null,
      accountNumberMasked: null,
      pensionProvider: null,
      taxId: null,
      payrollGroup: null,
      lastPayrollProcessed: null,
    },
    performanceSummary: { currentRating: '-', lastReviewAt: null, goals: [], managerFeedback: null, aiSignals: [] },
    training: [],
    assets: [],
    medicalHse: {
      medicalFitnessStatus: null,
      bloodGroup: null,
      knownAllergies: null,
      medicalRestrictions: null,
      fitToWorkStatus: null,
      incidentHistory: [],
      hseCertifications: [],
    },
    disciplinary: [],
    history: [],
    audit: [],
    aiInsights: [],
  };

  const seed = seedFromId(employeeId);
  const rng = createSeeded(seed);
  const first = ['Juan', 'Amina', 'Chinedu', 'Halima', 'Tunde', 'Ngozi', 'Michael', 'Fatima', 'Ade', 'Rita', 'Samuel', 'Zainab', 'Ibrahim', 'Grace', 'Kehinde', 'Bola', 'Chika', 'Emeka', 'Mary', 'David'];
  const last = ['Dela Cruz', 'Okafor', 'Adeoye', 'Bello', 'Eze', 'Uche', 'Johnson', 'Adebayo', 'Aliyu', 'Okonkwo', 'Ibrahim', 'Mohammed', 'Sule', 'Okoro', 'Nwankwo', 'Garcia', 'Torres', 'Mendoza', 'Valdez', 'Reyes'];
  const departments = ['Civil Engineering', 'Mechanical Engineering', 'Electrical & Instrumentation', 'Project Controls', 'HSE', 'Quality Assurance', 'Procurement', 'Finance', 'Human Capital', 'IT & Support', 'Legal & Compliance', 'Executive Office'];
  const businessUnits = ['DLE Projects', 'DLE Fabrication', 'DLE Marine', 'DLE Corporate', 'DLE Energy'];
  const locations = ['Lagos HQ', 'Port Harcourt Office', 'Warri Yard', 'Abuja Office', 'Onne Site', 'Kaduna Site', 'Offshore Platform'];
  const jobTitles = [
    'Senior Civil Engineer',
    'Mechanical Supervisor',
    'E&I Technician',
    'Project Manager',
    'Planning Engineer',
    'Quantity Surveyor',
    'HSE Officer',
    'QA/QC Engineer',
    'HR Officer',
    'Payroll Specialist',
    'IT Support Engineer',
    'Legal Counsel',
    'Executive Assistant',
  ];
  const employmentTypes = ['Permanent', 'Contract', 'Temporary', 'Intern', 'Consultant', 'Expatriate', 'Industrial Trainee', 'NYSC', 'Outsourced Staff'];
  const statuses: EmployeeStatus[] = ['Active', 'On Leave', 'Probation', 'Confirmed', 'Suspended', 'Resigned', 'Terminated', 'Retired', 'Contract', 'Seconded', 'Field Assignment'];
  const relationships = ['Spouse', 'Parent', 'Sibling', 'Child', 'Guardian', 'Friend', 'Partner'];
  const docCategories = [
    'Employment Letter',
    'CV / Resume',
    'Academic Certificates',
    'Professional Certifications',
    'Government ID',
    'Passport',
    'NIN',
    'BVN',
    'Tax Documents',
    'Medical Certificate',
    'Guarantor Form',
    'Reference Letter',
    'Promotion Letter',
    'Transfer Letter',
    'Disciplinary Letter',
    'Exit Documents',
    'Contract Agreement',
  ];

  const fn = pick(rng, first);
  const ln = pick(rng, last);
  const fullName = `${fn} ${ln}`;
  const department = pick(rng, departments);
  const businessUnit = pick(rng, businessUnits);
  const location = pick(rng, locations);
  const jobTitle = pick(rng, jobTitles);
  const employmentType = pick(rng, employmentTypes);
  const employmentStatus = pick(rng, statuses);
  const dateJoined = `${isoDate(rng, 2012, 2026)}T00:00:00.000Z`;
  const joinedMs = new Date(dateJoined).getTime();
  const yearsOfService = Math.max(0, Math.min(25, Math.floor((Date.now() - joinedMs) / (365.25 * 24 * 3600 * 1000))));
  const reportingManager = `${pick(rng, first)} ${pick(rng, last)}`;

  const baseProfile: EmployeeProfile = {
    id: employeeId,
    employeeId,
    photoUrl: `https://picsum.photos/seed/${encodeURIComponent(employeeId)}/160/160`,
    fullName,
    jobTitle,
    department,
    businessUnit,
    location,
    employmentStatus,
    employmentType,
    reportingManager,
    dateJoined,
    yearsOfService,
    personalInfo: {
      title: pick(rng, ['Mr', 'Mrs', 'Ms', 'Dr', 'Engr']),
      firstName: fn,
      middleName: pick(rng, ['A.', 'B.', 'C.', '—']),
      lastName: ln,
      preferredName: rng() < 0.3 ? fn : null,
      gender: pick(rng, ['Male', 'Female']),
      dateOfBirth: `${isoDate(rng, 1978, 2002)}T00:00:00.000Z`,
      maritalStatus: pick(rng, ['Single', 'Married', 'Divorced', 'Widowed']),
      nationality: pick(rng, ['Nigerian', 'Ghanaian', 'British', 'Indian', 'Filipino', 'South African']),
      stateOfOrigin: pick(rng, ['Lagos', 'Rivers', 'Ogun', 'Abuja (FCT)', 'Kaduna', 'Delta', 'Imo']),
      localGovernmentArea: pick(rng, ['Ikeja', 'Eti-Osa', 'Obio-Akpor', 'Abeokuta South', 'Maitama', 'Warri South']),
      religion: pick(rng, ['Christianity', 'Islam', 'Other']),
      languagesSpoken: pick(rng, ['English, Yoruba', 'English, Igbo', 'English, Hausa', 'English']),
      personalEmail: `${fn.toLowerCase()}.${ln.toLowerCase()}@mail.com`,
      personalPhone: pick(rng, ['+234 803 123 4567', '+234 802 555 0199', '+234 901 222 3344']),
      residentialAddress: pick(rng, ['Lekki, Lagos', 'GRA, Port Harcourt', 'Asokoro, Abuja', 'Warri, Delta']),
      permanentAddress: pick(rng, ['Surulere, Lagos', 'Aba Road, Port Harcourt', 'Wuse 2, Abuja', 'Sapele Road, Benin']),
    },
    employmentDetails: {
      employeeId,
      employmentType,
      employmentStatus,
      dateJoined: dateJoined.slice(0, 10),
      confirmationDate: rng() < 0.6 ? isoDate(rng, 2013, 2026) : null,
      probationStartDate: rng() < 0.5 ? isoDate(rng, 2012, 2026) : null,
      probationEndDate: rng() < 0.5 ? isoDate(rng, 2012, 2026) : null,
      contractStartDate: employmentType === 'Contract' ? isoDate(rng, 2023, 2026) : null,
      contractEndDate: employmentType === 'Contract' ? isoDate(rng, 2026, 2027) : null,
      exitDate: ['Resigned', 'Terminated', 'Retired'].includes(employmentStatus) ? isoDate(rng, 2024, 2026) : null,
      exitReason: ['Resigned', 'Terminated', 'Retired'].includes(employmentStatus) ? pick(rng, ['Resignation', 'Termination', 'Retirement']) : null,
      rehireEligibility: rng() < 0.7 ? 'Eligible' : 'Not Eligible',
      workLocation: location,
      workMode: pick(rng, ['Onsite', 'Hybrid', 'Remote']),
      shiftPattern: pick(rng, ['Day', 'Night', 'Rotational']),
      staffCategory: pick(rng, ['Senior Staff', 'Junior Staff', 'Contractor']),
      employeeCategory: pick(rng, ['Operations', 'Corporate Services', 'Projects', 'Commercial']),
      unionStatus: rng() < 0.3 ? 'Union' : 'Non-Union',
    },
    jobDetails: {
      jobTitle,
      designation: pick(rng, ['Engineer', 'Supervisor', 'Manager', 'Officer', 'Specialist']),
      jobGrade: pick(rng, ['G7', 'G8', 'G9', 'G10', 'G11']),
      department,
      division: pick(rng, ['Engineering', 'Operations', 'Corporate Services', 'Projects', 'Commercial']),
      businessUnit,
      costCenter: pick(rng, ['CC-ENG-001', 'CC-OPS-004', 'CC-HR-002', 'CC-FIN-003']),
      projectSite: pick(rng, ['Lekki Project', 'NLNG Train 7', 'Bonny Island', 'Onshore Pipeline', 'Fabrication Bay', 'N/A']),
      reportingManager,
      functionalManager: rng() < 0.4 ? `${pick(rng, first)} ${pick(rng, last)}` : null,
      departmentHead: `${pick(rng, first)} ${pick(rng, last)}`,
      hrBusinessPartner: `${pick(rng, first)} ${pick(rng, last)}`,
      roleProfile: pick(rng, ['Role-based access: HR Generalist', 'Role-based access: Project Delivery', 'Role-based access: Finance Ops']),
      jobDescription: 'Enterprise role profile with responsibilities aligned to DLE operational standards.',
      keyResponsibilities: 'Operational delivery, compliance adherence, reporting accuracy, and continuous improvement.',
    },
    contacts: {
      officialEmail: `${fn.toLowerCase()}.${ln.toLowerCase()}@dle.com`,
      personalEmail: `${fn.toLowerCase()}.${ln.toLowerCase()}@mail.com`,
      officeExtension: pick(rng, ['1203', '2210', '3301', '4102', '—']),
      primaryPhone: pick(rng, ['+234 803 123 4567', '+234 802 555 0199', '+234 901 222 3344']),
      alternativePhone: rng() < 0.5 ? pick(rng, ['+234 806 111 2233', '+234 809 333 4400']) : null,
      nearestBusStop: pick(rng, ['Chevron', 'CMS', 'Yaba', 'Garrison', 'Wuse Market']),
      city: pick(rng, ['Lagos', 'Port Harcourt', 'Abuja', 'Warri', 'Kaduna']),
      state: pick(rng, ['Lagos', 'Rivers', 'FCT', 'Delta', 'Kaduna']),
      country: 'Nigeria',
      postalCode: pick(rng, ['100001', '500001', '900001', '320001']),
    },
  };

  const emergencyContacts: EmergencyContact[] = Array.from({ length: 1 + Math.floor(rng() * 2) }).map((_, i) => {
    const cfn = pick(rng, first);
    const cln = pick(rng, last);
    const isPrimary = i === 0;
    return {
      id: `ec-${employeeId}-${i}`,
      fullName: `${cfn} ${cln}`,
      relationship: pick(rng, relationships),
      phoneNumber: pick(rng, ['+234 803 555 2233', '+234 802 111 9090', '+234 901 333 1010']),
      alternativePhone: rng() < 0.4 ? pick(rng, ['+234 806 444 8888', '+234 809 100 2003']) : null,
      email: rng() < 0.4 ? `${cfn.toLowerCase()}.${cln.toLowerCase()}@mail.com` : null,
      address: rng() < 0.4 ? pick(rng, ['Lekki, Lagos', 'GRA, Port Harcourt', 'Asokoro, Abuja']) : null,
      isPrimary,
      isNextOfKin: isPrimary,
      isBeneficiary: rng() < 0.5,
    };
  });

  const nextOfKin: NextOfKinRecord[] = Array.from({ length: 1 + Math.floor(rng() * 1) }).map((_, i) => {
    const cfn = pick(rng, first);
    const cln = pick(rng, last);
    const isPrimary = i === 0;
    const isBeneficiary = rng() < 0.55;
    const pct = isBeneficiary ? (isPrimary ? 60 : 40) : 0;
    const evidenceUploaded = rng() < 0.6;
    const evidenceVerified = evidenceUploaded && rng() < 0.55;
    const now = nowIso();
    const evidence: NextOfKinEvidence[] = evidenceUploaded
      ? [
          {
            id: `nok-ev-${employeeId}-${i}-0`,
            evidenceType: pick(rng, ['Marriage Certificate', 'Birth Certificate', 'Court Affidavit', 'Government ID', 'Employee Declaration Form']),
            fileName: `relationship_evidence_${employeeId}_${i}.pdf`,
            mimeType: 'application/pdf',
            sizeBytes: 180_000 + Math.floor(rng() * 900_000),
            status: evidenceVerified ? 'Verified' : 'Uploaded',
            uploadedAt: now,
            verifiedAt: evidenceVerified ? now : null,
            verifiedBy: evidenceVerified ? 'Compliance Officer' : null,
            notes: null,
          },
        ]
      : [];

    return {
      id: `nok-${employeeId}-${i}`,
      employeeId,
      fullName: `${cfn} ${cln}`,
      relationship: pick(rng, ['Spouse', 'Father', 'Mother', 'Brother', 'Sister', 'Son', 'Daughter', 'Guardian', 'Friend', 'Other']),
      gender: pick(rng, ['Male', 'Female', 'Other']),
      dateOfBirth: rng() < 0.75 ? isoDate(rng, 1960, 2005) : null,
      primaryPhone: pick(rng, ['+234 803 555 2233', '+234 802 111 9090', '+234 901 333 1010']),
      alternatePhone: rng() < 0.35 ? pick(rng, ['+234 806 444 8888', '+234 809 100 2003']) : null,
      email: rng() < 0.35 ? `${cfn.toLowerCase()}.${cln.toLowerCase()}@mail.com` : null,
      residentialAddress: rng() < 0.5 ? pick(rng, ['Lekki, Lagos', 'GRA, Port Harcourt', 'Asokoro, Abuja']) : null,
      city: rng() < 0.55 ? pick(rng, ['Lagos', 'Port Harcourt', 'Abuja', 'Warri']) : null,
      state: rng() < 0.55 ? pick(rng, ['Lagos', 'Rivers', 'FCT', 'Delta']) : null,
      country: 'Nigeria',
      nearestLandmark: rng() < 0.35 ? pick(rng, ['Chevron', 'Garrison', 'Wuse Market']) : null,
      preferredContactMethod: pick(rng, ['Phone Confirmation', 'SMS Confirmation', 'Email Confirmation', 'Employee Declaration', 'HR Manual Verification']),
      isPrimary,
      isEmergencyContact: rng() < 0.5,
      verificationStatus: rng() < 0.55 ? 'Verified' : rng() < 0.8 ? 'Pending Verification' : 'Unverified',
      lastVerifiedAt: rng() < 0.55 ? nowIso() : null,
      verifiedBy: rng() < 0.55 ? 'HR Officer' : null,
      relationshipEvidenceType: evidence.length ? evidence[0].evidenceType : null,
      evidenceStatus: evidenceVerified ? 'Verified' : evidenceUploaded ? 'Uploaded' : 'Missing',
      evidence: evidence.length ? evidence : null,
      beneficiary: {
        isBeneficiary,
        beneficiaryPercentage: isBeneficiary ? pct : null,
        benefitCategory: isBeneficiary ? pick(rng, ['Death Benefit', 'Insurance Benefit', 'Gratuity', 'Welfare Benefit']) : null,
        nominationDate: isBeneficiary ? nowIso().slice(0, 10) : null,
        nominationStatus: isBeneficiary ? (rng() < 0.55 ? 'Approved' : 'Pending HR Review') : 'Draft',
        approvedBy: isBeneficiary && rng() < 0.55 ? 'HR Director' : null,
        approvalDate: isBeneficiary && rng() < 0.55 ? nowIso().slice(0, 10) : null,
        notes: null,
      },
      notes: null,
      createdAt: now,
      updatedAt: now,
      createdBy: 'HR Officer',
      updatedBy: 'HR Officer',
    };
  });

  const documents: DocumentItem[] = Array.from({ length: 6 + Math.floor(rng() * 6) }).map((_, i) => {
    const category = pick(rng, docCategories);
    const ext = pick(rng, ['pdf', 'jpg', 'png', 'webp', 'docx', 'xlsx', 'csv']);
    const uploadedAt = `${isoDate(rng, 2024, 2026)}T${String(Math.floor(rng() * 23)).padStart(2, '0')}:${String(Math.floor(rng() * 59)).padStart(2, '0')}:00.000Z`;
    const expiresAt = rng() < 0.35 ? `${isoDate(rng, 2026, 2028)}T00:00:00.000Z` : null;
    const status: DocumentItem['status'] = rng() < 0.6 ? 'Verified' : rng() < 0.84 ? 'Pending Verification' : 'Rejected';
    const confidentialityLevel: DocumentItem['confidentialityLevel'] =
      category.includes('Disciplinary') || category.includes('Warning') ? 'Restricted' : category.includes('Contract') || category.includes('Tax') || category.includes('Pension') ? 'Confidential' : 'Internal';
    const issueDate = uploadedAt.slice(0, 10);
    const nowMs = Date.now();
    const expMs = expiresAt ? new Date(expiresAt).getTime() : NaN;
    const complianceStatus: DocumentItem['complianceStatus'] =
      status === 'Rejected'
        ? 'Non-Compliant'
        : status === 'Verified'
          ? Number.isFinite(expMs) && expMs < nowMs
            ? 'Non-Compliant'
            : Number.isFinite(expMs) && expMs - nowMs < 30 * 24 * 3600 * 1000
              ? 'At Risk'
              : 'Compliant'
          : 'At Risk';
    return {
      id: `doc-${employeeId}-${i}`,
      category,
      documentTitle: category,
      fileName: `${category.replace(/\s+/g, '_').toLowerCase()}_${i}.${ext}`,
      mimeType:
        ext === 'pdf'
          ? 'application/pdf'
          : ext === 'jpg'
            ? 'image/jpeg'
            : ext === 'png'
              ? 'image/png'
              : ext === 'webp'
                ? 'image/webp'
                : ext === 'docx'
                  ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                  : ext === 'xlsx'
                    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                    : 'text/csv',
      sizeBytes: 180_000 + Math.floor(rng() * 1_800_000),
      status,
      complianceStatus,
      confidentialityLevel,
      issueDate,
      uploadedAt,
      expiresAt,
      verifiedBy: status === 'Verified' ? 'HR Compliance' : null,
      verifiedAt: status === 'Verified' ? uploadedAt : null,
      uploadedBy: status === 'Verified' ? 'HR Officer' : 'Admin Officer',
      versionNumber: 1,
      archivedAt: null,
      archiveReason: null,
      notes: null,
    };
  });

  const leaveSummary: LeaveSummary = {
    balances: {
      'Annual Leave': 8 + Math.floor(rng() * 18),
      'Sick Leave': 3 + Math.floor(rng() * 6),
      'Maternity Leave': rng() < 0.3 ? 0 : 0,
      'Paternity Leave': rng() < 0.3 ? 0 : 0,
      'Compassionate Leave': 1 + Math.floor(rng() * 4),
      'Study Leave': Math.floor(rng() * 6),
      'Unpaid Leave': Math.floor(rng() * 6),
      'Emergency Leave': Math.floor(rng() * 3),
    },
    history: Array.from({ length: 6 + Math.floor(rng() * 6) }).map((_, i) => {
      const type = pick(rng, ['Annual Leave', 'Sick Leave', 'Compassionate Leave', 'Study Leave', 'Unpaid Leave', 'Emergency Leave']);
      const start = `${isoDate(rng, 2024, 2026)}T00:00:00.000Z`;
      const days = 1 + Math.floor(rng() * 10);
      const endMs = new Date(start).getTime() + (days - 1) * 24 * 3600 * 1000;
      const end = new Date(endMs).toISOString();
      const status: LeaveSummary['history'][number]['status'] = rng() < 0.68 ? 'Approved' : rng() < 0.86 ? 'Pending' : 'Rejected';
      return { id: `lv-${employeeId}-${i}`, type, start, end, days, status };
    }),
  };

  const attendanceScore = 62 + Math.floor(rng() * 35);
  const attendanceSummary: AttendanceSummary = {
    score: attendanceScore,
    presentDays: 18 + Math.floor(rng() * 8),
    absentDays: Math.floor(rng() * 3),
    lateComing: Math.floor(rng() * 6),
    earlyDeparture: Math.floor(rng() * 5),
    overtimeHours: Math.floor(rng() * 25),
    biometricLogs: Array.from({ length: 10 }).map((_, i) => {
      const at = `${isoDate(rng, 2026, 2026)}T${String(7 + Math.floor(rng() * 4)).padStart(2, '0')}:${String(Math.floor(rng() * 59)).padStart(2, '0')}:00.000Z`;
      return { id: `bio-${employeeId}-${i}`, at, source: pick(rng, ['Biometric', 'Mobile', 'Access Control']), status: pick(rng, ['IN', 'OUT']) };
    }),
  };

  const payrollSummary: PayrollSummary = {
    payrollStatus: rng() < 0.7 ? 'Verified' : 'Pending Validation',
    salaryGrade: pick(rng, ['SG-07', 'SG-08', 'SG-09', 'SG-10', 'SG-11']),
    basicSalary: 450_000 + Math.floor(rng() * 1_850_000),
    allowances: 60_000 + Math.floor(rng() * 420_000),
    deductions: 30_000 + Math.floor(rng() * 250_000),
    bankName: pick(rng, ['GTBank', 'Access Bank', 'Zenith Bank', 'FirstBank', 'UBA']),
    accountNumberMasked: maskAccount(pick(rng, ['0123456789', '1029384756', '9911223344'])),
    pensionProvider: pick(rng, ['ARM Pensions', 'Stanbic IBTC', 'Leadway Pensure', 'PENCOM']),
    taxId: pick(rng, ['TX-198220', 'TX-991120', 'TX-550012']),
    payrollGroup: pick(rng, ['Monthly', 'Bi-Weekly', 'Project-Based']),
    lastPayrollProcessed: `${isoDate(rng, 2026, 2026)}T00:00:00.000Z`,
  };

  const performanceSummary: PerformanceSummary = {
    currentRating: pick(rng, ['A', 'B', 'B', 'C', '-'] as PerformanceSummary['currentRating'][]),
    lastReviewAt: rng() < 0.55 ? `${isoDate(rng, 2025, 2026)}T00:00:00.000Z` : null,
    goals: Array.from({ length: 3 + Math.floor(rng() * 3) }).map((_, i) => ({
      id: `g-${employeeId}-${i}`,
      title: pick(rng, ['Reduce rework rate', 'Improve HSE compliance', 'Optimize schedule adherence', 'Mentor junior engineers', 'Accelerate project closeout']),
      progressPct: 10 + Math.floor(rng() * 90),
      status: pick(rng, ['On Track', 'At Risk', 'Completed'] as PerformanceSummary['goals'][number]['status'][]),
    })),
    managerFeedback: rng() < 0.55 ? 'Consistent delivery with strong compliance posture; focus on documentation cycle time improvements.' : null,
    aiSignals: [
      { id: `ai-perf-${employeeId}-0`, title: 'No recent performance review found', severity: 'medium', confidence: 0.84 },
      { id: `ai-perf-${employeeId}-1`, title: 'Promotion readiness requires additional training evidence', severity: 'low', confidence: 0.72 },
    ],
  };

  const training: TrainingRecord[] = Array.from({ length: 6 + Math.floor(rng() * 6) }).map((_, i) => {
    const completed = rng() < 0.62;
    const expired = completed && rng() < 0.18;
    const completionDate = completed ? `${isoDate(rng, 2024, 2026)}T00:00:00.000Z` : null;
    const expiryDate = completed ? `${isoDate(rng, 2026, 2028)}T00:00:00.000Z` : null;
    return {
      id: `tr-${employeeId}-${i}`,
      trainingName: pick(rng, ['HSE Induction', 'Permit to Work', 'Project Controls Basics', 'Anti-Bribery & Corruption', 'Data Protection', 'Leadership Essentials']),
      provider: pick(rng, ['DLE Academy', 'External Provider', 'OEM Training']),
      completionDate,
      expiryDate: expired ? `${isoDate(rng, 2024, 2025)}T00:00:00.000Z` : expiryDate,
      status: expired ? 'Expired' : completed ? 'Completed' : 'Pending',
      score: completed ? 60 + Math.floor(rng() * 40) : null,
    };
  });

  const assets: AssetItem[] = Array.from({ length: 1 + Math.floor(rng() * 4) }).map((_, i) => ({
    id: `as-${employeeId}-${i}`,
    assetType: pick(rng, ['Laptop', 'Phone', 'Access Card', 'PPE', 'Software License', 'Office Equipment']),
    assetTag: `DLE-ASSET-${String(1000 + Math.floor(rng() * 8999))}`,
    assetName: pick(rng, ['Dell Latitude', 'HP EliteBook', 'iPhone', 'Android Phone', 'RFID Access Card', 'PPE Kit', 'AutoCAD License']),
    serialNumber: `SN-${String(100000 + Math.floor(rng() * 899999))}`,
    assignedDate: `${isoDate(rng, 2024, 2026)}T00:00:00.000Z`,
    condition: pick(rng, ['Good', 'Fair', 'Needs Repair'] as AssetItem['condition'][]),
    returnStatus: pick(rng, ['Assigned', 'Returned'] as AssetItem['returnStatus'][]),
    returnDate: rng() < 0.3 ? `${isoDate(rng, 2025, 2026)}T00:00:00.000Z` : null,
  }));

  const medicalHse: MedicalHSE = {
    medicalFitnessStatus: pick(rng, ['Fit', 'Fit with restrictions', 'Pending']),
    bloodGroup: pick(rng, ['A+', 'A-', 'B+', 'B-', 'AB+', 'O+', 'O-']),
    knownAllergies: rng() < 0.4 ? pick(rng, ['None', 'Peanuts', 'Dust', 'Seafood']) : null,
    medicalRestrictions: rng() < 0.35 ? 'Requires PPE compliance for confined space operations.' : null,
    fitToWorkStatus: pick(rng, ['Fit-to-Work', 'Restricted', 'Pending Review']),
    incidentHistory: Array.from({ length: Math.floor(rng() * 3) }).map((_, i) => ({
      id: `inc-${employeeId}-${i}`,
      at: `${isoDate(rng, 2024, 2026)}T00:00:00.000Z`,
      title: pick(rng, ['Near miss reported', 'First aid incident', 'PPE non-compliance']),
      severity: pick(rng, ['low', 'medium', 'high'] as Severity[]),
      status: pick(rng, ['Closed', 'Investigating', 'Action Required']),
    })),
    hseCertifications: Array.from({ length: 2 + Math.floor(rng() * 3) }).map((_, i) => ({
      id: `hse-${employeeId}-${i}`,
      name: pick(rng, ['BOSIET', 'H2S Awareness', 'Fire Warden', 'First Aid', 'Working at Height']),
      expiryDate: rng() < 0.8 ? `${isoDate(rng, 2026, 2028)}T00:00:00.000Z` : null,
      status: rng() < 0.8 ? 'Valid' : 'Expired',
    })),
  };

  const disciplinary: DisciplinaryRecord[] = Array.from({ length: Math.floor(rng() * 3) }).map((_, i) => ({
    id: `disc-${employeeId}-${i}`,
    caseType: pick(rng, ['Warning', 'Query', 'Investigation', 'Suspension']),
    dateReported: `${isoDate(rng, 2024, 2026)}T00:00:00.000Z`,
    description: 'Case record captured for compliance and traceability.',
    actionTaken: rng() < 0.6 ? pick(rng, ['Written warning issued', 'Training assigned', 'Suspension applied']) : null,
    status: pick(rng, ['Open', 'Closed', 'Appealed'] as DisciplinaryRecord['status'][]),
    approver: rng() < 0.7 ? 'HR Director' : null,
  }));

  const history: HistoryEvent[] = [
    { id: `h-${employeeId}-0`, at: dateJoined, type: 'Employee Created', detail: 'Employee record created in HRIS', actor: 'HR Officer' },
    { id: `h-${employeeId}-1`, at: `${isoDate(rng, 2013, 2016)}T00:00:00.000Z`, type: 'Employee Confirmed', detail: 'Probation completed and confirmation approved', actor: 'HR Manager' },
    { id: `h-${employeeId}-2`, at: `${isoDate(rng, 2017, 2020)}T00:00:00.000Z`, type: 'Promotion', detail: 'Promotion applied to new grade and role', actor: 'HR Director' },
    { id: `h-${employeeId}-3`, at: `${isoDate(rng, 2022, 2026)}T00:00:00.000Z`, type: 'Manager Change', detail: 'Reporting manager updated', actor: 'Department Head' },
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  const audit: AuditLog[] = [
    auditEntry('Viewed profile', 'HR Manager'),
    auditEntry('Viewed payroll', 'Payroll Officer', { reason: 'Payroll validation' }),
    auditEntry('Downloaded document', 'HR Officer', { reason: 'Compliance review' }),
  ];

  const aiInsights: AIInsight[] = [
    { id: `ai-${employeeId}-0`, severity: 'high', confidence: 0.92, title: 'Emergency contact missing', recommendation: 'Add at least one emergency contact and mark primary.', actionLabel: 'Open Emergency', action: 'tab.emergency' },
    { id: `ai-${employeeId}-1`, severity: 'medium', confidence: 0.87, title: 'Training compliance incomplete', recommendation: 'Assign mandatory trainings and track certificates.', actionLabel: 'Open Training', action: 'tab.training' },
    { id: `ai-${employeeId}-2`, severity: 'medium', confidence: 0.81, title: 'Attendance risk detected', recommendation: 'Review lateness pattern and trigger coaching workflow.', actionLabel: 'Open Attendance', action: 'tab.attendance' },
    { id: `ai-${employeeId}-3`, severity: 'low', confidence: 0.74, title: 'Payroll data requires validation', recommendation: 'Reconcile salary grade and bank details with payroll group.', actionLabel: 'Open Payroll', action: 'tab.payroll' },
  ];

  const overview: EmployeeOverview = {
    profileCompletionPct: 78 + Math.floor(rng() * 18),
    leaveBalanceDays: 6 + Math.floor(rng() * 18),
    attendanceScore,
    trainingCompliancePct: 60 + Math.floor(rng() * 38),
    performanceRating: performanceSummary.currentRating,
    payrollStatus: payrollSummary.payrollStatus === 'Verified' ? 'Verified' : 'Pending Validation',
    documentStatus: documents.some((d) => d.status === 'Rejected') ? 'Missing' : documents.some((d) => d.expiresAt) ? 'Expiring' : 'Compliant',
    assetStatus: assets.length > 0 ? 'Assigned' : 'None',
    currentLeaveStatus: rng() < 0.12 ? 'On Leave' : rng() < 0.2 ? 'Pending' : 'None',
    recentActivity: [
      { id: `ra-${employeeId}-0`, at: nowIso(), title: 'Profile viewed', detail: 'Employee profile accessed by authorized user.', actor: 'HR Manager' },
      { id: `ra-${employeeId}-1`, at: nowIso(), title: 'Documents checked', detail: 'Compliance document review executed.', actor: 'Compliance Officer' },
      { id: `ra-${employeeId}-2`, at: nowIso(), title: 'Attendance signal', detail: 'AI attendance risk flagged for review.', actor: 'AI Engine' },
    ],
  };

  return {
    profile: baseProfile,
    overview,
    emergencyContacts,
    nextOfKin,
    documents,
    leaveSummary,
    attendanceSummary,
    payrollSummary,
    performanceSummary,
    training,
    assets,
    medicalHse,
    disciplinary,
    history,
    audit,
    aiInsights,
  };
};

const store = (() => {
  const g = globalThis as unknown as { __dleHrisEmployees?: Map<string, EmployeeRecord> };
  if (!g.__dleHrisEmployees) g.__dleHrisEmployees = new Map();
  return g.__dleHrisEmployees;
})();

const overridesStore = (() => {
  const g = globalThis as unknown as { __dleHrisEmployeeOverrides?: Map<string, any> };
  if (!g.__dleHrisEmployeeOverrides) g.__dleHrisEmployeeOverrides = new Map();
  return g.__dleHrisEmployeeOverrides;
})();

const jobRequestsStore = (() => {
  const g = globalThis as unknown as { __dleHrisJobChangeRequests?: Map<string, JobChangeRequest> };
  if (!g.__dleHrisJobChangeRequests) g.__dleHrisJobChangeRequests = new Map();
  return g.__dleHrisJobChangeRequests;
})();

const jobRequestIndexStore = (() => {
  const g = globalThis as unknown as { __dleHrisJobChangeRequestsByEmployee?: Map<string, string[]> };
  if (!g.__dleHrisJobChangeRequestsByEmployee) g.__dleHrisJobChangeRequestsByEmployee = new Map();
  return g.__dleHrisJobChangeRequestsByEmployee;
})();

const employmentHistoryStores = () => {
  const g = globalThis as unknown as { __dleHrisEmploymentHistory?: Map<string, any>; __dleHrisEmploymentHistoryDetail?: Map<string, any> };
  if (!g.__dleHrisEmploymentHistory) g.__dleHrisEmploymentHistory = new Map();
  if (!g.__dleHrisEmploymentHistoryDetail) g.__dleHrisEmploymentHistoryDetail = new Map();
  return { list: g.__dleHrisEmploymentHistory, detail: g.__dleHrisEmploymentHistoryDetail };
};

const jobPermissions = (role: Role) => {
  const canCreate = role === 'Super Admin' || role === 'HR Director' || role === 'HR Manager' || role === 'HR Officer';
  const canSubmit = canCreate;
  const canApprove = role === 'Super Admin' || role === 'HR Director' || role === 'HR Manager' || role === 'Department Head';
  const canAudit = role !== 'Employee' && role !== 'IT Administrator';
  const canExport = role !== 'Employee';
  return { canCreate, canSubmit, canApprove, canAudit, canExport };
};

const requestForEmployee = (employeeId: string) => {
  const ids = jobRequestIndexStore.get(employeeId) || [];
  const items = ids.map((id) => jobRequestsStore.get(id)).filter((x): x is JobChangeRequest => !!x);
  items.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return items;
};

const addRequestToIndex = (employeeId: string, requestId: string) => {
  const ids = jobRequestIndexStore.get(employeeId) || [];
  if (!ids.includes(requestId)) jobRequestIndexStore.set(employeeId, [requestId, ...ids].slice(0, 80));
};

const jobEventTypeForChange = (t: JobChangeType) => {
  if (t === 'Job Title Change') return 'Job Title Change';
  if (t === 'Department Change') return 'Department Change';
  if (t === 'Grade Change') return 'Grade Change';
  if (t === 'Reporting Manager Change' || t === 'Functional Manager Change') return 'Manager Change';
  if (t === 'Location Change') return 'Transfer';
  if (t === 'Project Assignment Change') return 'Project Assignment';
  if (t === 'Cost Center Change') return 'Department Change';
  return 'Job Title Change';
};

const applyOverrideFromJobRequest = (employeeId: string, req: JobChangeRequest) => {
  const existing = overridesStore.get(employeeId) || {};
  const next = { ...existing };
  next.profile = next.profile && typeof next.profile === 'object' ? { ...next.profile } : {};
  next.profile.jobDetails = next.profile.jobDetails && typeof next.profile.jobDetails === 'object' ? { ...next.profile.jobDetails } : {};
  next.profile.employmentDetails = next.profile.employmentDetails && typeof next.profile.employmentDetails === 'object' ? { ...next.profile.employmentDetails } : {};

  const patch = req.newValues || {};
  const set = (k: string, v: string | null) => {
    (next.profile.jobDetails as any)[k] = v;
  };

  const setEmployment = (k: string, v: string | null) => {
    (next.profile.employmentDetails as any)[k] = v;
  };

  if (req.changeType === 'Job Title Change') set('jobTitle', patch.jobTitle ?? null);
  if (req.changeType === 'Grade Change') set('jobGrade', patch.jobGrade ?? null);
  if (req.changeType === 'Department Change') set('department', patch.department ?? null);
  if (req.changeType === 'Department Change') set('businessUnit', patch.businessUnit ?? null);
  if (req.changeType === 'Reporting Manager Change') set('reportingManager', patch.reportingManager ?? null);
  if (req.changeType === 'Functional Manager Change') set('functionalManager', patch.functionalManager ?? null);
  if (req.changeType === 'Location Change') setEmployment('workLocation', patch.workLocation ?? null);
  if (req.changeType === 'Project Assignment Change') set('projectSite', patch.projectSite ?? null);
  if (req.changeType === 'Cost Center Change') set('costCenter', patch.costCenter ?? null);
  if (req.changeType === 'Role Profile Update') {
    set('roleProfile', patch.roleProfile ?? null);
    set('jobDescription', patch.jobDescription ?? null);
    set('keyResponsibilities', patch.keyResponsibilities ?? null);
    set('jobPurpose', patch.jobPurpose ?? null);
    set('technicalCompetencies', patch.technicalCompetencies ?? null);
    set('behavioralCompetencies', patch.behavioralCompetencies ?? null);
    set('requiredQualifications', patch.requiredQualifications ?? null);
    set('requiredCertifications', patch.requiredCertifications ?? null);
    set('requiredExperience', patch.requiredExperience ?? null);
    set('kpis', patch.kpis ?? null);
    set('performanceExpectations', patch.performanceExpectations ?? null);
    set('hseResponsibilities', patch.hseResponsibilities ?? null);
    set('complianceResponsibilities', patch.complianceResponsibilities ?? null);
    set('roleSummary', patch.roleSummary ?? null);
  }

  const histEvent = {
    id: `h-${employeeId}-${Math.random().toString(16).slice(2)}`,
    sourceJobRequestId: req.id,
    at: req.effectiveDate,
    type: req.changeType,
    detail: req.reason,
    actor: req.createdBy || 'HRIS',
  };
  next.history = Array.isArray(next.history) ? [histEvent, ...next.history] : [histEvent];

  overridesStore.set(employeeId, next);
};

const createEmploymentHistoryFromJobRequest = (req: JobChangeRequest) => {
  const stores = employmentHistoryStores();
  const id = `hist-job-${req.id}`;
  const referenceNo = `HIST-JOB-${req.id.slice(-6).toUpperCase()}`;
  const eventType = jobEventTypeForChange(req.changeType);
  const item = {
    id,
    referenceNo,
    employeeId: req.employeeId,
    employeeName: req.employeeName,
    eventType,
    eventDate: req.updatedAt,
    effectiveDate: req.effectiveDate,
    previousDepartment: req.previousValues.department ?? null,
    newDepartment: req.newValues.department ?? null,
    previousJobTitle: req.previousValues.jobTitle ?? null,
    newJobTitle: req.newValues.jobTitle ?? null,
    previousGrade: req.previousValues.jobGrade ?? null,
    newGrade: req.newValues.jobGrade ?? null,
    previousManager: req.previousValues.reportingManager ?? null,
    newManager: req.newValues.reportingManager ?? null,
    previousLocation: req.previousValues.workLocation ?? null,
    newLocation: req.newValues.workLocation ?? null,
    previousStatus: null,
    newStatus: null,
    reason: req.reason,
    notes: req.notes ?? null,
    supportingDocument: req.supportingDocuments && req.supportingDocuments.length ? req.supportingDocuments[0] : null,
    approvalStatus: 'Approved',
    approvalId: `JOB-APP-${req.id.slice(-6).toUpperCase()}`,
    approvedBy: req.approvals.find((a) => a.decision === 'Approved')?.by || 'HRIS',
    approvedAt: req.updatedAt,
    createdBy: req.createdBy,
    createdAt: req.createdAt,
    updatedAt: req.updatedAt,
    audit: req.audit || [],
    reverseOf: null,
  };
  stores.detail.set(id, item);
  stores.list.set(id, {
    id,
    referenceNo,
    employeeId: req.employeeId,
    employeeName: req.employeeName,
    businessUnit: req.newValues.businessUnit ?? null,
    location: req.newValues.workLocation ?? null,
    eventType,
    eventDate: item.eventDate,
    effectiveDate: item.effectiveDate,
    previousDepartment: item.previousDepartment,
    newDepartment: item.newDepartment,
    previousJobTitle: item.previousJobTitle,
    newJobTitle: item.newJobTitle,
    previousGrade: item.previousGrade,
    newGrade: item.newGrade,
    previousManager: item.previousManager,
    newManager: item.newManager,
    previousLocation: item.previousLocation,
    newLocation: item.newLocation,
    previousStatus: null,
    newStatus: null,
    reason: item.reason,
    notes: item.notes,
    approvalStatus: item.approvalStatus,
    approvalId: item.approvalId,
    approvedBy: item.approvedBy,
    createdBy: item.createdBy,
    createdAt: item.createdAt,
  });
};

const assignmentRequestsStore = (() => {
  const g = globalThis as unknown as { __dleHrisAssignmentRequests?: Map<string, AssignmentRequest> };
  if (!g.__dleHrisAssignmentRequests) g.__dleHrisAssignmentRequests = new Map();
  return g.__dleHrisAssignmentRequests;
})();

const assignmentRequestIndexStore = (() => {
  const g = globalThis as unknown as { __dleHrisAssignmentRequestsByEmployee?: Map<string, string[]> };
  if (!g.__dleHrisAssignmentRequestsByEmployee) g.__dleHrisAssignmentRequestsByEmployee = new Map();
  return g.__dleHrisAssignmentRequestsByEmployee;
})();

const assignmentHistoryStore = (() => {
  const g = globalThis as unknown as { __dleHrisAssignmentHistory?: Map<string, any[]> };
  if (!g.__dleHrisAssignmentHistory) g.__dleHrisAssignmentHistory = new Map();
  return g.__dleHrisAssignmentHistory;
})();

const assignmentPermissions = (role: Role) => {
  const canCreate = role === 'Super Admin' || role === 'HR Director' || role === 'HR Manager' || role === 'HR Officer';
  const canSubmit = canCreate;
  const canApprove =
    role === 'Super Admin' ||
    role === 'HR Director' ||
    role === 'HR Manager' ||
    role === 'Department Head' ||
    role === 'Line Manager' ||
    role === 'Payroll Officer';
  const canExport = role !== 'Employee';
  const canAudit = role !== 'Employee' && role !== 'IT Administrator';
  return { canCreate, canSubmit, canApprove, canExport, canAudit };
};

const assignmentRequestsForEmployee = (employeeId: string) => {
  const ids = assignmentRequestIndexStore.get(employeeId) || [];
  const items = ids.map((id) => assignmentRequestsStore.get(id)).filter((x): x is AssignmentRequest => !!x);
  items.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return items;
};

const addAssignmentRequestToIndex = (employeeId: string, requestId: string) => {
  const ids = assignmentRequestIndexStore.get(employeeId) || [];
  if (!ids.includes(requestId)) assignmentRequestIndexStore.set(employeeId, [requestId, ...ids].slice(0, 120));
};

const assignmentEventTypeForRequest = (t: AssignmentRequestType) => {
  if (t === 'Department Transfer' || t === 'Business Unit Transfer') return 'Transfer';
  if (t === 'Unit Transfer') return 'Department Change';
  if (t === 'Cost Center Change') return 'Department Change';
  if (t === 'Reporting Manager Change') return 'Manager Change';
  if (t === 'Project Reassignment' || t === 'Site Reassignment') return 'Project Assignment';
  if (t === 'Secondment') return 'Secondment';
  if (t === 'Acting Assignment') return 'Job Title Change';
  if (t === 'Temporary Assignment') return 'Transfer';
  return 'Transfer';
};

const applyOverrideFromAssignmentRequest = (employeeId: string, req: AssignmentRequest) => {
  const existing = overridesStore.get(employeeId) || {};
  const next = { ...existing };
  next.profile = next.profile && typeof next.profile === 'object' ? { ...next.profile } : {};
  next.profile.jobDetails = next.profile.jobDetails && typeof next.profile.jobDetails === 'object' ? { ...next.profile.jobDetails } : {};
  next.profile.employmentDetails = next.profile.employmentDetails && typeof next.profile.employmentDetails === 'object' ? { ...next.profile.employmentDetails } : {};

  const setJob = (k: string, v: string | null) => ((next.profile.jobDetails as any)[k] = v);
  const setEmp = (k: string, v: string | null) => ((next.profile.employmentDetails as any)[k] = v);

  const nv = req.newValues || {};
  const keysJob = [
    'department',
    'division',
    'unit',
    'team',
    'businessUnit',
    'costCenter',
    'officeSite',
    'projectSite',
    'assignmentType',
    'assignmentStatus',
    'reportingManager',
    'functionalManager',
    'departmentHead',
    'unitHead',
    'businessUnitHead',
    'projectManager',
    'siteSupervisor',
    'matrixManager',
    'delegatedApprover',
    'hrBusinessPartner',
    'projectName',
    'projectCode',
    'client',
    'projectLocation',
    'siteLocation',
  ];
  for (const k of keysJob) {
    if (!(k in nv)) continue;
    setJob(k, typeof (nv as any)[k] === 'string' ? ((nv as any)[k] as string) : null);
  }
  if ('workLocation' in nv) setEmp('workLocation', typeof (nv as any).workLocation === 'string' ? ((nv as any).workLocation as string) : null);
  if ('workMode' in nv) setEmp('workMode', typeof (nv as any).workMode === 'string' ? ((nv as any).workMode as string) : null);
  if ('shiftPattern' in nv) setEmp('shiftPattern', typeof (nv as any).shiftPattern === 'string' ? ((nv as any).shiftPattern as string) : null);

  if (typeof nv.department === 'string' && nv.department.trim()) (next.profile as any).department = nv.department;
  if (typeof nv.businessUnit === 'string' && nv.businessUnit.trim()) (next.profile as any).businessUnit = nv.businessUnit;
  if (typeof nv.workLocation === 'string' && nv.workLocation.trim()) (next.profile as any).location = nv.workLocation;
  if (typeof nv.reportingManager === 'string' && nv.reportingManager.trim()) (next.profile as any).reportingManager = nv.reportingManager;

  const histEvent = {
    id: `h-${employeeId}-${Math.random().toString(16).slice(2)}`,
    sourceAssignmentRequestId: req.id,
    at: req.effectiveDate,
    type: req.requestType,
    detail: req.reason,
    actor: req.createdBy || 'HRIS',
  };
  next.history = Array.isArray(next.history) ? [histEvent, ...next.history] : [histEvent];

  overridesStore.set(employeeId, next);
};

const createEmploymentHistoryFromAssignmentRequest = (req: AssignmentRequest) => {
  const stores = employmentHistoryStores();
  const id = `hist-asg-${req.id}`;
  const referenceNo = `HIST-ASG-${req.id.slice(-6).toUpperCase()}`;
  const eventType = assignmentEventTypeForRequest(req.requestType);
  const item = {
    id,
    referenceNo,
    employeeId: req.employeeId,
    employeeName: req.employeeName,
    eventType,
    eventDate: req.updatedAt,
    effectiveDate: req.effectiveDate,
    previousDepartment: req.previousValues.department ?? null,
    newDepartment: req.newValues.department ?? null,
    previousJobTitle: null,
    newJobTitle: null,
    previousGrade: null,
    newGrade: null,
    previousManager: req.previousValues.reportingManager ?? null,
    newManager: req.newValues.reportingManager ?? null,
    previousLocation: req.previousValues.workLocation ?? null,
    newLocation: req.newValues.workLocation ?? null,
    previousStatus: null,
    newStatus: null,
    reason: req.reason,
    notes: req.notes ?? null,
    supportingDocument: req.supportingDocuments && req.supportingDocuments.length ? req.supportingDocuments[0] : null,
    approvalStatus: 'Approved',
    approvalId: `ASG-APP-${req.id.slice(-6).toUpperCase()}`,
    approvedBy: req.approvals.find((a) => a.decision === 'Approved')?.by || 'HRIS',
    approvedAt: req.updatedAt,
    createdBy: req.createdBy,
    createdAt: req.createdAt,
    updatedAt: req.updatedAt,
    audit: req.audit || [],
    reverseOf: null,
  };
  stores.detail.set(id, item);
  stores.list.set(id, {
    id,
    referenceNo,
    employeeId: req.employeeId,
    employeeName: req.employeeName,
    businessUnit: req.newValues.businessUnit ?? null,
    location: req.newValues.workLocation ?? null,
    eventType,
    eventDate: item.eventDate,
    effectiveDate: item.effectiveDate,
    previousDepartment: item.previousDepartment,
    newDepartment: item.newDepartment,
    previousJobTitle: null,
    newJobTitle: null,
    previousGrade: null,
    newGrade: null,
    previousManager: item.previousManager,
    newManager: item.newManager,
    previousLocation: item.previousLocation,
    newLocation: item.newLocation,
    previousStatus: null,
    newStatus: null,
    reason: item.reason,
    notes: item.notes,
    approvalStatus: item.approvalStatus,
    approvalId: item.approvalId,
    approvedBy: item.approvedBy,
    createdBy: item.createdBy,
    createdAt: item.createdAt,
  });
};

const addAssignmentHistoryEntry = (req: AssignmentRequest) => {
  const current = assignmentHistoryStore.get(req.employeeId) || [];
  const entry = {
    id: `asg-h-${req.id}`,
    referenceNo: `ASG-${req.id.slice(-6).toUpperCase()}`,
    employeeId: req.employeeId,
    employeeName: req.employeeName,
    assignmentType: req.assignmentType,
    previousDepartment: req.previousValues.department ?? null,
    newDepartment: req.newValues.department ?? null,
    previousUnit: req.previousValues.unit ?? null,
    newUnit: req.newValues.unit ?? null,
    previousManager: req.previousValues.reportingManager ?? null,
    newManager: req.newValues.reportingManager ?? null,
    previousCostCenter: req.previousValues.costCenter ?? null,
    newCostCenter: req.newValues.costCenter ?? null,
    effectiveDate: req.effectiveDate,
    endDate: req.endDate ?? null,
    approvalStatus: req.status,
    approvedBy: req.approvals.find((a) => a.decision === 'Approved')?.by || null,
    createdBy: req.createdBy,
    createdAt: req.createdAt,
    updatedAt: req.updatedAt,
    requestId: req.id,
  };
  assignmentHistoryStore.set(req.employeeId, [entry, ...current].slice(0, 250));
};

const deriveAssignmentAi = (employeeId: string, rec: EmployeeRecord) => {
  const job = rec.profile.jobDetails || {};
  const emp = rec.profile.employmentDetails || {};
  const department = (job.department || '').toString();
  const unit = (job.unit || '').toString();
  const businessUnit = (job.businessUnit || '').toString();
  const costCenter = (job.costCenter || '').toString();
  const manager = (job.reportingManager || '').toString();
  const projEnd = (job.assignmentEndDate || '').toString();
  const payrollCc = (rec.payrollSummary.salaryGrade || '').toString();

  const out: AIInsight[] = [];
  const add = (severity: Severity, title: string, confidence: number, recommendation: string, actionLabel: string, action: string) =>
    out.push({ id: `asg-ai-${employeeId}-${Math.random().toString(16).slice(2)}`, severity, confidence, title, recommendation, actionLabel, action });

  if (!unit || unit === '—') add('medium', 'Employee has no assigned unit/team', 0.78, 'Assign unit/team to improve operational reporting and approval routing.', 'Create Request', 'open_request');
  if (department.toLowerCase().includes('engineering') && costCenter && !costCenter.includes('ENG'))
    add('high', 'Selected cost center does not belong to assigned department', 0.84, 'Update cost center to match department mapping or submit correction for approval.', 'Review Cost Center', 'open_request');
  if (businessUnit && manager && businessUnit.toLowerCase().includes('operations') && manager.toLowerCase().includes('finance'))
    add('medium', 'Reporting manager is not within the assigned business unit', 0.7, 'Validate reporting line. If mismatch, submit manager change request.', 'Review Manager', 'open_request');
  if (projEnd) {
    const endMs = new Date(projEnd).getTime();
    if (Number.isFinite(endMs) && Date.now() - endMs > 12 * 24 * 3600 * 1000) add('medium', 'Employee is assigned to a project that ended 12+ days ago', 0.74, 'Close or update assignment end date and move employee to the next assignment.', 'Review Project', 'open_request');
  }
  if (payrollCc && costCenter && payrollCc.includes('SG-') && costCenter.includes('CC-') && payrollCc.includes('07') && costCenter.includes('ENG'))
    add('low', 'Employee assignment conflicts with payroll cost center', 0.62, 'Notify payroll to reconcile cost center mapping where required.', 'Notify Payroll', 'open_request');
  if ((emp.employmentStatus || '').toString().toLowerCase() !== 'active') add('low', 'Employee is not active; placement changes may require reactivation workflow', 0.58, 'Confirm employee status before applying assignment changes.', 'Review Status', 'review_status');

  if (out.length === 0) add('low', 'No assignment anomalies detected', 0.66, 'Maintain controlled transfers/assignments through approvals for audit integrity.', 'Open Workflow', 'open_workflow');
  return out.slice(0, 12);
};

const reportingRequestsStore = (() => {
  const g = globalThis as unknown as { __dleHrisReportingChangeRequests?: Map<string, ReportingChangeRequest> };
  if (!g.__dleHrisReportingChangeRequests) g.__dleHrisReportingChangeRequests = new Map();
  return g.__dleHrisReportingChangeRequests;
})();

const reportingRequestIndexStore = (() => {
  const g = globalThis as unknown as { __dleHrisReportingChangeRequestsByEmployee?: Map<string, string[]> };
  if (!g.__dleHrisReportingChangeRequestsByEmployee) g.__dleHrisReportingChangeRequestsByEmployee = new Map();
  return g.__dleHrisReportingChangeRequestsByEmployee;
})();

const reportingHistoryStore = (() => {
  const g = globalThis as unknown as { __dleHrisReportingHistory?: Map<string, any[]> };
  if (!g.__dleHrisReportingHistory) g.__dleHrisReportingHistory = new Map();
  return g.__dleHrisReportingHistory;
})();

const reportingDelegationsStore = (() => {
  const g = globalThis as unknown as { __dleHrisDelegations?: Map<string, ReportingDelegation[]> };
  if (!g.__dleHrisDelegations) g.__dleHrisDelegations = new Map();
  return g.__dleHrisDelegations;
})();

const statusOverridesStore = (() => {
  const g = globalThis as unknown as { __dleHrisEmployeeStatusOverrides?: Map<string, any> };
  if (!g.__dleHrisEmployeeStatusOverrides) g.__dleHrisEmployeeStatusOverrides = new Map();
  return g.__dleHrisEmployeeStatusOverrides;
})();

const statusRequestsStore = (() => {
  const g = globalThis as unknown as { __dleHrisStatusChangeRequests?: Map<string, any> };
  if (!g.__dleHrisStatusChangeRequests) g.__dleHrisStatusChangeRequests = new Map();
  return g.__dleHrisStatusChangeRequests;
})();

const statusRequestIndexStore = (() => {
  const g = globalThis as unknown as { __dleHrisStatusChangeRequestsByEmployee?: Map<string, string[]> };
  if (!g.__dleHrisStatusChangeRequestsByEmployee) g.__dleHrisStatusChangeRequestsByEmployee = new Map();
  return g.__dleHrisStatusChangeRequestsByEmployee;
})();

const statusHistoryStore = (() => {
  const g = globalThis as unknown as { __dleHrisStatusHistoryByEmployee?: Map<string, any[]> };
  if (!g.__dleHrisStatusHistoryByEmployee) g.__dleHrisStatusHistoryByEmployee = new Map();
  return g.__dleHrisStatusHistoryByEmployee;
})();

const statusRequestsForEmployee = (employeeId: string) => {
  const ids = statusRequestIndexStore.get(employeeId) || [];
  const items = ids.map((id) => statusRequestsStore.get(id)).filter(Boolean) as any[];
  items.sort((a, b) => ((a?.updatedAt || '') < (b?.updatedAt || '') ? 1 : -1));
  return items.slice(0, 120);
};

const addStatusRequestToIndex = (employeeId: string, requestId: string) => {
  const ids = statusRequestIndexStore.get(employeeId) || [];
  if (!ids.includes(requestId)) statusRequestIndexStore.set(employeeId, [requestId, ...ids].slice(0, 160));
};

const computeContractStatusForEmployee = (employeeId: string) => {
  const g = globalThis as unknown as { __dleHrisContracts?: Map<string, any>; __dleHrisContractsByEmployee?: Map<string, string[]> };
  const contracts = g.__dleHrisContracts;
  const byEmployee = g.__dleHrisContractsByEmployee;
  const ids = byEmployee?.get(employeeId) || [];
  const list = ids.map((id) => contracts?.get(id)).filter(Boolean) as any[];
  const active = list.find((c) => c.contractStatus === 'Active' || c.workflowStatus === 'Active') || list[0] || null;
  const end = active?.endDate ? String(active.endDate) : null;
  if (!end) return { contractStatus: '—', contractExpiredDays: null as number | null };
  const endMs = new Date(`${end}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(endMs)) return { contractStatus: '—', contractExpiredDays: null as number | null };
  const days = Math.ceil((Date.now() - endMs) / (24 * 3600 * 1000));
  if (days > 0) return { contractStatus: 'Contract Expired', contractExpiredDays: days };
  return { contractStatus: 'Contract Active', contractExpiredDays: null as number | null };
};

const statusImpactFor = (newEmploymentStatus: string, action: string) => {
  const impact = {
    payroll: [] as string[],
    systemAccess: [] as string[],
    emailAccess: [] as string[],
    attendance: [] as string[],
    leaveEntitlement: [] as string[],
    benefits: [] as string[],
    assetRecovery: [] as string[],
    documentClearance: [] as string[],
    reportingLine: [] as string[],
    workflowApprovals: [] as string[],
    projectAssignment: [] as string[],
    contractRenewal: [] as string[],
  };
  const add = (k: keyof typeof impact, line: string) => impact[k].push(line);
  const s = (newEmploymentStatus || '').toLowerCase();
  const a = (action || '').toLowerCase();

  if (s.includes('suspended') || a.includes('suspend')) {
    add('payroll', 'Payroll requires review; pay may be held depending on policy.');
    add('systemAccess', 'Restrict system access for suspension duration.');
    add('emailAccess', 'Disable corporate email access or set to restricted.');
    add('attendance', 'Disable attendance clock-in and overtime approvals.');
    add('workflowApprovals', 'Remove from approval routing; re-route pending approvals.');
    add('reportingLine', 'Notify line manager and HRBP.');
  }
  if (s.includes('terminated') || s.includes('resigned') || s.includes('retired') || s.includes('exited') || a.includes('terminate') || a.includes('exit')) {
    add('payroll', 'Stop payroll eligibility after effective date; run final settlement workflow.');
    add('systemAccess', 'Disable system access, VPN and application accounts.');
    add('emailAccess', 'Disable corporate email and revoke access tokens.');
    add('attendance', 'Disable attendance clock-in and roster allocation.');
    add('assetRecovery', 'Trigger asset recovery checklist.');
    add('documentClearance', 'Trigger clearance workflow and document completion checks.');
    add('workflowApprovals', 'Re-route approvals and remove from workflow steps.');
    add('projectAssignment', 'Demobilize from project assignments and close timesheets.');
    add('reportingLine', 'Update reporting line where required and notify stakeholders.');
  }
  if (s.includes('on leave') || a.includes('leave')) {
    add('attendance', 'Attendance clock-in should be disabled for leave duration.');
    add('leaveEntitlement', 'Leave entitlement will be reduced and tracked.');
    add('workflowApprovals', 'Delegations may be required for approvals during leave.');
  }
  if (s.includes('reactivated') || a.includes('reactivate') || a.includes('activate')) {
    add('systemAccess', 'Restore access based on role and policy (IT review).');
    add('payroll', 'Payroll eligibility must be confirmed by Payroll Officer.');
    add('attendance', 'Re-enable attendance clock-in and roster allocation.');
    add('workflowApprovals', 'Restore approval routing if applicable.');
  }
  if (s.includes('contract expired') || a.includes('contract expired')) {
    add('contractRenewal', 'Initiate contract renewal workflow or exit escalation.');
    add('payroll', 'Payroll requires review if contract has expired.');
    add('systemAccess', 'Access should be reviewed for contract expiry.');
  }
  if (s.includes('confirmed') || a.includes('confirm')) {
    add('benefits', 'Enable confirmed benefits eligibility and update HR status.');
    add('payroll', 'Confirm payroll eligibility and grade-based allowances.');
  }
  if (s.includes('deceased') || a.includes('deceased')) {
    add('documentClearance', 'Trigger deceased clearance and benefits workflows.');
    add('payroll', 'Stop payroll and route to benefits processing.');
    add('systemAccess', 'Disable all access immediately.');
    add('emailAccess', 'Disable email immediately.');
  }
  if (s.includes('blacklisted') || a.includes('blacklist')) {
    add('documentClearance', 'Blacklisting requires compliance and executive review.');
    add('systemAccess', 'Disable access immediately.');
  }
  return impact;
};

const reportingPermissions = (role: Role) => {
  const canCreate = role === 'Super Admin' || role === 'HR Director' || role === 'HR Manager' || role === 'HR Officer';
  const canSubmit = canCreate;
  const canApprove = role === 'Super Admin' || role === 'HR Director' || role === 'HR Manager' || role === 'Department Head' || role === 'Line Manager';
  const canExport = role !== 'Employee';
  const canAudit = role !== 'Employee' && role !== 'IT Administrator';
  return { canCreate, canSubmit, canApprove, canExport, canAudit };
};

const reportingRequestsForEmployee = (employeeId: string) => {
  const ids = reportingRequestIndexStore.get(employeeId) || [];
  const items = ids.map((id) => reportingRequestsStore.get(id)).filter((x): x is ReportingChangeRequest => !!x);
  items.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return items;
};

const addReportingRequestToIndex = (employeeId: string, requestId: string) => {
  const ids = reportingRequestIndexStore.get(employeeId) || [];
  if (!ids.includes(requestId)) reportingRequestIndexStore.set(employeeId, [requestId, ...ids].slice(0, 120));
};

const reportingEventTypeForChange = (t: ReportingChangeType) => {
  if (t === 'Manager Change') return 'Manager Change';
  if (t === 'Functional Manager Change') return 'Manager Change';
  if (t === 'Department Head Change') return 'Manager Change';
  if (t === 'Project Manager Change') return 'Project Assignment';
  if (t === 'Matrix Manager Change') return 'Manager Change';
  if (t === 'Delegated Approver Change') return 'Manager Change';
  if (t === 'Temporary Reporting Assignment') return 'Manager Change';
  if (t === 'Bulk Manager Reassignment') return 'Manager Change';
  return 'Manager Change';
};

const applyOverrideFromReportingRequest = (employeeId: string, req: ReportingChangeRequest, mode: 'applyNew' | 'applyPrevious') => {
  const existing = overridesStore.get(employeeId) || {};
  const next = { ...existing };
  next.profile = next.profile && typeof next.profile === 'object' ? { ...next.profile } : {};
  next.profile.jobDetails = next.profile.jobDetails && typeof next.profile.jobDetails === 'object' ? { ...next.profile.jobDetails } : {};

  const patch = mode === 'applyNew' ? req.newValues : req.previousValues;
  const setJob = (k: string, v: string | null) => ((next.profile.jobDetails as any)[k] = v);
  const safeStr = (v: any) => (typeof v === 'string' && v.trim() ? v.trim() : null);

  const mapKeys: [string, string][] = [
    ['directManager', 'reportingManager'],
    ['functionalManager', 'functionalManager'],
    ['departmentHead', 'departmentHead'],
    ['unitHead', 'unitHead'],
    ['businessUnitHead', 'businessUnitHead'],
    ['projectManager', 'projectManager'],
    ['siteSupervisor', 'siteSupervisor'],
    ['matrixManager', 'matrixManager'],
    ['dottedLineManager', 'dottedLineManager'],
    ['hrBusinessPartner', 'hrBusinessPartner'],
    ['delegatedApprover', 'delegatedApprover'],
  ];
  for (const [src, dest] of mapKeys) {
    if (!(src in patch)) continue;
    setJob(dest, safeStr((patch as any)[src]));
  }

  if (mode === 'applyNew') {
    const del = Array.isArray(req.delegations) ? req.delegations : [];
    reportingDelegationsStore.set(employeeId, del);
  } else {
    reportingDelegationsStore.set(employeeId, []);
  }

  const histEvent = {
    id: `h-${employeeId}-${Math.random().toString(16).slice(2)}`,
    sourceReportingRequestId: req.id,
    at: req.effectiveDate,
    type: req.changeType,
    detail: req.reason,
    actor: req.createdBy || 'HRIS',
  };
  next.history = Array.isArray(next.history) ? [histEvent, ...next.history] : [histEvent];

  overridesStore.set(employeeId, next);
};

const addReportingHistoryEntry = (req: ReportingChangeRequest) => {
  const current = reportingHistoryStore.get(req.employeeId) || [];
  const entry = {
    id: `rep-h-${req.id}`,
    referenceNo: `REP-${req.id.slice(-6).toUpperCase()}`,
    employeeId: req.employeeId,
    employeeName: req.employeeName,
    changeType: req.changeType,
    previousManager: req.previousValues.directManager ?? null,
    newManager: req.newValues.directManager ?? null,
    previousFunctionalManager: req.previousValues.functionalManager ?? null,
    newFunctionalManager: req.newValues.functionalManager ?? null,
    effectiveDate: req.effectiveDate,
    endDate: req.endDate ?? null,
    approvalStatus: req.status,
    approvedBy: req.approvals.find((a) => a.decision === 'Approved')?.by || null,
    createdBy: req.createdBy,
    createdAt: req.createdAt,
    updatedAt: req.updatedAt,
    requestId: req.id,
    isBulk: !!req.isBulk,
  };
  reportingHistoryStore.set(req.employeeId, [entry, ...current].slice(0, 250));
};

const createEmploymentHistoryFromReportingRequest = (req: ReportingChangeRequest, reverseOf?: string | null) => {
  const stores = employmentHistoryStores();
  const id = `hist-rep-${req.id}${reverseOf ? '-rev' : ''}`;
  const referenceNo = `HIST-REP-${req.id.slice(-6).toUpperCase()}`;
  const eventType = reportingEventTypeForChange(req.changeType);
  const item = {
    id,
    referenceNo,
    employeeId: req.employeeId,
    employeeName: req.employeeName,
    eventType,
    eventDate: req.updatedAt,
    effectiveDate: req.effectiveDate,
    previousDepartment: null,
    newDepartment: null,
    previousJobTitle: null,
    newJobTitle: null,
    previousGrade: null,
    newGrade: null,
    previousManager: req.previousValues.directManager ?? null,
    newManager: req.newValues.directManager ?? null,
    previousLocation: null,
    newLocation: null,
    previousStatus: null,
    newStatus: null,
    reason: reverseOf ? `Reversal of ${req.id}` : req.reason,
    notes: req.notes ?? null,
    supportingDocument: req.supportingDocuments && req.supportingDocuments.length ? req.supportingDocuments[0] : null,
    approvalStatus: 'Approved',
    approvalId: `REP-APP-${req.id.slice(-6).toUpperCase()}`,
    approvedBy: req.approvals.find((a) => a.decision === 'Approved')?.by || 'HRIS',
    approvedAt: req.updatedAt,
    createdBy: req.createdBy,
    createdAt: req.createdAt,
    updatedAt: req.updatedAt,
    audit: req.audit || [],
    reverseOf: reverseOf || null,
  };
  stores.detail.set(id, item);
  stores.list.set(id, {
    id,
    referenceNo,
    employeeId: req.employeeId,
    employeeName: req.employeeName,
    businessUnit: null,
    location: null,
    eventType,
    eventDate: item.eventDate,
    effectiveDate: item.effectiveDate,
    previousDepartment: null,
    newDepartment: null,
    previousJobTitle: null,
    newJobTitle: null,
    previousGrade: null,
    newGrade: null,
    previousManager: item.previousManager,
    newManager: item.newManager,
    previousLocation: null,
    newLocation: null,
    previousStatus: null,
    newStatus: null,
    reason: item.reason,
    notes: item.notes,
    approvalStatus: item.approvalStatus,
    approvalId: item.approvalId,
    approvedBy: item.approvedBy,
    createdBy: item.createdBy,
    createdAt: item.createdAt,
  });
};

const buildOrgChartForEmployee = (employeeId: string, rec: EmployeeRecord) => {
  const rng = createSeeded(seedFromId(`org-${employeeId}`));
  const job = rec.profile.jobDetails || {};
  const name = rec.profile.fullName;
  const jobTitle = (job.jobTitle || rec.profile.jobTitle || '—').toString();
  const department = (job.department || rec.profile.department || '—').toString();
  const status = rec.profile.employmentStatus;
  const managerName = (job.reportingManager || 'Direct Manager').toString();
  const deptHead = (job.departmentHead || 'Department Head').toString();
  const buHead = (job.businessUnitHead || 'BU Head').toString();
  const matrix = (job.matrixManager || 'Matrix Manager').toString();
  const projectMgr = (job.projectManager || 'Project Manager').toString();

  const employeeNodeId = `n-${employeeId}`;
  const nodes: OrgChartNode[] = [
    { id: employeeNodeId, employeeId, name, jobTitle, department, status, directReports: 0, level: 'employee' },
    { id: `n-mgr-${employeeId}`, employeeId: `MGR-${employeeId}`, name: managerName, jobTitle: 'Line Manager', department, status: 'Active', directReports: 6 + Math.floor(rng() * 10), level: 'manager' },
    { id: `n-dh-${employeeId}`, employeeId: `DH-${employeeId}`, name: deptHead, jobTitle: 'Department Head', department, status: 'Active', directReports: 15 + Math.floor(rng() * 20), level: 'departmentHead' },
    { id: `n-bu-${employeeId}`, employeeId: `BUH-${employeeId}`, name: buHead, jobTitle: 'Business Unit Head', department: (job.businessUnit || rec.profile.businessUnit || '—').toString(), status: 'Active', directReports: 30 + Math.floor(rng() * 40), level: 'businessUnitHead' },
    { id: `n-matrix-${employeeId}`, employeeId: `MX-${employeeId}`, name: matrix, jobTitle: 'Matrix Manager', department: (job.businessUnit || rec.profile.businessUnit || '—').toString(), status: 'Active', directReports: 4 + Math.floor(rng() * 8), level: 'matrixManager' },
    { id: `n-proj-${employeeId}`, employeeId: `PM-${employeeId}`, name: projectMgr, jobTitle: 'Project Manager', department: 'Projects', status: 'Active', directReports: 8 + Math.floor(rng() * 12), level: 'projectManager' },
  ];

  const peers = Array.from({ length: 3 }).map((_, i) => ({
    id: `n-peer-${employeeId}-${i}`,
    employeeId: `PEER-${employeeId}-${i}`,
    name: `Peer ${i + 1}`,
    jobTitle: pick(rng, ['Engineer', 'Supervisor', 'Officer']),
    department,
    status: 'Active',
    directReports: Math.floor(rng() * 3),
    level: 'peer' as const,
  }));
  const subs = Array.from({ length: 4 }).map((_, i) => ({
    id: `n-sub-${employeeId}-${i}`,
    employeeId: `SUB-${employeeId}-${i}`,
    name: `Direct Report ${i + 1}`,
    jobTitle: pick(rng, ['Technician', 'Assistant', 'Coordinator']),
    department,
    status: rng() < 0.1 ? 'Suspended' : 'Active',
    directReports: 0,
    level: 'subordinate' as const,
  }));
  nodes.push(...peers, ...subs);

  const edges: OrgChartEdge[] = [
    { from: employeeNodeId, to: `n-mgr-${employeeId}`, relation: 'reports_to' },
    { from: `n-mgr-${employeeId}`, to: `n-dh-${employeeId}`, relation: 'reports_to' },
    { from: `n-dh-${employeeId}`, to: `n-bu-${employeeId}`, relation: 'reports_to' },
    { from: employeeNodeId, to: `n-matrix-${employeeId}`, relation: 'matrix_to' },
    { from: employeeNodeId, to: `n-proj-${employeeId}`, relation: 'dotted_to' },
  ];
  for (const p of peers) edges.push({ from: employeeNodeId, to: p.id, relation: 'peer' });
  for (const s of subs) edges.push({ from: s.id, to: employeeNodeId, relation: 'reports_to' });

  return { nodes, edges };
};

const buildApprovalChains = (rec: EmployeeRecord): ApprovalChain[] => {
  const job = rec.profile.jobDetails || {};
  const direct = (job.reportingManager || 'Direct Manager').toString();
  const functional = (job.functionalManager || 'Functional Manager').toString();
  const deptHead = (job.departmentHead || 'Department Head').toString();
  const buHead = (job.businessUnitHead || 'HR Director').toString();
  const fallback = (job.hrBusinessPartner || 'HRBP').toString();
  const esc = 'HR Director';
  const mk = (key: ApprovalChain['key'], slaHours: number, rule: string): ApprovalChain => ({
    key,
    level1Approver: direct,
    level2Approver: deptHead,
    level3Approver: buHead,
    escalationApprover: esc,
    fallbackApprover: fallback,
    slaHours,
    escalationRule: rule,
  });
  return [
    mk('Leave Approval Chain', 48, 'Escalate if pending > SLA'),
    mk('Attendance Approval Chain', 24, 'Escalate if pending > SLA'),
    mk('Overtime Approval Chain', 24, 'Escalate if pending > SLA'),
    mk('Timesheet Approval Chain', 48, 'Escalate if pending > SLA'),
    mk('Expense Approval Chain', 72, 'Escalate if pending > SLA'),
    mk('Training Approval Chain', 72, 'Escalate if pending > SLA'),
    mk('Recruitment Approval Chain', 168, 'Escalate if pending > SLA'),
    mk('Employee Change Approval Chain', 72, 'Escalate if pending > SLA'),
    mk('Exit Approval Chain', 168, 'Escalate if pending > SLA'),
  ];
};

const detectCircularReporting = (employeeName: string, directManager: string, matrixManager: string, dottedManager: string) => {
  const e = employeeName.trim().toLowerCase();
  const dm = directManager.trim().toLowerCase();
  const mm = matrixManager.trim().toLowerCase();
  const dot = dottedManager.trim().toLowerCase();
  if (!e) return false;
  if (dm && dm === e) return true;
  if (mm && mm === e) return true;
  if (dot && dot === e) return true;
  if (dm && mm && dm === mm) return false;
  return false;
};

const deriveReportingAi = (employeeId: string, rec: EmployeeRecord) => {
  const job = rec.profile.jobDetails || {};
  const employeeName = rec.profile.fullName;
  const dept = (job.department || rec.profile.department || '').toString();
  const direct = (job.reportingManager || '').toString();
  const functional = (job.functionalManager || '').toString();
  const deptHead = (job.departmentHead || '').toString();
  const matrix = (job.matrixManager || '').toString();
  const dotted = (job.dottedLineManager || '').toString();
  const delegated = (job.delegatedApprover || '').toString();

  const out: AIInsight[] = [];
  const add = (s: Severity, title: string, confidence: number, recommendation: string, actionLabel: string, action: string) =>
    out.push({ id: `rep-ai-${employeeId}-${Math.random().toString(16).slice(2)}`, severity: s, confidence, title, recommendation, actionLabel, action });

  if (!direct || direct === '—') add('high', 'Direct reporting manager is missing', 0.86, 'Assign a direct manager or mark employee as top executive if exempt.', 'Create Change', 'open_request');
  if (!deptHead || deptHead === '—') add('high', 'Employee has no assigned department head', 0.82, 'Assign department head to ensure approvals can be routed correctly.', 'Fix Chain', 'open_request');
  if (dept && direct && dept.toLowerCase().includes('engineering') && direct.toLowerCase().includes('finance'))
    add('medium', 'Reporting manager belongs to a different department', 0.72, 'Validate cross-department reporting. If incorrect, submit manager change request.', 'Review Manager', 'open_request');

  if (detectCircularReporting(employeeName, direct, matrix, dotted)) add('high', 'Circular reporting risk detected', 0.9, 'Block self-reporting/matrix loops. Reverse incorrect assignments and submit corrected hierarchy.', 'Resolve', 'open_request');

  const delegations = reportingDelegationsStore.get(employeeId) || [];
  const soon = delegations.find((d) => d.status === 'Active' && new Date(d.endDate).getTime() - Date.now() < 3 * 24 * 3600 * 1000);
  if (soon) add('medium', 'Delegated approver expires in 3 days', 0.74, 'Extend delegation or confirm fallback approver is configured.', 'Review Delegation', 'open_request');

  if (delegated && delegated.toLowerCase().includes('inactive')) add('high', 'Employee is reporting to an inactive manager', 0.78, 'Replace inactive managers and re-route approvals.', 'Replace', 'open_request');

  if (!functional || functional === '—') add('low', 'Functional manager not set', 0.62, 'Set functional manager for matrix operations and approvals.', 'Update', 'open_request');

  if (out.length === 0) add('low', 'No hierarchy anomalies detected', 0.66, 'Maintain controlled reporting changes through approvals and audit logs.', 'Open Workflow', 'open_workflow');
  return out.slice(0, 12);
};

const applyOverrides = (employeeId: string, rec: EmployeeRecord) => {
  const ov = overridesStore.get(employeeId);
  if (!ov || typeof ov !== 'object') return rec;

  const profile = (ov.profile && typeof ov.profile === 'object' ? ov.profile : null) as any;
  if (profile) {
    const patchStr = (v: any) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    const patchISO = (v: any) => (typeof v === 'string' && v.trim() ? v.trim() : null);

    rec.profile.employeeId = employeeId;
    const fullName = patchStr(profile.fullName);
    if (fullName) rec.profile.fullName = fullName;
    const jobTitle = patchStr(profile.jobTitle);
    if (jobTitle) rec.profile.jobTitle = jobTitle;
    const department = patchStr(profile.department);
    if (department) rec.profile.department = department;
    const businessUnit = patchStr(profile.businessUnit);
    if (businessUnit) rec.profile.businessUnit = businessUnit;
    const location = patchStr(profile.location);
    if (location) rec.profile.location = location;
    const employmentStatus = patchStr(profile.employmentStatus) as EmployeeStatus | null;
    if (employmentStatus) rec.profile.employmentStatus = employmentStatus;
    const employmentType = patchStr(profile.employmentType);
    if (employmentType) rec.profile.employmentType = employmentType;
    const reportingManager = patchStr(profile.reportingManager);
    if (reportingManager) rec.profile.reportingManager = reportingManager;
    const dateJoined = patchISO(profile.dateJoined);
    if (dateJoined) rec.profile.dateJoined = dateJoined;

    const mergeObj = (target: Record<string, string | null>, src: any) => {
      if (!src || typeof src !== 'object') return target;
      for (const [k, v] of Object.entries(src)) {
        if (typeof v === 'string') target[k] = v;
        else if (v === null) target[k] = null;
      }
      return target;
    };

    mergeObj(rec.profile.personalInfo, profile.personalInfo);
    mergeObj(rec.profile.employmentDetails, profile.employmentDetails);
    mergeObj(rec.profile.jobDetails, profile.jobDetails);
    mergeObj(rec.profile.contacts, profile.contacts);
  }

  if (Array.isArray(ov.emergencyContacts)) {
    rec.emergencyContacts = ov.emergencyContacts
      .filter((x: any) => x && typeof x === 'object')
      .map((x: any, idx: number) => ({
        id: typeof x.id === 'string' ? x.id : `ec-${employeeId}-${idx}`,
        fullName: typeof x.fullName === 'string' ? x.fullName : '—',
        relationship: typeof x.relationship === 'string' ? x.relationship : '—',
        phoneNumber: typeof x.phoneNumber === 'string' ? x.phoneNumber : '—',
        alternativePhone: typeof x.alternativePhone === 'string' ? x.alternativePhone : typeof x.alternatePhone === 'string' ? x.alternatePhone : null,
        email: typeof x.email === 'string' ? x.email : null,
        address: typeof x.address === 'string' ? x.address : null,
        isPrimary: !!x.isPrimary,
        isNextOfKin: !!x.isNextOfKin,
        isBeneficiary: !!x.isBeneficiary,
      }));
  }

  if (Array.isArray(ov.nextOfKin)) {
    rec.nextOfKin = ov.nextOfKin
      .filter((x: any) => x && typeof x === 'object')
      .map((x: any, idx: number) => {
        const isBeneficiary = !!(x.isBeneficiary ?? x.beneficiary?.isBeneficiary);
        const pct = typeof x.beneficiaryPercentage === 'number' ? x.beneficiaryPercentage : typeof x.beneficiary?.beneficiaryPercentage === 'number' ? x.beneficiary.beneficiaryPercentage : null;
        return {
          id: typeof x.id === 'string' ? x.id : `nok-${employeeId}-${idx}`,
          employeeId,
          fullName: typeof x.fullName === 'string' ? x.fullName : '—',
          relationship: typeof x.relationship === 'string' ? x.relationship : '—',
          gender: typeof x.gender === 'string' ? x.gender : null,
          dateOfBirth: typeof x.dateOfBirth === 'string' ? x.dateOfBirth : null,
          primaryPhone: typeof x.primaryPhone === 'string' ? x.primaryPhone : typeof x.phoneNumber === 'string' ? x.phoneNumber : '—',
          alternatePhone: typeof x.alternatePhone === 'string' ? x.alternatePhone : typeof x.alternativePhone === 'string' ? x.alternativePhone : null,
          email: typeof x.email === 'string' ? x.email : null,
          residentialAddress: typeof x.residentialAddress === 'string' ? x.residentialAddress : typeof x.address === 'string' ? x.address : null,
          city: typeof x.city === 'string' ? x.city : null,
          state: typeof x.state === 'string' ? x.state : null,
          country: typeof x.country === 'string' ? x.country : null,
          nearestLandmark: typeof x.nearestLandmark === 'string' ? x.nearestLandmark : null,
          preferredContactMethod: typeof x.preferredContactMethod === 'string' ? x.preferredContactMethod : null,
          isPrimary: !!x.isPrimary,
          isEmergencyContact: !!x.isEmergencyContact,
          verificationStatus: (typeof x.verificationStatus === 'string' ? x.verificationStatus : 'Unverified') as NextOfKinRecord['verificationStatus'],
          lastVerifiedAt: typeof x.lastVerifiedAt === 'string' ? x.lastVerifiedAt : null,
          verifiedBy: typeof x.verifiedBy === 'string' ? x.verifiedBy : null,
          relationshipEvidenceType: typeof x.relationshipEvidenceType === 'string' ? x.relationshipEvidenceType : null,
          evidenceStatus: (typeof x.evidenceStatus === 'string' ? x.evidenceStatus : 'Missing') as NextOfKinRecord['evidenceStatus'],
          evidence: null,
          beneficiary: {
            isBeneficiary,
            beneficiaryPercentage: isBeneficiary ? (pct ?? 0) : null,
            benefitCategory: typeof x.benefitCategory === 'string' ? x.benefitCategory : typeof x.beneficiary?.benefitCategory === 'string' ? x.beneficiary.benefitCategory : null,
            nominationDate: typeof x.nominationDate === 'string' ? x.nominationDate : null,
            nominationStatus: (typeof x.nominationStatus === 'string' ? x.nominationStatus : 'Draft') as NextOfKinBeneficiary['nominationStatus'],
            approvedBy: typeof x.approvedBy === 'string' ? x.approvedBy : null,
            approvalDate: typeof x.approvalDate === 'string' ? x.approvalDate : null,
            notes: typeof x.notes === 'string' ? x.notes : null,
          },
          notes: typeof x.notes === 'string' ? x.notes : null,
          createdAt: typeof x.createdAt === 'string' ? x.createdAt : new Date().toISOString(),
          updatedAt: typeof x.updatedAt === 'string' ? x.updatedAt : new Date().toISOString(),
          createdBy: typeof x.createdBy === 'string' ? x.createdBy : 'HR Officer',
          updatedBy: typeof x.updatedBy === 'string' ? x.updatedBy : 'HR Officer',
        } satisfies NextOfKinRecord;
      });
  }

  if (Array.isArray(ov.documents)) {
    rec.documents = ov.documents
      .filter((d: any) => d && typeof d === 'object')
      .map((d: any, idx: number) => ({
        id: typeof d.id === 'string' ? d.id : `doc-${employeeId}-${idx}`,
        category: typeof d.category === 'string' ? d.category : 'Document',
        fileName: typeof d.fileName === 'string' ? d.fileName : 'file',
        mimeType: typeof d.mimeType === 'string' ? d.mimeType : 'application/octet-stream',
        sizeBytes: typeof d.sizeBytes === 'number' ? d.sizeBytes : 0,
        status: (typeof d.status === 'string' ? d.status : 'Uploaded') as DocumentItem['status'],
        uploadedAt: typeof d.uploadedAt === 'string' ? d.uploadedAt : new Date().toISOString(),
        expiresAt: typeof d.expiresAt === 'string' ? d.expiresAt : d.expiresAt === null ? null : null,
        verifiedBy: typeof d.verifiedBy === 'string' ? d.verifiedBy : null,
      }));
  }

  if (ov.payroll && typeof ov.payroll === 'object') {
    const toNum = (v: any) => {
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (typeof v !== 'string') return null;
      const n = Number(v.replace(/[^\d.]/g, ''));
      return Number.isFinite(n) ? n : null;
    };
    const p = ov.payroll as any;
    rec.payrollSummary = {
      payrollStatus: p.setupAssignedToPayroll ? 'Pending Validation' : 'Verified',
      salaryGrade: typeof p.salaryGrade === 'string' && p.salaryGrade.trim() ? p.salaryGrade.trim() : rec.payrollSummary.salaryGrade,
      basicSalary: toNum(p.basicSalary),
      allowances: null,
      deductions: null,
      bankName: typeof p.bankName === 'string' && p.bankName.trim() ? p.bankName.trim() : null,
      accountNumberMasked: typeof p.accountNumber === 'string' && p.accountNumber.trim() ? `••••••${p.accountNumber.replace(/\D/g, '').slice(-4)}` : rec.payrollSummary.accountNumberMasked,
      pensionProvider: typeof p.pensionProvider === 'string' && p.pensionProvider.trim() ? p.pensionProvider.trim() : null,
      taxId: typeof p.taxId === 'string' && p.taxId.trim() ? p.taxId.trim() : null,
      payrollGroup: typeof p.payrollGroup === 'string' && p.payrollGroup.trim() ? p.payrollGroup.trim() : null,
      lastPayrollProcessed: null,
    };
  }

  if (Array.isArray(ov.onboardingChecklist)) {
    const created = ov.onboardingChecklist.length > 0;
    if (created) {
      rec.history.unshift({
        id: `h-${employeeId}-${Math.random().toString(16).slice(2)}`,
        at: new Date().toISOString(),
        type: 'Onboarding Checklist Generated',
        detail: `Checklist items: ${ov.onboardingChecklist.length}`,
        actor: 'HRIS',
      });
    }
  }

  return rec;
};

const stripSeededProfilePageData = (employeeId: string, rec: EmployeeRecord) => {
  const generatedProfile = typeof rec.profile.photoUrl === 'string' && rec.profile.photoUrl.includes('picsum.photos');
  const generatedInsights = Array.isArray(rec.aiInsights) && rec.aiInsights.some((x) => typeof x?.id === 'string' && x.id.startsWith(`ai-${employeeId}-`));
  if (!generatedProfile && !generatedInsights) return rec;

  rec.profile.photoUrl = undefined;
  rec.profile.fullName = `Employee ${employeeId}`;
  rec.profile.jobTitle = 'Not assigned';
  rec.profile.department = 'Not assigned';
  rec.profile.businessUnit = 'Not assigned';
  rec.profile.location = 'Not assigned';
  rec.profile.employmentType = 'Not assigned';
  rec.profile.reportingManager = 'Not assigned';
  rec.profile.yearsOfService = 0;
  rec.profile.personalInfo = Object.fromEntries(Object.keys(rec.profile.personalInfo || {}).map((key) => [key, key === 'employeeId' ? employeeId : null]));
  rec.profile.employmentDetails = { employeeId, employmentStatus: rec.profile.employmentStatus };
  rec.profile.jobDetails = {};
  rec.profile.contacts = {};
  rec.overview = {
    profileCompletionPct: 0,
    leaveBalanceDays: 0,
    attendanceScore: 0,
    trainingCompliancePct: 0,
    performanceRating: '-',
    payrollStatus: 'Pending Validation',
    documentStatus: 'Missing',
    assetStatus: 'None',
    currentLeaveStatus: 'None',
    recentActivity: [],
  };
  rec.emergencyContacts = [];
  rec.nextOfKin = [];
  rec.documents = [];
  rec.leaveSummary = { balances: {}, history: [] };
  rec.attendanceSummary = { score: 0, presentDays: 0, absentDays: 0, lateComing: 0, earlyDeparture: 0, overtimeHours: 0, biometricLogs: [] };
  rec.payrollSummary = {
    payrollStatus: 'Pending Validation',
    salaryGrade: 'Not assigned',
    basicSalary: null,
    allowances: null,
    deductions: null,
    bankName: null,
    accountNumberMasked: null,
    pensionProvider: null,
    taxId: null,
    payrollGroup: null,
    lastPayrollProcessed: null,
  };
  rec.performanceSummary = { currentRating: '-', lastReviewAt: null, goals: [], managerFeedback: null, aiSignals: [] };
  rec.training = [];
  rec.assets = [];
  rec.medicalHse = { medicalFitnessStatus: null, bloodGroup: null, knownAllergies: null, medicalRestrictions: null, fitToWorkStatus: null, incidentHistory: [], hseCertifications: [] };
  rec.disciplinary = [];
  rec.history = [];
  rec.audit = [];
  rec.aiInsights = [];
  return rec;
};

const ensureRecord = (employeeId: string) => {
  const existing = store.get(employeeId);
  if (existing) return applyOverrides(employeeId, stripSeededProfilePageData(employeeId, existing));
  const next = makeRecord(employeeId);
  const merged = applyOverrides(employeeId, next);
  store.set(employeeId, merged);
  return merged;
};

const dateOnly = (value?: string | null) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return d.toISOString().slice(0, 10);
};

const isoOrNow = (value?: string | null) => {
  if (!value) return nowIso();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? nowIso() : d.toISOString();
};

const valueOrNull = (value?: string | number | boolean | null) => {
  const s = String(value ?? '').trim();
  return s ? s : null;
};

const roundLeaveDays = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

const maskAccountNumber = (value?: string | null) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits ? `••••••${digits.slice(-4)}` : null;
};

const payrollBasicAmount = (row: DleEmployeeDirectoryRow) =>
  row.periodSalary ?? row.basicSalary ?? (row.ratePerDay ? row.ratePerDay * 22 : null);

const payrollAllowancesAmount = (row: DleEmployeeDirectoryRow) => {
  if (row.latestAllowances && row.latestAllowances > 0) return row.latestAllowances;
  const basic = payrollBasicAmount(row);
  if (row.periodSalary && basic && row.periodSalary > basic) return row.periodSalary - basic;
  return null;
};

const buildDbProfileRecord = (row: DleEmployeeDirectoryRow): EmployeeRecord => {
  const rec = makeRecord(row.employeeCode);
  const profileCompletionFields = [
    row.fullName,
    row.firstName,
    row.lastName,
    row.gender,
    row.dateOfBirth,
    row.maritalStatus,
    row.nationality,
    row.officialEmail,
    row.primaryPhone,
    row.dateJoined,
    row.jobTitle,
    row.department,
    row.workLocation,
    row.managerName,
    row.payrollGroup,
    row.bankName,
    row.accountNo,
    row.taxIdentificationNumber,
    row.sourceEmployeeId,
  ];
  const profileCompletionPct = Math.round((profileCompletionFields.filter((x) => valueOrNull(x)).length / profileCompletionFields.length) * 100);
  const documentStatus: EmployeeOverview['documentStatus'] = row.documentCount > 0 ? 'Compliant' : 'Missing';
  const payrollStatus: PayrollSummary['payrollStatus'] = row.setupAssignedToPayroll ? 'Verified' : 'Pending Validation';
  const joinedIso = isoOrNow(row.dateJoined);

  rec.profile = {
    ...rec.profile,
    id: row.employeeCode,
    employeeId: row.employeeCode,
    photoUrl: row.hasPhoto ? `/api/hris/employees/${encodeURIComponent(row.employeeCode)}/photo` : undefined,
    fullName: row.fullName,
    jobTitle: row.jobTitle || 'Unassigned Job Title',
    department: row.department || 'Unassigned Department',
    businessUnit: row.businessUnit || 'Unassigned Business Unit',
    location: row.location || row.workLocation || 'Unassigned Location',
    employmentStatus: row.status as EmployeeStatus,
    employmentType: row.employmentType || 'Not assigned',
    reportingManager: row.managerName || 'Unassigned',
    dateJoined: joinedIso,
    yearsOfService: row.yearsOfService,
    personalInfo: {
      title: valueOrNull(row.title),
      firstName: valueOrNull(row.firstName),
      middleName: valueOrNull(row.middleName),
      lastName: valueOrNull(row.lastName),
      preferredName: valueOrNull(row.preferredName),
      gender: valueOrNull(row.gender),
      dateOfBirth: dateOnly(row.dateOfBirth),
      maritalStatus: valueOrNull(row.maritalStatus),
      nationality: valueOrNull(row.nationality),
      stateOfOrigin: valueOrNull(row.stateOfOrigin),
      localGovernmentArea: valueOrNull(row.localGovernmentArea),
      religion: valueOrNull(row.religion),
      languagesSpoken: valueOrNull(row.languagesSpoken),
      personalEmail: valueOrNull(row.personalEmail),
      personalPhone: valueOrNull(row.primaryPhone),
      residentialAddress: valueOrNull(row.residentialAddress),
      permanentAddress: valueOrNull(row.permanentAddress),
    },
    employmentDetails: {
      employeeId: row.employeeCode,
      employmentType: valueOrNull(row.employmentType),
      employmentStatus: valueOrNull(row.status),
      dateJoined: dateOnly(row.dateJoined),
      confirmationDate: dateOnly(row.confirmationDueDate),
      probationStartDate: dateOnly(row.probationStartDate),
      probationEndDate: dateOnly(row.probationEndDate),
      contractStartDate: dateOnly(row.contractStartDate),
      contractEndDate: dateOnly(row.contractEndDate),
      exitDate: row.status === 'Terminated' || row.status === 'Resigned' || row.status === 'Retired' ? dateOnly(row.modifiedAt) : null,
      exitReason: row.status === 'Terminated' ? 'System status marked terminated' : null,
      rehireEligibility: null,
      workLocation: valueOrNull(row.workLocation || row.location),
      workMode: row.remoteWorker ? 'Remote' : 'Onsite',
      shiftPattern: valueOrNull(row.shift),
      staffCategory: valueOrNull(row.staffCategory),
      employeeCategory: valueOrNull(row.employeeCategory),
      unionStatus: null,
    },
    jobDetails: {
      jobTitle: valueOrNull(row.jobTitle),
      designation: valueOrNull(row.designation),
      jobGrade: valueOrNull(row.jobGrade),
      department: valueOrNull(row.department),
      division: valueOrNull(row.division),
      unit: valueOrNull(row.projectSite || row.division),
      businessUnit: valueOrNull(row.businessUnit),
      costCenter: valueOrNull(row.costCenter),
      location: valueOrNull(row.location || row.workLocation),
      officeSite: valueOrNull(row.officeLocation || row.location || row.workLocation),
      projectSite: valueOrNull(row.projectSite),
      currentProject: valueOrNull(row.projectSite),
      projectName: valueOrNull(row.projectSite),
      siteLocation: valueOrNull(row.location || row.workLocation),
      reportingManager: valueOrNull(row.managerName),
      functionalManager: valueOrNull(row.functionalManager),
      departmentHead: valueOrNull(row.departmentHead),
      hrBusinessPartner: valueOrNull(row.hrBusinessPartner),
      assignmentType: valueOrNull(row.employmentType) || 'Permanent Assignment',
      assignmentStatus: valueOrNull(row.status),
      assignmentEffectiveDate: dateOnly(row.dateJoined),
      assignmentStartDate: dateOnly(row.dateJoined),
      assignmentEndDate: dateOnly(row.contractEndDate),
      roleProfile: valueOrNull(row.staffCategory || row.employeeCategory),
      jobDescription: valueOrNull(row.jobTitle) ? `Role imported from ${row.sourceSystem || 'DLE_Enterprise HRIS'}.` : null,
      keyResponsibilities: null,
    },
    contacts: {
      officialEmail: valueOrNull(row.officialEmail),
      personalEmail: valueOrNull(row.personalEmail),
      officeExtension: valueOrNull(row.officeExtension),
      primaryPhone: valueOrNull(row.primaryPhone),
      alternativePhone: valueOrNull(row.alternatePhone),
      nearestBusStop: valueOrNull(row.nearestBusStop),
      city: valueOrNull(row.city),
      state: valueOrNull(row.state),
      country: valueOrNull(row.country),
      postalCode: valueOrNull(row.postalCode),
    },
  };

  rec.overview = {
    profileCompletionPct,
    leaveBalanceDays: 0,
    attendanceScore: row.status === 'Active' ? 92 : 0,
    trainingCompliancePct: row.trainingCompliance === 'Compliant' ? 100 : row.trainingCompliance === 'At Risk' ? 65 : 30,
    performanceRating: '-',
    payrollStatus,
    documentStatus,
    assetStatus: 'None',
    currentLeaveStatus: row.status === 'On Leave' ? 'On Leave' : 'None',
    recentActivity: [
      { id: `ra-${row.employeeCode}-source`, at: row.modifiedAt || row.createdAt || nowIso(), title: 'Source record synchronized', detail: `${row.sourceSystem || 'DLE_Enterprise HRIS'} employee profile loaded.`, actor: 'System' },
      { id: `ra-${row.employeeCode}-profile`, at: nowIso(), title: 'Profile opened', detail: '360 profile generated from DLE_Enterprise employee entities.', actor: 'HRIS' },
    ],
  };

  rec.payrollSummary = {
    payrollStatus,
    salaryGrade: row.salaryGrade || row.employmentType || row.jobGrade || 'Not assigned',
    basicSalary: payrollBasicAmount(row),
    allowances: payrollAllowancesAmount(row),
    deductions: row.latestDeductions && row.latestDeductions > 0 ? row.latestDeductions : null,
    bankName: valueOrNull(row.bankName),
    accountNumberMasked: maskAccountNumber(row.accountNo),
    pensionProvider: valueOrNull(row.pensionProvider),
    taxId: valueOrNull(row.taxIdentificationNumber),
    payrollGroup: [row.payrollGroup, row.payCurrency, row.paymentRun].filter(Boolean).join(' / ') || null,
    lastPayrollProcessed: row.modifiedAt || row.createdAt || null,
  };

  rec.emergencyContacts = [];
  rec.documents = row.documentCount > 0 ? rec.documents.slice(0, row.documentCount) : [];
  rec.leaveSummary = { balances: {}, history: [] };
  rec.attendanceSummary = { score: rec.overview.attendanceScore, presentDays: 0, absentDays: 0, lateComing: 0, earlyDeparture: 0, overtimeHours: 0, biometricLogs: [] };
  rec.performanceSummary = { currentRating: '-', lastReviewAt: null, goals: [], managerFeedback: null, aiSignals: [] };
  rec.training = [];
  rec.assets = [];
  rec.medicalHse = { medicalFitnessStatus: null, bloodGroup: null, knownAllergies: null, medicalRestrictions: null, fitToWorkStatus: null, incidentHistory: [], hseCertifications: [] };
  rec.disciplinary = [];
  rec.history = [
    { id: `hist-${row.employeeCode}-joined`, at: joinedIso, type: 'Date Joined', detail: `Employee joined as ${row.employmentType || 'employee'}.`, actor: row.sourceSystem || 'DLE_Enterprise HRIS' },
    { id: `hist-${row.employeeCode}-source`, at: row.createdAt || nowIso(), type: 'Source Import', detail: `Source employee ID ${row.sourceEmployeeId || 'not recorded'} imported into HRIS.`, actor: 'Sage Payroll Import' },
  ];
  rec.audit = [
    auditEntry('Viewed profile', 'HR Manager'),
    auditEntry('Loaded from DLE_Enterprise HRIS', 'System', { newValue: row.employeeCode }),
  ];
  rec.aiInsights = [
    ...(row.emergencyContactCount === 0
      ? [{ id: `ai-${row.employeeCode}-emergency`, severity: 'high' as const, confidence: 0.92, title: 'Emergency contact missing', recommendation: 'Add at least one verified emergency contact and next of kin record.', actionLabel: 'Open Emergency', action: 'tab.emergency' }]
      : []),
    ...(row.documentCount === 0
      ? [{ id: `ai-${row.employeeCode}-docs`, severity: 'medium' as const, confidence: 0.86, title: 'No employee documents recorded', recommendation: 'Upload employment letter, government ID and onboarding documents.', actionLabel: 'Open Documents', action: 'tab.documents' }]
      : []),
    ...(row.hasManagerAssigned
      ? []
      : [{ id: `ai-${row.employeeCode}-manager`, severity: 'medium' as const, confidence: 0.84, title: 'Reporting manager unassigned', recommendation: 'Assign a reporting manager to complete organization controls.', actionLabel: 'Open Job', action: 'tab.job' }]),
  ];

  return rec;
};

const persistHrisProfileToEnterprise = async (rec: EmployeeRecord, options?: { replaceEmergencyContacts?: boolean }) => {
  const employeeCode = rec.profile.employeeId;
  if (!employeeCode) return;
  try {
    const synced = await syncHrisEmployeeProfileToDb({
      employeeCode,
      fullName: rec.profile.fullName,
      preferredName: rec.profile.personalInfo?.preferredName,
      jobTitle: rec.profile.jobTitle,
      department: rec.profile.department,
      businessUnit: rec.profile.businessUnit,
      reportingManager: rec.profile.reportingManager,
      employmentStatus: rec.profile.employmentStatus,
      employmentType: rec.profile.employmentType,
      personalInfo: rec.profile.personalInfo,
      contacts: rec.profile.contacts,
      employmentDetails: rec.profile.employmentDetails,
      jobDetails: rec.profile.jobDetails,
      payrollSetup: {
        payrollGroup: rec.payrollSummary.payrollGroup,
        salaryGrade: rec.payrollSummary.salaryGrade,
        periodSalary: rec.payrollSummary.basicSalary,
        bankName: rec.payrollSummary.bankName,
        pensionProvider: rec.payrollSummary.pensionProvider,
        taxIdentificationNumber: rec.payrollSummary.taxId,
      },
      emergencyContacts: rec.emergencyContacts.map((contact) => ({
        id: contact.id,
        fullName: contact.fullName,
        relationship: contact.relationship,
        phoneNumber: contact.phoneNumber,
        alternativePhone: contact.alternativePhone,
        email: contact.email,
        address: contact.address ?? undefined,
        isPrimary: contact.isPrimary,
        isNextOfKin: contact.isNextOfKin,
        isBeneficiary: contact.isBeneficiary,
      })),
      replaceEmergencyContacts: options?.replaceEmergencyContacts,
    });
    if (synced) invalidateHrisEmployeeCaches();
  } catch (error) {
    console.error('Failed to persist HRIS profile to DLE_Enterprise', error);
  }
};

const persistEmergencyContactsToEnterprise = async (rec: EmployeeRecord) =>
  persistHrisProfileToEnterprise(rec, { replaceEmergencyContacts: true });

const ensureRecordFromDb = async (employeeId: string) => {
  const employeeSource = await readDirectoryEmployees();
  const found = employeeSource.employees.find((row) => row.employeeCode.toLowerCase() === employeeId.toLowerCase() || row.employeeId.toLowerCase() === employeeId.toLowerCase());
  if (!found) return ensureRecord(employeeId);
  const record = applyOverrides(found.employeeCode, buildDbProfileRecord(found));
  const [leaveSummary, emergencyContacts, documents, extensions] = await Promise.all([
    ensureEmployeeLeaveFromSage(found),
    readEmployeeEmergencyContactsFromDb(found.employeeCode),
    readEmployeeProfileDocumentsFromDb(found.employeeCode),
    readEmployeeProfileExtensions(found.employeeCode),
  ]);
  record.leaveSummary = leaveSummary;
  record.overview.leaveBalanceDays = roundLeaveDays(
    leaveSummary.balances['Annual Leave']
    ?? leaveSummary.balances.Annual
    ?? Object.entries(leaveSummary.balances).find(([key]) => key.toLowerCase().includes('annual'))?.[1]
    ?? 0,
  );
  if (emergencyContacts.length) record.emergencyContacts = emergencyContacts;
  if (documents.length) record.documents = documents;
  if (extensions.medicalHse) record.medicalHse = extensions.medicalHse;
  if (extensions.training?.length) record.training = extensions.training;
  if (extensions.assets?.length) record.assets = extensions.assets;
  if (extensions.performanceSummary) record.performanceSummary = extensions.performanceSummary;
  if (extensions.disciplinary?.length) record.disciplinary = extensions.disciplinary;
  record.payrollClassification = found.payrollClassification || contractPayrollClassification(found);
  store.set(found.employeeCode, record);
  return record;
};

const getRole = (request: Request): Role => {
  const v = request.headers.get('x-hris-role');
  const all: Role[] = [
    'Super Admin',
    'HR Director',
    'HR Manager',
    'HR Officer',
    'Admin Officer',
    'Legal Officer',
    'Department Head',
    'Line Manager',
    'Payroll Officer',
    'HSE Officer',
    'Compliance Officer',
    'Auditor',
    'IT Administrator',
    'Employee',
    'Executive Management',
  ];
  return (all.includes(v as Role) ? (v as Role) : 'HR Manager') as Role;
};

const getViewerEmployeeId = (request: Request) => {
  const v = request.headers.get('x-hris-employee-id');
  return v && v.trim() ? v.trim() : undefined;
};

const getResource = (segments: string[]) => ({
  root: segments[0] || '',
  rest: segments.slice(1),
});

const sanitizeProfileForRole = (rec: EmployeeRecord, perms: ReturnType<typeof rolePermissions>) => {
  const profile: EmployeeProfile = JSON.parse(JSON.stringify(rec.profile)) as EmployeeProfile;
  if (!perms.canViewSensitivePersonal) {
    const p = profile.personalInfo;
    p.dateOfBirth = null;
    p.maritalStatus = null;
    p.religion = null;
    p.residentialAddress = null;
    p.permanentAddress = null;
    p.personalPhone = null;
  }
  if (!perms.canViewDocuments) {
    profile.personalInfo.personalEmail = null;
  }
  return profile;
};

type ProfilePayload = EmployeeProfile & {
  overview: EmployeeOverview;
  emergencyContacts: EmergencyContact[];
  documents: DocumentItem[];
  leaveSummary: LeaveSummary;
  attendanceSummary: AttendanceSummary;
  payrollSummary: PayrollSummary;
  performanceSummary: PerformanceSummary;
  training: TrainingRecord[];
  assets: AssetItem[];
  medicalHse: MedicalHSE | null;
  disciplinary: DisciplinaryRecord[] | null;
  history: HistoryEvent[];
  aiInsights: AIInsight[];
  payrollClassification?: ContractPayrollClassification;
};

const sanitizePayrollForRole = (payroll: PayrollSummary, perms: ReturnType<typeof rolePermissions>): PayrollSummary => {
  if (perms.canViewPayroll) return payroll;
  return {
    payrollStatus: 'Masked',
    salaryGrade: payroll.salaryGrade,
    basicSalary: null,
    allowances: null,
    deductions: null,
    bankName: null,
    accountNumberMasked: payroll.accountNumberMasked ? payroll.accountNumberMasked : null,
    pensionProvider: null,
    taxId: null,
    payrollGroup: null,
    lastPayrollProcessed: null,
  };
};

const sanitizePayloadForRole = (rec: EmployeeRecord, perms: ReturnType<typeof rolePermissions>): ProfilePayload => {
  const profile = sanitizeProfileForRole(rec, perms);
  const overview = perms.canViewPayroll ? rec.overview : ({ ...rec.overview, payrollStatus: 'Masked' } satisfies EmployeeOverview);
  return {
    ...profile,
    overview,
    emergencyContacts: rec.emergencyContacts,
    documents: perms.canViewDocuments ? rec.documents : [],
    leaveSummary: rec.leaveSummary,
    attendanceSummary: rec.attendanceSummary,
    payrollSummary: sanitizePayrollForRole(rec.payrollSummary, perms),
    performanceSummary: rec.performanceSummary,
    training: rec.training,
    assets: rec.assets,
    medicalHse: perms.canViewMedical ? rec.medicalHse : null,
    disciplinary: perms.canViewDisciplinary ? rec.disciplinary : null,
    history: rec.history,
    aiInsights: rec.aiInsights,
    payrollClassification: rec.payrollClassification,
  };
};

const validateEmergencyContacts = (items: EmergencyContact[]) => {
  if (items.length < 1) return 'At least one emergency contact is required';
  if (!items.some((c) => c.isPrimary)) return 'One emergency contact must be marked as primary';
  if (items.filter((c) => c.isPrimary).length > 1) return 'Only one emergency contact can be marked as primary';
  const totalBeneficiaryPct = items.reduce((acc, c) => acc + (c.isBeneficiary ? (typeof c.beneficiaryPercentage === 'number' ? c.beneficiaryPercentage : 0) : 0), 0);
  if (totalBeneficiaryPct > 100) return 'Beneficiary percentage total cannot exceed 100%';
  for (const c of items) {
    if (!c.fullName.trim()) return 'Emergency contact full name is required';
    if (!c.relationship.trim()) return 'Emergency contact relationship is required';
    if (!validatePhone(c.phoneNumber)) return 'Emergency contact phone number is invalid';
    if (c.email && !validateEmail(c.email)) return 'Emergency contact email address is invalid';
  }
  return null;
};

const validateNextOfKin = (items: NextOfKinRecord[], employmentStatus?: string | null) => {
  const status = (employmentStatus || '').toString();
  if (status === 'Active' && items.length < 1) return 'At least one next of kin is required for active employees';
  if (items.length < 1) return null;
  if (!items.some((c) => c.isPrimary)) return 'One next of kin must be marked as primary';
  if (items.filter((c) => c.isPrimary).length > 1) return 'Only one primary next of kin is allowed';
  const totalBeneficiaryPct = items.reduce(
    (acc, c) => acc + (c.beneficiary?.isBeneficiary ? (typeof c.beneficiary?.beneficiaryPercentage === 'number' ? c.beneficiary.beneficiaryPercentage : 0) : 0),
    0
  );
  if (totalBeneficiaryPct > 100) return 'Total beneficiary percentage cannot exceed 100%';
  for (const c of items) {
    if (!c.fullName.trim()) return 'Full name is required';
    if (!c.relationship.trim()) return 'Relationship is required';
    if (!validatePhone(c.primaryPhone)) return 'Primary phone number must be valid';
    if (c.email && !validateEmail(c.email)) return 'Email must be valid';
  }
  return null;
};

export async function GET(request: Request, ctx: { params: Promise<{ id: string; resource: string[] }> }) {
  const { id, resource } = await ctx.params;
  const employeeId = id;
  const role = getRole(request);
  const viewerEmployeeId = getViewerEmployeeId(request);
  if (role === 'Employee' && (!viewerEmployeeId || viewerEmployeeId !== employeeId)) return jsonErr(403, 'Permission denied');
  const perms = rolePermissions(role, employeeId, viewerEmployeeId);
  if (!perms.canViewProfile) return jsonErr(403, 'Permission denied');

  const rec = await ensureRecordFromDb(employeeId);
  const { root, rest } = getResource(resource);
  if (!root) return jsonErr(404, 'Not found');

  if (root === 'profile') return jsonOk(sanitizePayloadForRole(rec, perms));
  if (root === 'overview') {
    if (perms.canViewPayroll) return jsonOk(rec.overview);
    return jsonOk({ ...rec.overview, payrollStatus: 'Masked' } satisfies EmployeeOverview);
  }
  if (root === 'personal-info') return jsonOk(sanitizeProfileForRole(rec, perms).personalInfo);
  if (root === 'employment') return jsonOk(rec.profile.employmentDetails);
  if (root === 'job') return jsonOk(rec.profile.jobDetails);
  if (root === 'contacts') return jsonOk(rec.profile.contacts);
  if (root === 'emergency-contacts') return jsonOk(rec.emergencyContacts);
  if (root === 'next-of-kin') return jsonOk(rec.nextOfKin);
  if (root === 'documents') {
    if (!perms.canViewDocuments) return jsonErr(403, 'Permission denied');
    const canAccess = (doc: DocumentItem) => {
      const conf = (doc.confidentialityLevel || 'Internal') as DocumentItem['confidentialityLevel'];
      if (conf === 'Restricted') {
        const allowRestricted = new Set<Role>(['Super Admin', 'HR Director', 'HR Manager', 'Legal Officer', 'Compliance Officer', 'Auditor']);
        if (!allowRestricted.has(role)) return false;
      }
      if (conf === 'Confidential') {
        const allowConfidential = new Set<Role>([
          'Super Admin',
          'HR Director',
          'HR Manager',
          'HR Officer',
          'Admin Officer',
          'Legal Officer',
          'Compliance Officer',
          'Payroll Officer',
          'Auditor',
          'Executive Management',
        ]);
        if (!allowConfidential.has(role)) return false;
      }
      if (role === 'Payroll Officer') {
        return doc.category === 'Tax Document' || doc.category === 'Pension Document' || doc.category === 'BVN';
      }
      if (role === 'HSE Officer') {
        return doc.category === 'Medical Certificate' || doc.category === 'HSE Certificate' || doc.category === 'Training Certificate';
      }
      if (role === 'Compliance Officer') {
        return ['Government ID', 'NIN', 'BVN', 'International Passport', 'Tax Document', 'Pension Document', 'Medical Certificate', 'HSE Certificate'].includes(doc.category);
      }
      if (role === 'Legal Officer') {
        return [
          'Signed Employment Contract',
          'Offer Letter',
          'Employment Letter',
          'Promotion Letter',
          'Transfer Letter',
          'Warning Letter',
          'Disciplinary Letter',
          'Contract Renewal Letter',
          'Exit Document',
          'Clearance Form',
          'Other Document',
        ].includes(doc.category);
      }
      if (role === 'Line Manager') {
        if (conf === 'Confidential' || conf === 'Restricted') return false;
        return doc.status === 'Verified' || doc.status === 'Not Required';
      }
      if (role === 'Employee') {
        if (conf === 'Restricted') return false;
        return true;
      }
      return true;
    };
    const visible = (rec.documents || []).filter((d) => d && typeof d === 'object').filter((d) => canAccess(d as DocumentItem));
    return jsonOk(visible);
  }
  if (root === 'timeline') {
    const url = new URL(request.url);
    if (role === 'Executive Management') {
      if (rest[0] === 'summary' || rest[0] === 'analytics') {
      } else {
        return jsonErr(403, 'Permission denied');
      }
    }

    type Severity = 'high' | 'medium' | 'low';
    type Visibility = 'HR Only' | 'Manager Visible' | 'Employee Visible' | 'Audit Only' | 'Executive Visible';
    type EventCategory =
      | 'Employment'
      | 'Job Information'
      | 'Department Assignment'
      | 'Reporting Line'
      | 'Contract'
      | 'Status Change'
      | 'Emergency Contact'
      | 'Next of Kin'
      | 'Documents'
      | 'Leave'
      | 'Attendance'
      | 'Payroll'
      | 'Performance'
      | 'Training'
      | 'Assets'
      | 'Disciplinary'
      | 'Medical / HSE'
      | 'Compliance'
      | 'System Access'
      | 'Audit';
    type ApprovalStatus = 'Not Applicable' | 'Pending' | 'Approved' | 'Rejected';

    type TimelineEvent = {
      id: string;
      employeeId: string;
      eventReferenceNo: string;
      eventCategory: EventCategory;
      eventType: string;
      eventTitle: string;
      eventDescription: string;
      eventDate: string;
      effectiveDate?: string | null;
      sourceModule: string;
      sourceRecordId?: string | null;
      relatedWorkflowId?: string | null;
      relatedDocumentId?: string | null;
      previousValue?: string | null;
      newValue?: string | null;
      reason?: string | null;
      severity: Severity;
      visibility: Visibility;
      isSystemGenerated: boolean;
      approvalStatus: ApprovalStatus;
      createdBy: string;
      approvedBy?: string | null;
      approvedAt?: string | null;
      createdAt: string;
      updatedAt: string;
    };

    const stores = () => {
      const g = globalThis as unknown as {
        __dleHrisTimelineManualByEmployee?: Map<string, TimelineEvent[]>;
        __dleHrisTimelineManualById?: Map<string, TimelineEvent>;
        __dleHrisTimelineComments?: Map<string, any[]>;
        __dleHrisDocumentVersions?: Map<string, any[]>;
        __dleHrisDocumentAudits?: Map<string, any[]>;
        __dleHrisContracts?: Map<string, any>;
        __dleHrisContractsByEmployee?: Map<string, string[]>;
        __dleHrisStatusHistoryByEmployee?: Map<string, any[]>;
      };
      if (!g.__dleHrisTimelineManualByEmployee) g.__dleHrisTimelineManualByEmployee = new Map();
      if (!g.__dleHrisTimelineManualById) g.__dleHrisTimelineManualById = new Map();
      if (!g.__dleHrisTimelineComments) g.__dleHrisTimelineComments = new Map();
      if (!g.__dleHrisDocumentVersions) g.__dleHrisDocumentVersions = new Map();
      if (!g.__dleHrisDocumentAudits) g.__dleHrisDocumentAudits = new Map();
      if (!g.__dleHrisContracts) g.__dleHrisContracts = new Map();
      if (!g.__dleHrisContractsByEmployee) g.__dleHrisContractsByEmployee = new Map();
      if (!g.__dleHrisStatusHistoryByEmployee) g.__dleHrisStatusHistoryByEmployee = new Map();
      return {
        manualByEmployee: g.__dleHrisTimelineManualByEmployee,
        manualById: g.__dleHrisTimelineManualById,
        comments: g.__dleHrisTimelineComments,
        docVersions: g.__dleHrisDocumentVersions,
        docAudits: g.__dleHrisDocumentAudits,
        contracts: g.__dleHrisContracts,
        contractsByEmployee: g.__dleHrisContractsByEmployee,
        statusHistoryByEmployee: g.__dleHrisStatusHistoryByEmployee,
      };
    };

    const sanitizeKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'x';
    const safeSeg = (s: string) => (s || 'na').replace(/__/g, '-').slice(0, 140);
    const eventId = (empId: string, module: string, sourceId: string, typeKey: string) => `tl__${safeSeg(empId)}__${sanitizeKey(module)}__${safeSeg(sourceId)}__${sanitizeKey(typeKey)}`;
    const refNo = (empId: string, typeKey: string, sourceId: string) => `TL-${empId}-${sanitizeKey(typeKey).slice(0, 10).toUpperCase()}-${sanitizeKey(sourceId).slice(0, 10).toUpperCase()}`;

    const normalizeDate = (v: unknown) => {
      const s = normalizeStr(v, 40);
      if (!s) return null;
      const ms = new Date(s.includes('T') ? s : `${s}T00:00:00.000Z`).getTime();
      if (!Number.isFinite(ms)) return null;
      return s.includes('T') ? s : `${s}T00:00:00.000Z`;
    };

    const canViewEvent = (ev: TimelineEvent) => {
      if (role === 'Super Admin' || role === 'HR Director' || role === 'HR Manager' || role === 'HR Officer' || role === 'Admin Officer') return true;
      if (role === 'Auditor') return true;
      if (role === 'Executive Management') return ev.visibility === 'Executive Visible';
      if (role === 'Employee') return ev.visibility === 'Employee Visible';
      if (role === 'Line Manager' || role === 'Department Head') return ev.visibility === 'Manager Visible' || ev.visibility === 'Employee Visible';
      if (role === 'Payroll Officer') return ev.eventCategory === 'Payroll';
      if (role === 'HSE Officer') return ev.eventCategory === 'Medical / HSE' || ev.eventCategory === 'Emergency Contact' || (ev.eventCategory === 'Documents' && /medical|hse/i.test(ev.eventTitle));
      if (role === 'Compliance Officer') return ev.eventCategory === 'Compliance' || ev.eventCategory === 'Audit' || (ev.eventCategory === 'Documents' && /(nin|bvn|passport|tax|pension|id)/i.test(ev.eventTitle));
      if (role === 'Legal Officer') return ev.eventCategory === 'Contract' || (ev.eventCategory === 'Documents' && /(contract|offer|employment|warning|disciplinary)/i.test(ev.eventTitle)) || ev.eventCategory === 'Audit';
      if (role === 'IT Administrator') return ev.eventCategory === 'System Access' || ev.eventCategory === 'Audit';
      return false;
    };

    const buildTimeline = () => {
      const out: TimelineEvent[] = [];
      const nowFixed = nowIso();
      const nowFixedMs = new Date(nowFixed).getTime();
      const nowFixedIso = () => nowFixed;

      const add = (ev: Omit<TimelineEvent, 'employeeId' | 'createdAt' | 'updatedAt'> & { createdAt?: string; updatedAt?: string }) => {
        const row: TimelineEvent = {
          ...ev,
          employeeId,
          createdAt: ev.createdAt || ev.eventDate || nowFixedIso(),
          updatedAt: ev.updatedAt || ev.eventDate || nowFixedIso(),
        };
        if (canViewEvent(row)) out.push(row);
      };

      const mapAuditToCategory = (action: string): EventCategory => {
        const a = (action || '').toLowerCase();
        if (a.includes('document')) return 'Documents';
        if (a.includes('status')) return 'Status Change';
        if (a.includes('contract')) return 'Contract';
        if (a.includes('assignment') || a.includes('department') || a.includes('unit')) return 'Department Assignment';
        if (a.includes('manager') || a.includes('reporting')) return 'Reporting Line';
        if (a.includes('emergency')) return 'Emergency Contact';
        if (a.includes('next of kin')) return 'Next of Kin';
        if (a.includes('leave')) return 'Leave';
        if (a.includes('attendance') || a.includes('biometric')) return 'Attendance';
        if (a.includes('payroll')) return 'Payroll';
        if (a.includes('training')) return 'Training';
        if (a.includes('asset')) return 'Assets';
        if (a.includes('disciplinary')) return 'Disciplinary';
        if (a.includes('hse') || a.includes('medical')) return 'Medical / HSE';
        return 'Audit';
      };

      for (const h of (rec.history || []).slice(0, 250)) {
        const ms = new Date(h.at).getTime();
        if (!Number.isFinite(ms)) continue;
        add({
          id: eventId(employeeId, 'EmploymentHistory', h.id, h.type),
          eventReferenceNo: refNo(employeeId, h.type, h.id),
          eventCategory: h.type.toLowerCase().includes('job') || h.type.toLowerCase().includes('assignment') ? 'Employment' : 'Employment',
          eventType: h.type,
          eventTitle: h.type,
          eventDescription: h.detail || 'Employment lifecycle event recorded.',
          eventDate: h.at,
          effectiveDate: h.at,
          sourceModule: 'Employment History',
          sourceRecordId: h.id,
          relatedWorkflowId: null,
          relatedDocumentId: null,
          previousValue: null,
          newValue: null,
          reason: null,
          severity: 'low',
          visibility: 'Employee Visible',
          isSystemGenerated: true,
          approvalStatus: 'Not Applicable',
          createdBy: h.actor || 'System',
          approvedBy: null,
          approvedAt: null,
        });
      }

      for (const a of (rec.audit || []).slice(0, 400)) {
        add({
          id: eventId(employeeId, 'Audit', a.id, a.action),
          eventReferenceNo: refNo(employeeId, 'audit', a.id),
          eventCategory: mapAuditToCategory(a.action),
          eventType: a.action,
          eventTitle: a.action,
          eventDescription: [a.reason ? `Reason: ${a.reason}` : null, a.oldValue ? `Old: ${a.oldValue}` : null, a.newValue ? `New: ${a.newValue}` : null].filter(Boolean).join(' • ') || 'Audit event.',
          eventDate: a.at,
          effectiveDate: a.at,
          sourceModule: 'Audit',
          sourceRecordId: a.id,
          relatedWorkflowId: null,
          relatedDocumentId: null,
          previousValue: a.oldValue || null,
          newValue: a.newValue || null,
          reason: a.reason || null,
          severity: a.action.toLowerCase().includes('denied') ? 'high' : a.action.toLowerCase().includes('rejected') ? 'medium' : 'low',
          visibility: 'Audit Only',
          isSystemGenerated: true,
          approvalStatus: 'Not Applicable',
          createdBy: a.performedBy || 'System',
          approvedBy: null,
          approvedAt: null,
        });
      }

      for (const d of (rec.documents || []).slice(0, 250)) {
        add({
          id: eventId(employeeId, 'Documents', d.id, 'uploaded'),
          eventReferenceNo: refNo(employeeId, 'doc_upload', d.id),
          eventCategory: 'Documents',
          eventType: 'Document Uploaded',
          eventTitle: `${d.category} uploaded`,
          eventDescription: `File: ${d.fileName} • Status: ${d.status} • Confidentiality: ${d.confidentialityLevel || 'Internal'}`,
          eventDate: d.uploadedAt,
          effectiveDate: d.issueDate || null,
          sourceModule: 'Documents',
          sourceRecordId: d.id,
          relatedWorkflowId: null,
          relatedDocumentId: d.id,
          previousValue: null,
          newValue: null,
          reason: d.notes || null,
          severity: d.status === 'Rejected' ? 'medium' : d.status === 'Expired' ? 'high' : 'low',
          visibility: d.confidentialityLevel === 'Restricted' ? 'HR Only' : 'Employee Visible',
          isSystemGenerated: true,
          approvalStatus: d.status === 'Verified' ? 'Approved' : d.status === 'Rejected' ? 'Rejected' : d.status === 'Pending Verification' ? 'Pending' : 'Not Applicable',
          createdBy: d.uploadedBy || 'System',
          approvedBy: d.verifiedBy || null,
          approvedAt: d.verifiedAt || null,
        });
        if (d.verifiedAt) {
          add({
            id: eventId(employeeId, 'Documents', d.id, d.status === 'Rejected' ? 'rejected' : 'verified'),
            eventReferenceNo: refNo(employeeId, d.status === 'Rejected' ? 'doc_reject' : 'doc_verify', d.id),
            eventCategory: 'Documents',
            eventType: d.status === 'Rejected' ? 'Document Rejected' : 'Document Verified',
            eventTitle: `${d.category} ${d.status === 'Rejected' ? 'rejected' : 'verified'}`,
            eventDescription: d.status === 'Rejected' ? `Rejected: ${d.notes || 'No reason provided'}` : `Verified via ${d.verifiedBy || 'HR Review'}`,
            eventDate: d.verifiedAt,
            effectiveDate: d.verifiedAt,
            sourceModule: 'Documents',
            sourceRecordId: d.id,
            relatedWorkflowId: null,
            relatedDocumentId: d.id,
            previousValue: null,
            newValue: d.status,
            reason: d.notes || null,
            severity: d.status === 'Rejected' ? 'medium' : 'low',
            visibility: d.confidentialityLevel === 'Restricted' ? 'HR Only' : 'Employee Visible',
            isSystemGenerated: true,
            approvalStatus: d.status === 'Rejected' ? 'Rejected' : 'Approved',
            createdBy: d.verifiedBy || 'System',
            approvedBy: d.verifiedBy || null,
            approvedAt: d.verifiedAt,
          });
        }
        if (d.archivedAt) {
          add({
            id: eventId(employeeId, 'Documents', d.id, 'archived'),
            eventReferenceNo: refNo(employeeId, 'doc_archive', d.id),
            eventCategory: 'Documents',
            eventType: 'Document Archived',
            eventTitle: `${d.category} archived`,
            eventDescription: d.archiveReason || 'Archived',
            eventDate: d.archivedAt,
            effectiveDate: d.archivedAt,
            sourceModule: 'Documents',
            sourceRecordId: d.id,
            relatedWorkflowId: null,
            relatedDocumentId: d.id,
            previousValue: null,
            newValue: 'Archived',
            reason: d.archiveReason || null,
            severity: 'low',
            visibility: 'HR Only',
            isSystemGenerated: true,
            approvalStatus: 'Approved',
            createdBy: d.uploadedBy || 'System',
            approvedBy: null,
            approvedAt: null,
          });
        }
        if (d.expiresAt) {
          const exp = normalizeDate(d.expiresAt);
          if (exp) {
            const expMs = new Date(exp).getTime();
            if (Number.isFinite(expMs) && Number.isFinite(nowFixedMs) && expMs < nowFixedMs) {
              add({
                id: eventId(employeeId, 'Documents', d.id, 'expired'),
                eventReferenceNo: refNo(employeeId, 'doc_expired', d.id),
                eventCategory: 'Documents',
                eventType: 'Document Expired',
                eventTitle: `${d.category} expired`,
                eventDescription: `Expired at ${exp.slice(0, 10)} • Renewal required`,
                eventDate: exp,
                effectiveDate: exp,
                sourceModule: 'Documents',
                sourceRecordId: d.id,
                relatedWorkflowId: null,
                relatedDocumentId: d.id,
                previousValue: 'Valid',
                newValue: 'Expired',
                reason: null,
                severity: 'high',
                visibility: d.confidentialityLevel === 'Restricted' ? 'HR Only' : 'Employee Visible',
                isSystemGenerated: true,
                approvalStatus: 'Not Applicable',
                createdBy: 'System',
                approvedBy: null,
                approvedAt: null,
              });
            }
          }
        }
        const dv = stores().docVersions.get(d.id) || [];
        for (const v of dv) {
          if (!v || typeof v !== 'object') continue;
          const changedAt = normalizeDate((v as any).changedAt);
          if (!changedAt) continue;
          const verNo = typeof (v as any).versionNumber === 'number' ? (v as any).versionNumber : null;
          if (!verNo || verNo <= 1) continue;
          add({
            id: eventId(employeeId, 'Documents', `${d.id}_${verNo}`, 'replaced'),
            eventReferenceNo: refNo(employeeId, 'doc_replace', `${d.id}_${verNo}`),
            eventCategory: 'Documents',
            eventType: 'Document Replaced',
            eventTitle: `${d.category} replaced (v${verNo})`,
            eventDescription: `Previous: ${(v as any).previousFileName || '—'} • New: ${(v as any).newFileName || '—'} • Reason: ${(v as any).reason || 'Replacement'}`,
            eventDate: changedAt,
            effectiveDate: changedAt,
            sourceModule: 'Documents',
            sourceRecordId: d.id,
            relatedWorkflowId: null,
            relatedDocumentId: d.id,
            previousValue: String((v as any).previousFileName || ''),
            newValue: String((v as any).newFileName || ''),
            reason: String((v as any).reason || ''),
            severity: d.status === 'Verified' ? 'medium' : 'low',
            visibility: d.confidentialityLevel === 'Restricted' ? 'HR Only' : 'Employee Visible',
            isSystemGenerated: true,
            approvalStatus: 'Not Applicable',
            createdBy: String((v as any).changedBy || 'System'),
            approvedBy: null,
            approvedAt: null,
          });
        }
      }

      for (const t of (rec.training || []).slice(0, 200)) {
        if (t.completionDate) {
          add({
            id: eventId(employeeId, 'Training', t.id, 'completed'),
            eventReferenceNo: refNo(employeeId, 'training_completed', t.id),
            eventCategory: 'Training',
            eventType: 'Training Completed',
            eventTitle: `${t.trainingName} completed`,
            eventDescription: `Provider: ${t.provider} • Status: ${t.status}`,
            eventDate: t.completionDate.includes('T') ? t.completionDate : `${t.completionDate}T00:00:00.000Z`,
            effectiveDate: t.completionDate,
            sourceModule: 'Training',
            sourceRecordId: t.id,
            relatedWorkflowId: null,
            relatedDocumentId: null,
            previousValue: null,
            newValue: t.status,
            reason: null,
            severity: t.status === 'Expired' ? 'high' : 'low',
            visibility: 'Employee Visible',
            isSystemGenerated: true,
            approvalStatus: 'Not Applicable',
            createdBy: 'System',
            approvedBy: null,
            approvedAt: null,
          });
        }
        if (t.expiryDate) {
          add({
            id: eventId(employeeId, 'Training', t.id, 'expiry'),
            eventReferenceNo: refNo(employeeId, 'training_expiry', t.id),
            eventCategory: 'Training',
            eventType: 'Certification Expiry',
            eventTitle: `${t.trainingName} expiry`,
            eventDescription: `Expiry date: ${t.expiryDate}`,
            eventDate: t.expiryDate.includes('T') ? t.expiryDate : `${t.expiryDate}T00:00:00.000Z`,
            effectiveDate: t.expiryDate,
            sourceModule: 'Training',
            sourceRecordId: t.id,
            relatedWorkflowId: null,
            relatedDocumentId: null,
            previousValue: 'Valid',
            newValue: t.status,
            reason: null,
            severity: t.status === 'Expired' ? 'high' : 'medium',
            visibility: 'Employee Visible',
            isSystemGenerated: true,
            approvalStatus: 'Not Applicable',
            createdBy: 'System',
            approvedBy: null,
            approvedAt: null,
          });
        }
      }

      for (const a of (rec.assets || []).slice(0, 200)) {
        add({
          id: eventId(employeeId, 'Assets', a.id, 'assigned'),
          eventReferenceNo: refNo(employeeId, 'asset_assigned', a.id),
          eventCategory: 'Assets',
          eventType: `${a.assetType} Assigned`,
          eventTitle: `${a.assetName} assigned`,
          eventDescription: `Tag: ${a.assetTag} • Condition: ${a.condition} • Status: ${a.returnStatus}`,
          eventDate: a.assignedDate.includes('T') ? a.assignedDate : `${a.assignedDate}T00:00:00.000Z`,
          effectiveDate: a.assignedDate,
          sourceModule: 'Assets',
          sourceRecordId: a.id,
          relatedWorkflowId: null,
          relatedDocumentId: null,
          previousValue: null,
          newValue: 'Assigned',
          reason: null,
          severity: 'low',
          visibility: 'Employee Visible',
          isSystemGenerated: true,
          approvalStatus: 'Not Applicable',
          createdBy: 'System',
          approvedBy: null,
          approvedAt: null,
        });
        if (a.returnDate) {
          add({
            id: eventId(employeeId, 'Assets', a.id, 'returned'),
            eventReferenceNo: refNo(employeeId, 'asset_returned', a.id),
            eventCategory: 'Assets',
            eventType: `${a.assetType} Returned`,
            eventTitle: `${a.assetName} returned`,
            eventDescription: `Returned at ${a.returnDate}`,
            eventDate: a.returnDate.includes('T') ? a.returnDate : `${a.returnDate}T00:00:00.000Z`,
            effectiveDate: a.returnDate,
            sourceModule: 'Assets',
            sourceRecordId: a.id,
            relatedWorkflowId: null,
            relatedDocumentId: null,
            previousValue: 'Assigned',
            newValue: 'Returned',
            reason: null,
            severity: 'low',
            visibility: 'Employee Visible',
            isSystemGenerated: true,
            approvalStatus: 'Not Applicable',
            createdBy: 'System',
            approvedBy: null,
            approvedAt: null,
          });
        }
      }

      for (const l of (rec.leaveSummary?.history || []).slice(0, 250)) {
        const dt = normalizeDate(l.start) || normalizeDate(l.end) || null;
        if (!dt) continue;
        add({
          id: eventId(employeeId, 'Leave', l.id, l.status),
          eventReferenceNo: refNo(employeeId, 'leave', l.id),
          eventCategory: 'Leave',
          eventType: `Leave ${l.status}`,
          eventTitle: `${l.type} leave ${l.status.toLowerCase()}`,
          eventDescription: `Start: ${String(l.start).slice(0, 10)} • End: ${String(l.end).slice(0, 10)} • Days: ${l.days}`,
          eventDate: dt,
          effectiveDate: normalizeDate(l.start),
          sourceModule: 'Leave',
          sourceRecordId: l.id,
          relatedWorkflowId: null,
          relatedDocumentId: null,
          previousValue: null,
          newValue: l.status,
          reason: null,
          severity: l.status === 'Rejected' ? 'medium' : l.status === 'Pending' ? 'medium' : 'low',
          visibility: 'Employee Visible',
          isSystemGenerated: true,
          approvalStatus: l.status === 'Approved' ? 'Approved' : l.status === 'Rejected' ? 'Rejected' : l.status === 'Pending' ? 'Pending' : 'Not Applicable',
          createdBy: 'System',
          approvedBy: null,
          approvedAt: null,
        });
      }

      for (const b of (rec.attendanceSummary?.biometricLogs || []).slice(0, 250)) {
        add({
          id: eventId(employeeId, 'Attendance', b.id, b.status),
          eventReferenceNo: refNo(employeeId, 'attendance', b.id),
          eventCategory: 'Attendance',
          eventType: 'Attendance Log',
          eventTitle: `Biometric log: ${b.status}`,
          eventDescription: `Source: ${b.source} • Status: ${b.status}`,
          eventDate: b.at,
          effectiveDate: b.at,
          sourceModule: 'Attendance',
          sourceRecordId: b.id,
          relatedWorkflowId: null,
          relatedDocumentId: null,
          previousValue: null,
          newValue: b.status,
          reason: null,
          severity: b.status.toLowerCase().includes('failed') ? 'high' : 'low',
          visibility: 'Employee Visible',
          isSystemGenerated: true,
          approvalStatus: 'Not Applicable',
          createdBy: 'System',
          approvedBy: null,
          approvedAt: null,
        });
      }

      if (rec.payrollSummary?.lastPayrollProcessed) {
        add({
          id: eventId(employeeId, 'Payroll', 'payroll', 'payslip_generated'),
          eventReferenceNo: refNo(employeeId, 'payroll', 'last_processed'),
          eventCategory: 'Payroll',
          eventType: 'Payslip Generated',
          eventTitle: 'Payslip generated',
          eventDescription: `Last payroll processed: ${rec.payrollSummary.lastPayrollProcessed}`,
          eventDate: rec.payrollSummary.lastPayrollProcessed,
          effectiveDate: rec.payrollSummary.lastPayrollProcessed,
          sourceModule: 'Payroll',
          sourceRecordId: 'lastPayrollProcessed',
          relatedWorkflowId: null,
          relatedDocumentId: null,
          previousValue: null,
          newValue: rec.payrollSummary.payrollStatus,
          reason: null,
          severity: rec.payrollSummary.payrollStatus === 'Pending Validation' ? 'medium' : 'low',
          visibility: 'HR Only',
          isSystemGenerated: true,
          approvalStatus: 'Not Applicable',
          createdBy: 'System',
          approvedBy: null,
          approvedAt: null,
        });
      }

      if (rec.performanceSummary?.lastReviewAt) {
        add({
          id: eventId(employeeId, 'Performance', 'performance', 'review_completed'),
          eventReferenceNo: refNo(employeeId, 'performance', 'last_review'),
          eventCategory: 'Performance',
          eventType: 'Review Completed',
          eventTitle: 'Performance review completed',
          eventDescription: `Current rating: ${rec.performanceSummary.currentRating}`,
          eventDate: rec.performanceSummary.lastReviewAt,
          effectiveDate: rec.performanceSummary.lastReviewAt,
          sourceModule: 'Performance',
          sourceRecordId: 'lastReviewAt',
          relatedWorkflowId: null,
          relatedDocumentId: null,
          previousValue: null,
          newValue: rec.performanceSummary.currentRating,
          reason: null,
          severity: 'low',
          visibility: 'Employee Visible',
          isSystemGenerated: true,
          approvalStatus: 'Not Applicable',
          createdBy: 'System',
          approvedBy: null,
          approvedAt: null,
        });
      }

      for (const d of (rec.disciplinary || []).slice(0, 120)) {
        const dt = normalizeDate(d.dateReported);
        if (!dt) continue;
        add({
          id: eventId(employeeId, 'Disciplinary', d.id, d.status),
          eventReferenceNo: refNo(employeeId, 'disciplinary', d.id),
          eventCategory: 'Disciplinary',
          eventType: `Case ${d.status}`,
          eventTitle: `${d.caseType} case ${d.status.toLowerCase()}`,
          eventDescription: d.description,
          eventDate: dt,
          effectiveDate: dt,
          sourceModule: 'Disciplinary',
          sourceRecordId: d.id,
          relatedWorkflowId: null,
          relatedDocumentId: null,
          previousValue: null,
          newValue: d.status,
          reason: d.actionTaken || null,
          severity: d.status === 'Open' ? 'high' : 'medium',
          visibility: 'HR Only',
          isSystemGenerated: true,
          approvalStatus: d.status === 'Closed' ? 'Approved' : 'Not Applicable',
          createdBy: 'System',
          approvedBy: d.approver || null,
          approvedAt: null,
        });
      }

      for (const inc of (rec.medicalHse?.incidentHistory || []).slice(0, 120)) {
        add({
          id: eventId(employeeId, 'MedicalHSE', inc.id, inc.title),
          eventReferenceNo: refNo(employeeId, 'hse_incident', inc.id),
          eventCategory: 'Medical / HSE',
          eventType: 'Incident Logged',
          eventTitle: inc.title,
          eventDescription: `Status: ${inc.status}`,
          eventDate: inc.at,
          effectiveDate: inc.at,
          sourceModule: 'Medical / HSE',
          sourceRecordId: inc.id,
          relatedWorkflowId: null,
          relatedDocumentId: null,
          previousValue: null,
          newValue: inc.status,
          reason: null,
          severity: inc.severity || 'medium',
          visibility: 'HR Only',
          isSystemGenerated: true,
          approvalStatus: 'Not Applicable',
          createdBy: 'System',
          approvedBy: null,
          approvedAt: null,
        });
      }
      for (const c of (rec.medicalHse?.hseCertifications || []).slice(0, 120)) {
        if (!c.expiryDate) continue;
        add({
          id: eventId(employeeId, 'MedicalHSE', c.id, 'cert_expiry'),
          eventReferenceNo: refNo(employeeId, 'hse_cert', c.id),
          eventCategory: 'Medical / HSE',
          eventType: 'Certification Expired',
          eventTitle: `${c.name} ${c.status === 'Expired' ? 'expired' : 'expiry'}`,
          eventDescription: `Expiry date: ${c.expiryDate}`,
          eventDate: c.expiryDate.includes('T') ? c.expiryDate : `${c.expiryDate}T00:00:00.000Z`,
          effectiveDate: c.expiryDate,
          sourceModule: 'Medical / HSE',
          sourceRecordId: c.id,
          relatedWorkflowId: null,
          relatedDocumentId: null,
          previousValue: null,
          newValue: c.status,
          reason: null,
          severity: c.status === 'Expired' ? 'high' : 'medium',
          visibility: 'HR Only',
          isSystemGenerated: true,
          approvalStatus: 'Not Applicable',
          createdBy: 'System',
          approvedBy: null,
          approvedAt: null,
        });
      }

      for (const c of (rec.emergencyContacts || []).slice(0, 200)) {
        const v = (c.verificationStatus || 'Unverified').toString();
        const vLower = v.toLowerCase();
        const rejected = vLower.includes('failed') || vLower.includes('rejected');
        add({
          id: eventId(employeeId, 'EmergencyContacts', c.id, 'created'),
          eventReferenceNo: refNo(employeeId, 'emergency_contact', c.id),
          eventCategory: 'Emergency Contact',
          eventType: 'Emergency Contact Updated',
          eventTitle: `Emergency contact recorded: ${c.fullName}`,
          eventDescription: `Relationship: ${c.relationship} • Phone: ${c.phoneNumber}`,
          eventDate: c.lastVerifiedAt || nowFixedIso(),
          effectiveDate: c.lastVerifiedAt || null,
          sourceModule: 'Emergency Contacts',
          sourceRecordId: c.id,
          relatedWorkflowId: null,
          relatedDocumentId: null,
          previousValue: null,
          newValue: v || null,
          reason: null,
          severity: rejected ? 'medium' : v === 'Verified' ? 'low' : 'medium',
          visibility: 'Employee Visible',
          isSystemGenerated: true,
          approvalStatus: v === 'Verified' ? 'Approved' : rejected ? 'Rejected' : 'Pending',
          createdBy: c.verifiedBy || 'System',
          approvedBy: c.verifiedBy || null,
          approvedAt: c.lastVerifiedAt || null,
        });
      }

      for (const n of (rec.nextOfKin || []).slice(0, 200)) {
        add({
          id: eventId(employeeId, 'NextOfKin', n.id, 'updated'),
          eventReferenceNo: refNo(employeeId, 'next_of_kin', n.id),
          eventCategory: 'Next of Kin',
          eventType: 'Next of Kin Updated',
          eventTitle: `Next of kin recorded: ${n.fullName}`,
          eventDescription: `Relationship: ${n.relationship} • Phone: ${n.primaryPhone} • Primary: ${n.isPrimary ? 'Yes' : 'No'}`,
          eventDate: n.updatedAt || nowFixedIso(),
          effectiveDate: n.updatedAt || null,
          sourceModule: 'Next of Kin',
          sourceRecordId: n.id,
          relatedWorkflowId: null,
          relatedDocumentId: null,
          previousValue: null,
          newValue: n.verificationStatus,
          reason: n.notes || null,
          severity: n.verificationStatus === 'Rejected' ? 'medium' : n.verificationStatus === 'Verified' ? 'low' : 'medium',
          visibility: 'Employee Visible',
          isSystemGenerated: true,
          approvalStatus: n.verificationStatus === 'Verified' ? 'Approved' : n.verificationStatus === 'Rejected' ? 'Rejected' : 'Pending',
          createdBy: n.updatedBy || 'System',
          approvedBy: n.verifiedBy || null,
          approvedAt: n.lastVerifiedAt || null,
        });
      }

      const s = stores();
      const contractIds = s.contractsByEmployee.get(employeeId) || [];
      for (const cid of contractIds.slice(0, 80)) {
        const c = s.contracts.get(cid);
        if (!c) continue;
        const createdAt = normalizeDate(c.createdAt) || nowIso();
        add({
          id: eventId(employeeId, 'Contracts', cid, 'created'),
          eventReferenceNo: refNo(employeeId, 'contract', cid),
          eventCategory: 'Contract',
          eventType: 'Contract Created',
          eventTitle: `Contract created: ${String(c.contractType || 'Contract')}`,
          eventDescription: `Status: ${String(c.status || c.workflowStatus || 'Draft')} • Start: ${String(c.startDate || '')} • End: ${String(c.endDate || '')}`,
          eventDate: createdAt,
          effectiveDate: normalizeDate(c.startDate),
          sourceModule: 'Contracts',
          sourceRecordId: cid,
          relatedWorkflowId: String(c.id || cid),
          relatedDocumentId: null,
          previousValue: null,
          newValue: String(c.status || c.workflowStatus || ''),
          reason: normalizeStr(c.reason, 300),
          severity: String(c.status || '').toLowerCase().includes('expired') ? 'high' : 'low',
          visibility: 'HR Only',
          isSystemGenerated: true,
          approvalStatus: String(c.workflowStatus || '').toLowerCase().includes('approved') ? 'Approved' : String(c.workflowStatus || '').toLowerCase().includes('rejected') ? 'Rejected' : 'Pending',
          createdBy: String(c.createdBy || 'System'),
          approvedBy: String(c.approvedBy || '') || null,
          approvedAt: normalizeDate(c.approvedAt),
        });
        if (c.endDate) {
          const end = normalizeDate(c.endDate);
          if (end) {
            add({
              id: eventId(employeeId, 'Contracts', cid, 'end'),
              eventReferenceNo: refNo(employeeId, 'contract_end', cid),
              eventCategory: 'Contract',
              eventType: 'Contract Expiry',
              eventTitle: 'Contract expiry',
              eventDescription: `End date: ${String(c.endDate)}`,
              eventDate: end,
              effectiveDate: end,
              sourceModule: 'Contracts',
              sourceRecordId: cid,
              relatedWorkflowId: String(c.id || cid),
              relatedDocumentId: null,
              previousValue: null,
              newValue: String(c.status || ''),
              reason: null,
              severity: 'medium',
              visibility: 'HR Only',
              isSystemGenerated: true,
              approvalStatus: 'Not Applicable',
              createdBy: 'System',
              approvedBy: null,
              approvedAt: null,
            });
          }
        }
      }

      const statusHist = s.statusHistoryByEmployee.get(employeeId) || [];
      for (const row of (statusHist as any[]).slice(0, 120)) {
        const dt = normalizeDate(row.effectiveDate) || normalizeDate(row.at) || normalizeDate(row.updatedAt) || null;
        if (!dt) continue;
        add({
          id: eventId(employeeId, 'Status', String(row.id || ''), 'status_change'),
          eventReferenceNo: refNo(employeeId, 'status', String(row.id || 'status')),
          eventCategory: 'Status Change',
          eventType: 'Status Changed',
          eventTitle: 'Employment status changed',
          eventDescription: `Previous: ${String(row.previousStatus || row.from || '—')} • New: ${String(row.newStatus || row.to || '—')}`,
          eventDate: dt,
          effectiveDate: normalizeDate(row.effectiveDate) || dt,
          sourceModule: 'Status',
          sourceRecordId: String(row.id || ''),
          relatedWorkflowId: String(row.requestId || ''),
          relatedDocumentId: null,
          previousValue: String(row.previousStatus || row.from || ''),
          newValue: String(row.newStatus || row.to || ''),
          reason: normalizeStr(row.reason, 300),
          severity: String(row.newStatus || '').toLowerCase().includes('terminated') || String(row.newStatus || '').toLowerCase().includes('resigned') ? 'high' : 'low',
          visibility: 'Employee Visible',
          isSystemGenerated: true,
          approvalStatus: 'Approved',
          createdBy: String(row.performedBy || row.by || 'System'),
          approvedBy: String(row.approvedBy || '') || null,
          approvedAt: normalizeDate(row.approvedAt),
        });
      }

      const manual = stores().manualByEmployee.get(employeeId) || [];
      for (const m of manual.slice(0, 200)) {
        if (canViewEvent(m)) out.push(m);
      }

      out.sort((a, b) => (a.eventDate < b.eventDate ? 1 : a.eventDate > b.eventDate ? -1 : 0));
      return out;
    };

    const events = buildTimeline();

    const filterEvents = (rows: TimelineEvent[]) => {
      const category = normalizeStr(url.searchParams.get('category'), 80);
      const type = normalizeStr(url.searchParams.get('type'), 120);
      const severity = normalizeStr(url.searchParams.get('severity'), 20);
      const moduleName = normalizeStr(url.searchParams.get('module'), 120);
      const approval = normalizeStr(url.searchParams.get('approval'), 40);
      const createdBy = normalizeStr(url.searchParams.get('createdBy'), 80);
      const system = normalizeStr(url.searchParams.get('system'), 20);
      const from = normalizeStr(url.searchParams.get('from'), 20);
      const to = normalizeStr(url.searchParams.get('to'), 20);
      const sort = normalizeStr(url.searchParams.get('sort'), 10);
      const fromMs = from ? new Date(`${from}T00:00:00.000Z`).getTime() : NaN;
      const toMs = to ? new Date(`${to}T23:59:59.999Z`).getTime() : NaN;
      const out = rows.filter((e) => {
        if (category && e.eventCategory !== category) return false;
        if (type && e.eventType !== type) return false;
        if (severity && e.severity !== severity) return false;
        if (moduleName && e.sourceModule !== moduleName) return false;
        if (approval && e.approvalStatus !== approval) return false;
        if (createdBy && e.createdBy !== createdBy) return false;
        if (system === 'system' && !e.isSystemGenerated) return false;
        if (system === 'user' && e.isSystemGenerated) return false;
        const ms = new Date(e.eventDate).getTime();
        if (Number.isFinite(fromMs) && Number.isFinite(ms) && ms < fromMs) return false;
        if (Number.isFinite(toMs) && Number.isFinite(ms) && ms > toMs) return false;
        return true;
      });
      if (sort === 'asc') out.sort((a, b) => (a.eventDate < b.eventDate ? -1 : a.eventDate > b.eventDate ? 1 : 0));
      else out.sort((a, b) => (a.eventDate < b.eventDate ? 1 : a.eventDate > b.eventDate ? -1 : 0));
      return out;
    };

    if (rest[0] === 'summary') {
      const byCategory: Record<string, number> = {};
      for (const e of events) byCategory[e.eventCategory] = (byCategory[e.eventCategory] || 0) + 1;
      const lastActivityAt = events.length ? events[0].eventDate : null;
      return jsonOk({ total: events.length, byCategory, lastActivityAt, lastUpdatedAt: nowIso() });
    }

    if (rest[0] === 'analytics') {
      const byCategory = Object.entries(
        events.reduce((acc, e) => ((acc[e.eventCategory] = (acc[e.eventCategory] || 0) + 1), acc), {} as Record<string, number>)
      )
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 16);
      const byMonthMap = new Map<string, number>();
      for (const e of events) {
        const d = new Date(e.eventDate);
        if (!Number.isFinite(d.getTime())) continue;
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        byMonthMap.set(key, (byMonthMap.get(key) || 0) + 1);
      }
      const byMonth = Array.from(byMonthMap.entries())
        .sort((a, b) => (a[0] < b[0] ? 1 : -1))
        .slice(0, 18)
        .map(([month, count]) => ({ month, count }));
      const highRisk = (['high', 'medium', 'low'] as Severity[]).map((s) => ({ severity: s, count: events.filter((e) => e.severity === s).length }));
      const approvalDelays = [
        { bucket: '0-2 days', count: 0 },
        { bucket: '3-7 days', count: 0 },
        { bucket: '8-14 days', count: 0 },
        { bucket: '15+ days', count: 0 },
      ];
      for (const e of events) {
        if (!e.approvedAt) continue;
        const a = new Date(e.eventDate).getTime();
        const b = new Date(e.approvedAt).getTime();
        if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) continue;
        const days = Math.ceil((b - a) / (24 * 3600 * 1000));
        if (days <= 2) approvalDelays[0].count++;
        else if (days <= 7) approvalDelays[1].count++;
        else if (days <= 14) approvalDelays[2].count++;
        else approvalDelays[3].count++;
      }
      return jsonOk({ byCategory, byMonth, approvalDelays, highRisk, lastUpdatedAt: nowIso() });
    }

    if (rest[0] === 'ai-insights') {
      const out: { id: string; severity: Severity; confidence: number; title: string; recommendation: string; eventId?: string | null; actionLabel: string; action: string }[] = [];
      const add = (sev: Severity, title: string, conf: number, recm: string, eventId?: string | null) =>
        out.push({
          id: `ai-tl-${employeeId}-${Math.random().toString(16).slice(2)}`,
          severity: sev,
          confidence: conf,
          title,
          recommendation: recm,
          eventId: eventId || null,
          actionLabel: eventId ? 'Open Related Event' : 'Review',
          action: eventId ? 'open_event' : 'review',
        });

      const nowMs = new Date(nowIso()).getTime();
      const perf = events.find((e) => e.eventCategory === 'Performance' && /review/i.test(e.eventType)) || null;
      if (!perf) add('medium', 'Employee has no performance review recorded', 0.74, 'Capture performance review outcome and publish rating to maintain governance.', null);
      else {
        const ms = new Date(perf.eventDate).getTime();
        if (Number.isFinite(ms) && Number.isFinite(nowMs)) {
          const days = Math.floor((nowMs - ms) / (24 * 3600 * 1000));
          if (days > 365) add('medium', 'Employee has no performance review recorded in the last 12 months', 0.78, 'Schedule and record annual performance review.', perf.id);
        }
      }

      const contracts = events.filter((e) => e.eventCategory === 'Contract' && /expiry/i.test(e.eventType.toLowerCase()));
      const statusEvents = events.filter((e) => e.eventCategory === 'Status Change');
      const latestContractExpiry = contracts.sort((a, b) => (a.eventDate < b.eventDate ? 1 : -1))[0] || null;
      if (latestContractExpiry) {
        const exp = new Date(latestContractExpiry.eventDate).getTime();
        const laterStatus = statusEvents.find((s) => new Date(s.eventDate).getTime() >= exp) || null;
        if (!laterStatus) add('high', 'Contract expired before status was updated', 0.82, 'Submit a status change request to reflect contract expiry and update access/payroll eligibility.', latestContractExpiry.id);
      }

      const payroll = events.find((e) => e.eventCategory === 'Payroll') || null;
      if (payroll) {
        const approvalNearby = events.find((e) => e.approvalStatus === 'Approved' && Math.abs(new Date(e.eventDate).getTime() - new Date(payroll.eventDate).getTime()) <= 7 * 24 * 3600 * 1000) || null;
        if (!approvalNearby) add('medium', 'Payroll change occurred without matching approval event', 0.71, 'Verify payroll-impacting changes are linked to an approved workflow and document audit rationale.', payroll.id);
      }

      const contractActivated = events.find((e) => e.eventCategory === 'Contract' && /activated/i.test(e.eventType.toLowerCase())) || null;
      if (contractActivated) {
        const docAfter = events.find((e) => e.eventCategory === 'Documents' && /uploaded/i.test(e.eventType.toLowerCase()) && e.eventDate > contractActivated.eventDate) || null;
        if (docAfter) add('low', 'Document was uploaded after contract activation', 0.63, 'Confirm required documents were present before activation; if not, backfill and re-verify.', docAfter.id);
      }

      const created = events.find((e) => e.eventCategory === 'Employment' && /created/i.test(e.eventType.toLowerCase())) || events.find((e) => /employee created/i.test(e.eventTitle.toLowerCase())) || null;
      const deptAssigned = events.find((e) => e.eventCategory === 'Department Assignment' || /assignment/i.test(e.eventCategory.toLowerCase())) || null;
      if (created && deptAssigned) {
        const a = new Date(created.eventDate).getTime();
        const b = new Date(deptAssigned.eventDate).getTime();
        if (Number.isFinite(a) && Number.isFinite(b) && b > a) {
          const days = Math.floor((b - a) / (24 * 3600 * 1000));
          if (days >= 42) add('medium', 'Employee has unexplained 42-day gap between onboarding and department assignment', 0.7, 'Review onboarding workflow and add missing assignment events with audit notes.', deptAssigned.id);
        }
      }

      const exitStart = events.find((e) => e.eventCategory === 'Employment' && /exit/i.test(e.eventType.toLowerCase())) || null;
      if (exitStart) {
        const returned = events.find((e) => e.eventCategory === 'Assets' && /returned/i.test(e.eventType.toLowerCase()) && e.eventDate >= exitStart.eventDate) || null;
        if (!returned) add('high', 'Exit process started but asset recovery is incomplete', 0.83, 'Validate asset inventory, create recovery tasks, and record returns/clearance events.', exitStart.id);
      }

      return jsonOk(out.slice(0, 12));
    }

    if (rest[0] === 'export') {
      if (role === 'Employee') return jsonErr(403, 'Permission denied');
      const format = (url.searchParams.get('format') || 'csv').toLowerCase();
      const filtered = filterEvents(events);
      const stamp = nowIso().slice(0, 10);
      const fileBase = `employee_timeline_${employeeId}_${stamp}`;

      const header = [
        'Event Ref',
        'Category',
        'Type',
        'Title',
        'Event Date',
        'Effective Date',
        'Severity',
        'Approval Status',
        'Created By',
        'Approved By',
        'Module',
        'Source Record',
        'Related Workflow',
        'Related Document',
        'Visibility',
        'System Generated',
      ];
      const csvCell = (v: string) => {
        const s = (v ?? '').replace(/\r?\n/g, ' ').trim();
        if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
      };
      const toCsv = (rows: string[][]) => [header.map(csvCell).join(','), ...rows.map((r) => r.map((c) => csvCell(String(c ?? ''))).join(','))].join('\n');
      const rows = filtered.slice(0, 2500).map((e) => [
        e.eventReferenceNo,
        e.eventCategory,
        e.eventType,
        e.eventTitle,
        e.eventDate,
        e.effectiveDate || '',
        e.severity,
        e.approvalStatus,
        e.createdBy,
        e.approvedBy || '',
        e.sourceModule,
        e.sourceRecordId || '',
        e.relatedWorkflowId || '',
        e.relatedDocumentId || '',
        e.visibility,
        e.isSystemGenerated ? 'Yes' : 'No',
      ]);

      if (format === 'xls' || format === 'excel') {
        const html = `<!doctype html><html><head><meta charset="utf-8"/></head><body>
          <table border="1">
            <tr>${header.map((h) => `<th>${h}</th>`).join('')}</tr>
            ${rows.map((r) => `<tr>${r.map((c) => `<td>${String(c || '')}</td>`).join('')}</tr>`).join('')}
          </table>
        </body></html>`;
        return new NextResponse(html, {
          headers: {
            'content-type': 'application/vnd.ms-excel; charset=utf-8',
            'content-disposition': `attachment; filename="${fileBase}.xls"`,
          },
        });
      }

      if (format === 'pdf') {
        const escapePdf = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
        const clean = (s: string) => escapePdf(s.replace(/\r?\n/g, ' ').slice(0, 170));
        const fontSize = 10;
        const lineHeight = 12;
        const startY = 760;
        const x = 40;
        const lines = rows.slice(0, 50).map((r) => `${r[0]} • ${r[1]} • ${r[2]} • ${r[5] || r[4]}`);
        const all = [`DLE HRIS — Employee Timeline Report (${employeeId})`, ...lines].slice(0, 55);
        const streamParts: string[] = [];
        streamParts.push(`BT /F1 ${fontSize} Tf ${x} ${startY} Td`);
        for (let i = 0; i < all.length; i++) {
          streamParts.push(`(${clean(all[i] || '')}) Tj`);
          if (i !== all.length - 1) streamParts.push(`0 -${lineHeight} Td`);
        }
        streamParts.push('ET');
        const stream = streamParts.join('\n');
        const encoder = new TextEncoder();
        const xref: number[] = [0];
        let outPdf = '%PDF-1.4\n';
        const pushObj = (obj: string) => {
          xref.push(outPdf.length);
          outPdf += obj;
        };
        pushObj('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
        pushObj('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
        pushObj('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n');
        pushObj('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');
        const streamBytes = encoder.encode(stream);
        pushObj(`5 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n${stream}\nendstream\nendobj\n`);
        const startXref = outPdf.length;
        outPdf += `xref\n0 ${xref.length}\n0000000000 65535 f \n`;
        for (let i = 1; i < xref.length; i++) outPdf += `${String(xref[i]).padStart(10, '0')} 00000 n \n`;
        outPdf += `trailer\n<< /Size ${xref.length} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;
        const bytes = encoder.encode(outPdf);
        return new NextResponse(bytes, {
          headers: {
            'content-type': 'application/pdf',
            'content-disposition': `attachment; filename="${fileBase}.pdf"`,
          },
        });
      }

      const csv = toCsv(rows);
      return new NextResponse(csv, {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="${fileBase}.csv"`,
        },
      });
    }

    return jsonOk(events);
  }
  if (root === 'leave-summary') return jsonOk(rec.leaveSummary);
  if (root === 'attendance-summary') return jsonOk(rec.attendanceSummary);
  if (root === 'payroll-summary') return jsonOk(sanitizePayrollForRole(rec.payrollSummary, perms));
  if (root === 'performance-summary') return jsonOk(rec.performanceSummary);
  if (root === 'training') return jsonOk(rec.training);
  if (root === 'assets') return jsonOk(rec.assets);
  if (root === 'history') return jsonOk(rec.history);
  if (root === 'employment-history') {
    const g = globalThis as unknown as { __dleHrisEmploymentHistoryDetail?: Map<string, any> };
    const map = g.__dleHrisEmploymentHistoryDetail;
    if (!map) return jsonOk([]);
    const items = Array.from(map.values()).filter((x) => x && x.employeeId === employeeId);
    items.sort((a, b) => (a.effectiveDate < b.effectiveDate ? 1 : -1));
    return jsonOk(items);
  }
  if (root === 'job-information') {
    const requests = requestForEmployee(employeeId).slice(0, 25);
    const active = requests.find((r) => r.status !== 'Approved' && r.status !== 'Cancelled') || null;
    const approvalStatus: JobChangeStatus = active ? active.status : 'Approved';
    const approvalRef = active ? active.id : null;
    const lastUpdatedAt = active ? active.updatedAt : nowIso();

    rec.audit.unshift(auditEntry('Job information viewed', role));

    const jobDetails = rec.profile.jobDetails || {};
    const employmentDetails = rec.profile.employmentDetails || {};
    const roleProfile: Record<string, string | null> = {
      roleSummary: jobDetails.roleSummary ?? null,
      jobPurpose: jobDetails.jobPurpose ?? null,
      keyResponsibilities: jobDetails.keyResponsibilities ?? null,
      technicalCompetencies: jobDetails.technicalCompetencies ?? null,
      behavioralCompetencies: jobDetails.behavioralCompetencies ?? null,
      requiredQualifications: jobDetails.requiredQualifications ?? null,
      requiredCertifications: jobDetails.requiredCertifications ?? null,
      requiredExperience: jobDetails.requiredExperience ?? null,
      kpis: jobDetails.kpis ?? null,
      performanceExpectations: jobDetails.performanceExpectations ?? null,
      hseResponsibilities: jobDetails.hseResponsibilities ?? null,
      complianceResponsibilities: jobDetails.complianceResponsibilities ?? null,
      jobDescription: jobDetails.jobDescription ?? null,
    };
    const projectAssignment: Record<string, string | null> = {
      currentProject: jobDetails.currentProject ?? jobDetails.projectSite ?? null,
      projectCode: jobDetails.projectCode ?? null,
      projectLocation: jobDetails.projectLocation ?? null,
      client: jobDetails.client ?? null,
      siteSupervisor: jobDetails.siteSupervisor ?? null,
      assignmentStartDate: jobDetails.assignmentStartDate ?? null,
      assignmentEndDate: jobDetails.assignmentEndDate ?? null,
      assignmentStatus: jobDetails.assignmentStatus ?? null,
      mobilizationStatus: jobDetails.mobilizationStatus ?? null,
      demobilizationStatus: jobDetails.demobilizationStatus ?? null,
    };

    const payload: JobInformationPayload = {
      employeeId,
      employeeName: rec.profile.fullName,
      approvalStatus,
      approvalRef,
      lastUpdatedAt,
      job: jobDetails,
      employment: employmentDetails,
      roleProfile,
      projectAssignment,
      requests,
    };
    return jsonOk(payload);
  }
  if (root === 'job-history') {
    const g = globalThis as unknown as { __dleHrisEmploymentHistoryDetail?: Map<string, any> };
    const map = g.__dleHrisEmploymentHistoryDetail;
    const items = map ? Array.from(map.values()).filter((x) => x && x.employeeId === employeeId) : [];
    const relevant = new Set([
      'Promotion',
      'Transfer',
      'Department Change',
      'Manager Change',
      'Job Title Change',
      'Grade Change',
      'Salary Grade Change',
      'Secondment',
      'Project Assignment',
      'Contract Renewal',
      'Reactivation',
      'Suspension',
      'Resignation',
      'Termination',
      'Retirement',
    ]);
    const filtered = items.filter((x: any) => relevant.has(String(x.eventType || '')));
    filtered.sort((a: any, b: any) => (a.effectiveDate < b.effectiveDate ? 1 : -1));
    return jsonOk(filtered.slice(0, 250));
  }
  if (root === 'job-ai-insights') {
    const jobDetails = rec.profile.jobDetails || {};
    const employmentDetails = rec.profile.employmentDetails || {};
    const requests = requestForEmployee(employeeId);
    const latestApproved = requests.find((r) => r.status === 'Approved') || null;
    const currentGrade = (jobDetails.jobGrade || '').toString();
    const currentDesignation = (jobDetails.designation || '').toString();
    const currentCostCenter = (jobDetails.costCenter || '').toString();
    const currentDepartment = (jobDetails.department || '').toString();
    const manager = (jobDetails.reportingManager || '').toString();
    const project = (jobDetails.projectSite || jobDetails.currentProject || '').toString();
    const roleProfile = (jobDetails.jobDescription || '').toString();

    const out: AIInsight[] = [];
    const add = (s: Severity, title: string, confidence: number, recommendation: string, actionLabel: string, action: string) =>
      out.push({ id: `ai-${employeeId}-${Math.random().toString(16).slice(2)}`, severity: s, title, confidence, recommendation, actionLabel, action });

    if (!currentGrade || currentGrade === '—') add('high', 'Job grade is missing', 0.86, 'Populate job grade via a controlled Grade Change request and complete approval.', 'Create Change Request', 'open_change_request');
    if (currentGrade && currentDesignation && currentDesignation.toLowerCase().includes('manager') && ['G7', 'G8'].includes(currentGrade))
      add('medium', 'Job grade may not match designation range', 0.71, 'Validate grade vs designation policy. If mismatch, submit a Grade Change request with supporting evidence.', 'Review Grade', 'review_grade');
    if (!manager || manager === '—') add('high', 'Reporting manager is missing', 0.84, 'Assign reporting manager via a Manager Change request and complete approval workflow.', 'Assign Manager', 'open_change_request');
    if (manager && rec.profile.fullName && manager.toLowerCase() === rec.profile.fullName.toLowerCase())
      add('high', 'Invalid reporting manager (self)', 0.9, 'Manager cannot be the same employee. Reverse incorrect event/change and submit corrected manager assignment.', 'Fix Manager', 'open_change_request');
    if (!project || project === '—') add('medium', 'Project assignment is missing', 0.73, 'Record project/site assignment to enable project governance and reporting.', 'Assign Project', 'open_change_request');
    if (roleProfile && roleProfile.length < 50) add('low', 'Job description appears incomplete', 0.62, 'Update role profile/job description and attach the updated role document if required.', 'Update Role Profile', 'open_change_request');
    if (currentCostCenter && currentDepartment && currentCostCenter.includes('CC-') && currentDepartment.toLowerCase().includes('finance') && currentCostCenter.includes('ENG'))
      add('medium', 'Cost center may be inconsistent with department', 0.68, 'Validate cost center mapping for this department. If incorrect, submit Cost Center Change request.', 'Review Cost Center', 'open_change_request');
    if (latestApproved && latestApproved.changeType === 'Role Profile Update' && Date.now() - new Date(latestApproved.updatedAt).getTime() > 18 * 30 * 24 * 3600 * 1000)
      add('low', 'Role profile has not been updated in 18+ months', 0.64, 'Review role profile and refresh responsibilities/KPIs where needed.', 'Review Role Profile', 'open_change_request');
    if (employmentDetails && (employmentDetails.employmentType || '').toString().toLowerCase() === 'permanent' && (employmentDetails.dateJoined || '').toString()) {
      const joined = new Date(`${String(employmentDetails.dateJoined).slice(0, 10)}T00:00:00.000Z`).getTime();
      if (Number.isFinite(joined)) {
        const yrs = Math.floor((Date.now() - joined) / (365.25 * 24 * 3600 * 1000));
        if (yrs >= 5) add('low', 'Employee has remained in role for 5+ years', 0.6, 'Consider promotion/transfer review based on performance and succession planning.', 'Review Eligibility', 'review_eligibility');
      }
    }

    return jsonOk(out.slice(0, 12));
  }
  if (root === 'department-unit-assignment') {
    const aps = assignmentRequestsForEmployee(employeeId).slice(0, 25);
    const active = aps.find((r) => r.status !== 'Approved' && r.status !== 'Cancelled' && r.status !== 'Completed') || null;
    const approvalStatus: AssignmentRequestStatus = active ? active.status : 'Approved';
    const approvalRef = active ? active.id : null;
    const lastUpdatedAt = active ? active.updatedAt : nowIso();
    const pendingChanges = aps.filter((r) => r.status !== 'Approved' && r.status !== 'Cancelled' && r.status !== 'Completed').length;

    rec.audit.unshift(auditEntry('Assignment viewed', role));

    const jobDetails = rec.profile.jobDetails || {};
    const employmentDetails = rec.profile.employmentDetails || {};
    const assignment: Record<string, string | null> = {
      department: jobDetails.department ?? null,
      division: jobDetails.division ?? null,
      unit: jobDetails.unit ?? null,
      team: jobDetails.team ?? null,
      businessUnit: jobDetails.businessUnit ?? null,
      costCenter: jobDetails.costCenter ?? null,
      location: employmentDetails.workLocation ?? jobDetails.location ?? null,
      officeSite: jobDetails.officeSite ?? null,
      projectSite: jobDetails.projectSite ?? null,
      workMode: employmentDetails.workMode ?? null,
      shiftPattern: employmentDetails.shiftPattern ?? null,
      assignmentType: jobDetails.assignmentType ?? null,
      assignmentStatus: jobDetails.assignmentStatus ?? null,
      effectiveDate: jobDetails.assignmentEffectiveDate ?? null,
      endDate: jobDetails.assignmentEndDate ?? null,
    };
    const reporting: Record<string, string | null> = {
      reportingManager: jobDetails.reportingManager ?? null,
      functionalManager: jobDetails.functionalManager ?? null,
      departmentHead: jobDetails.departmentHead ?? null,
      unitHead: jobDetails.unitHead ?? null,
      businessUnitHead: jobDetails.businessUnitHead ?? null,
      projectManager: jobDetails.projectManager ?? null,
      siteSupervisor: jobDetails.siteSupervisor ?? null,
      matrixManager: jobDetails.matrixManager ?? null,
      delegatedApprover: jobDetails.delegatedApprover ?? null,
      hrBusinessPartner: jobDetails.hrBusinessPartner ?? null,
    };
    const project: Record<string, string | null> = {
      projectName: jobDetails.projectName ?? jobDetails.currentProject ?? null,
      projectCode: jobDetails.projectCode ?? null,
      client: jobDetails.client ?? null,
      projectLocation: jobDetails.projectLocation ?? null,
      siteLocation: jobDetails.siteLocation ?? null,
      mobilizationStatus: jobDetails.mobilizationStatus ?? null,
      demobilizationStatus: jobDetails.demobilizationStatus ?? null,
      hseInductionStatus: jobDetails.hseInductionStatus ?? null,
      ppeRequirement: jobDetails.ppeRequirement ?? null,
      siteAccessRequirement: jobDetails.siteAccessRequirement ?? null,
      assignmentStartDate: jobDetails.assignmentStartDate ?? null,
      assignmentEndDate: jobDetails.assignmentEndDate ?? null,
    };

    const ai = deriveAssignmentAi(employeeId, rec);
    const payload: DepartmentUnitAssignmentPayload = {
      employeeId,
      employeeName: rec.profile.fullName,
      assignment,
      reporting,
      project,
      approvalStatus,
      approvalRef,
      lastUpdatedAt,
      pendingChanges,
      requests: aps,
      aiInsights: ai,
    };
    return jsonOk(payload);
  }
  if (root === 'assignment-history') {
    const existing = assignmentHistoryStore.get(employeeId) || [];
    if (existing.length) return jsonOk(existing.slice(0, 250));
    const g = globalThis as unknown as { __dleHrisEmploymentHistoryDetail?: Map<string, any> };
    const map = g.__dleHrisEmploymentHistoryDetail;
    if (!map) return jsonOk([]);
    const items = Array.from(map.values()).filter((x) => x && x.employeeId === employeeId);
    const relevant = new Set(['Transfer', 'Department Change', 'Manager Change', 'Project Assignment', 'Secondment']);
    const rows = items
      .filter((x: any) => relevant.has(String(x.eventType || '')))
      .sort((a: any, b: any) => (a.effectiveDate < b.effectiveDate ? 1 : -1))
      .slice(0, 120)
      .map((x: any) => ({
        id: x.id,
        referenceNo: x.referenceNo,
        employeeId: x.employeeId,
        employeeName: x.employeeName,
        assignmentType: x.eventType === 'Secondment' ? 'Secondment' : 'Permanent Assignment',
        previousDepartment: x.previousDepartment ?? null,
        newDepartment: x.newDepartment ?? null,
        previousUnit: null,
        newUnit: null,
        previousManager: x.previousManager ?? null,
        newManager: x.newManager ?? null,
        previousCostCenter: null,
        newCostCenter: null,
        effectiveDate: x.effectiveDate,
        endDate: null,
        approvalStatus: x.approvalStatus,
        approvedBy: x.approvedBy ?? null,
        createdBy: x.createdBy ?? null,
        createdAt: x.createdAt ?? null,
        updatedAt: x.updatedAt ?? null,
        requestId: null,
      }));
    return jsonOk(rows);
  }
  if (root === 'reporting-line') {
    const rqs = reportingRequestsForEmployee(employeeId).slice(0, 25);
    const active = rqs.find((r) => r.status !== 'Approved' && r.status !== 'Cancelled' && r.status !== 'Completed') || null;
    const approvalStatus: ReportingChangeStatus = active ? active.status : 'Approved';
    const approvalRef = active ? active.id : null;
    const lastUpdatedAt = active ? active.updatedAt : nowIso();
    const pendingChanges = rqs.filter((r) => r.status !== 'Approved' && r.status !== 'Cancelled' && r.status !== 'Completed').length;

    rec.audit.unshift(auditEntry('Reporting line viewed', role));

    const jobDetails = rec.profile.jobDetails || {};
    const line: Record<string, string | null> = {
      directManager: jobDetails.reportingManager ?? null,
      functionalManager: jobDetails.functionalManager ?? null,
      departmentHead: jobDetails.departmentHead ?? null,
      unitHead: jobDetails.unitHead ?? null,
      businessUnitHead: jobDetails.businessUnitHead ?? null,
      projectManager: jobDetails.projectManager ?? null,
      siteSupervisor: jobDetails.siteSupervisor ?? null,
      matrixManager: jobDetails.matrixManager ?? null,
      dottedLineManager: (jobDetails as any).dottedLineManager ?? null,
      hrBusinessPartner: jobDetails.hrBusinessPartner ?? null,
      delegatedApprover: jobDetails.delegatedApprover ?? null,
    };
    const delegations = reportingDelegationsStore.get(employeeId) || [];
    const orgChart = buildOrgChartForEmployee(employeeId, rec);
    const approvalChains = buildApprovalChains(rec);
    const history = reportingHistoryStore.get(employeeId) || [];
    const ai = deriveReportingAi(employeeId, rec);
    const payload: ReportingLinePayload = {
      employeeId,
      employeeName: rec.profile.fullName,
      status: 'Active',
      effectiveDate: jobDetails.reportingEffectiveDate ?? nowIso(),
      endDate: jobDetails.reportingEndDate ?? null,
      reason: jobDetails.reportingReason ?? '—',
      line,
      delegations,
      approvalChains,
      orgChart,
      history,
      requests: rqs,
      approvalStatus,
      approvalRef,
      lastUpdatedAt,
      pendingChanges,
      aiInsights: ai,
      auditTrail: rec.audit.slice(0, 200),
    };
    return jsonOk(payload);
  }
  if (root === 'reporting-history') {
    const existing = reportingHistoryStore.get(employeeId) || [];
    if (existing.length) return jsonOk(existing.slice(0, 250));
    const g = globalThis as unknown as { __dleHrisEmploymentHistoryDetail?: Map<string, any> };
    const map = g.__dleHrisEmploymentHistoryDetail;
    if (!map) return jsonOk([]);
    const items = Array.from(map.values()).filter((x) => x && x.employeeId === employeeId);
    const relevant = new Set(['Manager Change']);
    const rows = items
      .filter((x: any) => relevant.has(String(x.eventType || '')))
      .sort((a: any, b: any) => (a.effectiveDate < b.effectiveDate ? 1 : -1))
      .slice(0, 120)
      .map((x: any) => ({
        id: x.id,
        referenceNo: x.referenceNo,
        employeeId: x.employeeId,
        employeeName: x.employeeName,
        changeType: 'Manager Change',
        previousManager: x.previousManager ?? null,
        newManager: x.newManager ?? null,
        previousFunctionalManager: null,
        newFunctionalManager: null,
        effectiveDate: x.effectiveDate,
        endDate: null,
        approvalStatus: x.approvalStatus,
        approvedBy: x.approvedBy ?? null,
        createdBy: x.createdBy ?? null,
        createdDate: x.createdAt ?? null,
        requestId: null,
      }));
    return jsonOk(rows);
  }
  if (root === 'org-chart') {
    rec.audit.unshift(auditEntry('Org chart viewed', role));
    return jsonOk(buildOrgChartForEmployee(employeeId, rec));
  }
  if (root === 'approval-chains') {
    return jsonOk(buildApprovalChains(rec));
  }
  if (root === 'contracts') {
    const g = globalThis as unknown as {
      __dleHrisContracts?: Map<string, any>;
      __dleHrisContractsByEmployee?: Map<string, string[]>;
    };
    const contracts = g.__dleHrisContracts;
    const byEmployee = g.__dleHrisContractsByEmployee;
    const ids = byEmployee?.get(employeeId) || [];
    const memoryRows = ids
      .map((id) => contracts?.get(id))
      .filter(Boolean)
      .map((c: any) => {
        const approvals = Array.isArray(c.approvals) ? (c.approvals as any[]) : [];
        const lastApproved = approvals.find((a) => a && a.decision === 'Approved') || null;
        return {
          id: String(c.id || ''),
          employeeId: String(c.employeeId || employeeId),
          employeeName: String(c.employeeName || rec.profile.fullName),
          contractReferenceNo: String(c.contractReferenceNo || ''),
          contractType: String(c.contractType || ''),
          startDate: String(c.startDate || ''),
          endDate: c.endDate ? String(c.endDate) : null,
          contractStatus: String(c.contractStatus || ''),
          renewalStatus: String(c.renewalStatus || ''),
          approvalStatus: String(c.approvalStatus || ''),
          documentStatus: String(c.documentStatus || ''),
          createdBy: String(c.createdBy || ''),
          approvedBy: lastApproved ? String(lastApproved.by || '') : null,
          createdAt: String(c.createdAt || ''),
          updatedAt: String(c.updatedAt || ''),
        };
      });
    const dbRows = ((await readEmployeeContractsFromDb(employeeId)) || []).map((c: any) => {
      const approvals = Array.isArray(c.approvals) ? c.approvals : [];
      const lastApproved = approvals.find((a: any) => a && a.decision === 'Approved') || null;
      return {
        id: String(c.id || ''),
        employeeId: String(c.employeeId || employeeId),
        employeeName: String(c.employeeName || rec.profile.fullName),
        contractReferenceNo: String(c.contractReferenceNo || ''),
        contractType: String(c.contractType || ''),
        startDate: String(c.startDate || ''),
        endDate: c.endDate ? String(c.endDate) : null,
        contractStatus: String(c.contractStatus || ''),
        renewalStatus: String(c.renewalStatus || ''),
        approvalStatus: String(c.approvalStatus || ''),
        documentStatus: String(c.documentStatus || ''),
        createdBy: String(c.createdBy || ''),
        approvedBy: lastApproved ? String(lastApproved.by || '') : null,
        createdAt: String(c.createdAt || ''),
        updatedAt: String(c.updatedAt || ''),
      };
    });
    const seen = new Set<string>();
    const rows = [...memoryRows, ...dbRows].filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    }).slice(0, 250);
    rec.audit.unshift(auditEntry('Contract viewed', role));
    return jsonOk(rows);
  }
  if (root === 'audit-trail') {
    if (!perms.canViewAudit) return jsonErr(403, 'Permission denied');
    return jsonOk(rec.audit);
  }
  if (root === 'ai-insights') return jsonOk(rec.aiInsights);
  if (root === 'status-history') {
    rec.audit.unshift(auditEntry('Status history viewed', role));
    return jsonOk((statusHistoryStore.get(employeeId) || []).slice(0, 250));
  }
  if (root === 'status') {
    const overrides = statusOverridesStore.get(employeeId) || {};
    const employmentStatus = String(rec.profile.employmentStatus || 'Active');
    const employmentType = String(rec.profile.employmentType || '—');
    const contract = computeContractStatusForEmployee(employeeId);
    const payrollDefault = ['Active', 'Confirmed', 'Probation', 'Reactivated', 'Contract Active'].includes(employmentStatus) ? 'Eligible' : 'Ineligible';
    const accessDefault = ['Active', 'Confirmed', 'Probation', 'On Leave', 'Contract Active', 'Seconded', 'Reactivated'].includes(employmentStatus) ? 'Active' : 'Restricted';
    const leaveDefault = employmentStatus === 'On Leave' ? 'On Leave' : 'Not on Leave';
    const probationDefault = employmentStatus === 'Probation' ? 'In Probation' : employmentStatus === 'Confirmed' ? 'Completed' : '—';
    const confirmationDefault = employmentStatus === 'Confirmed' ? 'Confirmed' : employmentStatus === 'Probation' ? 'Pending' : '—';
    const complianceDefault =
      ['Blacklisted', 'Deceased'].includes(employmentStatus) ? 'High Risk' : ['Terminated', 'Resigned', 'Exited', 'Retired'].includes(employmentStatus) ? 'Clearance Required' : 'OK';
    const exitDefault = ['Terminated', 'Resigned', 'Exited', 'Retired', 'Deceased'].includes(employmentStatus) ? employmentStatus : '—';

    const requests = statusRequestsForEmployee(employeeId);
    const pendingCount = requests.filter((r) => !['Completed', 'Rejected', 'Cancelled'].includes(String(r.workflowStatus || ''))).length;
    const history = (statusHistoryStore.get(employeeId) || []) as any[];
    const lastStatusChangeAt = history[0]?.createdAt ? String(history[0].createdAt) : null;

    const aiInsights: AIInsight[] = [];
    const addAi = (severity: Severity, title: string, confidence: number, recommendation: string, actionLabel: string, action: string) =>
      aiInsights.push({ id: `ai-status-${employeeId}-${Math.random().toString(16).slice(2)}`, severity, confidence, title, recommendation, actionLabel, action });

    if (employmentStatus === 'Active' && contract.contractStatus === 'Contract Expired' && typeof contract.contractExpiredDays === 'number') {
      addAi('high', `Employee is active but contract expired ${contract.contractExpiredDays} days ago`, 0.86, 'Initiate renewal or update employee status with escalation.', 'Change Status', 'open_change');
    }
    if ((employmentStatus === 'Exited' || employmentStatus === 'Terminated' || employmentStatus === 'Resigned') && String(overrides.payrollStatus || payrollDefault).toLowerCase().includes('eligible')) {
      addAi('high', 'Employee is exited but payroll eligibility remains active', 0.83, 'Disable payroll eligibility and run final settlement workflow.', 'Change Status', 'open_change');
    }
    if ((employmentStatus === 'Suspended' || employmentStatus === 'Blacklisted') && String(overrides.accessStatus || accessDefault).toLowerCase().includes('active')) {
      addAi('high', 'Suspended employee still has system access', 0.84, 'Route to IT Access Review stage and restrict access immediately.', 'Change Status', 'open_change');
    }
    if (employmentStatus === 'Probation') addAi('medium', 'Probation ended but confirmation status not updated', 0.72, 'Confirm employee or extend probation with approval.', 'Change Status', 'open_change');
    if (employmentStatus === 'On Leave') addAi('medium', 'Employee is on leave but attendance clock-in is active', 0.7, 'Disable attendance clock-in for leave duration.', 'Review Impact', 'open_change');
    if (contract.contractStatus === 'Contract Expired') addAi('medium', 'Contract employee has no renewal workflow initiated', 0.69, 'Create renewal request or escalate expiry.', 'Bulk Update', 'open_bulk');
    addAi('low', 'Exit status requires clearance completion', 0.62, 'Ensure clearance steps and asset recovery are completed.', 'View Impact', 'open_change');

    rec.audit.unshift(auditEntry('Status viewed', role));
    return jsonOk({
      employeeId,
      employeeName: rec.profile.fullName,
      currentStatus: {
        employmentStatus,
        employmentType,
        hrStatus: String(overrides.hrStatus || employmentStatus),
        payrollStatus: String(overrides.payrollStatus || payrollDefault),
        accessStatus: String(overrides.accessStatus || accessDefault),
        leaveStatus: String(overrides.leaveStatus || leaveDefault),
        probationStatus: String(overrides.probationStatus || probationDefault),
        contractStatus: String(overrides.contractStatus || contract.contractStatus),
        confirmationStatus: String(overrides.confirmationStatus || confirmationDefault),
        complianceStatus: String(overrides.complianceStatus || complianceDefault),
        exitStatus: String(overrides.exitStatus || exitDefault),
        effectiveDate: String(overrides.effectiveDate || rec.profile.employmentDetails?.statusEffectiveDate || rec.profile.dateJoined || nowIso().slice(0, 10)),
        statusReason: String(overrides.statusReason || rec.profile.employmentDetails?.statusReason || ''),
        responsibleOfficer: String(overrides.responsibleOfficer || rec.profile.jobDetails?.hrBusinessPartner || '—'),
        updatedAt: String(overrides.updatedAt || rec.profile.dateJoined || nowIso()),
      },
      summary: { lastStatusChangeAt, pendingRequestCount: pendingCount },
      aiInsights: aiInsights.slice(0, 10),
      requests,
      auditTrail: rec.audit.slice(0, 200),
    });
  }

  return jsonErr(404, 'Not found');
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string; resource: string[] }> }) {
  const { id, resource } = await ctx.params;
  const employeeId = id;
  const role = getRole(request);
  const viewerEmployeeId = getViewerEmployeeId(request);
  if (role === 'Employee' && (!viewerEmployeeId || viewerEmployeeId !== employeeId)) return jsonErr(403, 'Permission denied');
  const perms = rolePermissions(role, employeeId, viewerEmployeeId);
  if (!perms.canViewProfile) return jsonErr(403, 'Permission denied');
  if (!perms.canEdit && resource[0] !== 'status') return jsonErr(403, 'Permission denied');

  const rec = await ensureRecordFromDb(employeeId);
  const { root, rest } = getResource(resource);
  const body = (await request.json().catch(() => null)) as any;
  if (!body) return jsonErr(400, 'Invalid JSON body');

  if (root === 'job-information') {
    const jp = jobPermissions(role);
    if (!jp.canCreate) return jsonErr(403, 'Permission denied');

    const changeType = normalizeStr(body.changeType, 60) as JobChangeType | null;
    const allowed: JobChangeType[] = [
      'Job Title Change',
      'Department Change',
      'Grade Change',
      'Reporting Manager Change',
      'Functional Manager Change',
      'Location Change',
      'Project Assignment Change',
      'Cost Center Change',
      'Role Profile Update',
    ];
    if (!changeType || !allowed.includes(changeType)) return jsonErr(400, 'Invalid change type');

    const effectiveDate = normalizeStr(body.effectiveDate, 40);
    const reason = normalizeStr(body.reason, 600);
    if (!effectiveDate) return jsonErr(400, 'Effective date is required');
    if (!reason) return jsonErr(400, 'Reason is required');
    const eff = new Date(effectiveDate).getTime();
    if (!Number.isFinite(eff)) return jsonErr(400, 'Effective date is invalid');

    const notes = normalizeStr(body.notes, 1200);
    const requestId = normalizeStr(body.requestId, 120);

    const jobDetails = rec.profile.jobDetails || {};
    const employmentDetails = rec.profile.employmentDetails || {};
    const previousValues: Record<string, string | null> = {
      jobTitle: jobDetails.jobTitle ?? null,
      designation: jobDetails.designation ?? null,
      jobGrade: jobDetails.jobGrade ?? null,
      jobLevel: jobDetails.jobLevel ?? null,
      department: jobDetails.department ?? null,
      division: jobDetails.division ?? null,
      businessUnit: jobDetails.businessUnit ?? null,
      costCenter: jobDetails.costCenter ?? null,
      reportingManager: jobDetails.reportingManager ?? null,
      functionalManager: jobDetails.functionalManager ?? null,
      departmentHead: jobDetails.departmentHead ?? null,
      businessUnitHead: jobDetails.businessUnitHead ?? null,
      hrBusinessPartner: jobDetails.hrBusinessPartner ?? null,
      matrixReportingManager: jobDetails.matrixReportingManager ?? null,
      actingSupervisor: jobDetails.actingSupervisor ?? null,
      delegatedApprover: jobDetails.delegatedApprover ?? null,
      workLocation: employmentDetails.workLocation ?? null,
      officeSite: jobDetails.officeSite ?? null,
      projectSite: jobDetails.projectSite ?? null,
      currentProject: jobDetails.currentProject ?? null,
      projectCode: jobDetails.projectCode ?? null,
      projectLocation: jobDetails.projectLocation ?? null,
      client: jobDetails.client ?? null,
      siteSupervisor: jobDetails.siteSupervisor ?? null,
      assignmentStartDate: jobDetails.assignmentStartDate ?? null,
      assignmentEndDate: jobDetails.assignmentEndDate ?? null,
      assignmentStatus: jobDetails.assignmentStatus ?? null,
      mobilizationStatus: jobDetails.mobilizationStatus ?? null,
      demobilizationStatus: jobDetails.demobilizationStatus ?? null,
      roleSummary: jobDetails.roleSummary ?? null,
      roleProfile: jobDetails.roleProfile ?? null,
      jobPurpose: jobDetails.jobPurpose ?? null,
      jobDescription: jobDetails.jobDescription ?? null,
      keyResponsibilities: jobDetails.keyResponsibilities ?? null,
      technicalCompetencies: jobDetails.technicalCompetencies ?? null,
      behavioralCompetencies: jobDetails.behavioralCompetencies ?? null,
      requiredQualifications: jobDetails.requiredQualifications ?? null,
      requiredCertifications: jobDetails.requiredCertifications ?? null,
      requiredExperience: jobDetails.requiredExperience ?? null,
      kpis: jobDetails.kpis ?? null,
      performanceExpectations: jobDetails.performanceExpectations ?? null,
      hseResponsibilities: jobDetails.hseResponsibilities ?? null,
      complianceResponsibilities: jobDetails.complianceResponsibilities ?? null,
      workMode: employmentDetails.workMode ?? null,
      shiftPattern: employmentDetails.shiftPattern ?? null,
      staffCategory: employmentDetails.staffCategory ?? null,
      employeeCategory: employmentDetails.employeeCategory ?? null,
      employmentType: employmentDetails.employmentType ?? null,
    };

    const whitelist = new Set(Object.keys(previousValues));
    const incoming = body.newValues && typeof body.newValues === 'object' ? (body.newValues as Record<string, any>) : {};
    const normalizeAny = (v: any, max: number) => {
      if (v === null) return null;
      if (typeof v !== 'string') return null;
      const t = v.trim();
      if (!t) return null;
      return t.length > max ? t.slice(0, max) : t;
    };

    let req: JobChangeRequest | undefined;
    if (requestId) {
      const found = jobRequestsStore.get(requestId);
      if (!found) return jsonErr(404, 'Job change request not found');
      if (found.employeeId !== employeeId) return jsonErr(403, 'Permission denied');
      if (found.status !== 'Draft' && found.status !== 'Rejected') return jsonErr(400, 'Only Draft/Rejected requests can be edited');
      req = found;
    } else {
      const existingDraft = requestForEmployee(employeeId).find((r) => r.status === 'Draft' || r.status === 'Rejected');
      req = existingDraft || undefined;
    }

    const now = nowIso();
    if (!req) {
      req = {
        id: `jobreq-${employeeId}-${Math.random().toString(16).slice(2)}`,
        employeeId,
        employeeName: rec.profile.fullName,
        changeType,
        status: 'Draft',
        effectiveDate,
        reason,
        notes,
        previousValues,
        newValues: { ...previousValues },
        supportingDocuments: [],
        approvals: [],
        audit: [],
        createdBy: role,
        createdAt: now,
        updatedAt: now,
      };
      addRequestToIndex(employeeId, req.id);
    }

    const before = JSON.stringify({ changeType: req.changeType, status: req.status, effectiveDate: req.effectiveDate, reason: req.reason, notes: req.notes, newValues: req.newValues });

    req.changeType = changeType;
    req.effectiveDate = effectiveDate;
    req.reason = reason;
    req.notes = notes;
    req.employeeName = rec.profile.fullName;
    req.previousValues = previousValues;
    const nextValues: Record<string, string | null> = { ...req.newValues };
    for (const [k, v] of Object.entries(incoming)) {
      if (!whitelist.has(k)) continue;
      nextValues[k] = normalizeAny(v, 1800);
    }
    req.newValues = nextValues;

    const docs = Array.isArray(body.supportingDocuments) ? (body.supportingDocuments as any[]) : [];
    req.supportingDocuments = docs
      .filter((d) => d && typeof d === 'object')
      .map((d) => ({ id: normalizeStr((d as any).id, 120) || `doc-${Math.random().toString(16).slice(2)}`, name: normalizeStr((d as any).name, 200) || 'document' }))
      .slice(0, 10);

    const validateRequired = (key: keyof JobChangeRequest['newValues'], msg: string) => {
      const v = (req as JobChangeRequest).newValues[key as string];
      if (!v) throw new Error(msg);
    };
    try {
      if (changeType === 'Job Title Change') validateRequired('jobTitle', 'Job title is required');
      if (changeType === 'Grade Change') validateRequired('jobGrade', 'Job grade is required');
      if (changeType === 'Department Change') {
        validateRequired('department', 'Department is required');
        validateRequired('businessUnit', 'Business unit is required');
      }
      if (changeType === 'Reporting Manager Change') validateRequired('reportingManager', 'Reporting manager is required');
      if (changeType === 'Functional Manager Change') validateRequired('functionalManager', 'Functional manager is required');
      if (changeType === 'Location Change') validateRequired('workLocation', 'Work location is required');
      if (changeType === 'Project Assignment Change') validateRequired('projectSite', 'Project/site is required');
      if (changeType === 'Cost Center Change') validateRequired('costCenter', 'Cost center is required');
      if (changeType === 'Role Profile Update') validateRequired('jobDescription', 'Job description is required');

      const mgr = (req.newValues.reportingManager || '').toString().toLowerCase();
      const empName = rec.profile.fullName.toLowerCase();
      if (mgr && empName && mgr === empName) throw new Error('Manager cannot be same as employee');

      const cc = (req.newValues.costCenter || '').toString();
      const dep = (req.newValues.department || '').toString().toLowerCase();
      if (cc && dep) {
        if (dep.includes('engineering') && !cc.includes('ENG')) throw new Error('Cost center must belong to department');
        if (dep.includes('finance') && !cc.includes('FIN')) throw new Error('Cost center must belong to department');
        if (dep.includes('human') && !cc.includes('HR')) throw new Error('Cost center must belong to department');
        if (dep.includes('it') && !cc.includes('IT')) throw new Error('Cost center must belong to department');
      }
    } catch (e) {
      return jsonErr(400, e instanceof Error ? e.message : 'Validation failed');
    }

    req.updatedAt = now;
    jobRequestsStore.set(req.id, req);
    addRequestToIndex(employeeId, req.id);
    req.audit.unshift(auditEntry('Job information edited', role, { oldValue: before, newValue: JSON.stringify({ changeType: req.changeType, effectiveDate: req.effectiveDate, reason: req.reason, notes: req.notes, newValues: req.newValues }) }));
    rec.audit.unshift(auditEntry('Job change request edited', role, { reason: req.reason }));
    return jsonOk(req);
  }

  if (root === 'reporting-line') {
    const rp = reportingPermissions(role);
    if (!rp.canCreate) return jsonErr(403, 'Permission denied');

    const changeType = normalizeStr(body.changeType, 80) as ReportingChangeType | null;
    const allowed: ReportingChangeType[] = [
      'Manager Change',
      'Functional Manager Change',
      'Department Head Change',
      'Project Manager Change',
      'Matrix Manager Change',
      'Delegated Approver Change',
      'Temporary Reporting Assignment',
    ];
    if (!changeType || !allowed.includes(changeType)) return jsonErr(400, 'Invalid change type');

    const effectiveDate = normalizeStr(body.effectiveDate, 40);
    const endDate = normalizeStr(body.endDate, 40);
    const reason = normalizeStr(body.reason, 600);
    if (!effectiveDate) return jsonErr(400, 'Effective date is required');
    if (!reason) return jsonErr(400, 'Reason is required');
    const eff = new Date(effectiveDate).getTime();
    if (!Number.isFinite(eff)) return jsonErr(400, 'Effective date is invalid');
    const endMs = endDate ? new Date(endDate).getTime() : null;
    if (endDate && !Number.isFinite(endMs as number)) return jsonErr(400, 'End date is invalid');
    if (endMs && endMs < eff) return jsonErr(400, 'End date cannot be before effective date');
    if (changeType === 'Temporary Reporting Assignment' && !endDate) return jsonErr(400, 'Temporary reporting assignment must have end date');

    const notes = normalizeStr(body.notes, 1200);
    const requestId = normalizeStr(body.requestId, 140);

    const jobDetails = rec.profile.jobDetails || {};
    const previousValues: Record<string, string | null> = {
      directManager: jobDetails.reportingManager ?? null,
      functionalManager: jobDetails.functionalManager ?? null,
      departmentHead: jobDetails.departmentHead ?? null,
      unitHead: jobDetails.unitHead ?? null,
      businessUnitHead: jobDetails.businessUnitHead ?? null,
      projectManager: jobDetails.projectManager ?? null,
      siteSupervisor: jobDetails.siteSupervisor ?? null,
      matrixManager: jobDetails.matrixManager ?? null,
      dottedLineManager: (jobDetails as any).dottedLineManager ?? (jobDetails as any).dottedLineManager ?? null,
      hrBusinessPartner: jobDetails.hrBusinessPartner ?? null,
      delegatedApprover: jobDetails.delegatedApprover ?? null,
    };

    const whitelist = new Set(Object.keys(previousValues));
    const incoming = body.newValues && typeof body.newValues === 'object' ? (body.newValues as Record<string, any>) : {};
    const normalizeAny = (v: any, max: number) => {
      if (v === null) return null;
      if (typeof v !== 'string') return null;
      const t = v.trim();
      if (!t) return null;
      return t.length > max ? t.slice(0, max) : t;
    };

    let req: ReportingChangeRequest | undefined;
    if (requestId) {
      const found = reportingRequestsStore.get(requestId);
      if (!found) return jsonErr(404, 'Reporting change request not found');
      if (!found.isBulk && found.employeeId !== employeeId) return jsonErr(403, 'Permission denied');
      if (found.status !== 'Draft' && found.status !== 'Rejected') return jsonErr(400, 'Only Draft/Rejected requests can be edited');
      req = found;
    } else {
      const existingDraft = reportingRequestsForEmployee(employeeId).find((r) => r.status === 'Draft' || r.status === 'Rejected');
      req = existingDraft || undefined;
    }

    const now = nowIso();
    if (!req) {
      req = {
        id: `repreq-${employeeId}-${Math.random().toString(16).slice(2)}`,
        employeeId,
        employeeName: rec.profile.fullName,
        changeType,
        status: 'Draft',
        effectiveDate,
        endDate: endDate ?? null,
        reason,
        notes,
        previousValues,
        newValues: { ...previousValues },
        delegations: [],
        supportingDocuments: [],
        approvals: [],
        audit: [],
        createdBy: role,
        createdAt: now,
        updatedAt: now,
      };
      addReportingRequestToIndex(employeeId, req.id);
    }

    const before = JSON.stringify({ changeType: req.changeType, status: req.status, effectiveDate: req.effectiveDate, endDate: req.endDate, reason: req.reason, notes: req.notes, newValues: req.newValues, delegations: req.delegations });

    req.employeeName = rec.profile.fullName;
    req.changeType = changeType;
    req.effectiveDate = effectiveDate;
    req.endDate = endDate ?? null;
    req.reason = reason;
    req.notes = notes;
    req.previousValues = previousValues;

    const nextValues: Record<string, string | null> = { ...req.newValues };
    for (const [k, v] of Object.entries(incoming)) {
      if (!whitelist.has(k)) continue;
      nextValues[k] = normalizeAny(v, 600);
    }
    req.newValues = nextValues;

    const incomingDelegations = Array.isArray(body.delegations) ? (body.delegations as any[]) : [];
    const del: ReportingDelegation[] = incomingDelegations
      .filter((d) => d && typeof d === 'object')
      .map((d) => {
        const startDate = normalizeStr((d as any).startDate, 40) || effectiveDate;
        const endDateLocal = normalizeStr((d as any).endDate, 40) || endDate || '';
        const statusMs = Date.now();
        const st = new Date(startDate).getTime();
        const en = new Date(endDateLocal).getTime();
        const status: ReportingDelegation['status'] = Number.isFinite(st) && Number.isFinite(en) ? (statusMs < st ? 'Scheduled' : statusMs > en ? 'Expired' : 'Active') : 'Scheduled';
        const rawAssignmentType = normalizeStr((d as any).assignmentType, 60) || '';
        const rawApprovalScope = normalizeStr((d as any).approvalScope, 80) || '';
        const assignmentTypes: DelegationAssignmentType[] = [
          'Acting manager assignment',
          'Temporary supervisor',
          'Delegated approver',
          'Leave-cover manager',
          'Project supervisor',
          'Alternate approver',
        ];
        const scopes: DelegationScope[] = [
          'Leave Approval',
          'Attendance Approval',
          'Expense Approval',
          'Timesheet Approval',
          'HR Request Approval',
          'Project Approval',
          'All Workflow Approvals',
        ];
        const assignmentType: DelegationAssignmentType = assignmentTypes.includes(rawAssignmentType as DelegationAssignmentType) ? (rawAssignmentType as DelegationAssignmentType) : 'Delegated approver';
        const approvalScope: DelegationScope = scopes.includes(rawApprovalScope as DelegationScope) ? (rawApprovalScope as DelegationScope) : 'All Workflow Approvals';
        return {
          id: normalizeStr((d as any).id, 120) || `del-${Math.random().toString(16).slice(2)}`,
          assignmentType,
          assignedEmployee: normalizeStr((d as any).assignedEmployee, 140) || '',
          delegatedRole: normalizeStr((d as any).delegatedRole, 120) || '',
          startDate,
          endDate: endDateLocal || startDate,
          delegationReason: normalizeStr((d as any).delegationReason, 600) || reason,
          approvalScope,
          status,
        };
      })
      .slice(0, 20);
    req.delegations = del;

    const docs = Array.isArray(body.supportingDocuments) ? (body.supportingDocuments as any[]) : [];
    req.supportingDocuments = docs
      .filter((d) => d && typeof d === 'object')
      .map((d) => ({ id: normalizeStr((d as any).id, 120) || `doc-${Math.random().toString(16).slice(2)}`, name: normalizeStr((d as any).name, 200) || 'document' }))
      .slice(0, 10);

    try {
      const requireKey = (k: keyof ReportingChangeRequest['newValues'], msg: string) => {
        const v = (req as ReportingChangeRequest).newValues[k as string];
        if (!v) throw new Error(msg);
      };
      if (changeType === 'Manager Change') requireKey('directManager', 'Direct reporting manager is required');
      if (changeType === 'Functional Manager Change') requireKey('functionalManager', 'Functional manager is required');
      if (changeType === 'Department Head Change') requireKey('departmentHead', 'Department head is required');
      if (changeType === 'Project Manager Change') requireKey('projectManager', 'Project manager is required');
      if (changeType === 'Matrix Manager Change') requireKey('matrixManager', 'Matrix manager is required');
      if (changeType === 'Delegated Approver Change') requireKey('delegatedApprover', 'Delegated approver is required');
      if (changeType === 'Temporary Reporting Assignment' && !req.endDate) throw new Error('Temporary reporting assignment must have end date');

      const empName = rec.profile.fullName.toLowerCase();
      const dm = (req.newValues.directManager || '').toString().toLowerCase();
      if (dm && empName && dm === empName) throw new Error('Manager cannot be same as employee');
      if (detectCircularReporting(rec.profile.fullName, req.newValues.directManager || '', req.newValues.matrixManager || '', req.newValues.dottedLineManager || ''))
        throw new Error('Circular reporting must be blocked');

      const delegated = (req.newValues.delegatedApprover || '').toString();
      if (delegated && delegated.toLowerCase().includes('inactive')) throw new Error('Delegated approver must be active');
      for (const d of req.delegations) {
        if (!d.assignedEmployee) throw new Error('Delegated employee is required');
        const ds = new Date(d.startDate).getTime();
        const de = new Date(d.endDate).getTime();
        if (!Number.isFinite(ds) || !Number.isFinite(de)) throw new Error('Delegation start/end dates are invalid');
        if (de < ds) throw new Error('Delegation end date cannot be before start date');
      }
    } catch (e) {
      return jsonErr(400, e instanceof Error ? e.message : 'Validation failed');
    }

    req.updatedAt = now;
    reportingRequestsStore.set(req.id, req);
    addReportingRequestToIndex(employeeId, req.id);
    req.audit.unshift(
      auditEntry('Reporting line edited', role, {
        oldValue: before,
        newValue: JSON.stringify({ changeType: req.changeType, effectiveDate: req.effectiveDate, endDate: req.endDate, reason: req.reason, notes: req.notes, newValues: req.newValues, delegations: req.delegations }),
        reason: req.reason,
      })
    );
    rec.audit.unshift(auditEntry('Reporting change request edited', role, { reason: req.reason }));
    return jsonOk(req);
  }

  if (root === 'department-unit-assignment') {
    const ap = assignmentPermissions(role);
    if (!ap.canCreate) return jsonErr(403, 'Permission denied');

    const requestType = normalizeStr(body.requestType, 80) as AssignmentRequestType | null;
    const allowed: AssignmentRequestType[] = [
      'Department Transfer',
      'Unit Transfer',
      'Business Unit Transfer',
      'Cost Center Change',
      'Reporting Manager Change',
      'Project Reassignment',
      'Site Reassignment',
      'Temporary Assignment',
      'Secondment',
      'Acting Assignment',
    ];
    if (!requestType || !allowed.includes(requestType)) return jsonErr(400, 'Invalid request type');

    const assignmentType = (normalizeStr(body.assignmentType, 60) as AssignmentType | null) || 'Permanent Assignment';
    const assignmentStatus = (normalizeStr(body.assignmentStatus, 40) as AssignmentStatus | null) || 'Pending Approval';
    const effectiveDate = normalizeStr(body.effectiveDate, 40);
    const endDate = normalizeStr(body.endDate, 40);
    const reason = normalizeStr(body.reason, 600);
    if (!effectiveDate) return jsonErr(400, 'Effective date is required');
    if (!reason) return jsonErr(400, 'Reason is required');
    const eff = new Date(effectiveDate).getTime();
    if (!Number.isFinite(eff)) return jsonErr(400, 'Effective date is invalid');
    const endMs = endDate ? new Date(endDate).getTime() : null;
    if (endDate && !Number.isFinite(endMs as number)) return jsonErr(400, 'End date is invalid');
    if (endMs && endMs < eff) return jsonErr(400, 'End date cannot be before effective date');
    if (assignmentType === 'Temporary Assignment' && !endDate) return jsonErr(400, 'Temporary assignment must have end date');

    const notes = normalizeStr(body.notes, 1200);
    const requestId = normalizeStr(body.requestId, 140);

    const jobDetails = rec.profile.jobDetails || {};
    const employmentDetails = rec.profile.employmentDetails || {};
    const previousValues: Record<string, string | null> = {
      department: jobDetails.department ?? null,
      division: jobDetails.division ?? null,
      unit: jobDetails.unit ?? null,
      team: jobDetails.team ?? null,
      businessUnit: jobDetails.businessUnit ?? null,
      costCenter: jobDetails.costCenter ?? null,
      workLocation: employmentDetails.workLocation ?? jobDetails.location ?? null,
      officeSite: jobDetails.officeSite ?? null,
      projectSite: jobDetails.projectSite ?? null,
      reportingManager: jobDetails.reportingManager ?? null,
      functionalManager: jobDetails.functionalManager ?? null,
      departmentHead: jobDetails.departmentHead ?? null,
      unitHead: jobDetails.unitHead ?? null,
      businessUnitHead: jobDetails.businessUnitHead ?? null,
      projectManager: jobDetails.projectManager ?? null,
      siteSupervisor: jobDetails.siteSupervisor ?? null,
      matrixManager: jobDetails.matrixManager ?? null,
      delegatedApprover: jobDetails.delegatedApprover ?? null,
      hrBusinessPartner: jobDetails.hrBusinessPartner ?? null,
      workMode: employmentDetails.workMode ?? null,
      shiftPattern: employmentDetails.shiftPattern ?? null,
      projectName: jobDetails.projectName ?? jobDetails.currentProject ?? null,
      projectCode: jobDetails.projectCode ?? null,
      client: jobDetails.client ?? null,
      projectLocation: jobDetails.projectLocation ?? null,
      siteLocation: jobDetails.siteLocation ?? null,
      mobilizationStatus: jobDetails.mobilizationStatus ?? null,
      demobilizationStatus: jobDetails.demobilizationStatus ?? null,
      siteAccessRequirement: jobDetails.siteAccessRequirement ?? null,
      ppeRequirement: jobDetails.ppeRequirement ?? null,
      hseInductionStatus: jobDetails.hseInductionStatus ?? null,
    };

    const whitelist = new Set(Object.keys(previousValues));
    const incoming = body.newValues && typeof body.newValues === 'object' ? (body.newValues as Record<string, any>) : {};
    const normalizeAny = (v: any, max: number) => {
      if (v === null) return null;
      if (typeof v !== 'string') return null;
      const t = v.trim();
      if (!t) return null;
      return t.length > max ? t.slice(0, max) : t;
    };

    let req: AssignmentRequest | undefined;
    if (requestId) {
      const found = assignmentRequestsStore.get(requestId);
      if (!found) return jsonErr(404, 'Assignment request not found');
      if (found.employeeId !== employeeId) return jsonErr(403, 'Permission denied');
      if (found.status !== 'Draft' && found.status !== 'Rejected') return jsonErr(400, 'Only Draft/Rejected requests can be edited');
      req = found;
    } else {
      const existingDraft = assignmentRequestsForEmployee(employeeId).find((r) => r.status === 'Draft' || r.status === 'Rejected');
      req = existingDraft || undefined;
    }

    const now = nowIso();
    if (!req) {
      req = {
        id: `asgreq-${employeeId}-${Math.random().toString(16).slice(2)}`,
        employeeId,
        employeeName: rec.profile.fullName,
        requestType,
        status: 'Draft',
        effectiveDate,
        endDate: endDate ?? null,
        reason,
        notes,
        previousValues,
        newValues: { ...previousValues },
        assignmentType,
        assignmentStatus,
        supportingDocuments: [],
        approvals: [],
        audit: [],
        createdBy: role,
        createdAt: now,
        updatedAt: now,
      };
      addAssignmentRequestToIndex(employeeId, req.id);
    }

    const before = JSON.stringify({
      requestType: req.requestType,
      status: req.status,
      effectiveDate: req.effectiveDate,
      endDate: req.endDate,
      reason: req.reason,
      notes: req.notes,
      newValues: req.newValues,
      assignmentType: req.assignmentType,
      assignmentStatus: req.assignmentStatus,
    });

    req.requestType = requestType;
    req.effectiveDate = effectiveDate;
    req.endDate = endDate ?? null;
    req.reason = reason;
    req.notes = notes;
    req.employeeName = rec.profile.fullName;
    req.previousValues = previousValues;
    req.assignmentType = assignmentType;
    req.assignmentStatus = assignmentStatus;

    const nextValues: Record<string, string | null> = { ...req.newValues };
    for (const [k, v] of Object.entries(incoming)) {
      if (!whitelist.has(k)) continue;
      nextValues[k] = normalizeAny(v, 1800);
    }
    req.newValues = nextValues;

    const docs = Array.isArray(body.supportingDocuments) ? (body.supportingDocuments as any[]) : [];
    req.supportingDocuments = docs
      .filter((d) => d && typeof d === 'object')
      .map((d) => ({ id: normalizeStr((d as any).id, 120) || `doc-${Math.random().toString(16).slice(2)}`, name: normalizeStr((d as any).name, 200) || 'document' }))
      .slice(0, 12);

    try {
      const need = (key: string, msg: string) => {
        if (!req!.newValues[key]) throw new Error(msg);
      };
      need('department', 'Department is required');
      need('businessUnit', 'Business unit is required');
      const mgr = (req.newValues.reportingManager || '').toString().toLowerCase();
      const empName = rec.profile.fullName.toLowerCase();
      if (mgr && empName && mgr === empName) throw new Error('Manager cannot be same as employee');
      if (requestType === 'Reporting Manager Change') need('reportingManager', 'Reporting manager is required');
      if (requestType === 'Cost Center Change') need('costCenter', 'Cost center is required');
      if (requestType === 'Project Reassignment' || requestType === 'Site Reassignment') need('projectName', 'Project name is required');

      const cc = (req.newValues.costCenter || '').toString();
      const dep = (req.newValues.department || '').toString().toLowerCase();
      if (cc && dep) {
        if (dep.includes('engineering') && !cc.includes('ENG')) throw new Error('Cost center must belong to selected department');
        if (dep.includes('finance') && !cc.includes('FIN')) throw new Error('Cost center must belong to selected department');
        if (dep.includes('human') && !cc.includes('HR')) throw new Error('Cost center must belong to selected department');
        if (dep.includes('it') && !cc.includes('IT')) throw new Error('Cost center must belong to selected department');
      }
    } catch (e) {
      return jsonErr(400, e instanceof Error ? e.message : 'Validation failed');
    }

    req.updatedAt = now;
    assignmentRequestsStore.set(req.id, req);
    addAssignmentRequestToIndex(employeeId, req.id);
    req.audit.unshift(auditEntry('Assignment edited', role, { oldValue: before, newValue: JSON.stringify({ requestType: req.requestType, effectiveDate: req.effectiveDate, endDate: req.endDate, reason: req.reason, notes: req.notes, newValues: req.newValues }) }));
    rec.audit.unshift(auditEntry('Assignment request edited', role, { reason: req.reason }));
    return jsonOk(req);
  }

  if (root === 'personal-info') {
    const next = { ...rec.profile.personalInfo };
    for (const k of Object.keys(next)) {
      if (!(k in body)) continue;
      const v = normalizeStr(body[k], 500);
      next[k] = v;
    }
    const phone = body.personalPhone ? normalizeStr(body.personalPhone, 40) : null;
    if (phone && !validatePhone(phone)) return jsonErr(400, 'Phone number must be valid');
    if (phone) next.personalPhone = phone;
    rec.profile.personalInfo = next;
    rec.audit.unshift(auditEntry('Edited personal information', role));
    await persistHrisProfileToEnterprise(rec);
    return jsonOk(sanitizeProfileForRole(rec, perms).personalInfo);
  }

  if (root === 'employment') {
    const next = { ...rec.profile.employmentDetails };
    for (const k of Object.keys(next)) {
      if (!(k in body)) continue;
      next[k] = normalizeStr(body[k], 200);
    }
    const dateJoined = next.dateJoined ? new Date(`${next.dateJoined}T00:00:00.000Z`).getTime() : null;
    if (dateJoined && dateJoined > Date.now()) return jsonErr(400, 'Date joined cannot be future date');
    const ps = next.probationStartDate ? new Date(`${next.probationStartDate}T00:00:00.000Z`).getTime() : null;
    const pe = next.probationEndDate ? new Date(`${next.probationEndDate}T00:00:00.000Z`).getTime() : null;
    if (ps && pe && pe < ps) return jsonErr(400, 'Probation end date cannot be before probation start date');
    const cs = next.contractStartDate ? new Date(`${next.contractStartDate}T00:00:00.000Z`).getTime() : null;
    const ce = next.contractEndDate ? new Date(`${next.contractEndDate}T00:00:00.000Z`).getTime() : null;
    if (cs && ce && ce < cs) return jsonErr(400, 'Contract end date cannot be before contract start date');
    const exit = next.exitDate ? new Date(`${next.exitDate}T00:00:00.000Z`).getTime() : null;
    if (exit && dateJoined && exit < dateJoined) return jsonErr(400, 'Exit date cannot be before date joined');
    rec.profile.employmentDetails = next;
    rec.audit.unshift(auditEntry('Updated employment details', role));
    await persistHrisProfileToEnterprise(rec);
    return jsonOk(rec.profile.employmentDetails);
  }

  if (root === 'job') {
    const next = { ...rec.profile.jobDetails };
    for (const k of Object.keys(next)) {
      if (!(k in body)) continue;
      next[k] = normalizeStr(body[k], 500);
    }
    if (body.reportingManager && normalizeStr(body.reportingManager, 200) === rec.profile.fullName) return jsonErr(400, 'Manager cannot be same as employee');
    rec.profile.jobDetails = next;
    if (typeof next.jobTitle === 'string' && next.jobTitle.trim()) rec.profile.jobTitle = next.jobTitle;
    if (typeof next.department === 'string' && next.department.trim()) rec.profile.department = next.department;
    if (typeof next.businessUnit === 'string' && next.businessUnit.trim()) rec.profile.businessUnit = next.businessUnit;
    if (typeof next.reportingManager === 'string' && next.reportingManager.trim()) rec.profile.reportingManager = next.reportingManager;
    rec.audit.unshift(auditEntry('Changed department/job details', role));
    await persistHrisProfileToEnterprise(rec);
    return jsonOk(rec.profile.jobDetails);
  }

  if (root === 'contacts') {
    const next = { ...rec.profile.contacts };
    for (const k of Object.keys(next)) {
      if (!(k in body)) continue;
      next[k] = normalizeStr(body[k], 500);
    }
    const phone = body.primaryPhone ? normalizeStr(body.primaryPhone, 40) : null;
    if (phone && !validatePhone(phone)) return jsonErr(400, 'Phone number must be valid');
    if (phone) next.primaryPhone = phone;
    rec.profile.contacts = next;
    rec.audit.unshift(auditEntry('Updated contact information', role));
    await persistHrisProfileToEnterprise(rec);
    return jsonOk(rec.profile.contacts);
  }

  if (root === 'emergency-contacts') {
    const contactId = rest[0];
    if (!contactId) return jsonErr(400, 'Missing contactId');
    const idx = rec.emergencyContacts.findIndex((c) => c.id === contactId);
    if (idx < 0) return jsonErr(404, 'Emergency contact not found');
    const current = rec.emergencyContacts[idx];
    const nextPhone = normalizeStr(body.phoneNumber, 40) ?? normalizeStr(body.primaryPhone, 40) ?? normalizeStr(body.primaryPhoneNumber, 40);
    const nextAlt = normalizeStr(body.alternativePhone, 40) ?? normalizeStr(body.alternatePhone, 40) ?? normalizeStr(body.alternatePhoneNumber, 40);
    const pctRaw = body.beneficiaryPercentage;
    const pct = typeof pctRaw === 'number' && Number.isFinite(pctRaw) ? Math.max(0, Math.min(100, pctRaw)) : current.beneficiaryPercentage ?? null;
    const next: EmergencyContact = {
      ...current,
      fullName: normalizeStr(body.fullName, 200) ?? current.fullName,
      relationship: normalizeStr(body.relationship, 120) ?? current.relationship,
      phoneNumber: nextPhone ?? current.phoneNumber,
      alternativePhone: nextAlt ?? current.alternativePhone ?? null,
      email: normalizeStr(body.email, 200) ?? current.email ?? null,
      address: normalizeStr(body.address, 500) ?? normalizeStr(body.residentialAddress, 500) ?? current.address ?? null,
      city: normalizeStr(body.city, 120) ?? current.city ?? null,
      state: normalizeStr(body.state, 120) ?? current.state ?? null,
      country: normalizeStr(body.country, 120) ?? current.country ?? null,
      nearestLandmark: normalizeStr(body.nearestLandmark, 200) ?? current.nearestLandmark ?? null,
      preferredContactMethod: (normalizeStr(body.preferredContactMethod, 60) as any) ?? current.preferredContactMethod ?? null,
      gender: normalizeStr(body.gender, 40) ?? current.gender ?? null,
      dateOfBirth: normalizeStr(body.dateOfBirth, 40) ?? current.dateOfBirth ?? null,
      isPrimary: typeof body.isPrimary === 'boolean' ? body.isPrimary : current.isPrimary,
      isNextOfKin: typeof body.isNextOfKin === 'boolean' ? body.isNextOfKin : current.isNextOfKin,
      isBeneficiary: typeof body.isBeneficiary === 'boolean' ? body.isBeneficiary : current.isBeneficiary,
      beneficiaryPercentage: (typeof body.isBeneficiary === 'boolean' ? body.isBeneficiary : current.isBeneficiary) ? pct : null,
      verificationStatus: (normalizeStr(body.verificationStatus, 40) as any) ?? current.verificationStatus ?? 'Unverified',
      lastVerifiedAt: normalizeStr(body.lastVerifiedAt, 40) ?? current.lastVerifiedAt ?? null,
      verifiedBy: normalizeStr(body.verifiedBy, 120) ?? current.verifiedBy ?? null,
      notes: normalizeStr(body.notes, 1200) ?? current.notes ?? null,
    };
    if (!validatePhone(next.phoneNumber)) return jsonErr(400, 'Phone number must be valid');
    rec.emergencyContacts[idx] = next;
    const err = validateEmergencyContacts(rec.emergencyContacts);
    if (err) return jsonErr(400, err);
    rec.audit.unshift(auditEntry('Updated emergency contact', role));
    await persistEmergencyContactsToEnterprise(rec);
    return jsonOk(rec.emergencyContacts);
  }

  if (root === 'next-of-kin') {
    const nokId = rest[0];
    if (!nokId) return jsonErr(400, 'Missing nokId');
    const idx = rec.nextOfKin.findIndex((c) => c.id === nokId);
    if (idx < 0) return jsonErr(404, 'Next of kin record not found');
    const current = rec.nextOfKin[idx];

    const nextPrimaryPhone =
      normalizeStr(body.primaryPhone, 40) ?? normalizeStr(body.phoneNumber, 40) ?? normalizeStr(body.primaryPhoneNumber, 40) ?? current.primaryPhone;
    const nextAlternatePhone =
      normalizeStr(body.alternatePhone, 40) ?? normalizeStr(body.alternativePhone, 40) ?? normalizeStr(body.alternatePhoneNumber, 40) ?? current.alternatePhone ?? null;
    if (!validatePhone(nextPrimaryPhone)) return jsonErr(400, 'Primary phone number must be valid');
    const nextEmail = normalizeStr(body.email, 200) ?? current.email ?? null;
    if (nextEmail && !validateEmail(nextEmail)) return jsonErr(400, 'Email must be valid');

    const isBeneficiary = typeof body.isBeneficiary === 'boolean' ? body.isBeneficiary : current.beneficiary.isBeneficiary;
    const pctRaw = body.beneficiaryPercentage;
    const pct = typeof pctRaw === 'number' && Number.isFinite(pctRaw) ? Math.max(0, Math.min(100, pctRaw)) : current.beneficiary.beneficiaryPercentage ?? null;
    const updatedAt = nowIso();
    const next: NextOfKinRecord = {
      ...current,
      fullName: normalizeStr(body.fullName, 200) ?? current.fullName,
      relationship: normalizeStr(body.relationship, 120) ?? current.relationship,
      gender: normalizeStr(body.gender, 40) ?? current.gender ?? null,
      dateOfBirth: normalizeStr(body.dateOfBirth, 40) ?? current.dateOfBirth ?? null,
      primaryPhone: nextPrimaryPhone,
      alternatePhone: nextAlternatePhone,
      email: nextEmail,
      residentialAddress: normalizeStr(body.residentialAddress, 500) ?? normalizeStr(body.address, 500) ?? current.residentialAddress ?? null,
      city: normalizeStr(body.city, 120) ?? current.city ?? null,
      state: normalizeStr(body.state, 120) ?? current.state ?? null,
      country: normalizeStr(body.country, 120) ?? current.country ?? null,
      nearestLandmark: normalizeStr(body.nearestLandmark, 200) ?? current.nearestLandmark ?? null,
      preferredContactMethod: (normalizeStr(body.preferredContactMethod, 80) as any) ?? current.preferredContactMethod ?? null,
      isPrimary: typeof body.isPrimary === 'boolean' ? body.isPrimary : current.isPrimary,
      isEmergencyContact: typeof body.isEmergencyContact === 'boolean' ? body.isEmergencyContact : current.isEmergencyContact,
      relationshipEvidenceType: normalizeStr(body.relationshipEvidenceType, 120) ?? current.relationshipEvidenceType ?? null,
      notes: normalizeStr(body.notes, 1200) ?? current.notes ?? null,
      beneficiary: {
        ...current.beneficiary,
        isBeneficiary,
        beneficiaryPercentage: isBeneficiary ? pct : null,
      },
      updatedAt,
      updatedBy: role,
    };

    const nextList = rec.nextOfKin.map((c, i) => (i === idx ? next : c));
    if (next.isPrimary) {
      rec.nextOfKin = nextList.map((c) => (c.id === next.id ? c : { ...c, isPrimary: false }));
    } else {
      rec.nextOfKin = nextList;
    }
    const err = validateNextOfKin(rec.nextOfKin, rec.profile.employmentStatus);
    if (err) return jsonErr(400, err);

    rec.audit.unshift(auditEntry('Updated next of kin', role, { reason: next.fullName }));
    return jsonOk(rec.nextOfKin);
  }

  if (root === 'status') {
    if (!perms.canChangeStatus) return jsonErr(403, 'Permission denied');
    const requestId = normalizeStr(body.requestId, 120);
    if (requestId) {
      const req = statusRequestsStore.get(requestId);
      if (!req) return jsonErr(404, 'Status change request not found');
      if (String(req.employeeId || '') !== employeeId) return jsonErr(403, 'Permission denied');
      if (!['Draft', 'Rejected'].includes(String(req.workflowStatus || ''))) return jsonErr(400, 'Only Draft/Rejected requests can be edited');

      const action = normalizeStr(body.action, 80) || String(req.action || 'Change Status');
      const effectiveDate = normalizeStr(body.effectiveDate, 40);
      const reason = normalizeStr(body.reason, 600);
      if (!effectiveDate) return jsonErr(400, 'Effective date is required');
      if (!reason) return jsonErr(400, 'Status change reason is required');
      const eff = new Date(effectiveDate).getTime();
      if (!Number.isFinite(eff)) return jsonErr(400, 'Effective date is invalid');

      const newEmploymentStatus = normalizeStr(body.newEmploymentStatus, 60) || normalizeStr(body.employmentStatus, 60);
      const allowed = [
        'Active',
        'Probation',
        'Confirmed',
        'On Leave',
        'Suspended',
        'Terminated',
        'Resigned',
        'Retired',
        'Contract Active',
        'Contract Expired',
        'Seconded',
        'Inactive',
        'Exited',
        'Reactivated',
        'Blacklisted',
        'Deceased',
        'Contract',
        'Field Assignment',
      ];
      if (!newEmploymentStatus || !allowed.includes(newEmploymentStatus)) return jsonErr(400, 'Invalid employment status');

      const current = String(rec.profile.employmentStatus || 'Active');
      if (newEmploymentStatus === 'Active' && ['Terminated', 'Exited', 'Resigned', 'Retired', 'Deceased', 'Blacklisted'].includes(current) && !action.toLowerCase().includes('reactivate'))
        return jsonErr(400, 'Terminated/exited employees require reactivation workflow');
      if (newEmploymentStatus === 'On Leave' && ['Exited', 'Terminated', 'Resigned', 'Retired', 'Deceased'].includes(current)) return jsonErr(400, 'Exited employees cannot be placed on leave');

      if (newEmploymentStatus === 'Confirmed' && current === 'Probation') {
        const end = (rec.profile.employmentDetails?.probationEndDate || '').toString();
        if (end) {
          const endMs = new Date(end).getTime();
          if (Number.isFinite(endMs) && Date.now() < endMs && !(role === 'Super Admin' || role === 'HR Director')) return jsonErr(400, 'Probation end date has not been reached');
        }
      }

      const prev = JSON.stringify({ action: req.action, newStatus: req.newStatus, effectiveDate: req.effectiveDate, reason: req.reason });
      req.action = action;
      req.effectiveDate = effectiveDate;
      req.reason = reason;
      req.responsibleOfficer = normalizeStr(body.responsibleOfficer, 160) || null;
      req.newStatus = { ...(req.newStatus || {}), employmentStatus: newEmploymentStatus };
      req.impact = statusImpactFor(newEmploymentStatus, action);
      req.updatedAt = nowIso();
      req.audit = Array.isArray(req.audit) ? req.audit : [];
      req.audit.unshift(auditEntry('Status change request edited', role, { oldValue: prev, newValue: JSON.stringify({ action, newEmploymentStatus, effectiveDate }), reason }));
      statusRequestsStore.set(requestId, req);
      rec.audit.unshift(auditEntry('Status change request edited', role, { reason }));
      return jsonOk(req);
    }

    const nextStatus = normalizeStr(body.employmentStatus, 60) as EmployeeStatus | null;
    const allowed: EmployeeStatus[] = [
      'Active',
      'On Leave',
      'Probation',
      'Confirmed',
      'Suspended',
      'Resigned',
      'Terminated',
      'Retired',
      'Seconded',
      'Inactive',
      'Exited',
      'Reactivated',
      'Blacklisted',
      'Deceased',
      'Contract',
      'Contract Active',
      'Contract Expired',
      'Field Assignment',
    ];
    if (!nextStatus || !allowed.includes(nextStatus)) return jsonErr(400, 'Invalid employment status');
    const prev = rec.profile.employmentStatus;
    rec.profile.employmentStatus = nextStatus;
    rec.profile.employmentDetails.employmentStatus = nextStatus;
    statusOverridesStore.set(employeeId, {
      employeeId,
      hrStatus: nextStatus,
      payrollStatus: ['Active', 'Confirmed', 'Probation', 'Reactivated', 'Contract Active'].includes(nextStatus) ? 'Eligible' : 'Ineligible',
      accessStatus: ['Active', 'Confirmed', 'Probation', 'On Leave', 'Contract Active', 'Seconded', 'Reactivated'].includes(nextStatus) ? 'Active' : 'Restricted',
      leaveStatus: nextStatus === 'On Leave' ? 'On Leave' : 'Not on Leave',
      probationStatus: nextStatus === 'Probation' ? 'In Probation' : nextStatus === 'Confirmed' ? 'Completed' : '—',
      contractStatus: nextStatus === 'Contract Expired' ? 'Contract Expired' : nextStatus === 'Contract Active' ? 'Contract Active' : '—',
      confirmationStatus: nextStatus === 'Confirmed' ? 'Confirmed' : nextStatus === 'Probation' ? 'Pending' : '—',
      complianceStatus: ['Blacklisted', 'Deceased'].includes(nextStatus) ? 'High Risk' : ['Terminated', 'Resigned', 'Exited', 'Retired'].includes(nextStatus) ? 'Clearance Required' : 'OK',
      exitStatus: ['Terminated', 'Resigned', 'Exited', 'Retired', 'Deceased'].includes(nextStatus) ? nextStatus : '—',
      effectiveDate: normalizeStr(body.effectiveDate, 40) || nowIso().slice(0, 10),
      statusReason: normalizeStr(body.reason, 600) || 'Status change',
      responsibleOfficer: normalizeStr(body.responsibleOfficer, 160) || null,
      updatedAt: nowIso(),
    });
    rec.audit.unshift(auditEntry('Changed status', role, { oldValue: prev, newValue: nextStatus, reason: normalizeStr(body.reason, 240) ?? 'Status change' }));
    rec.history.unshift({ id: `h-${employeeId}-${Math.random().toString(16).slice(2)}`, at: nowIso(), type: 'Status Change', detail: `${prev} → ${nextStatus}`, actor: role });
    await persistHrisProfileToEnterprise(rec);
    return jsonOk({ employmentStatus: nextStatus });
  }

  if (root === 'payroll') {
    if (!perms.canEditPayroll) return jsonErr(403, 'Permission denied');
    const next = { ...rec.payrollSummary };
    if (body.salaryGrade !== undefined) next.salaryGrade = normalizeStr(body.salaryGrade, 120) || next.salaryGrade;
    if (body.payrollGroup !== undefined) next.payrollGroup = normalizeStr(body.payrollGroup, 200);
    if (body.bankName !== undefined) next.bankName = normalizeStr(body.bankName, 150);
    if (body.pensionProvider !== undefined) next.pensionProvider = normalizeStr(body.pensionProvider, 150);
    if (body.taxId !== undefined) next.taxId = normalizeStr(body.taxId, 80);
    if (body.basicSalary !== undefined) {
      const amount = Number(body.basicSalary);
      next.basicSalary = Number.isFinite(amount) ? amount : null;
    }
    if (body.allowances !== undefined) {
      const amount = Number(body.allowances);
      next.allowances = Number.isFinite(amount) ? amount : null;
    }
    if (body.deductions !== undefined) {
      const amount = Number(body.deductions);
      next.deductions = Number.isFinite(amount) ? amount : null;
    }
    if (body.accountNumber !== undefined) {
      const account = normalizeStr(body.accountNumber, 50);
      next.accountNumberMasked = account ? `****${account.slice(-4)}` : next.accountNumberMasked;
    }
    rec.payrollSummary = next;
    rec.audit.unshift(auditEntry('Updated payroll summary', role));
    await syncHrisEmployeeProfileToDb({
      employeeCode: rec.profile.employeeId,
      payrollSetup: {
        payrollGroup: next.payrollGroup,
        salaryGrade: next.salaryGrade,
        periodSalary: next.basicSalary,
        annualSalary: next.basicSalary ? Number(next.basicSalary) * 12 : null,
        bankName: next.bankName,
        accountNumber: normalizeStr(body.accountNumber, 50),
        pensionProvider: next.pensionProvider,
        taxIdentificationNumber: next.taxId,
      },
    }).then((synced) => {
      if (synced) invalidateHrisEmployeeCaches();
    });
    return jsonOk(sanitizePayrollForRole(rec.payrollSummary, perms));
  }

  if (root === 'profile-extensions') {
    if (!perms.canEdit) return jsonErr(403, 'Permission denied');
    const { writeEmployeeProfileExtensions } = await import('@/lib/employee-profile-extensions-store');
    const patch: Record<string, unknown> = {};
    if (body.medicalHse && typeof body.medicalHse === 'object') {
      rec.medicalHse = { ...rec.medicalHse, ...(body.medicalHse as object) };
      patch.medicalHse = rec.medicalHse;
    }
    if (Array.isArray(body.training)) {
      rec.training = body.training as EmployeeRecord['training'];
      patch.training = rec.training;
    }
    if (Array.isArray(body.assets)) {
      rec.assets = body.assets as EmployeeRecord['assets'];
      patch.assets = rec.assets;
    }
    if (body.performanceSummary && typeof body.performanceSummary === 'object') {
      rec.performanceSummary = { ...rec.performanceSummary, ...(body.performanceSummary as object) };
      patch.performanceSummary = rec.performanceSummary;
    }
    if (Array.isArray(body.disciplinary)) {
      rec.disciplinary = body.disciplinary as EmployeeRecord['disciplinary'];
      patch.disciplinary = rec.disciplinary;
    }
    const saved = await writeEmployeeProfileExtensions(rec.profile.employeeId, patch);
    rec.audit.unshift(auditEntry('Updated profile extensions', role));
    return jsonOk(saved);
  }

  if (root === 'ai-insights') {
    const next = Array.isArray(body) ? (body as AIInsight[]) : null;
    if (!next) return jsonErr(400, 'Invalid insights payload');
    rec.aiInsights = next.slice(0, 24);
    rec.audit.unshift(auditEntry('Updated AI insights', role));
    return jsonOk(rec.aiInsights);
  }

  return jsonErr(404, 'Not found');
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string; resource: string[] }> }) {
  const { id, resource } = await ctx.params;
  const employeeId = id;
  const role = getRole(request);
  const viewerEmployeeId = getViewerEmployeeId(request);
  if (role === 'Employee' && (!viewerEmployeeId || viewerEmployeeId !== employeeId)) return jsonErr(403, 'Permission denied');
  const perms = rolePermissions(role, employeeId, viewerEmployeeId);
  if (!perms.canViewProfile) return jsonErr(403, 'Permission denied');

  const rec = await ensureRecordFromDb(employeeId);
  const { root, rest } = getResource(resource);
  const body = (await request.json().catch(() => null)) as any;
  if (!body) return jsonErr(400, 'Invalid JSON body');
  if (!perms.canEdit) {
    if (
      !(
        (root === 'emergency-contacts' && rest[0] === 'request-update') ||
        (root === 'next-of-kin' && rest[0] === 'request-update') ||
        (root === 'documents' && (rest.length === 0 || rest[0] === 'bulk-upload'))
      )
    )
      return jsonErr(403, 'Permission denied');
  }

  if (root === 'emergency-contacts') {
    if (rest[0] === 'request-update') {
      const g = globalThis as unknown as { __dleHrisEmergencyContactUpdateRequestsByEmployee?: Map<string, any[]> };
      if (!g.__dleHrisEmergencyContactUpdateRequestsByEmployee) g.__dleHrisEmergencyContactUpdateRequestsByEmployee = new Map();
      const map = g.__dleHrisEmergencyContactUpdateRequestsByEmployee;
      const now = nowIso();
      const reason = normalizeStr(body.reason, 600) ?? 'Employee update requested';
      const req = {
        id: `ecupd-${employeeId}-${Math.random().toString(16).slice(2)}`,
        employeeId,
        employeeName: rec.profile.fullName,
        requestedBy: role,
        status: 'Pending HR Review',
        reason,
        createdAt: now,
        updatedAt: now,
      };
      const cur = map.get(employeeId) || [];
      map.set(employeeId, [req, ...cur].slice(0, 120));
      rec.audit.unshift(auditEntry('Employee update requested (emergency contacts)', role, { reason }));
      return jsonOk(req);
    }

    if (!perms.canEdit) return jsonErr(403, 'Permission denied');

    const contactId = rest[0];
    const action = rest[1];
    if (contactId && action) {
      const idx = rec.emergencyContacts.findIndex((c) => c.id === contactId);
      if (idx < 0) return jsonErr(404, 'Emergency contact not found');
      const current = rec.emergencyContacts[idx];

      if (action === 'verify') {
        const method = normalizeStr(body.method, 80) ?? normalizeStr(body.verificationMethod, 80) ?? 'HR Manual Verification';
        const status = (normalizeStr(body.verificationStatus, 40) as any) || 'Verified';
        const updated: EmergencyContact = {
          ...current,
          verificationStatus: status,
          lastVerifiedAt: nowIso(),
          verifiedBy: role,
          preferredContactMethod: (normalizeStr(body.preferredContactMethod, 60) as any) ?? current.preferredContactMethod ?? method,
        };
        rec.emergencyContacts[idx] = updated;
        rec.audit.unshift(auditEntry('Emergency contact verified', role, { reason: method }));
        return jsonOk(updated);
      }

      if (action === 'set-primary') {
        rec.emergencyContacts = rec.emergencyContacts.map((c) => ({ ...c, isPrimary: c.id === contactId }));
        const err = validateEmergencyContacts(rec.emergencyContacts);
        if (err) return jsonErr(400, err);
        rec.audit.unshift(auditEntry('Primary contact changed', role, { reason: current.fullName }));
        return jsonOk(rec.emergencyContacts);
      }

      if (action === 'set-next-of-kin') {
        const set = Boolean(body.value ?? true);
        rec.emergencyContacts = rec.emergencyContacts.map((c) => (c.id === contactId ? { ...c, isNextOfKin: set } : c));
        const err = validateEmergencyContacts(rec.emergencyContacts);
        if (err) return jsonErr(400, err);
        rec.audit.unshift(auditEntry('Next of kin changed', role, { reason: current.fullName }));
        return jsonOk(rec.emergencyContacts);
      }

      return jsonErr(404, 'Not found');
    }

    const fullName = normalizeStr(body.fullName, 200);
    const relationship = normalizeStr(body.relationship, 120);
    const phone = normalizeStr(body.phoneNumber, 40) ?? normalizeStr(body.primaryPhone, 40) ?? normalizeStr(body.primaryPhoneNumber, 40);
    const alt = normalizeStr(body.alternativePhone, 40) ?? normalizeStr(body.alternatePhone, 40) ?? normalizeStr(body.alternatePhoneNumber, 40);
    const email = normalizeStr(body.email, 200);
    const address = normalizeStr(body.address, 500) ?? normalizeStr(body.residentialAddress, 500);
    const city = normalizeStr(body.city, 120);
    const state = normalizeStr(body.state, 120);
    const country = normalizeStr(body.country, 120);
    const nearestLandmark = normalizeStr(body.nearestLandmark, 200);
    const preferredContactMethod = normalizeStr(body.preferredContactMethod, 60);
    const gender = normalizeStr(body.gender, 40);
    const dateOfBirth = normalizeStr(body.dateOfBirth, 40);
    const isPrimary = typeof body.isPrimary === 'boolean' ? body.isPrimary : false;
    const isNextOfKin = typeof body.isNextOfKin === 'boolean' ? body.isNextOfKin : false;
    const isBeneficiary = typeof body.isBeneficiary === 'boolean' ? body.isBeneficiary : false;
    const pctRaw = body.beneficiaryPercentage;
    const beneficiaryPercentage = isBeneficiary && typeof pctRaw === 'number' && Number.isFinite(pctRaw) ? Math.max(0, Math.min(100, pctRaw)) : null;

    if (!fullName) return jsonErr(400, 'Full name is required');
    if (!relationship) return jsonErr(400, 'Relationship is required');
    if (!phone) return jsonErr(400, 'Primary phone number is required');
    if (!validatePhone(phone)) return jsonErr(400, 'Phone number must be valid');
    if (email && !validateEmail(email)) return jsonErr(400, 'Email must be valid');

    const contact: EmergencyContact = {
      id: `ec-${employeeId}-${Math.random().toString(16).slice(2)}`,
      fullName,
      relationship,
      phoneNumber: phone,
      alternativePhone: alt,
      email,
      address,
      city,
      state,
      country,
      nearestLandmark,
      preferredContactMethod: (preferredContactMethod as any) || null,
      gender,
      dateOfBirth,
      isPrimary: false,
      isNextOfKin,
      isBeneficiary,
      beneficiaryPercentage,
      verificationStatus: 'Unverified',
      lastVerifiedAt: null,
      verifiedBy: null,
      notes: normalizeStr(body.notes, 1200),
    };

    const currentHasPrimary = rec.emergencyContacts.some((c) => c.isPrimary);
    if (isPrimary || !currentHasPrimary) {
      rec.emergencyContacts = rec.emergencyContacts.map((c) => ({ ...c, isPrimary: false }));
      contact.isPrimary = true;
    }

    rec.emergencyContacts = [contact, ...rec.emergencyContacts].slice(0, 25);
    const err = validateEmergencyContacts(rec.emergencyContacts);
    if (err) return jsonErr(400, err);
    rec.audit.unshift(auditEntry('Created emergency contact', role, { reason: contact.fullName }));
    return jsonOk(contact);
  }

  if (root === 'next-of-kin') {
    if (rest[0] === 'request-update') {
      const g = globalThis as unknown as { __dleHrisNextOfKinUpdateRequestsByEmployee?: Map<string, any[]> };
      if (!g.__dleHrisNextOfKinUpdateRequestsByEmployee) g.__dleHrisNextOfKinUpdateRequestsByEmployee = new Map();
      const map = g.__dleHrisNextOfKinUpdateRequestsByEmployee;
      const now = nowIso();
      const reason = normalizeStr(body.reason, 600) ?? 'Employee update requested';
      const req = {
        id: `nokupd-${employeeId}-${Math.random().toString(16).slice(2)}`,
        employeeId,
        employeeName: rec.profile.fullName,
        requestedBy: role,
        status: 'Pending HR Review',
        reason,
        createdAt: now,
        updatedAt: now,
      };
      const cur = map.get(employeeId) || [];
      map.set(employeeId, [req, ...cur].slice(0, 120));
      rec.audit.unshift(auditEntry('Employee update requested (next of kin)', role, { reason }));
      return jsonOk(req);
    }

    if (!perms.canEdit) return jsonErr(403, 'Permission denied');

    const nokId = rest[0];
    const action = rest[1];
    if (nokId && action) {
      const idx = rec.nextOfKin.findIndex((c) => c.id === nokId);
      if (idx < 0) return jsonErr(404, 'Next of kin record not found');
      const current = rec.nextOfKin[idx];

      if (action === 'set-primary') {
        rec.nextOfKin = rec.nextOfKin.map((c) => ({ ...c, isPrimary: c.id === nokId, updatedAt: nowIso(), updatedBy: role }));
        const err = validateNextOfKin(rec.nextOfKin, rec.profile.employmentStatus);
        if (err) return jsonErr(400, err);
        rec.audit.unshift(auditEntry('Primary next of kin changed', role, { reason: current.fullName }));
        return jsonOk(rec.nextOfKin);
      }

      if (action === 'verify') {
        const method = normalizeStr(body.method, 80) ?? normalizeStr(body.verificationMethod, 80) ?? 'HR Manual Verification';
        const status = (normalizeStr(body.verificationStatus, 40) as any) || 'Verified';
        const updated: NextOfKinRecord = {
          ...current,
          verificationStatus: status,
          lastVerifiedAt: nowIso(),
          verifiedBy: role,
          updatedAt: nowIso(),
          updatedBy: role,
        };
        rec.nextOfKin[idx] = updated;
        rec.audit.unshift(auditEntry('Next of kin verified', role, { reason: method }));
        return jsonOk(updated);
      }

      if (action === 'upload-evidence') {
        const evidenceType = normalizeStr(body.evidenceType, 120);
        const fileName = normalizeStr(body.fileName, 240);
        const mimeType = normalizeStr(body.mimeType, 120) ?? 'application/pdf';
        const sizeBytes = typeof body.sizeBytes === 'number' && Number.isFinite(body.sizeBytes) ? Math.max(0, Math.floor(body.sizeBytes)) : null;
        if (!evidenceType) return jsonErr(400, 'Relationship evidence type is required');
        if (!fileName) return jsonErr(400, 'File name is required');
        if (!sizeBytes || sizeBytes < 1) return jsonErr(400, 'File size is required');
        if (sizeBytes > 10_000_000) return jsonErr(400, 'File too large');
        const allowed = new Set(['application/pdf', 'image/png', 'image/jpeg']);
        if (!allowed.has(mimeType)) return jsonErr(400, 'File type not allowed');

        const now = nowIso();
        const canVerifyEvidence = role === 'Super Admin' || role === 'HR Director' || role === 'Compliance Officer';
        const markVerified = Boolean(body.markVerified) && canVerifyEvidence;
        const entry: NextOfKinEvidence = {
          id: `nok-ev-${employeeId}-${Math.random().toString(16).slice(2)}`,
          evidenceType,
          fileName,
          mimeType,
          sizeBytes,
          status: markVerified ? 'Verified' : 'Uploaded',
          uploadedAt: now,
          verifiedAt: markVerified ? now : null,
          verifiedBy: markVerified ? role : null,
          notes: normalizeStr(body.notes, 600) ?? null,
        };
        const prev = current.evidence && Array.isArray(current.evidence) ? current.evidence : [];
        const evidence = [entry, ...prev].slice(0, 10);
        const evidenceStatus: NextOfKinRecord['evidenceStatus'] = markVerified ? 'Verified' : 'Uploaded';
        const updated: NextOfKinRecord = {
          ...current,
          relationshipEvidenceType: evidenceType,
          evidenceStatus,
          evidence,
          updatedAt: now,
          updatedBy: role,
        };
        rec.nextOfKin[idx] = updated;
        rec.audit.unshift(auditEntry('Evidence uploaded (next of kin)', role, { reason: fileName }));
        return jsonOk(updated);
      }

      if (action === 'link-beneficiary') {
        const isBeneficiary = typeof body.isBeneficiary === 'boolean' ? body.isBeneficiary : true;
        const pctRaw = body.beneficiaryPercentage;
        const pct = typeof pctRaw === 'number' && Number.isFinite(pctRaw) ? Math.max(0, Math.min(100, pctRaw)) : null;
        if (isBeneficiary && (pct === null || pct <= 0)) return jsonErr(400, 'Beneficiary percentage is required');
        const benefitCategory = normalizeStr(body.benefitCategory, 120) ?? 'Death Benefit';
        const requireEvidence = true;
        const hasEvidence = current.evidenceStatus === 'Uploaded' || current.evidenceStatus === 'Verified';
        const canOverride = role === 'Super Admin' || role === 'HR Director';
        if (requireEvidence && isBeneficiary && !hasEvidence && !canOverride) return jsonErr(400, 'Evidence is required for beneficiary linkage');

        const now = nowIso();
        const nominationStatus: NextOfKinBeneficiary['nominationStatus'] = canOverride ? 'Approved' : 'Pending HR Review';
        const updated: NextOfKinRecord = {
          ...current,
          beneficiary: {
            ...current.beneficiary,
            isBeneficiary,
            beneficiaryPercentage: isBeneficiary ? pct : null,
            benefitCategory: isBeneficiary ? benefitCategory : null,
            nominationDate: isBeneficiary ? now.slice(0, 10) : null,
            nominationStatus: isBeneficiary ? nominationStatus : 'Draft',
            approvedBy: isBeneficiary && canOverride ? role : null,
            approvalDate: isBeneficiary && canOverride ? now.slice(0, 10) : null,
            notes: normalizeStr(body.notes, 600) ?? current.beneficiary.notes,
          },
          updatedAt: now,
          updatedBy: role,
        };

        const nextList = rec.nextOfKin.map((c, i) => (i === idx ? updated : c));
        const err = validateNextOfKin(nextList, rec.profile.employmentStatus);
        if (err) return jsonErr(400, err);
        rec.nextOfKin = nextList;
        rec.audit.unshift(auditEntry('Beneficiary linked (next of kin)', role, { reason: `${updated.fullName} • ${pct ?? 0}%` }));
        return jsonOk(updated);
      }

      return jsonErr(404, 'Not found');
    }

    const fullName = normalizeStr(body.fullName, 200);
    const relationship = normalizeStr(body.relationship, 120);
    const primaryPhone = normalizeStr(body.primaryPhone, 40) ?? normalizeStr(body.phoneNumber, 40) ?? normalizeStr(body.primaryPhoneNumber, 40);
    const alternatePhone = normalizeStr(body.alternatePhone, 40) ?? normalizeStr(body.alternativePhone, 40) ?? normalizeStr(body.alternatePhoneNumber, 40);
    const email = normalizeStr(body.email, 200);
    const residentialAddress = normalizeStr(body.residentialAddress, 500) ?? normalizeStr(body.address, 500);
    const city = normalizeStr(body.city, 120);
    const state = normalizeStr(body.state, 120);
    const country = normalizeStr(body.country, 120);
    const nearestLandmark = normalizeStr(body.nearestLandmark, 200);
    const preferredContactMethod = normalizeStr(body.preferredContactMethod, 80);
    const gender = normalizeStr(body.gender, 40);
    const dateOfBirth = normalizeStr(body.dateOfBirth, 40);
    const isPrimary = typeof body.isPrimary === 'boolean' ? body.isPrimary : false;
    const isEmergencyContact = typeof body.isEmergencyContact === 'boolean' ? body.isEmergencyContact : false;
    const relationshipEvidenceType = normalizeStr(body.relationshipEvidenceType, 120);
    const notes = normalizeStr(body.notes, 1200);

    const isBeneficiary = typeof body.isBeneficiary === 'boolean' ? body.isBeneficiary : false;
    const pctRaw = body.beneficiaryPercentage;
    const beneficiaryPercentage = isBeneficiary && typeof pctRaw === 'number' && Number.isFinite(pctRaw) ? Math.max(0, Math.min(100, pctRaw)) : null;
    if (!fullName) return jsonErr(400, 'Full name is required');
    if (!relationship) return jsonErr(400, 'Relationship is required');
    if (!primaryPhone) return jsonErr(400, 'Primary phone number is required');
    if (!validatePhone(primaryPhone)) return jsonErr(400, 'Phone number must be valid');
    if (email && !validateEmail(email)) return jsonErr(400, 'Email must be valid');
    if (beneficiaryPercentage !== null && (beneficiaryPercentage < 0 || beneficiaryPercentage > 100)) return jsonErr(400, 'Beneficiary percentage cannot exceed 100%');

    const now = nowIso();
    const record: NextOfKinRecord = {
      id: `nok-${employeeId}-${Math.random().toString(16).slice(2)}`,
      employeeId,
      fullName,
      relationship,
      gender,
      dateOfBirth,
      primaryPhone,
      alternatePhone,
      email,
      residentialAddress,
      city,
      state,
      country,
      nearestLandmark,
      preferredContactMethod: (preferredContactMethod as any) || null,
      isPrimary: false,
      isEmergencyContact,
      verificationStatus: 'Unverified',
      lastVerifiedAt: null,
      verifiedBy: null,
      relationshipEvidenceType: relationshipEvidenceType || null,
      evidenceStatus: 'Missing',
      evidence: null,
      beneficiary: {
        isBeneficiary,
        beneficiaryPercentage,
        benefitCategory: isBeneficiary ? (normalizeStr(body.benefitCategory, 120) ?? 'Death Benefit') : null,
        nominationDate: null,
        nominationStatus: 'Draft',
        approvedBy: null,
        approvalDate: null,
        notes: null,
      },
      notes,
      createdAt: now,
      updatedAt: now,
      createdBy: role,
      updatedBy: role,
    };

    const currentHasPrimary = rec.nextOfKin.some((c) => c.isPrimary);
    if (isPrimary || !currentHasPrimary) {
      rec.nextOfKin = rec.nextOfKin.map((c) => ({ ...c, isPrimary: false }));
      record.isPrimary = true;
    }

    rec.nextOfKin = [record, ...rec.nextOfKin].slice(0, 20);
    const err = validateNextOfKin(rec.nextOfKin, rec.profile.employmentStatus);
    if (err) return jsonErr(400, err);
    rec.audit.unshift(auditEntry('Next of kin created', role, { reason: record.fullName }));
    return jsonOk(record);
  }

  if (root === 'job-change-request') {
    const jp = jobPermissions(role);
    if (!jp.canCreate) return jsonErr(403, 'Permission denied');

    const changeType = normalizeStr(body.changeType, 60) as JobChangeType | null;
    const allowed: JobChangeType[] = [
      'Job Title Change',
      'Department Change',
      'Grade Change',
      'Reporting Manager Change',
      'Functional Manager Change',
      'Location Change',
      'Project Assignment Change',
      'Cost Center Change',
      'Role Profile Update',
    ];
    if (!changeType || !allowed.includes(changeType)) return jsonErr(400, 'Invalid change type');

    const effectiveDate = normalizeStr(body.effectiveDate, 40);
    const reason = normalizeStr(body.reason, 600);
    if (!effectiveDate) return jsonErr(400, 'Effective date is required');
    if (!reason) return jsonErr(400, 'Reason is required');
    const eff = new Date(effectiveDate).getTime();
    if (!Number.isFinite(eff)) return jsonErr(400, 'Effective date is invalid');

    const notes = normalizeStr(body.notes, 1200);
    const jobDetails = rec.profile.jobDetails || {};
    const employmentDetails = rec.profile.employmentDetails || {};
    const previousValues: Record<string, string | null> = {
      jobTitle: jobDetails.jobTitle ?? null,
      designation: jobDetails.designation ?? null,
      jobGrade: jobDetails.jobGrade ?? null,
      jobLevel: jobDetails.jobLevel ?? null,
      department: jobDetails.department ?? null,
      division: jobDetails.division ?? null,
      businessUnit: jobDetails.businessUnit ?? null,
      costCenter: jobDetails.costCenter ?? null,
      reportingManager: jobDetails.reportingManager ?? null,
      functionalManager: jobDetails.functionalManager ?? null,
      departmentHead: jobDetails.departmentHead ?? null,
      businessUnitHead: jobDetails.businessUnitHead ?? null,
      hrBusinessPartner: jobDetails.hrBusinessPartner ?? null,
      matrixReportingManager: jobDetails.matrixReportingManager ?? null,
      actingSupervisor: jobDetails.actingSupervisor ?? null,
      delegatedApprover: jobDetails.delegatedApprover ?? null,
      workLocation: employmentDetails.workLocation ?? null,
      officeSite: jobDetails.officeSite ?? null,
      projectSite: jobDetails.projectSite ?? null,
      roleSummary: jobDetails.roleSummary ?? null,
      roleProfile: jobDetails.roleProfile ?? null,
      jobPurpose: jobDetails.jobPurpose ?? null,
      jobDescription: jobDetails.jobDescription ?? null,
      keyResponsibilities: jobDetails.keyResponsibilities ?? null,
      technicalCompetencies: jobDetails.technicalCompetencies ?? null,
      behavioralCompetencies: jobDetails.behavioralCompetencies ?? null,
      requiredQualifications: jobDetails.requiredQualifications ?? null,
      requiredCertifications: jobDetails.requiredCertifications ?? null,
      requiredExperience: jobDetails.requiredExperience ?? null,
      kpis: jobDetails.kpis ?? null,
      performanceExpectations: jobDetails.performanceExpectations ?? null,
      hseResponsibilities: jobDetails.hseResponsibilities ?? null,
      complianceResponsibilities: jobDetails.complianceResponsibilities ?? null,
      currentProject: jobDetails.currentProject ?? null,
      projectCode: jobDetails.projectCode ?? null,
      projectLocation: jobDetails.projectLocation ?? null,
      client: jobDetails.client ?? null,
      siteSupervisor: jobDetails.siteSupervisor ?? null,
      assignmentStartDate: jobDetails.assignmentStartDate ?? null,
      assignmentEndDate: jobDetails.assignmentEndDate ?? null,
      assignmentStatus: jobDetails.assignmentStatus ?? null,
      mobilizationStatus: jobDetails.mobilizationStatus ?? null,
      demobilizationStatus: jobDetails.demobilizationStatus ?? null,
      workMode: employmentDetails.workMode ?? null,
      shiftPattern: employmentDetails.shiftPattern ?? null,
      staffCategory: employmentDetails.staffCategory ?? null,
      employeeCategory: employmentDetails.employeeCategory ?? null,
      employmentType: employmentDetails.employmentType ?? null,
    };

    const whitelist = new Set(Object.keys(previousValues));
    const incoming = body.newValues && typeof body.newValues === 'object' ? (body.newValues as Record<string, any>) : {};
    const normalizeAny = (v: any, max: number) => {
      if (v === null) return null;
      if (typeof v !== 'string') return null;
      const t = v.trim();
      if (!t) return null;
      return t.length > max ? t.slice(0, max) : t;
    };
    const newValues: Record<string, string | null> = { ...previousValues };
    for (const [k, v] of Object.entries(incoming)) {
      if (!whitelist.has(k)) continue;
      newValues[k] = normalizeAny(v, 1800);
    }

    try {
      const requireKey = (k: string, msg: string) => {
        if (!newValues[k]) throw new Error(msg);
      };
      if (changeType === 'Job Title Change') requireKey('jobTitle', 'Job title is required');
      if (changeType === 'Grade Change') requireKey('jobGrade', 'Job grade is required');
      if (changeType === 'Department Change') {
        requireKey('department', 'Department is required');
        requireKey('businessUnit', 'Business unit is required');
      }
      if (changeType === 'Reporting Manager Change') requireKey('reportingManager', 'Reporting manager is required');
      if (changeType === 'Functional Manager Change') requireKey('functionalManager', 'Functional manager is required');
      if (changeType === 'Location Change') requireKey('workLocation', 'Work location is required');
      if (changeType === 'Project Assignment Change') requireKey('projectSite', 'Project/site is required');
      if (changeType === 'Cost Center Change') requireKey('costCenter', 'Cost center is required');
      if (changeType === 'Role Profile Update') requireKey('jobDescription', 'Job description is required');

      const mgr = (newValues.reportingManager || '').toString().toLowerCase();
      const empName = rec.profile.fullName.toLowerCase();
      if (mgr && empName && mgr === empName) throw new Error('Manager cannot be same as employee');
    } catch (e) {
      return jsonErr(400, e instanceof Error ? e.message : 'Validation failed');
    }

    const now = nowIso();
    const req: JobChangeRequest = {
      id: `jobreq-${employeeId}-${Math.random().toString(16).slice(2)}`,
      employeeId,
      employeeName: rec.profile.fullName,
      changeType,
      status: 'Draft',
      effectiveDate,
      reason,
      notes,
      previousValues,
      newValues,
      supportingDocuments: [],
      approvals: [],
      audit: [auditEntry('Job change request created', role, { reason })],
      createdBy: role,
      createdAt: now,
      updatedAt: now,
    };

    const docs = Array.isArray(body.supportingDocuments) ? (body.supportingDocuments as any[]) : [];
    req.supportingDocuments = docs
      .filter((d) => d && typeof d === 'object')
      .map((d) => ({ id: normalizeStr((d as any).id, 120) || `doc-${Math.random().toString(16).slice(2)}`, name: normalizeStr((d as any).name, 200) || 'document' }))
      .slice(0, 10);

    jobRequestsStore.set(req.id, req);
    addRequestToIndex(employeeId, req.id);
    rec.audit.unshift(auditEntry('Job change request created', role, { reason }));
    return jsonOk(req);
  }

  if (root === 'reporting-change-request') {
    const rp = reportingPermissions(role);
    if (!rp.canCreate) return jsonErr(403, 'Permission denied');

    const changeType = normalizeStr(body.changeType, 80) as ReportingChangeType | null;
    const allowed: ReportingChangeType[] = [
      'Manager Change',
      'Functional Manager Change',
      'Department Head Change',
      'Project Manager Change',
      'Matrix Manager Change',
      'Delegated Approver Change',
      'Temporary Reporting Assignment',
    ];
    if (!changeType || !allowed.includes(changeType)) return jsonErr(400, 'Invalid change type');

    const effectiveDate = normalizeStr(body.effectiveDate, 40);
    const endDate = normalizeStr(body.endDate, 40);
    const reason = normalizeStr(body.reason, 600);
    if (!effectiveDate) return jsonErr(400, 'Effective date is required');
    if (!reason) return jsonErr(400, 'Reason is required');
    const eff = new Date(effectiveDate).getTime();
    if (!Number.isFinite(eff)) return jsonErr(400, 'Effective date is invalid');
    const endMs = endDate ? new Date(endDate).getTime() : null;
    if (endDate && !Number.isFinite(endMs as number)) return jsonErr(400, 'End date is invalid');
    if (endMs && endMs < eff) return jsonErr(400, 'End date cannot be before effective date');
    if (changeType === 'Temporary Reporting Assignment' && !endDate) return jsonErr(400, 'Temporary reporting assignment must have end date');

    const notes = normalizeStr(body.notes, 1200);

    const jobDetails = rec.profile.jobDetails || {};
    const previousValues: Record<string, string | null> = {
      directManager: jobDetails.reportingManager ?? null,
      functionalManager: jobDetails.functionalManager ?? null,
      departmentHead: jobDetails.departmentHead ?? null,
      unitHead: jobDetails.unitHead ?? null,
      businessUnitHead: jobDetails.businessUnitHead ?? null,
      projectManager: jobDetails.projectManager ?? null,
      siteSupervisor: jobDetails.siteSupervisor ?? null,
      matrixManager: jobDetails.matrixManager ?? null,
      dottedLineManager: (jobDetails as any).dottedLineManager ?? null,
      hrBusinessPartner: jobDetails.hrBusinessPartner ?? null,
      delegatedApprover: jobDetails.delegatedApprover ?? null,
    };

    const whitelist = new Set(Object.keys(previousValues));
    const incoming = body.newValues && typeof body.newValues === 'object' ? (body.newValues as Record<string, any>) : {};
    const normalizeAny = (v: any, max: number) => {
      if (v === null) return null;
      if (typeof v !== 'string') return null;
      const t = v.trim();
      if (!t) return null;
      return t.length > max ? t.slice(0, max) : t;
    };
    const newValues: Record<string, string | null> = { ...previousValues };
    for (const [k, v] of Object.entries(incoming)) {
      if (!whitelist.has(k)) continue;
      newValues[k] = normalizeAny(v, 600);
    }

    const incomingDelegations = Array.isArray(body.delegations) ? (body.delegations as any[]) : [];
    const del: ReportingDelegation[] = incomingDelegations
      .filter((d) => d && typeof d === 'object')
      .map((d) => {
        const startDate = normalizeStr((d as any).startDate, 40) || effectiveDate;
        const endDateLocal = normalizeStr((d as any).endDate, 40) || endDate || '';
        const statusMs = Date.now();
        const st = new Date(startDate).getTime();
        const en = new Date(endDateLocal).getTime();
        const status: ReportingDelegation['status'] = Number.isFinite(st) && Number.isFinite(en) ? (statusMs < st ? 'Scheduled' : statusMs > en ? 'Expired' : 'Active') : 'Scheduled';
        const rawAssignmentType = normalizeStr((d as any).assignmentType, 60) || '';
        const rawApprovalScope = normalizeStr((d as any).approvalScope, 80) || '';
        const assignmentTypes: DelegationAssignmentType[] = [
          'Acting manager assignment',
          'Temporary supervisor',
          'Delegated approver',
          'Leave-cover manager',
          'Project supervisor',
          'Alternate approver',
        ];
        const scopes: DelegationScope[] = [
          'Leave Approval',
          'Attendance Approval',
          'Expense Approval',
          'Timesheet Approval',
          'HR Request Approval',
          'Project Approval',
          'All Workflow Approvals',
        ];
        const assignmentType: DelegationAssignmentType = assignmentTypes.includes(rawAssignmentType as DelegationAssignmentType) ? (rawAssignmentType as DelegationAssignmentType) : 'Delegated approver';
        const approvalScope: DelegationScope = scopes.includes(rawApprovalScope as DelegationScope) ? (rawApprovalScope as DelegationScope) : 'All Workflow Approvals';
        return {
          id: normalizeStr((d as any).id, 120) || `del-${Math.random().toString(16).slice(2)}`,
          assignmentType,
          assignedEmployee: normalizeStr((d as any).assignedEmployee, 140) || '',
          delegatedRole: normalizeStr((d as any).delegatedRole, 120) || '',
          startDate,
          endDate: endDateLocal || startDate,
          delegationReason: normalizeStr((d as any).delegationReason, 600) || reason,
          approvalScope,
          status,
        };
      })
      .slice(0, 20);

    try {
      const requireKey = (k: string, msg: string) => {
        if (!newValues[k]) throw new Error(msg);
      };
      if (changeType === 'Manager Change') requireKey('directManager', 'Direct reporting manager is required');
      if (changeType === 'Functional Manager Change') requireKey('functionalManager', 'Functional manager is required');
      if (changeType === 'Department Head Change') requireKey('departmentHead', 'Department head is required');
      if (changeType === 'Project Manager Change') requireKey('projectManager', 'Project manager is required');
      if (changeType === 'Matrix Manager Change') requireKey('matrixManager', 'Matrix manager is required');
      if (changeType === 'Delegated Approver Change') requireKey('delegatedApprover', 'Delegated approver is required');
      if (changeType === 'Temporary Reporting Assignment' && !endDate) throw new Error('Temporary reporting assignment must have end date');

      const empName = rec.profile.fullName.toLowerCase();
      const dm = (newValues.directManager || '').toString().toLowerCase();
      if (dm && empName && dm === empName) throw new Error('Manager cannot be same as employee');
      if (detectCircularReporting(rec.profile.fullName, newValues.directManager || '', newValues.matrixManager || '', newValues.dottedLineManager || '')) throw new Error('Circular reporting must be blocked');

      const delegated = (newValues.delegatedApprover || '').toString();
      if (delegated && delegated.toLowerCase().includes('inactive')) throw new Error('Delegated approver must be active');
      for (const d of del) {
        if (!d.assignedEmployee) throw new Error('Delegated employee is required');
        const ds = new Date(d.startDate).getTime();
        const de = new Date(d.endDate).getTime();
        if (!Number.isFinite(ds) || !Number.isFinite(de)) throw new Error('Delegation start/end dates are invalid');
        if (de < ds) throw new Error('Delegation end date cannot be before start date');
      }
    } catch (e) {
      return jsonErr(400, e instanceof Error ? e.message : 'Validation failed');
    }

    const now = nowIso();
    const req: ReportingChangeRequest = {
      id: `repreq-${employeeId}-${Math.random().toString(16).slice(2)}`,
      employeeId,
      employeeName: rec.profile.fullName,
      changeType,
      status: 'Draft',
      effectiveDate,
      endDate: endDate ?? null,
      reason,
      notes,
      previousValues,
      newValues,
      delegations: del,
      supportingDocuments: [],
      approvals: [],
      audit: [auditEntry('Reporting change request created', role, { reason })],
      createdBy: role,
      createdAt: now,
      updatedAt: now,
    };

    const docs = Array.isArray(body.supportingDocuments) ? (body.supportingDocuments as any[]) : [];
    req.supportingDocuments = docs
      .filter((d) => d && typeof d === 'object')
      .map((d) => ({ id: normalizeStr((d as any).id, 120) || `doc-${Math.random().toString(16).slice(2)}`, name: normalizeStr((d as any).name, 200) || 'document' }))
      .slice(0, 10);

    reportingRequestsStore.set(req.id, req);
    addReportingRequestToIndex(employeeId, req.id);
    rec.audit.unshift(auditEntry('Reporting change request created', role, { reason }));
    return jsonOk(req);
  }

  if (root === 'status-change-request') {
    if (!perms.canChangeStatus) return jsonErr(403, 'Permission denied');
    const action = normalizeStr(body.action, 80) || 'Change Status';
    const effectiveDate = normalizeStr(body.effectiveDate, 40);
    const reason = normalizeStr(body.reason, 600);
    if (!effectiveDate) return jsonErr(400, 'Effective date is required');
    if (!reason) return jsonErr(400, 'Status change reason is required');
    const eff = new Date(effectiveDate).getTime();
    if (!Number.isFinite(eff)) return jsonErr(400, 'Effective date is invalid');

    const newEmploymentStatus = normalizeStr(body.newEmploymentStatus, 60) || normalizeStr(body.employmentStatus, 60);
    const allowed = [
      'Active',
      'Probation',
      'Confirmed',
      'On Leave',
      'Suspended',
      'Terminated',
      'Resigned',
      'Retired',
      'Contract Active',
      'Contract Expired',
      'Seconded',
      'Inactive',
      'Exited',
      'Reactivated',
      'Blacklisted',
      'Deceased',
      'Contract',
      'Field Assignment',
    ];
    if (!newEmploymentStatus || !allowed.includes(newEmploymentStatus)) return jsonErr(400, 'Invalid employment status');

    const current = String(rec.profile.employmentStatus || 'Active');
    if (newEmploymentStatus === 'Active' && ['Terminated', 'Exited', 'Resigned', 'Retired', 'Deceased', 'Blacklisted'].includes(current) && !action.toLowerCase().includes('reactivate'))
      return jsonErr(400, 'Terminated/exited employees require reactivation workflow');
    if (newEmploymentStatus === 'On Leave' && ['Exited', 'Terminated', 'Resigned', 'Retired', 'Deceased'].includes(current)) return jsonErr(400, 'Exited employees cannot be placed on leave');

    if (newEmploymentStatus === 'Confirmed' && current === 'Probation') {
      const end = (rec.profile.employmentDetails?.probationEndDate || '').toString();
      if (end) {
        const endMs = new Date(end).getTime();
        if (Number.isFinite(endMs) && Date.now() < endMs && !(role === 'Super Admin' || role === 'HR Director')) return jsonErr(400, 'Probation end date has not been reached');
      }
    }

    const overrides = statusOverridesStore.get(employeeId) || {};
    const previousStatus = {
      employmentStatus: String(rec.profile.employmentStatus || 'Active'),
      payrollStatus: overrides.payrollStatus ? String(overrides.payrollStatus) : null,
      accessStatus: overrides.accessStatus ? String(overrides.accessStatus) : null,
      leaveStatus: overrides.leaveStatus ? String(overrides.leaveStatus) : null,
      probationStatus: overrides.probationStatus ? String(overrides.probationStatus) : null,
      contractStatus: overrides.contractStatus ? String(overrides.contractStatus) : computeContractStatusForEmployee(employeeId).contractStatus,
    };

    const now = nowIso();
    const req = {
      id: `streq-${employeeId}-${Math.random().toString(16).slice(2)}`,
      scope: 'Single',
      employeeId,
      employeeName: rec.profile.fullName,
      action,
      previousStatus,
      newStatus: { employmentStatus: newEmploymentStatus },
      effectiveDate,
      reason,
      responsibleOfficer: normalizeStr(body.responsibleOfficer, 160) || null,
      workflowStatus: 'Draft',
      createdBy: role,
      createdAt: now,
      updatedAt: now,
      approvals: [],
      impact: statusImpactFor(newEmploymentStatus, action),
      audit: [auditEntry('Status change request created', role, { reason })],
    };
    statusRequestsStore.set(req.id, req);
    addStatusRequestToIndex(employeeId, req.id);
    rec.audit.unshift(auditEntry('Status change request created', role, { reason }));
    return jsonOk(req);
  }

  if (root === 'assignment-request') {
    const ap = assignmentPermissions(role);
    if (!ap.canCreate) return jsonErr(403, 'Permission denied');

    const requestType = normalizeStr(body.requestType, 80) as AssignmentRequestType | null;
    const allowed: AssignmentRequestType[] = [
      'Department Transfer',
      'Unit Transfer',
      'Business Unit Transfer',
      'Cost Center Change',
      'Reporting Manager Change',
      'Project Reassignment',
      'Site Reassignment',
      'Temporary Assignment',
      'Secondment',
      'Acting Assignment',
    ];
    if (!requestType || !allowed.includes(requestType)) return jsonErr(400, 'Invalid request type');

    const assignmentType = (normalizeStr(body.assignmentType, 60) as AssignmentType | null) || 'Permanent Assignment';
    const assignmentStatus = (normalizeStr(body.assignmentStatus, 40) as AssignmentStatus | null) || 'Pending Approval';
    const effectiveDate = normalizeStr(body.effectiveDate, 40);
    const endDate = normalizeStr(body.endDate, 40);
    const reason = normalizeStr(body.reason, 600);
    if (!effectiveDate) return jsonErr(400, 'Effective date is required');
    if (!reason) return jsonErr(400, 'Reason is required');
    const eff = new Date(effectiveDate).getTime();
    if (!Number.isFinite(eff)) return jsonErr(400, 'Effective date is invalid');
    const endMs = endDate ? new Date(endDate).getTime() : null;
    if (endDate && !Number.isFinite(endMs as number)) return jsonErr(400, 'End date is invalid');
    if (endMs && endMs < eff) return jsonErr(400, 'End date cannot be before effective date');
    if (assignmentType === 'Temporary Assignment' && !endDate) return jsonErr(400, 'Temporary assignment must have end date');

    const notes = normalizeStr(body.notes, 1200);
    const jobDetails = rec.profile.jobDetails || {};
    const employmentDetails = rec.profile.employmentDetails || {};
    const previousValues: Record<string, string | null> = {
      department: jobDetails.department ?? null,
      division: jobDetails.division ?? null,
      unit: jobDetails.unit ?? null,
      team: jobDetails.team ?? null,
      businessUnit: jobDetails.businessUnit ?? null,
      costCenter: jobDetails.costCenter ?? null,
      workLocation: employmentDetails.workLocation ?? jobDetails.location ?? null,
      officeSite: jobDetails.officeSite ?? null,
      projectSite: jobDetails.projectSite ?? null,
      reportingManager: jobDetails.reportingManager ?? null,
      functionalManager: jobDetails.functionalManager ?? null,
      departmentHead: jobDetails.departmentHead ?? null,
      unitHead: jobDetails.unitHead ?? null,
      businessUnitHead: jobDetails.businessUnitHead ?? null,
      projectManager: jobDetails.projectManager ?? null,
      siteSupervisor: jobDetails.siteSupervisor ?? null,
      matrixManager: jobDetails.matrixManager ?? null,
      delegatedApprover: jobDetails.delegatedApprover ?? null,
      hrBusinessPartner: jobDetails.hrBusinessPartner ?? null,
      workMode: employmentDetails.workMode ?? null,
      shiftPattern: employmentDetails.shiftPattern ?? null,
      projectName: jobDetails.projectName ?? jobDetails.currentProject ?? null,
      projectCode: jobDetails.projectCode ?? null,
      client: jobDetails.client ?? null,
      projectLocation: jobDetails.projectLocation ?? null,
      siteLocation: jobDetails.siteLocation ?? null,
      mobilizationStatus: jobDetails.mobilizationStatus ?? null,
      demobilizationStatus: jobDetails.demobilizationStatus ?? null,
      siteAccessRequirement: jobDetails.siteAccessRequirement ?? null,
      ppeRequirement: jobDetails.ppeRequirement ?? null,
      hseInductionStatus: jobDetails.hseInductionStatus ?? null,
    };

    const whitelist = new Set(Object.keys(previousValues));
    const incoming = body.newValues && typeof body.newValues === 'object' ? (body.newValues as Record<string, any>) : {};
    const normalizeAny = (v: any, max: number) => {
      if (v === null) return null;
      if (typeof v !== 'string') return null;
      const t = v.trim();
      if (!t) return null;
      return t.length > max ? t.slice(0, max) : t;
    };
    const newValues: Record<string, string | null> = { ...previousValues };
    for (const [k, v] of Object.entries(incoming)) {
      if (!whitelist.has(k)) continue;
      newValues[k] = normalizeAny(v, 1800);
    }

    try {
      const need = (key: string, msg: string) => {
        if (!newValues[key]) throw new Error(msg);
      };
      need('department', 'Department is required');
      need('businessUnit', 'Business unit is required');
      const mgr = (newValues.reportingManager || '').toString().toLowerCase();
      const empName = rec.profile.fullName.toLowerCase();
      if (mgr && empName && mgr === empName) throw new Error('Manager cannot be same as employee');
    } catch (e) {
      return jsonErr(400, e instanceof Error ? e.message : 'Validation failed');
    }

    const now = nowIso();
    const req: AssignmentRequest = {
      id: `asgreq-${employeeId}-${Math.random().toString(16).slice(2)}`,
      employeeId,
      employeeName: rec.profile.fullName,
      requestType,
      status: 'Draft',
      effectiveDate,
      endDate: endDate ?? null,
      reason,
      notes,
      previousValues,
      newValues,
      assignmentType,
      assignmentStatus,
      supportingDocuments: [],
      approvals: [],
      audit: [auditEntry('Assignment request created', role, { reason })],
      createdBy: role,
      createdAt: now,
      updatedAt: now,
    };

    const docs = Array.isArray(body.supportingDocuments) ? (body.supportingDocuments as any[]) : [];
    req.supportingDocuments = docs
      .filter((d) => d && typeof d === 'object')
      .map((d) => ({ id: normalizeStr((d as any).id, 120) || `doc-${Math.random().toString(16).slice(2)}`, name: normalizeStr((d as any).name, 200) || 'document' }))
      .slice(0, 12);

    assignmentRequestsStore.set(req.id, req);
    addAssignmentRequestToIndex(employeeId, req.id);
    rec.audit.unshift(auditEntry('Assignment request created', role, { reason }));
    return jsonOk(req);
  }

  if (root === 'emergency-contacts') {
    const fullName = normalizeStr(body.fullName, 200);
    const relationship = normalizeStr(body.relationship, 120);
    const phoneNumber = normalizeStr(body.phoneNumber, 40);
    if (!fullName || !relationship || !phoneNumber) return jsonErr(400, 'Full name, relationship, and phone number are required');
    if (!validatePhone(phoneNumber)) return jsonErr(400, 'Phone number must be valid');
    const item: EmergencyContact = {
      id: `ec-${employeeId}-${Math.random().toString(16).slice(2)}`,
      fullName,
      relationship,
      phoneNumber,
      alternativePhone: normalizeStr(body.alternativePhone, 40),
      email: normalizeStr(body.email, 200),
      address: normalizeStr(body.address, 500),
      isPrimary: !!body.isPrimary,
      isNextOfKin: !!body.isNextOfKin,
      isBeneficiary: !!body.isBeneficiary,
    };
    const next = [item, ...rec.emergencyContacts];
    const err = validateEmergencyContacts(next);
    if (err) return jsonErr(400, err);
    rec.emergencyContacts = next;
    rec.audit.unshift(auditEntry('Added emergency contact', role));
    await persistEmergencyContactsToEnterprise(rec);
    return jsonOk(rec.emergencyContacts);
  }

  if (root === 'timeline') {
    if (rest[0] !== 'manual-event') return jsonErr(404, 'Not found');
    if (!perms.canEdit) return jsonErr(403, 'Permission denied');

    type Severity = 'high' | 'medium' | 'low';
    type Visibility = 'HR Only' | 'Manager Visible' | 'Employee Visible' | 'Audit Only' | 'Executive Visible';
    type EventCategory =
      | 'Employment'
      | 'Job Information'
      | 'Department Assignment'
      | 'Reporting Line'
      | 'Contract'
      | 'Status Change'
      | 'Emergency Contact'
      | 'Next of Kin'
      | 'Documents'
      | 'Leave'
      | 'Attendance'
      | 'Payroll'
      | 'Performance'
      | 'Training'
      | 'Assets'
      | 'Disciplinary'
      | 'Medical / HSE'
      | 'Compliance'
      | 'System Access'
      | 'Audit';
    type ApprovalStatus = 'Not Applicable' | 'Pending' | 'Approved' | 'Rejected';

    type TimelineEvent = {
      id: string;
      employeeId: string;
      eventReferenceNo: string;
      eventCategory: EventCategory;
      eventType: string;
      eventTitle: string;
      eventDescription: string;
      eventDate: string;
      effectiveDate?: string | null;
      sourceModule: string;
      sourceRecordId?: string | null;
      relatedWorkflowId?: string | null;
      relatedDocumentId?: string | null;
      previousValue?: string | null;
      newValue?: string | null;
      reason?: string | null;
      severity: Severity;
      visibility: Visibility;
      isSystemGenerated: boolean;
      approvalStatus: ApprovalStatus;
      createdBy: string;
      approvedBy?: string | null;
      approvedAt?: string | null;
      createdAt: string;
      updatedAt: string;
    };

    const allowedCategories: EventCategory[] = [
      'Employment',
      'Job Information',
      'Department Assignment',
      'Reporting Line',
      'Contract',
      'Status Change',
      'Emergency Contact',
      'Next of Kin',
      'Documents',
      'Leave',
      'Attendance',
      'Payroll',
      'Performance',
      'Training',
      'Assets',
      'Disciplinary',
      'Medical / HSE',
      'Compliance',
      'System Access',
      'Audit',
    ];
    const allowedVisibility: Visibility[] = ['HR Only', 'Manager Visible', 'Employee Visible', 'Audit Only', 'Executive Visible'];
    const allowedSeverity: Severity[] = ['high', 'medium', 'low'];

    const eventCategory = normalizeStr(body.eventCategory, 80) as EventCategory | null;
    const eventType = normalizeStr(body.eventType, 120);
    const eventTitle = normalizeStr(body.eventTitle, 220);
    const eventDescription = normalizeStr(body.eventDescription, 2000) ?? '';
    const eventDate = normalizeStr(body.eventDate, 40);
    const effectiveDate = normalizeStr(body.effectiveDate, 40);
    const severity = (normalizeStr(body.severity, 20) as Severity | null) || 'low';
    const visibility = (normalizeStr(body.visibility, 40) as Visibility | null) || null;
    const reason = normalizeStr(body.reason, 600);
    const attachment = body.attachment && typeof body.attachment === 'object' ? (body.attachment as any) : null;

    if (!eventCategory || !allowedCategories.includes(eventCategory)) return jsonErr(400, 'Event category is required');
    if (!eventType) return jsonErr(400, 'Event type is required');
    if (!eventTitle) return jsonErr(400, 'Manual event title is required');
    if (!eventDate) return jsonErr(400, 'Event date is required');
    if (!visibility || !allowedVisibility.includes(visibility)) return jsonErr(400, 'Visibility must be selected');
    if (!allowedSeverity.includes(severity)) return jsonErr(400, 'Invalid severity');

    const parseDate = (s: string) => {
      const ms = new Date(s.includes('T') ? s : `${s}T00:00:00.000Z`).getTime();
      return Number.isFinite(ms) ? ms : NaN;
    };
    const join = rec.profile.dateJoined ? parseDate(rec.profile.dateJoined) : NaN;
    const eff = effectiveDate ? parseDate(effectiveDate) : NaN;
    const canOverride = role === 'Super Admin' || role === 'HR Director';
    if (Number.isFinite(join) && Number.isFinite(eff) && eff < join && !canOverride) return jsonErr(400, 'Effective date cannot be before employee join date');

    const sensitive = new Set<EventCategory>(['Disciplinary', 'Medical / HSE', 'Compliance', 'Audit']);
    if (sensitive.has(eventCategory) && visibility === 'Employee Visible' && !canOverride) return jsonErr(400, 'Sensitive categories require restricted visibility');

    const sanitizeKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'x';
    const id = `tl__${employeeId}__manual__${Math.random().toString(16).slice(2)}__${sanitizeKey(eventType)}`;
    const ref = `TL-${employeeId}-MAN-${sanitizeKey(eventCategory).slice(0, 8).toUpperCase()}-${sanitizeKey(eventType).slice(0, 8).toUpperCase()}`;
    const now = nowIso();

    const fileMeta =
      attachment && typeof attachment === 'object'
        ? {
            fileName: normalizeStr(attachment.fileName, 260),
            mimeType: normalizeStr(attachment.mimeType, 140),
            sizeBytes: typeof attachment.sizeBytes === 'number' && Number.isFinite(attachment.sizeBytes) ? Math.max(0, Math.floor(attachment.sizeBytes)) : null,
          }
        : null;

    const ev: TimelineEvent = {
      id,
      employeeId,
      eventReferenceNo: ref,
      eventCategory,
      eventType,
      eventTitle,
      eventDescription: fileMeta?.fileName ? `${eventDescription}${eventDescription ? ' • ' : ''}Attachment: ${fileMeta.fileName}` : eventDescription,
      eventDate: eventDate.includes('T') ? eventDate : `${eventDate}T00:00:00.000Z`,
      effectiveDate: effectiveDate ? (effectiveDate.includes('T') ? effectiveDate : `${effectiveDate}T00:00:00.000Z`) : null,
      sourceModule: 'Manual',
      sourceRecordId: id,
      relatedWorkflowId: null,
      relatedDocumentId: null,
      previousValue: normalizeStr(body.previousValue, 1200),
      newValue: normalizeStr(body.newValue, 1200),
      reason,
      severity,
      visibility,
      isSystemGenerated: false,
      approvalStatus: 'Not Applicable',
      createdBy: role,
      approvedBy: null,
      approvedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const g = globalThis as unknown as { __dleHrisTimelineManualByEmployee?: Map<string, TimelineEvent[]>; __dleHrisTimelineManualById?: Map<string, TimelineEvent>; __dleHrisTimelineComments?: Map<string, any[]> };
    if (!g.__dleHrisTimelineManualByEmployee) g.__dleHrisTimelineManualByEmployee = new Map();
    if (!g.__dleHrisTimelineManualById) g.__dleHrisTimelineManualById = new Map();
    if (!g.__dleHrisTimelineComments) g.__dleHrisTimelineComments = new Map();
    const list = g.__dleHrisTimelineManualByEmployee.get(employeeId) || [];
    g.__dleHrisTimelineManualByEmployee.set(employeeId, [ev, ...list].slice(0, 600));
    g.__dleHrisTimelineManualById.set(ev.id, ev);
    g.__dleHrisTimelineComments.set(ev.id, g.__dleHrisTimelineComments.get(ev.id) || []);
    rec.audit.unshift(auditEntry('Manual timeline event created', role, { reason: ev.eventTitle }));
    return jsonOk(ev);
  }

  if (root === 'documents') {
    if (!perms.canViewDocuments) return jsonErr(403, 'Permission denied');
    const allowedMime = new Set([
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
    ]);

    const normalizeDate = (v: unknown) => {
      const s = normalizeStr(v, 40);
      if (!s) return null;
      const ms = new Date(s.includes('T') ? s : `${s}T00:00:00.000Z`).getTime();
      if (!Number.isFinite(ms)) return null;
      return s.includes('T') ? s : s;
    };

    const complianceFor = (doc: DocumentItem, nowMs: number) => {
      if (doc.status === 'Archived') return 'Unknown' as const;
      if (doc.status === 'Rejected') return 'Non-Compliant' as const;
      if (doc.status === 'Pending Verification' || doc.status === 'Uploaded') return 'At Risk' as const;
      const exp = doc.expiresAt ? new Date(doc.expiresAt).getTime() : NaN;
      if (Number.isFinite(exp) && exp < nowMs) return 'Non-Compliant' as const;
      if (Number.isFinite(exp) && exp - nowMs < 30 * 24 * 3600 * 1000) return 'At Risk' as const;
      if (doc.status === 'Verified' || doc.status === 'Not Required') return 'Compliant' as const;
      return 'Unknown' as const;
    };

    const seedAuditAndVersion = (doc: DocumentItem) => {
      const g = globalThis as unknown as { __dleHrisDocumentVersions?: Map<string, any[]>; __dleHrisDocumentAudits?: Map<string, any[]> };
      if (!g.__dleHrisDocumentVersions) g.__dleHrisDocumentVersions = new Map();
      if (!g.__dleHrisDocumentAudits) g.__dleHrisDocumentAudits = new Map();
      const versions = g.__dleHrisDocumentVersions.get(doc.id) || [];
      if (!versions.length) {
        g.__dleHrisDocumentVersions.set(doc.id, [
          {
            id: `ver-${doc.id}-1`,
            documentId: doc.id,
            versionNumber: doc.versionNumber || 1,
            previousFileName: doc.fileName,
            newFileName: doc.fileName,
            previousMimeType: doc.mimeType,
            newMimeType: doc.mimeType,
            previousSizeBytes: doc.sizeBytes,
            newSizeBytes: doc.sizeBytes,
            changedBy: doc.uploadedBy || role,
            changedAt: doc.uploadedAt,
            reason: 'Initial upload',
            verificationStatus: doc.status,
          },
        ]);
      }
      const audits = g.__dleHrisDocumentAudits.get(doc.id) || [];
      if (!audits.length) {
        g.__dleHrisDocumentAudits.set(doc.id, [
          {
            id: `aud-${Math.random().toString(16).slice(2)}`,
            at: nowIso(),
            action: 'Document uploaded',
            performedBy: role,
            employeeId,
            documentId: doc.id,
            oldValue: '',
            newValue: doc.fileName,
            reason: 'Upload',
          },
        ]);
      }
    };

    const validatePayload = (p: any) => {
      const category = normalizeStr(p?.category, 120);
      const fileName = normalizeStr(p?.fileName, 240);
      const mimeType = normalizeStr(p?.mimeType, 120);
      const sizeBytes = typeof p?.sizeBytes === 'number' && Number.isFinite(p.sizeBytes) ? Math.max(0, Math.floor(p.sizeBytes)) : null;
      const documentTitle = normalizeStr(p?.documentTitle, 200) ?? normalizeStr(p?.documentName, 200);
      const issueDate = normalizeDate(p?.issueDate);
      const expiryDate = normalizeDate(p?.expiryDate) ?? normalizeDate(p?.expiresAt);
      const confidentialityLevel = (normalizeStr(p?.confidentialityLevel, 40) as DocumentItem['confidentialityLevel']) ?? 'Internal';
      const verificationRequired = typeof p?.verificationRequired === 'boolean' ? p.verificationRequired : true;
      const notes = normalizeStr(p?.notes, 1200);
      if (!category || !fileName || !mimeType || sizeBytes === null) return { ok: false as const, error: 'Invalid document payload' };
      if (sizeBytes > 15 * 1024 * 1024) return { ok: false as const, error: 'File size limit exceeded' };
      if (!allowedMime.has(mimeType)) return { ok: false as const, error: 'File type not allowed' };
      const nameLower = fileName.toLowerCase();
      if (nameLower.includes('eicar') || nameLower.includes('virus')) return { ok: false as const, error: 'File blocked by virus scanning policy' };
      if (issueDate && expiryDate) {
        const a = new Date(issueDate.includes('T') ? issueDate : `${issueDate}T00:00:00.000Z`).getTime();
        const b = new Date(expiryDate.includes('T') ? expiryDate : `${expiryDate}T00:00:00.000Z`).getTime();
        if (Number.isFinite(a) && Number.isFinite(b) && b < a) return { ok: false as const, error: 'Expiry date cannot be before issue date' };
      }
      const allowedConf: Array<NonNullable<DocumentItem['confidentialityLevel']>> = ['Public', 'Internal', 'Confidential', 'Restricted'];
      if (!allowedConf.includes((confidentialityLevel || 'Internal') as any)) return { ok: false as const, error: 'Invalid confidentiality level' };
      return {
        ok: true as const,
        value: { category, fileName, mimeType, sizeBytes, documentTitle: documentTitle ?? category, issueDate, expiryDate, confidentialityLevel: (confidentialityLevel || 'Internal') as any, verificationRequired, notes },
      };
    };

    if (rest[0] === 'bulk-upload') {
      const items = Array.isArray(body.items) ? (body.items as any[]) : [];
      if (!items.length) return jsonErr(400, 'No items provided');
      if (items.length > 50) return jsonErr(400, 'Too many items');
      const now = nowIso();
      const created: DocumentItem[] = [];
      for (const raw of items) {
        const v = validatePayload(raw);
        if (!v.ok) return jsonErr(400, v.error);
        const expMs = v.value.expiryDate ? new Date(v.value.expiryDate.includes('T') ? v.value.expiryDate : `${v.value.expiryDate}T00:00:00.000Z`).getTime() : NaN;
        const expired = Number.isFinite(expMs) && expMs < Date.now();
        const status: DocumentItem['status'] = expired ? 'Expired' : v.value.verificationRequired ? 'Pending Verification' : 'Not Required';
        const doc: DocumentItem = {
          id: `doc-${employeeId}-${Math.random().toString(16).slice(2)}`,
          category: v.value.category,
          documentTitle: v.value.documentTitle,
          fileName: v.value.fileName,
          mimeType: v.value.mimeType,
          sizeBytes: v.value.sizeBytes,
          issueDate: v.value.issueDate,
          expiresAt: v.value.expiryDate,
          status,
          confidentialityLevel: v.value.confidentialityLevel,
          versionNumber: 1,
          uploadedBy: role,
          uploadedAt: now,
          verifiedBy: null,
          verifiedAt: null,
          notes: v.value.notes,
          complianceStatus: 'Unknown',
        };
        doc.complianceStatus = complianceFor(doc, Date.now());
        created.push(doc);
        seedAuditAndVersion(doc);
      }
      rec.documents = [...created, ...rec.documents];
      rec.audit.unshift(auditEntry('Bulk uploaded documents', role, { reason: `${created.length} files` }));
      return jsonOk({ uploaded: created.length, documents: created });
    }

    const v = validatePayload(body);
    if (!v.ok) return jsonErr(400, v.error);
    const now = nowIso();
    const expMs = v.value.expiryDate ? new Date(v.value.expiryDate.includes('T') ? v.value.expiryDate : `${v.value.expiryDate}T00:00:00.000Z`).getTime() : NaN;
    const expired = Number.isFinite(expMs) && expMs < Date.now();
    const status: DocumentItem['status'] = expired ? 'Expired' : v.value.verificationRequired ? 'Pending Verification' : 'Not Required';
    const item: DocumentItem = {
      id: `doc-${employeeId}-${Math.random().toString(16).slice(2)}`,
      category: v.value.category,
      documentTitle: v.value.documentTitle,
      fileName: v.value.fileName,
      mimeType: v.value.mimeType,
      sizeBytes: v.value.sizeBytes,
      issueDate: v.value.issueDate,
      uploadedAt: now,
      expiresAt: v.value.expiryDate,
      status,
      confidentialityLevel: v.value.confidentialityLevel,
      versionNumber: 1,
      uploadedBy: role,
      verifiedBy: null,
      verifiedAt: null,
      notes: v.value.notes,
      complianceStatus: 'Unknown',
    };
    item.complianceStatus = complianceFor(item, Date.now());
    const persisted = await insertEmployeeProfileDocumentInDb({
      employeeCode: rec.profile.employeeId,
      category: item.category,
      fileName: item.fileName,
      mimeType: item.mimeType,
      sizeBytes: item.sizeBytes,
      expiresAt: item.expiresAt,
      documentStatus: item.status === 'Pending Verification' ? 'Uploaded' : item.status,
      createdBy: role,
    });
    if (persisted) {
      item.id = persisted.id;
      item.uploadedAt = persisted.uploadedAt;
      item.status = persisted.status;
      item.verifiedBy = persisted.verifiedBy;
    }
    rec.documents = [item, ...rec.documents];
    seedAuditAndVersion(item);
    rec.audit.unshift(auditEntry('Uploaded document', role, { reason: item.category }));
    return jsonOk(item);
  }

  return jsonErr(404, 'Not found');
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string; resource: string[] }> }) {
  const { id, resource } = await ctx.params;
  const employeeId = id;
  const role = getRole(request);
  const viewerEmployeeId = getViewerEmployeeId(request);
  if (role === 'Employee' && (!viewerEmployeeId || viewerEmployeeId !== employeeId)) return jsonErr(403, 'Permission denied');
  const perms = rolePermissions(role, employeeId, viewerEmployeeId);
  if (!perms.canViewProfile) return jsonErr(403, 'Permission denied');
  if (!perms.canEdit) return jsonErr(403, 'Permission denied');

  const rec = await ensureRecordFromDb(employeeId);
  const { root, rest } = getResource(resource);
  const canOverride = role === 'Super Admin' || role === 'HR Director';

  if (root === 'emergency-contacts') {
    const contactId = rest[0];
    if (!contactId) return jsonErr(400, 'Missing contactId');
    const current = rec.emergencyContacts.find((c) => c.id === contactId) || null;
    if (!current) return jsonErr(404, 'Emergency contact not found');
    const isVerified = (current.verificationStatus || '').toString() === 'Verified';
    if (isVerified && !canOverride) return jsonErr(400, 'Verified contact cannot be deleted without HR override');
    const next = rec.emergencyContacts.filter((c) => c.id !== contactId);
    const err = validateEmergencyContacts(next);
    if (err) return jsonErr(400, err);
    rec.emergencyContacts = next;
    rec.audit.unshift(auditEntry('Deleted emergency contact', role));
    await persistEmergencyContactsToEnterprise(rec);
    return jsonOk({ deleted: true });
  }

  if (root === 'next-of-kin') {
    const nokId = rest[0];
    if (!nokId) return jsonErr(400, 'Missing nokId');
    const current = rec.nextOfKin.find((c) => c.id === nokId) || null;
    if (!current) return jsonErr(404, 'Next of kin record not found');
    const isVerified = (current.verificationStatus || '').toString() === 'Verified';
    if (isVerified && !canOverride) return jsonErr(400, 'Verified next of kin cannot be deleted without HR override');
    const next = rec.nextOfKin.filter((c) => c.id !== nokId);
    const err = validateNextOfKin(next, rec.profile.employmentStatus);
    if (err) return jsonErr(400, err);
    rec.nextOfKin = next;
    rec.audit.unshift(auditEntry('Deleted next of kin', role, { reason: current.fullName }));
    return jsonOk({ deleted: true });
  }

  return jsonErr(404, 'Not found');
}
