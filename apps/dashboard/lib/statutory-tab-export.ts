import type { ExcelCell } from '@/lib/excel-export';

export type StatutoryHubTabId =
  | 'overview'
  | 'paye'
  | 'pension'
  | 'nhf'
  | 'nsitf'
  | 'itf'
  | 'compliance-reports'
  | 'exceptions';

export type StatutoryHubException = {
  id: string;
  employeeId: string;
  employeeName: string;
  issue: string;
  severity: string;
  owner: string;
};

const compact = (value: unknown) => String(value || '').trim();

export const isStatutoryHubReport = (report: string) =>
  report === 'statutory-overview' || report === 'statutory-compliance' || report === 'statutory-exceptions';

export const statutoryExceptionIssue = (issue: string) =>
  /paye|tax|pension|nhf|nsitf|itf|statutory|remittance|tin|tax number|pension number|rsa|pfa/i.test(issue);

const categoryIssue = (issue: string, category: 'paye' | 'pension' | 'nhf' | 'nsitf' | 'itf') => {
  if (category === 'paye') return /paye|tax|tin|taxable|tax code/i.test(issue);
  if (category === 'pension') return /pension|rsa|pfa/i.test(issue);
  if (category === 'nhf') return /nhf/i.test(issue);
  if (category === 'nsitf') return /nsitf/i.test(issue);
  return /itf/i.test(issue);
};

const categoryStatus = (issues: StatutoryHubException[]) => {
  if (!issues.length) return 'Ready';
  if (issues.some((item) => item.severity === 'High')) return 'Blocked';
  return 'Pending';
};

export const statutoryTabExportTarget = (tab: StatutoryHubTabId) => {
  if (tab === 'paye') return { kind: 'api' as const, path: '/api/hris/payroll/tax-paye' };
  if (tab === 'pension') return { kind: 'api' as const, path: '/api/hris/payroll/pension' };
  if (tab === 'nhf') return { kind: 'api' as const, path: '/api/hris/payroll/nhf-nsitf-itf', query: { fund: 'nhf' } };
  if (tab === 'nsitf') return { kind: 'api' as const, path: '/api/hris/payroll/nhf-nsitf-itf', query: { fund: 'nsitf' } };
  if (tab === 'itf') return { kind: 'api' as const, path: '/api/hris/payroll/nhf-nsitf-itf', query: { fund: 'itf' } };
  if (tab === 'compliance-reports') return { kind: 'report' as const, report: 'statutory-compliance' };
  if (tab === 'exceptions') return { kind: 'report' as const, report: 'statutory-exceptions' };
  return { kind: 'report' as const, report: 'statutory-overview' };
};

export const buildStatutoryHubExportTable = (input: {
  report: string;
  periodLabel: string;
  employeesInScope: number;
  runStatus: string;
  schedulesGenerated: boolean;
  schedulesGeneratedAt?: string | null;
  exceptions: StatutoryHubException[];
}) => {
  const issues = (input.exceptions || []).filter((item) => statutoryExceptionIssue(item.issue));
  const categories = (['paye', 'pension', 'nhf', 'nsitf', 'itf'] as const).map((id) => {
    const categoryIssues = issues.filter((item) => categoryIssue(item.issue, id));
    return {
      id: id.toUpperCase(),
      issues: categoryIssues.length,
      status: categoryStatus(categoryIssues),
    };
  });

  if (input.report === 'statutory-overview') {
    return {
      title: `Statutory Overview - ${input.periodLabel}`,
      sheetName: 'Statutory Overview',
      fileName: `statutory-overview-${compact(input.periodLabel).replace(/\s+/g, '-').toLowerCase() || 'period'}`,
      subtitle: `${input.employeesInScope} employees in scope · ${issues.length} statutory issues`,
      columns: ['Category', 'Status', 'Issues'],
      rows: categories.map((item) => [item.id, item.status, item.issues] as ExcelCell[]),
    };
  }

  if (input.report === 'statutory-compliance') {
    return {
      title: `Statutory Compliance - ${input.periodLabel}`,
      sheetName: 'Compliance',
      fileName: `statutory-compliance-${compact(input.periodLabel).replace(/\s+/g, '-').toLowerCase() || 'period'}`,
      subtitle: `Run ${input.runStatus} · Schedules ${input.schedulesGenerated ? 'Generated' : 'Pending'}`,
      columns: ['Item', 'Value'],
      rows: [
        ['Period', input.periodLabel],
        ['Employees in scope', input.employeesInScope],
        ['Run status', input.runStatus],
        ['Schedules', input.schedulesGenerated ? 'Generated' : 'Pending'],
        ['Schedules generated at', input.schedulesGeneratedAt || ''],
        ...categories.map((item) => [`${item.id} issues`, item.issues] as ExcelCell[]),
      ],
    };
  }

  return {
    title: `Statutory Exceptions - ${input.periodLabel}`,
    sheetName: 'Exceptions',
    fileName: `statutory-exceptions-${compact(input.periodLabel).replace(/\s+/g, '-').toLowerCase() || 'period'}`,
    subtitle: `${issues.length} statutory exceptions`,
    columns: ['Employee ID', 'Employee Name', 'Issue', 'Severity', 'Owner'],
    rows: issues.map((item) => [item.employeeId, item.employeeName, item.issue, item.severity, item.owner] as ExcelCell[]),
  };
};
