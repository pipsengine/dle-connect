import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import { buildOnboardingDashboardMetrics } from '@/lib/onboarding-dashboard-metrics';
import OnboardingDashboardClient from './OnboardingDashboardClient';

export const dynamic = 'force-dynamic';

export default async function OnboardingDashboardPage() {
  const employeeSource = await readPayrollEmployees().catch(() => null);
  const employees = employeeSource?.employees || [];
  const generatedAt = new Date().toISOString();
  const initialMetrics = buildOnboardingDashboardMetrics(employees, 'MTD', generatedAt);

  return (
    <OnboardingDashboardClient
      employees={employees}
      initialMetrics={initialMetrics}
      generatedAt={generatedAt}
      source={employeeSource?.source || 'Employee directory'}
    />
  );
}
