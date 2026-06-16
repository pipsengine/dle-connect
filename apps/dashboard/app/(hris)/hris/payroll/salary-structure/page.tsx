import type { Metadata } from 'next';
import SalaryStructureClient from './SalaryStructureClient';

export const metadata: Metadata = {
  title: 'Salary Structure',
};

export default function SalaryStructurePage() {
  return <SalaryStructureClient initialNow={new Date().toISOString()} />;
}
