import { Suspense } from 'react';
import OvertimeApprovalAuthorizeClient from './OvertimeApprovalAuthorizeClient';

export default function OvertimeApprovalAuthorizePage() {
  return (
    <Suspense fallback={<div>Loading overtime approval...</div>}>
      <OvertimeApprovalAuthorizeClient />
    </Suspense>
  );
}
