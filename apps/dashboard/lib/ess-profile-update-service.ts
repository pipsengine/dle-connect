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
import { getNigeriaLgas, getNigeriaStates, getRegionForState } from '@/lib/nigeria-locations';

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
};

const compact = (value: unknown) => String(value || '').trim();
const PROFILE_SERVICE_ID = 'profile-update';

export const canApproveEssProfileUpdate = (roles: string[] = []) =>
  roles.some((role) => /super admin|hr director|hr manager|hr officer|system administrator/i.test(role));

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

export const submitEssProfileUpdate = async (input: {
  employee: DleEmployeeDirectoryRow;
  actorName: string;
  sectionId: string;
  sectionLabel: string;
  changes: Record<string, string>;
  previousValues: Record<string, string>;
  comment?: string;
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

  const now = new Date().toISOString();
  const requestId = `ess-profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const workflow = serviceWorkflowFor(
    ['Employee', 'HR Operations', 'HR Manager'],
    input.employee.fullName,
    'HR Operations',
    'HR Review',
    now,
  );
  const changedLabels = Object.keys(changes)
    .map((key) => Object.entries(labelToKey).find(([, value]) => value === key)?.[0] || key)
    .join(', ');
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
    approvers: ['HR Operations', 'HR Manager'],
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
  return requestItem;
};

export const transitionEssProfileUpdate = async (input: {
  requestId: string;
  action: 'approve' | 'reject';
  actor: SessionPayload;
  employeeDirectory: DleEmployeeDirectoryRow[];
  comment?: string;
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

  const now = new Date().toISOString();
  const actorName = input.actor.fullName || input.actor.username;
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
    return next;
  }

  const employee = input.employeeDirectory.find(
    (item) =>
      compact(item.employeeId).toUpperCase() === compact(current.employeeId).toUpperCase()
      || compact(item.employeeCode).toUpperCase() === compact(current.employeeId).toUpperCase(),
  );
  if (!employee) throw new Error('Employee record not found for profile update.');

  const syncPayload = mapChangesToHrisSync(employee, current.profileSectionId, current.profileChanges);
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

  try {
    await createEnterpriseNotification(
      { sub: employee.employeeId, fullName: employee.fullName, roles: ['Employee'] } as SessionPayload,
      {
        title: 'Profile update approved',
        body: `${current.title} has been approved and your HRIS profile was updated.`,
        module: 'Profile',
        severity: 'success',
        href: '/workforce-portal?tab=profile',
      },
    );
  } catch {
    // notification is best-effort
  }

  return next;
};
