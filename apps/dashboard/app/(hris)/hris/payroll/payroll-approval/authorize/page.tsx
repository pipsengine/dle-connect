import { Suspense } from 'react';
import PayrollApprovalAuthorizeClient from './PayrollApprovalAuthorizeClient';

export default function PayrollApprovalAuthorizePage() {
  return (
    <Suspense fallback={<div>Loading payroll approval...</div>}>
      <PayrollApprovalAuthorizeClient />
    </Suspense>
  );
}
