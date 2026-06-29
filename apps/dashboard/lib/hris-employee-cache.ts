import { invalidateEssPortalCache } from '@/lib/ess-portal-cache';
import { invalidatePayrollEmployeeCache } from '@/lib/payroll-employee-source';

export const invalidateHrisEmployeeCaches = () => {
  invalidatePayrollEmployeeCache();
  invalidateEssPortalCache();
};
