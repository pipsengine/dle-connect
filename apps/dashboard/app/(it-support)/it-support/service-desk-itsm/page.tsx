import { redirect } from 'next/navigation';

export const metadata = { title: 'Service Desk (ITSM)' };

export default function ServiceDeskItsmPage() {
  redirect('/it-support/service-desk-itsm/dashboard');
}
