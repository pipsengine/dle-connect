import EmployeeDirectoryClient from './EmployeeDirectoryClient';

export default function EmployeeDirectoryPage() {
  return <EmployeeDirectoryClient initialNow={new Date().toISOString()} />;
}

