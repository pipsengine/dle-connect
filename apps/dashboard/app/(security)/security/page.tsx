import { redirect } from 'next/navigation';

export default function SecurityHomePage() {
  redirect('/security/visitor-management/dashboard');
}
