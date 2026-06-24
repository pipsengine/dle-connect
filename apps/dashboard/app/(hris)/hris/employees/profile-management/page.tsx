import type { Metadata } from 'next';
import EmployeeProfileManagementPageClient from './EmployeeProfileManagementPageClient';

export const metadata: Metadata = {
  title: 'Employee Profile Management',
};

export default function EmployeeProfileManagementPage() {
  return <EmployeeProfileManagementPageClient />;
}
