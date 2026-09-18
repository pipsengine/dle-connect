/**
 * Payroll in-app notifications must stay on the approval chain.
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/payroll-notification-privacy.test.ts
 */
import assert from 'node:assert/strict';
import type { SessionPayload } from './auth/session.ts';
import {
  isLeakedPayrollApprovalNotification,
  notificationBelongsToSession,
  type EnterpriseNotification,
} from './enterprise-notifications-store.ts';
import { userMatchesPayrollApproverStage } from './payroll-approval-notification-service.ts';

const session = (input: Partial<SessionPayload> & Pick<SessionPayload, 'username' | 'roles'>): SessionPayload => ({
  sub: input.sub || input.username,
  username: input.username,
  fullName: input.fullName || input.username,
  employeeCode: input.employeeCode || input.username,
  roles: input.roles,
  permissions: [],
  status: 'Active',
  firstLoginRequired: false,
  passwordResetRequired: false,
  iat: 0,
  exp: 0,
  isGlobalAdmin: input.isGlobalAdmin,
});

const payrollNote = (recipient: string, roles: string[]): EnterpriseNotification => ({
  id: 'ntf-test',
  recipientUserId: recipient,
  recipientUsername: recipient,
  recipientEmployeeCode: recipient,
  recipientRoles: roles,
  kind: 'Approval',
  module: 'Payroll Management',
  title: 'Payroll approval required — August 2026 · DLE · Salaries',
  body: 'MD / CEO review is required. Gross ₦113,719,411.06, Net ₦91,831,140.22, 139 employees.',
  severity: 'warning',
  status: 'Unread',
  createdAt: '2026-09-09T15:26:18.743Z',
  actor: 'Payroll Approval Reminder',
  channels: ['In-App', 'Email'],
});

const mdItem = payrollNote('P0413', ['Employee', 'Executive Director', 'Executive User', 'Manager']);

assert.equal(notificationBelongsToSession(mdItem, session({ username: 'P0413', roles: ['Employee', 'Executive Director'] })), true);
assert.equal(notificationBelongsToSession(mdItem, session({ username: 'P0146', roles: ['Employee', 'Manager', 'Super Administrator', 'Executive Director'] })), false);
assert.equal(notificationBelongsToSession(mdItem, session({ username: 'L2000', roles: ['Employee'] })), false);

const allowed = new Set(['P0413', 'P0458', 'P0429']);
assert.equal(isLeakedPayrollApprovalNotification(mdItem, allowed), false);
assert.equal(isLeakedPayrollApprovalNotification(payrollNote('P0146', ['Super Administrator', 'Executive Director']), allowed), true);

assert.equal(userMatchesPayrollApproverStage({
  username: 'P0413',
  employeeCode: 'P0413',
  roles: ['Employee', 'Executive Director'],
  jobTitle: 'Managing Director',
}, 'md-ceo'), true);

assert.equal(userMatchesPayrollApproverStage({
  username: 'P0146',
  employeeCode: 'P0146',
  id: 'usr-P0146',
  isGlobalAdmin: true,
  roles: ['Super Administrator', 'Executive Director', 'Executive Management', 'HR Manager'],
  jobTitle: 'IT Manager',
}, 'md-ceo'), false);

assert.equal(userMatchesPayrollApproverStage({
  username: 'P0146',
  employeeCode: 'P0146',
  roles: ['Super Administrator', 'HR Manager', 'HR Director'],
}, 'hr-manager'), false);

console.log('payroll-notification-privacy.test.ts ok');
