/**
 * Send a one-off Finance Manager approval-style test email to Rapheal (P0429).
 */
import { loadWorkspaceEnv } from '../../apps/dashboard/lib/dle-enterprise-db.ts';
import { invalidatePayrollEmployeeCache, readDirectoryEmployees } from '../../apps/dashboard/lib/payroll-employee-source.ts';
import { resolveEmployeeMailbox, sendPaymentApprovalRequestEmail } from '../../apps/dashboard/lib/mail-service.ts';
import { paymentRequestDetailUrl } from '../../apps/dashboard/lib/finance-intelligence/payment-approval-notify.ts';

loadWorkspaceEnv();
invalidatePayrollEmployeeCache();

const main = async () => {
  const dir = await readDirectoryEmployees();
  const employee = (dir.employees || []).find((row) =>
    String(row.employeeCode || row.employeeId || '').toUpperCase() === 'P0429') || null;
  if (!employee) throw new Error('P0429 not found in directory');
  const mailbox = await resolveEmployeeMailbox(employee);
  console.log({
    code: employee.employeeCode,
    name: employee.fullName,
    officialEmail: employee.officialEmail,
    email: employee.email,
    mailbox,
  });
  if (!mailbox) throw new Error('No mailbox resolved for P0429');

  const requestId = 'test-rapheal-fm-notify';
  const result = await sendPaymentApprovalRequestEmail({
    recipientName: String(employee.fullName || 'RAPHEAL OLAITAN IYANDA'),
    recipientEmail: mailbox,
    request: {
      requestId,
      requestNumber: 'TEST-FM-NOTIFY',
      paymentType: 'Cash Advance Payment',
      title: 'Finance Manager notification test',
      requesterName: 'System Test',
      beneficiaryName: 'System Test',
      netAmount: 1,
      currencyCode: 'NGN',
      currentStage: 'Finance Manager',
      status: 'Pending Approval',
    },
    stage: 'Finance Manager',
    approveUrl: paymentRequestDetailUrl(requestId, null, 'approve'),
    rejectUrl: paymentRequestDetailUrl(requestId, null, 'reject'),
    detailUrl: paymentRequestDetailUrl(requestId),
  });
  console.log('send result', result);
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
