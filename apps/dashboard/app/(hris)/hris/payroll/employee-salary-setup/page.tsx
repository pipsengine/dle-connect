import type { Metadata } from 'next';
import EmployeeSalarySetupClient from './EmployeeSalarySetupClient';

export const metadata: Metadata = {
  title: 'Employee Salary Setup',
};

export default function EmployeeSalarySetupPage() {
  return <EmployeeSalarySetupClient initialNow={new Date().toISOString()} />;
}
