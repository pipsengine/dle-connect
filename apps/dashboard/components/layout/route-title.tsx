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
  '/hris/payroll/employee-salary-setup': 'Employee Salary Setup',
  '/hris/payroll/sage-migration-review': 'Sage Payroll Migration Review',
  '/hris/time-and-logs/timesheet-entry': 'Timesheet Entry',
  '/hris/time-and-logs/timesheet-period': 'Timesheet Period',
  '/hris/workforce-management/attendance': 'Attendance',
  '/hris/payroll-management/salary-management': 'Salary Management',
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
