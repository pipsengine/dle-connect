import { redirect } from 'next/navigation';
export const metadata = { title: 'Problems' };
export default function Page() { redirect('/it-support/service-desk-itsm/problems/active-problems'); }
