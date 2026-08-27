import { redirect } from 'next/navigation';
export const metadata = { title: 'Service Requests' };
export default function Page() { redirect('/it-support/service-desk-itsm/service-requests/all-requests'); }
