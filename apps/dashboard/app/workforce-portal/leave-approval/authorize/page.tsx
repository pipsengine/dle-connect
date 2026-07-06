import { Suspense } from 'react';
import LeaveApprovalAuthorizeClient from './LeaveApprovalAuthorizeClient';

export default function LeaveApprovalAuthorizePage() {
  return (
    <Suspense fallback={<div>Loading leave approval...</div>}>
      <LeaveApprovalAuthorizeClient />
    </Suspense>
  );
}
