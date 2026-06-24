'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const APP_NAME = 'DLE Digital Enterprise';

const titleOverrides: Record<string, string> = {
  '/': 'Enterprise Home',
  '/login': 'Sign In',
  '/hris': 'HRIS',
  '/workforce-portal': 'Employee Self-Service Portal',
  '/hris/payroll/payroll-processing': 'Payroll Processing',
  '/hris/payroll/payroll-workflow': 'Payroll Workflow',
  '/hris/payroll/employee-salary-setup': 'Employee Salary Setup',
  '/hris/payroll/sage-migration-review': 'Sage Payroll Migration Review',
  '/hris/time-and-logs/timesheet-entry': 'Timesheet Entry',
  '/hris/time-and-logs/timesheet-review': 'Timesheet Review',
  '/hris/time-and-logs/timesheet-period': 'Timesheet Period',
  '/hris/workforce-management/attendance': 'Attendance',
  '/hris/payroll-management/bank-finance': 'Bank & Finance',
  '/hris/payroll-management/finance-integration': 'Bank & Finance',
  '/hris/payroll-management/statutory': 'Statutory Deductions',
  '/hris/payroll-management/compliance-statutory-management': 'Statutory Deductions',
  '/hris/payroll-management/deductions': 'Deductions Management',
  '/hris/payroll-management/deductions-management': 'Deductions Management',
  '/hris/payroll-management/earnings': 'Earnings Management',
  '/hris/payroll-management/salary-management': 'Pay Setup',
  '/hris/payroll-management/pay-setup': 'Pay Setup',
  '/hris/payroll-management/reports': 'Payroll Reports',
  '/hris/payroll-management/reports-analytics': 'Payroll Reports',
  '/hris/payroll-management/payroll-computation-workflow': 'Payroll Computation & Approval Workflow',
  '/hris/employees/add-new-employee': 'Add New Employee',
  '/hris/organization/company-structure': 'Company Structure',
  '/hris/organization/departments': 'Departments',
  '/hris/organization/locations-sites': 'Locations & Sites',
  '/hris/organization/job-grades': 'Job Grades',
  '/hris/leave-management': 'Leave Management',
  '/hris/employees/profile-management': 'Employee Profile Management',
  '/hris/employees/employee-profile-management': 'Employee Profile Management',
  '/hris/employees': 'Employee Directory',
  '/hris/payroll/salary-structure': 'Salary Structure',
};

const titleCase = (value: string) =>
  value
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bHris\b/g, 'HRIS')
    .replace(/\bEss\b/g, 'ESS')
    .replace(/\bAi\b/g, 'AI')
    .replace(/\bHr\b/g, 'HR')
    .replace(/\bQa\b/g, 'QA')
    .replace(/\bQc\b/g, 'QC');

const titleFromPathname = (pathname: string) => {
  const cleanPath = pathname.replace(/\/+$/, '') || '/';
  if (titleOverrides[cleanPath]) return titleOverrides[cleanPath];
  const segments = cleanPath.split('/').filter(Boolean);
  const last = segments.at(-1);
  if (!last) return 'Enterprise Home';
  return titleCase(last);
};

export function RouteTitle() {
  const pathname = usePathname();

  useEffect(() => {
    const pageTitle = titleFromPathname(pathname || '/');
    const nextTitle = `${pageTitle} | ${APP_NAME}`;
    const applyTitle = () => {
      if (document.title !== nextTitle) document.title = nextTitle;
    };

    applyTitle();
    const raf = window.requestAnimationFrame(applyTitle);
    const timer = window.setTimeout(applyTitle, 250);
    const observer = new MutationObserver(applyTitle);
    const titleNode = document.querySelector('title');
    if (titleNode) observer.observe(titleNode, { childList: true });
    window.addEventListener('focus', applyTitle);
    document.addEventListener('visibilitychange', applyTitle);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener('focus', applyTitle);
      document.removeEventListener('visibilitychange', applyTitle);
    };
  }, [pathname]);

  return null;
}
