import { redirect } from 'next/navigation';
export const metadata = { title: 'Customer Feedback' };
export default function Page() { redirect('/it-support/service-desk-itsm/customer-feedback/surveys'); }
