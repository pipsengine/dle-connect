import { redirect } from 'next/navigation';
export const metadata = { title: 'Incidents' };
export default function Page() { redirect('/it-support/service-desk-itsm/incidents/active-incidents'); }
