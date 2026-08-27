import { redirect } from 'next/navigation';
export const metadata = { title: 'ITSM Settings' };
export default function Page() { redirect('/it-support/service-desk-itsm/settings/categories'); }
