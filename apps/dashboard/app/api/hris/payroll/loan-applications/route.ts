import { NextResponse } from 'next/server';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import { AUTH_COOKIE, verifySessionToken, type SessionPayload } from '@/lib/auth/session';
import {
  activeLoansVersion,
  payrollAmountFromEmployee,
  readPayrollLoanApplications,
  readPayrollLoansConfig,
  writePayrollLoanApplications,
  type LoanApplication,
} from '@/lib/payroll-loans-engine';

type Role = 'Super Admin' | 'HR Director' | 'HR Manager' | 'Payroll Officer' | 'Finance Controller' | 'Executive Management' | 'Auditor' | 'Employee';

const ok = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });
const compact = (value: unknown) => String(value || '').trim();
const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const normalize = (value: unknown) => compact(value).toLowerCase();
const tokenFrom = (request: Request) => request.headers.get('cookie')?.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${AUTH_COOKIE}=`))?.split('=').slice(1).join('=');
const getSession = (request: Request) => verifySessionToken(tokenFrom(request) ? decodeURIComponent(tokenFrom(request) || '') : '');

const getRole = (request: Request): Role => {
  const value = request.headers.get('x-hris-role');
  const roles: Role[] = ['Super Admin', 'HR Director', 'HR Manager', 'Payroll Officer', 'Finance Controller', 'Executive Management', 'Auditor', 'Employee'];
  return roles.includes(value as Role) ? (value as Role) : 'Employee';
};

const employeeKeys = (employee: Awaited<ReturnType<typeof readPayrollEmployees>>['employees'][number]) => [
  employee.employeeId,
  employee.employeeCode,
  employee.sourceEmployeeId,
  String(employee.employeeDbId || ''),
  employee.officialEmail,
  employee.email,
  employee.personalEmail,
].map(normalize).filter(Boolean);
const resolveEssEmployee = (employees: Awaited<ReturnType<typeof readPayrollEmployees>>['employees'], session: SessionPayload | null) => {
  const identities = [session?.employeeCode, session?.employeeId, session?.username].map(normalize).filter(Boolean);
  if (!identities.length) return null;
  return employees.find((employee) => identities.some((identity) => employeeKeys(employee).includes(identity))) || null;
};

export async function GET(request: Request) {
  try {
    const role = getRole(request);
    const session = await getSession(request);
    const [employeeSource, config, applications] = await Promise.all([readPayrollEmployees(), readPayrollLoansConfig(), readPayrollLoanApplications()]);
    const version = activeLoansVersion(config);
    if (!version) return err(500, 'No active loans and salary advances configuration is available.');
    const essEmployee = role === 'Employee' ? resolveEssEmployee(employeeSource.employees, session) : null;
    if (role === 'Employee' && !session) return err(401, 'Unauthenticated.');
    if (role === 'Employee' && !essEmployee) return err(403, 'Employee identity is not linked to the logged-in account.');

    const visibleApplications = role === 'Employee' && essEmployee ? applications.filter((item) => item.employeeId === essEmployee.employeeId) : applications;
    const visibleEmployees = role === 'Employee' && essEmployee ? [essEmployee] : employeeSource.employees;
    return ok({
      role,
      employees: visibleEmployees.map((employee) => ({
        employeeId: employee.employeeId,
        fullName: employee.fullName,
        department: employee.department,
        payrollGroup: employee.payrollGroup || 'Unassigned',
      })),
      products: version.products.filter((product) => product.enabled),
      applications: visibleApplications.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)),
    });
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to load loan applications.');
  }
}

export async function POST(request: Request) {
  try {
    const role = getRole(request);
    const session = await getSession(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const productId = compact(body.productId);
    const principal = Number(body.principal);
    const tenorMonths = Number(body.tenorMonths);
    const purpose = compact(body.purpose);

    if (role !== 'Employee') return err(403, 'Loan applications must be submitted by employees from the ESS portal.');
    if (!session) return err(401, 'Unauthenticated.');
    if (!productId) return err(400, 'productId is required');
    if (!Number.isFinite(principal) || principal <= 0) return err(400, 'principal must be a positive amount');
    if (!Number.isFinite(tenorMonths) || tenorMonths <= 0) return err(400, 'tenorMonths must be a positive number');
    if (!purpose) return err(400, 'purpose is required');

    const [employeeSource, config, applications] = await Promise.all([readPayrollEmployees(), readPayrollLoansConfig(), readPayrollLoanApplications()]);
    const employee = resolveEssEmployee(employeeSource.employees, session);
    if (!employee) return err(403, 'Employee identity is not linked to the logged-in account.');
    const version = activeLoansVersion(config);
    const product = version?.products.find((item) => item.id === productId && item.enabled);
    if (!version || !product) return err(400, 'Selected loan product is not available');

    const amounts = payrollAmountFromEmployee(employee);
    const maxPrincipal = amounts.monthlyBasePay * Number(product.maxPrincipalMultiple || 0);
    if (maxPrincipal > 0 && principal > maxPrincipal) return err(400, `Requested amount exceeds ${product.label} policy cap`);
    if (tenorMonths > Number(product.maxTenorMonths || 0)) return err(400, `Tenor exceeds ${product.label} policy cap`);

    const now = new Date().toISOString();
    const application: LoanApplication = {
      id: `loan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      employeeId: employee.employeeId,
      productId,
      principal: roundMoney(principal),
      outstandingBalance: roundMoney(principal),
      tenorMonths: Math.round(tenorMonths),
      installmentsPaid: 0,
      approvalStatus: 'Submitted',
      purpose,
      requestedAt: now,
      updatedAt: now,
      audit: [{ at: now, actor: role, action: 'Loan application submitted' }],
    };

    await writePayrollLoanApplications([application, ...applications]);
    return ok({ application });
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to submit loan application.');
  }
}
