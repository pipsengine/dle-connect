import fs from 'node:fs';
import path from 'node:path';
import sql from 'mssql';
import { createSessionToken } from '../apps/dashboard/lib/auth/session';

const BASE_URL = process.env.LEAVE_SMOKE_BASE_URL || 'http://localhost:3020';
const EMPLOYEE_CODE = process.env.LEAVE_SMOKE_EMPLOYEE || 'P0146';
const LEAVE_TYPE = process.env.LEAVE_SMOKE_LEAVE_TYPE || 'Compassionate Leave';
const RELIEVER_CODE = process.env.LEAVE_SMOKE_RELIEVER || 'P0181';

const loadEnv = () => {
  for (const file of [
    path.join(process.cwd(), 'apps', 'dashboard', '.env.local'),
    path.join(process.cwd(), 'apps', 'dashboard', '.env'),
  ]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value;
    }
  }
};

loadEnv();

const compact = (value: unknown) => String(value || '').trim();

const addWorkingDays = (startIso: string, workingDays: number) => {
  const date = new Date(`${startIso}T12:00:00.000Z`);
  let added = 0;
  while (added < workingDays) {
    date.setUTCDate(date.getUTCDate() + 1);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  return date.toISOString().slice(0, 10);
};

const uniqueSmokeWindow = () => {
  const seed = Number(String(Date.now()).slice(-4));
  const offset = 100 + (seed % 120);
  const startDate = addWorkingDays(new Date().toISOString().slice(0, 10), offset);
  const span = LEAVE_TYPE === 'Annual Leave' ? 4 : 2;
  const endDate = addWorkingDays(startDate, span);
  return { startDate, endDate, days: countWorkingDays(startDate, endDate) };
};

const countWorkingDays = (startIso: string, endIso: string) => {
  const start = new Date(`${startIso}T12:00:00.000Z`);
  const end = new Date(`${endIso}T12:00:00.000Z`);
  let days = 0;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) days += 1;
  }
  return days;
};

const assertStep = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const apiFetch = async (cookie: string, method: string, urlPath: string, body?: Record<string, unknown>) => {
  const response = await fetch(`${BASE_URL}${urlPath}`, {
    method,
    headers: {
      cookie: `dle_session=${cookie}`,
      'content-type': 'application/json',
      'x-ess-context': 'workforce-portal',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => ({}));
  return { response, json };
};

const queryLeaveApplication = async (requestId: string) => {
  const pool = await sql.connect({
    server: process.env.DLE_ENTERPRISE_DB_HOST,
    database: process.env.DLE_ENTERPRISE_DB_NAME,
    user: process.env.DLE_ENTERPRISE_DB_USER,
    password: process.env.DLE_ENTERPRISE_DB_PASSWORD,
    options: {
      encrypt: String(process.env.DLE_ENTERPRISE_DB_ENCRYPT || 'true').toLowerCase() === 'true',
      trustServerCertificate: true,
    },
  });
  try {
    const result = await pool.request()
      .input('Id', sql.NVarChar(120), requestId)
      .query(`
SELECT TOP 1 [Id],[EmployeeId],[LeaveType],[StartDate],[EndDate],[Days],[StatusName],[WorkflowStage],[ApprovalStatus]
FROM [hris].[LeaveApplications]
WHERE [Id]=@Id;`);
    return result.recordset[0] as Record<string, unknown> | undefined;
  } finally {
    await pool.close();
  }
};

const readEssRequest = async (requestId: string) => {
  const file = path.join(process.cwd(), 'apps', 'dashboard', 'data', 'hris', 'ess-requests.json');
  try {
    const parsed = JSON.parse(await fs.promises.readFile(file, 'utf8')) as Array<Record<string, unknown>>;
    return parsed.find((item) => item.id === requestId);
  } catch {
    return undefined;
  }
};

const run = async () => {
  console.log(`[smoke] Base URL: ${BASE_URL}`);
  console.log(`[smoke] Employee: ${EMPLOYEE_CODE}`);

  const token = await createSessionToken({
    userId: `usr-${EMPLOYEE_CODE}`,
    username: EMPLOYEE_CODE,
    employeeId: EMPLOYEE_CODE,
    employeeCode: EMPLOYEE_CODE,
    fullName: 'Mr CHRISTIAN ONUWABHAGBE OGBAISI',
    email: 'chrisogbaisi@dormanlongeng.com',
    department: 'INFORMATION TECHNOLOGY',
    unit: 'DLE',
    roles: ['Super Administrator'],
    permissions: ['*'],
    status: 'Active',
    firstLoginRequired: false,
    passwordResetRequired: false,
  });

  const portal = await apiFetch(token, 'GET', '/api/workforce-portal');
  assertStep(portal.response.ok, `GET /api/workforce-portal failed (${portal.response.status}): ${compact((portal.json as { error?: string }).error)}`);
  const portalData = (portal.json as { data?: Record<string, unknown> }).data || {};
  const widgets = (portalData.widgets as { leave?: { pending?: number; balance?: number } })?.leave || {};
  console.log(`[smoke] Portal leave balance: ${widgets.balance ?? 'n/a'}, pending widget: ${widgets.pending ?? 'n/a'}`);

  const { startDate, endDate, days } = uniqueSmokeWindow();
  const requestId = `ess-smoke-${EMPLOYEE_CODE.toLowerCase()}-${Date.now()}`;

  const submit = await apiFetch(token, 'POST', '/api/workforce-portal', {
    category: 'Leave Application',
    title: `${LEAVE_TYPE} ${startDate} to ${endDate}`,
    priority: 'Normal',
    requestId,
    leaveType: LEAVE_TYPE,
    startDate,
    endDate,
    days,
    reason: `Automated leave workflow smoke test for ${EMPLOYEE_CODE}.`,
    relieverEmployeeId: RELIEVER_CODE,
    relieverName: 'Mr NNAMDI FRANKLYN AGHANYA',
    handover: 'Routine handover notes for smoke test coverage.',
    attachmentNames: [],
  });
  assertStep(submit.response.ok, `Submit failed (${submit.response.status}): ${compact((submit.json as { error?: string }).error)}`);

  const submitted = (submit.json as { data?: { request?: { id?: string; status?: string; category?: string } } }).data?.request;
  assertStep(submitted?.id, 'Submit response missing request id');
  assertStep(submitted?.status === 'Line Manager Review', `Expected Line Manager Review, got ${submitted?.status}`);
  assertStep(/leave/i.test(String(submitted?.category || '')), `Unexpected category: ${submitted?.category}`);
  console.log(`[smoke] Submitted ${submitted.id} -> ${submitted.status}`);

  const portalAfterSubmit = await apiFetch(token, 'GET', '/api/workforce-portal');
  const pendingAfterSubmit = ((portalAfterSubmit.json as { data?: { widgets?: { leave?: { pending?: number } } } }).data?.widgets?.leave?.pending);
  assertStep(Number(pendingAfterSubmit) >= 1, `Pending widget should be >= 1 after submit, got ${pendingAfterSubmit}`);
  console.log(`[smoke] Pending widget after submit: ${pendingAfterSubmit}`);

  const managerApprove = await apiFetch(token, 'POST', '/api/workforce-portal', {
    action: 'approve-leave',
    requestId: submitted.id,
    comment: 'Line manager smoke-test approval.',
  });
  assertStep(managerApprove.response.ok, `Manager approve failed (${managerApprove.response.status}): ${compact((managerApprove.json as { error?: string }).error)}`);
  const afterManager = (managerApprove.json as { data?: { request?: { status?: string } } }).data?.request;
  assertStep(afterManager?.status === 'HR Review', `Expected HR Review, got ${afterManager?.status}`);
  console.log(`[smoke] Manager approved -> ${afterManager?.status}`);

  const hrApprove = await apiFetch(token, 'POST', '/api/workforce-portal', {
    action: 'approve-leave',
    requestId: submitted.id,
    comment: 'HR smoke-test final approval.',
  });
  assertStep(hrApprove.response.ok, `HR approve failed (${hrApprove.response.status}): ${compact((hrApprove.json as { error?: string }).error)}`);
  const afterHr = (hrApprove.json as { data?: { request?: { status?: string } } }).data?.request;
  assertStep(afterHr?.status === 'Approved', `Expected Approved, got ${afterHr?.status}`);
  console.log(`[smoke] HR approved -> ${afterHr?.status}`);

  const essRecord = await readEssRequest(String(submitted.id));
  assertStep(essRecord?.status === 'Approved', `ESS JSON status expected Approved, got ${essRecord?.status}`);
  console.log(`[smoke] ESS JSON status: ${essRecord?.status}`);

  const dbRecord = await queryLeaveApplication(String(submitted.id));
  assertStep(dbRecord, 'Leave application not found in SQL after approval');
  assertStep(String(dbRecord?.StatusName) === 'Approved', `SQL StatusName expected Approved, got ${dbRecord?.StatusName}`);
  assertStep(String(dbRecord?.WorkflowStage) === 'Final Approval', `SQL WorkflowStage expected Final Approval, got ${dbRecord?.WorkflowStage}`);
  console.log(`[smoke] SQL status: ${dbRecord?.StatusName}, stage: ${dbRecord?.WorkflowStage}, approval: ${dbRecord?.ApprovalStatus}`);

  const portalFinal = await apiFetch(token, 'GET', '/api/workforce-portal');
  const pendingFinal = ((portalFinal.json as { data?: { widgets?: { leave?: { pending?: number } } } }).data?.widgets?.leave?.pending);
  console.log(`[smoke] Pending widget after final approval: ${pendingFinal}`);

  console.log(JSON.stringify({
    ok: true,
    employeeCode: EMPLOYEE_CODE,
    requestId: submitted.id,
    startDate,
    endDate,
    days,
    essStatus: essRecord?.status,
    sqlStatus: dbRecord?.StatusName,
    sqlStage: dbRecord?.WorkflowStage,
    pendingAfterSubmit,
    pendingFinal,
    note: 'Smoke-test leave left in Approved status with future dates. Cancel manually in ESS if not needed.',
  }, null, 2));
};

run().catch((error) => {
  console.error('[smoke] FAILED:', error instanceof Error ? error.message : error);
  process.exit(1);
});
