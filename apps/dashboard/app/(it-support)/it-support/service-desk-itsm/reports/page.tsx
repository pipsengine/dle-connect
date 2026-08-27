import { redirect } from 'next/navigation';
export const metadata = { title: 'Reports' };
export default function Page() { redirect('/it-support/service-desk-itsm/reports/ticket-reports'); }
