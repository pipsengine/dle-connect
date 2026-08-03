import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import { buildOnboardingDashboardMetrics } from '@/lib/onboarding-dashboard-metrics';
import { buildInductionScheduleWorkspace } from '@/lib/induction-schedule-service';
import OnboardingDashboardClient from './OnboardingDashboardClient';

export const dynamic = 'force-dynamic';

export default async function OnboardingDashboardPage() {
  const employeeSource = await readPayrollEmployees().catch(() => null);
  const employees = employeeSource?.employees || [];
  const generatedAt = new Date().toISOString();
  const inductionWorkspace = await buildInductionScheduleWorkspace().catch(() => null);
  const liveInductions = (inductionWorkspace?.tours || [])
    .flatMap((tour) =>
      tour.stops
        .filter((stop) => stop.status === 'Scheduled' || stop.status === 'Overdue' || stop.status === 'Needs Scheduling')
        .map((stop) => ({
          id: stop.stopId,
          employeeCode: tour.employeeCode || 'PRE-HIRE',
          employeeName: tour.hireName,
          department: stop.department,
          scheduledFor: stop.scheduledFor,
          kind: `${stop.department} stop`,
        })),
    )
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))
    .slice(0, 6);

  const initialMetrics = buildOnboardingDashboardMetrics(employees, 'MTD', generatedAt, {
    inductions: liveInductions,
  });

  return (
    <OnboardingDashboardClient
      employees={employees}
      initialMetrics={initialMetrics}
      generatedAt={generatedAt}
      source={employeeSource?.source || 'Employee directory'}
    />
  );
}
