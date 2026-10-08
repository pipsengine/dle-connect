import { Suspense } from 'react';
import TelephoneAllowanceApprovalsClient from './TelephoneAllowanceApprovalsClient';

export const metadata = { title: 'Telephone Allowance Approvals' };

export default function TelephoneAllowanceApprovalsPage() {
  return (
    <Suspense fallback={null}>
      <TelephoneAllowanceApprovalsClient />
    </Suspense>
  );
}
