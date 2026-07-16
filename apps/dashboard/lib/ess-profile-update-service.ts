import { readUsers } from '@/lib/auth/auth-store';
import type { SessionPayload } from '@/lib/auth/session';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { syncHrisEmployeeProfileToDb } from '@/lib/dle-enterprise-db';
import { invalidateEssPortalCache } from '@/lib/ess-portal-cache';
import { serviceWorkflowFor } from '@/lib/ess-workflow-intelligence';
import { createEnterpriseNotification } from '@/lib/enterprise-notifications-store';
import {
  readAllEssRequests,
  writeAllEssRequests,
  type EssLeaveRequest,
} from '@/lib/leave-workflow-service';
import {
  resolveEmployeeMailbox,
  sendProfileUpdateApprovalRequestEmail,
  sendProfileUpdateDecisionEmail,
} from '@/lib/mail-service';
import { getNigeriaLgas, getNigeriaStates, getRegionForState } from '@/lib/nigeria-locations';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import { resolveWorkflowLinkOrigin } from '@/lib/public-app-url';

export type EssProfileFieldMeta = {
  key: string;
  label: string;
  value: string;
  editable: boolean;
  inputType?: 'text' | 'email' | 'tel' | 'textarea' | 'select';
  options?: string[];
};

export type EssProfileUpdateRequest = EssLeaveRequest & {
  serviceId: 'profile-update';
  profileSectionId: string;
  profileChanges: Record<string, string>;
  profilePreviousValues: Record<string, string>;
  hrApproverEmployeeCodes?: string[];
};

const compact = (value: unknown) => String(value || '').trim();
const PROFILE_SERVICE_ID = 'profile-update';
const HR_ROLE_PATTERN = /super admin|hr director|hr manager|hr officer|system administrator/i;
const HR_TITLE_PATTERN = /hr manager|hr head|hr director|hr officer|human resources manager|head of hr/i;

export const canApproveEssProfileUpdate = (roles: string[] = []) =>
  roles.some((role) => HR_ROLE_PATTERN.test(role));

export const isProfileUpdateRequest = (request: EssLeaveRequest): request is EssProfileUpdateRequest =>
  compact((request as EssProfileUpdateRequest).serviceId) === PROFILE_SERVICE_ID
  || /profile update/i.test(request.category);

export const pendingProfileUpdatesForEmployee = async (employeeId: string) => {
  const requests = await readAllEssRequests();
  return requests.filter(
    (item) =>
      isProfileUpdateRequest(item)
      && compact(item.employeeId).toUpperCase() === compact(employeeId).toUpperCase()
      && !/approved|rejected|closed|terminated/i.test(item.status),
  ) as EssProfileUpdateRequest[];
};

const employeeCodesMatch = (left?: string | null, right?: string | null) => {
  const a = compact(left).toUpperCase();
  const b = compact(right).toUpperCase();
  return Boolean(a && b && a === b);
};

const profileSystemSession = (actorName: string): SessionPayload => ({
  sub: 'profile-workflow',
  username: 'profile-workflow',
  fullName: actorName || 'Profile Workflow',
  employeeCode: 'profile-workflow',
  roles: ['System'],
  permissions: [],
  status: 'Active',
  firstLoginRequired: false,
  passwordResetRequired: false,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
});

const changeSummary = (changes: Record<string, string>) =>
  Object.keys(changes)
    .map((key) => Object.entries(labelToKey).find(([, value]) => value === key)?.[0] || key)
    .join(', ');

const profileApprovalHref = (requestId: string) =>
  `/workforce-portal?tab=profile&profileApprovalId=${encodeURIComponent(requestId)}`;

const profileEmployeeHref = () => '/workforce-portal?tab=profile';

type ProfileHrRecipient = {
  employeeCode: string;
  fullName: string;
  email: string;
  roles: string[];
};

export const resolveProfileHrRecipients = async (
  requester: DleEmployeeDirectoryRow,
  employees?: DleEmployeeDirectoryRow[],
): Promise<ProfileHrRecipient[]> => {
  const directory = employees || (await readPayrollEmployees()).employees;
  const users = await readUsers();
  const requesterCodes = new Set(
    [requester.employeeCode, requester.employeeId, requester.sourceEmployeeId]
      .map((value) => compact(value).toUpperCase())
      .filter(Boolean),
  );

  const byCode = new Map<string, ProfileHrRecipient>();

  const upsert = async (input: {
    employeeCode?: string | null;
    fullName?: string | null;
    email?: string | null;
    roles?: string[];
    directoryEmployee?: DleEmployeeDirectoryRow | null;
  }) => {
    const code = compact(input.employeeCode || input.directoryEmployee?.employeeCode || input.directoryEmployee?.employeeId).toUpperCase();
    if (!code || requesterCodes.has(code)) return;
    const email = compact(input.email)
      || compact(await resolveEmployeeMailbox(input.directoryEmployee))
      || '';
    const existing = byCode.get(code);
    byCode.set(code, {
      employeeCode: code,
      fullName: compact(input.fullName || input.directoryEmployee?.fullName || existing?.fullName || code),
      email: email || existing?.email || '',
      roles: Array.from(new Set([...(existing?.roles || []), ...(input.roles || [])])),
    });
  };

  for (const user of users.filter((item) => item.status === 'Active' || !item.status)) {
    if (!(user.roles || []).some((role) => HR_ROLE_PATTERN.test(role))) continue;
    const code = compact(user.employeeCode || user.employeeId || user.username);
    const directoryEmployee = directory.find((employee) =>
      [employee.employeeCode, employee.employeeId, employee.sourceEmployeeId]
        .some((value) => employeeCodesMatch(value, code)),
    ) || null;
    await upsert({
      employeeCode: code,
      fullName: user.fullName,
      email: user.email,
      roles: user.roles || ['HR Manager'],
      directoryEmployee,
    });
  }

  for (const employee of directory) {
    if (!HR_TITLE_PATTERN.test(`${employee.jobTitle || ''} ${employee.designation || ''}`)) continue;
    await upsert({
      employeeCode: employee.employeeCode || employee.employeeId,
      fullName: employee.fullName,
      directoryEmployee: employee,
      roles: ['HR Manager'],
    });
  }

  return Array.from(byCode.values()).filter((item) => item.email || item.employeeCode);
};

const labelToKey: Record<string, string> = {
  'Preferred name': 'preferredName',
  'Marital status': 'maritalStatus',
  'State of origin': 'stateOfOrigin',
  LGA: 'localGovernmentArea',
  Religion: 'religion',
  'Languages spoken': 'languagesSpoken',
  'Personal email': 'personalEmail',
  'Primary phone': 'primaryPhone',
  'Alternate phone': 'alternatePhone',
  'Office extension': 'officeExtension',
  'Residential address': 'residentialAddress',
  'Permanent address': 'permanentAddress',
  'Nearest bus stop': 'nearestBusStop',
  City: 'city',
  State: 'state',
  Country: 'country',
  'Postal code': 'postalCode',
  Bank: 'bankName',
  Branch: 'branchName',
  'Account name': 'accountName',
  'Account number': 'accountNo',
  'Next of kin name': 'nextOfKinName',
  'Next of kin relationship': 'nextOfKinRelationship',
  'Next of kin phone': 'nextOfKinPhone',
  'Next of kin address': 'nextOfKinAddress',
  'Emergency contact name': 'emergencyContactName',
  'Emergency relationship': 'emergencyContactRelationship',
  'Emergency phone': 'emergencyContactPhone',
};

export const profileFieldKeyFromLabel = (label: string) => labelToKey[label] || '';

export const nigeriaStateOptions = () => getNigeriaStates();
export const nigeriaLgaOptions = (stateName: string) => getNigeriaLgas(stateName);

export const buildProfileFieldMeta = (
  key: string,
  label: string,
  value: string,
  editable: boolean,
  inputType: EssProfileFieldMeta['inputType'] = 'text',
  options?: string[],
): EssProfileFieldMeta => ({
  key,
  label,
  value,
  editable,
  inputType,
  options,
});

type ProfileSectionLike = {
  id: string;
  label: string;
  status: string;
  approvalRequired: boolean;
  fields: Array<{ label: string; value: string; key?: string; editable?: boolean; inputType?: EssProfileFieldMeta['inputType']; options?: string[] }>;
};

const editableConfig: Record<
  string,
  { key: string; inputType?: EssProfileFieldMeta['inputType']; options?: () => string[]; editable?: boolean }
> = {
  'Preferred name': { key: 'preferredName' },
  'Marital status': {
    key: 'maritalStatus',
    inputType: 'select',
    options: () => ['Single', 'Married', 'MRD - Married', 'Divorced', 'Widowed'],
  },
  'State of origin': { key: 'stateOfOrigin', inputType: 'select', options: nigeriaStateOptions },
  LGA: { key: 'localGovernmentArea', inputType: 'select', options: () => [] },
  Religion: {
    key: 'religion',
    inputType: 'select',
    options: () => ['Christianity', 'Islam', 'Traditional', 'Other'],
  },
  'Languages spoken': { key: 'languagesSpoken', inputType: 'textarea' },
  'Personal email': { key: 'personalEmail', inputType: 'email' },
  'Primary phone': { key: 'primaryPhone', inputType: 'tel' },
  'Alternate phone': { key: 'alternatePhone', inputType: 'tel' },
  'Office extension': { key: 'officeExtension', inputType: 'tel' },
  'Residential address': { key: 'residentialAddress', inputType: 'textarea' },
  'Permanent address': { key: 'permanentAddress', inputType: 'textarea' },
  'Nearest bus stop': { key: 'nearestBusStop' },
  City: { key: 'city' },
  State: { key: 'state', inputType: 'select', options: nigeriaStateOptions },
  Country: { key: 'country' },
  'Postal code': { key: 'postalCode' },
  Bank: { key: 'bankName' },
  Branch: { key: 'branchName' },
  'Account number': { key: 'accountNo' },
  'Account name': { key: 'accountName' },
  'Emergency contact name': { key: 'emergencyContactName' },
  'Emergency relationship': { key: 'emergencyContactRelationship' },
  'Emergency phone': { key: 'emergencyContactPhone', inputType: 'tel' },
  'Next of kin name': { key: 'nextOfKinName' },
  'Next of kin relationship': { key: 'nextOfKinRelationship' },
  'Next of kin phone': { key: 'nextOfKinPhone', inputType: 'tel' },
  'Next of kin address': { key: 'nextOfKinAddress', inputType: 'textarea' },
};

export const enrichEssProfileSections = <T extends ProfileSectionLike>(sections: T[]) =>
  sections.map((section) => ({
    ...section,
    fields: section.fields.map((field) => {
      const config = editableConfig[field.label];
      if (!config) {
        return {
          ...field,
          key: field.key || profileFieldKeyFromLabel(field.label) || field.label.toLowerCase().replace(/\s+/g, '_'),
          editable: false,
        };
      }
      return {
        ...field,
        key: config.key,
        editable: section.approvalRequired && (config.editable ?? true),
        inputType: config.inputType || 'text',
        options: config.options ? [...config.options()] : field.options,
      };
    }),
  }));

const mapChangesToHrisSync = (
  employee: DleEmployeeDirectoryRow,
  sectionId: string,
  changes: Record<string, string>,
) => {
  const personalKeys = new Set([
    'preferredName',
    'maritalStatus',
    'stateOfOrigin',
    'localGovernmentArea',
    'religion',
    'languagesSpoken',
  ]);
  const contactKeys = new Set(['personalEmail', 'primaryPhone', 'alternatePhone', 'officeExtension']);
  const addressKeys = new Set([
    'residentialAddress',
    'permanentAddress',
    'nearestBusStop',
    'city',
    'state',
    'country',
    'postalCode',
  ]);
  const bankKeys = new Set(['bankName', 'branchName', 'accountName', 'accountNo']);

  const personalInfo: Record<string, string> = {};
  const contacts: Record<string, string> = {};
  const payrollSetup: Record<string, string> = {};

  for (const [key, value] of Object.entries(changes)) {
    const text = compact(value);
    if (!text) continue;
    if (personalKeys.has(key) || (sectionId === 'personal' && personalKeys.has(key))) {
      personalInfo[key] = text;
    }
    if (contactKeys.has(key) || addressKeys.has(key)) {
      if (key === 'personalEmail') contacts.personalEmail = text;
      else if (key === 'primaryPhone') contacts.primaryPhone = text;
      else if (key === 'alternatePhone') contacts.alternativePhone = text;
      else if (key === 'officeExtension') contacts.officeExtension = text;
      else contacts[key] = text;
    }
    if (bankKeys.has(key)) {
      if (key === 'accountNo') payrollSetup.accountNumber = text;
      else if (key === 'bankName') payrollSetup.bankName = text;
      else if (key === 'branchName') payrollSetup.branchName = text;
      else if (key === 'accountName') payrollSetup.accountName = text;
    }
  }

  if (personalInfo.stateOfOrigin) {
    const region = getRegionForState(personalInfo.stateOfOrigin);
    if (region) personalInfo.region = region;
  }

  const emergencyContacts: Array<{
    fullName: string;
    relationship?: string;
    phoneNumber?: string;
    address?: string;
    isPrimary?: boolean;
    isNextOfKin?: boolean;
  }> = [];
  if (compact(changes.emergencyContactName)) {
    emergencyContacts.push({
      fullName: compact(changes.emergencyContactName),
      relationship: compact(changes.emergencyContactRelationship) || 'Emergency',
      phoneNumber: compact(changes.emergencyContactPhone),
      isPrimary: true,
      isNextOfKin: false,
    });
  }
  if (compact(changes.nextOfKinName)) {
    emergencyContacts.push({
      fullName: compact(changes.nextOfKinName),
      relationship: compact(changes.nextOfKinRelationship) || 'Next of Kin',
      phoneNumber: compact(changes.nextOfKinPhone),
      address: compact(changes.nextOfKinAddress),
      isPrimary: false,
      isNextOfKin: true,
    });
  }

  return {
    employeeCode: employee.employeeCode || employee.employeeId,
    fullName: employee.fullName,
    preferredName: personalInfo.preferredName || employee.preferredName || null,
    personalInfo,
    contacts,
    payrollSetup,
    emergencyContacts,
  };
};

const notifyProfileSubmittedToHr = async (input: {
  request: EssProfileUpdateRequest;
  requester: DleEmployeeDirectoryRow;
  actorName: string;
  sectionLabel: string;
  recipients: ProfileHrRecipient[];
  baseUrl?: string | null;
}) => {
  const session = profileSystemSession(input.actorName);
  const origin = resolveWorkflowLinkOrigin(input.baseUrl);
  const href = profileApprovalHref(input.request.id);
  const workspaceLink = `${origin}${href}`;
  const summary = changeSummary(input.request.profileChanges);

  await createEnterpriseNotification(session, {
    kind: 'Approval',
    module: 'Profile',
    title: `Profile update awaiting HR approval — ${input.requester.fullName}`,
    body: `${input.requester.fullName} submitted ${input.request.title} (${summary}). Review and approve in ESS.`,
    severity: 'warning',
    href,
    actor: input.actorName,
    channels: ['In-App', 'Email'],
    recipientRoles: ['HR Manager', 'HR Director', 'HR Officer', 'HR Head'],
    metadata: {
      requestId: input.request.id,
      module: 'ess-profile-update',
      serviceId: PROFILE_SERVICE_ID,
    },
  }).catch(() => undefined);

  for (const recipient of input.recipients.slice(0, 8)) {
    await createEnterpriseNotification(session, {
      kind: 'Approval',
      module: 'Profile',
      title: `Profile update awaiting your approval — ${input.requester.fullName}`,
      body: `${input.request.title}: ${summary}`,
      severity: 'warning',
      href,
      actor: input.actorName,
      channels: ['In-App', 'Email'],
      recipientEmployeeCode: recipient.employeeCode,
      recipientRoles: recipient.roles,
      metadata: { requestId: input.request.id, module: 'ess-profile-update' },
    }).catch(() => undefined);

    if (!recipient.email) continue;
    await sendProfileUpdateApprovalRequestEmail({
      recipientName: recipient.fullName,
      recipientEmail: recipient.email,
      requesterName: input.requester.fullName,
      requestTitle: input.request.title,
      sectionLabel: input.sectionLabel,
      changeSummary: summary,
      workspaceLink,
      baseUrl: input.baseUrl,
    }).catch(() => undefined);
  }
};

const notifyProfileDecisionToRequester = async (input: {
  request: EssProfileUpdateRequest;
  requester: DleEmployeeDirectoryRow;
  actorName: string;
  decision: 'approved' | 'rejected';
  comment?: string;
  baseUrl?: string | null;
}) => {
  const session = profileSystemSession(input.actorName);
  const origin = resolveWorkflowLinkOrigin(input.baseUrl);
  const href = profileEmployeeHref();
  const workspaceLink = `${origin}${href}`;
  const title = input.decision === 'approved' ? 'Profile update approved' : 'Profile update rejected';
  const body = input.decision === 'approved'
    ? `${input.request.title} has been approved by ${input.actorName} and applied to HRIS.`
    : `${input.request.title} was rejected by ${input.actorName}.${input.comment ? ` Comment: ${input.comment}` : ''}`;

  await createEnterpriseNotification(session, {
    kind: 'Workflow',
    module: 'Profile',
    title,
    body,
    severity: input.decision === 'approved' ? 'success' : 'warning',
    href,
    actor: input.actorName,
    channels: ['In-App', 'Email'],
    recipientEmployeeCode: input.requester.employeeCode || input.requester.employeeId,
    metadata: { requestId: input.request.id, module: 'ess-profile-update', decision: input.decision },
  }).catch(() => undefined);

  const email = await resolveEmployeeMailbox(input.requester);
  if (!email) return;
  await sendProfileUpdateDecisionEmail({
    recipientName: input.requester.fullName,
    recipientEmail: email,
    requestTitle: input.request.title,
    sectionLabel: input.request.profileSectionId,
    decision: input.decision,
    actorName: input.actorName,
    reason: input.comment,
    workspaceLink,
    baseUrl: input.baseUrl,
  }).catch(() => undefined);
};

export const submitEssProfileUpdate = async (input: {
  employee: DleEmployeeDirectoryRow;
  actorName: string;
  sectionId: string;
  sectionLabel: string;
  changes: Record<string, string>;
  previousValues: Record<string, string>;
  comment?: string;
  baseUrl?: string | null;
}) => {
  const sectionId = compact(input.sectionId);
  if (!sectionId) throw new Error('Profile section is required.');
  const changes = Object.fromEntries(
    Object.entries(input.changes)
      .map(([key, value]) => [key, compact(value)])
      .filter(([, value]) => value),
  );
  if (!Object.keys(changes).length) throw new Error('Provide at least one updated field.');

  const existingPending = await pendingProfileUpdatesForEmployee(input.employee.employeeId);
  if (existingPending.some((item) => item.profileSectionId === sectionId)) {
    throw new Error('A profile update for this section is already pending HR approval.');
  }

  const hrRecipients = await resolveProfileHrRecipients(input.employee);
  const now = new Date().toISOString();
  const requestId = `ess-profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const workflow = serviceWorkflowFor(
    ['Employee', 'HR Operations', 'HR Manager'],
    input.employee.fullName,
    'HR Manager',
    'HR Review',
    now,
  );
  const changedLabels = changeSummary(changes);
  const requestItem: EssProfileUpdateRequest = {
    id: requestId,
    employeeId: input.employee.employeeId,
    serviceId: PROFILE_SERVICE_ID,
    category: 'Profile Update',
    title: `${input.sectionLabel} update`,
    status: 'HR Review',
    priority: 'Normal',
    submittedAt: now,
    updatedAt: now,
    approvers: hrRecipients.length
      ? hrRecipients.slice(0, 5).map((item) => item.fullName)
      : ['HR Manager'],
    hrApproverEmployeeCodes: hrRecipients.map((item) => item.employeeCode),
    profileSectionId: sectionId,
    profileChanges: changes,
    profilePreviousValues: input.previousValues,
    workflow,
    comments: [
      {
        at: now,
        actor: input.actorName || input.employee.fullName,
        comment: input.comment || `Submitted ${input.sectionLabel} changes (${changedLabels}) for HR approval.`,
      },
    ],
  };

  const requests = await readAllEssRequests();
  await writeAllEssRequests([requestItem, ...requests]);
  invalidateEssPortalCache();

  await notifyProfileSubmittedToHr({
    request: requestItem,
    requester: input.employee,
    actorName: input.actorName || input.employee.fullName,
    sectionLabel: input.sectionLabel,
    recipients: hrRecipients,
    baseUrl: input.baseUrl,
  });

  return requestItem;
};

export const transitionEssProfileUpdate = async (input: {
  requestId: string;
  action: 'approve' | 'reject';
  actor: SessionPayload;
  employeeDirectory: DleEmployeeDirectoryRow[];
  comment?: string;
  baseUrl?: string | null;
}) => {
  if (!canApproveEssProfileUpdate(input.actor.roles || [])) {
    throw new Error('You are not authorized to approve profile updates.');
  }
  const requests = await readAllEssRequests();
  const index = requests.findIndex((item) => item.id === input.requestId);
  if (index < 0) throw new Error('Profile update request not found.');
  const current = requests[index];
  if (!isProfileUpdateRequest(current)) throw new Error('Request is not a profile update.');
  if (!/hr review|submitted|line manager review/i.test(current.status)) {
    throw new Error('Profile update is not awaiting HR approval.');
  }

  const actorCode = compact(input.actor.employeeCode || input.actor.username).toUpperCase();
  if (actorCode && employeeCodesMatch(current.employeeId, actorCode)) {
    throw new Error('You cannot approve or reject your own profile update. An HR Manager must review this request.');
  }

  const now = new Date().toISOString();
  const actorName = input.actor.fullName || input.actor.username;
  const requester = input.employeeDirectory.find(
    (item) =>
      employeeCodesMatch(item.employeeId, current.employeeId)
      || employeeCodesMatch(item.employeeCode, current.employeeId),
  );

  if (input.action === 'reject') {
    const next: EssProfileUpdateRequest = {
      ...current,
      status: 'Rejected',
      updatedAt: now,
      workflow: (current.workflow || []).map((stage) =>
        /hr/i.test(stage.owner) ? { ...stage, status: 'Rejected', actedAt: now, comment: input.comment || 'Rejected by HR' } : stage,
      ),
      comments: [
        {
          at: now,
          actor: actorName,
          comment: input.comment || 'Profile update rejected by HR.',
        },
        ...current.comments,
      ],
    };
    requests[index] = next;
    await writeAllEssRequests(requests);
    invalidateEssPortalCache();

    if (requester) {
      await notifyProfileDecisionToRequester({
        request: next,
        requester,
        actorName,
        decision: 'rejected',
        comment: input.comment,
        baseUrl: input.baseUrl,
      });
    }
    return next;
  }

  if (!requester) throw new Error('Employee record not found for profile update.');

  const syncPayload = mapChangesToHrisSync(requester, current.profileSectionId, current.profileChanges);
  const applied = await syncHrisEmployeeProfileToDb({
    employeeCode: syncPayload.employeeCode,
    fullName: syncPayload.fullName,
    preferredName: syncPayload.preferredName,
    personalInfo: syncPayload.personalInfo,
    contacts: syncPayload.contacts,
    payrollSetup: syncPayload.payrollSetup,
    emergencyContacts: syncPayload.emergencyContacts,
  });
  if (!applied) throw new Error('Unable to apply profile changes to HRIS.');

  const next: EssProfileUpdateRequest = {
    ...current,
    status: 'Approved',
    updatedAt: now,
    workflow: (current.workflow || []).map((stage) =>
      /hr/i.test(stage.owner) || /employee/i.test(stage.owner)
        ? { ...stage, status: 'Approved', actedAt: now, comment: input.comment || 'Approved by HR' }
        : stage,
    ),
    comments: [
      {
        at: now,
        actor: actorName,
        comment: input.comment || 'Profile update approved and applied to HRIS.',
      },
      ...current.comments,
    ],
  };
  requests[index] = next;
  await writeAllEssRequests(requests);
  invalidateEssPortalCache();

  await notifyProfileDecisionToRequester({
    request: next,
    requester,
    actorName,
    decision: 'approved',
    comment: input.comment,
    baseUrl: input.baseUrl,
  });

  return next;
};
