import { redirect } from 'next/navigation';

export default function VisitorCheckInRedirect() {
  redirect('/security/visitor-management/dashboard');
}
