import { NextResponse } from 'next/server';

import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import { assignEmployeesToSupervisor, readSupervisorAssignments } from '@/lib/supervisor-assignment-store';
import { extractSupervisorEmployeeCode, supervisorCodesMatch } from '@/lib/timesheet-agege-blasting';
import { auditDepartmentReportingManagers, syncDepartmentReportingManagers } from '@/lib/department-reporting-manager-sync';

type Role =
  | 'Super Admin'
  | 'HR Director'
  | 'HR Manager'
  | 'HR Officer'
  | 'Department Head'
  | 'Unit Head'
  | 'Line Manager'
  | 'Project Manager'
  | 'Payroll Officer'
  | 'Auditor'
  | 'Employee'
  | 'Executive Management';

type Severity = 'high' | 'medium' | 'low';

type ReportingInsight = {
  id: string;
  severity: Severity;
  confidence: number;
  title: string;
  recommendation: string;
  actionLabel: string;
  action: string;
};

const jsonOk = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const jsonErr = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const getRole = (request: Request): Role => {
  const v = request.headers.get('x-hris-role');
  const all: Role[] = [
    'Super Admin',
    'HR Director',
    'HR Manager',
    'HR Officer',
    'Department Head',
    'Unit Head',
    'Line Manager',
    'Project Manager',
    'Payroll Officer',
    'Auditor',
    'Employee',
    'Executive Management',
  ];
  return (all.includes(v as Role) ? (v as Role) : 'HR Manager') as Role;
};

const stores = () => {
  const g = globalThis as unknown as {
    __dleHrisEmployees?: Map<string, any>;
    __dleHrisReportingChangeRequests?: Map<string, any>;
    __dleHrisReportingChangeRequestsByEmployee?: Map<string, string[]>;
    __dleHrisDelegations?: Map<string, any[]>;
  };
  if (!g.__dleHrisEmployees) g.__dleHrisEmployees = new Map();
  if (!g.__dleHrisReportingChangeRequests) g.__dleHrisReportingChangeRequests = new Map();
  if (!g.__dleHrisReportingChangeRequestsByEmployee) g.__dleHrisReportingChangeRequestsByEmployee = new Map();
  if (!g.__dleHrisDelegations) g.__dleHrisDelegations = new Map();
  return { employees: g.__dleHrisEmployees, requests: g.__dleHrisReportingChangeRequests, index: g.__dleHrisReportingChangeRequestsByEmployee, delegations: g.__dleHrisDelegations };
};

const addToIndex = (employeeId: string, requestId: string) => {
  const s = stores();
  const ids = s.index.get(employeeId) || [];
  if (!ids.includes(requestId)) s.index.set(employeeId, [requestId, ...ids].slice(0, 120));
};

type ReportingEmployeeOption = {
  employeeId: string;
  fullName: string;
  department: string;
  jobTitle: string;
  currentManager: string;
  location: string;
  businessUnit: string;
  employmentStatus: string;
  functionalManager: string;
  departmentHead: string;
  hrBusinessPartner: string;
};

const uniqueSorted = (values: Array<string | undefined | null>) =>
  Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));

const readRows = async () => (await readPayrollEmployees()).employees;

const assignmentActive = (row: DleEmployeeDirectoryRow) => !String(row.status || '').toLowerCase().match(/terminated|resigned|retired|inactive|deceased/);

const toEmployeeOption = (row: DleEmployeeDirectoryRow): ReportingEmployeeOption => ({
  employeeId: row.employeeId,
  fullName: row.fullName,
  department: row.department,
  jobTitle: row.jobTitle,
  currentManager: row.managerName || '',
  location: row.location,
  businessUnit: row.businessUnit,
  employmentStatus: row.status,
  functionalManager: row.functionalManager || '',
  departmentHead: row.departmentHead || '',
  hrBusinessPartner: row.hrBusinessPartner || '',
});

const listEmployees = async () => {
  const rows = await readRows();
  return rows.filter(assignmentActive).map(toEmployeeOption).sort((a, b) => `${a.fullName} ${a.employeeId}`.localeCompare(`${b.fullName} ${b.employeeId}`));
};

const formOptions = (rows: DleEmployeeDirectoryRow[]) => ({
  changeTypes: [
    'Manager Change',
    'Functional Manager Change',
    'Department Head Change',
    'Project Manager Change',
    'Matrix Manager Change',
    'Delegated Approver Change',
    'Temporary Reporting Assignment',
    'Bulk Manager Reassignment',
  ],
  statuses: ['Active', 'Pending Approval', 'Scheduled', 'Temporary', 'Expired', 'Cancelled'],
  delegationScopes: [
    'Leave Approval',
    'Attendance Approval',
    'Expense Approval',
    'Timesheet Approval',
    'HR Request Approval',
    'Project Approval',
    'All Workflow Approvals',
  ],
  delegationAssignmentTypes: [
    'Acting manager assignment',
    'Temporary supervisor',
    'Delegated approver',
    'Leave-cover manager',
    'Project supervisor',
    'Alternate approver',
  ],
  departments: uniqueSorted(rows.map((row) => row.department)),
  businessUnits: uniqueSorted(rows.map((row) => row.businessUnit)),
  locations: uniqueSorted(rows.flatMap((row) => [row.location, row.workLocation, row.officeLocation])),
});

const buildPdfBytes = (title: string, lines: string[]) => {
  const escapePdf = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const clean = (s: string) => escapePdf(s.replace(/\r?\n/g, ' ').slice(0, 170));
  const fontSize = 10;
  const lineHeight = 12;
  const startY = 760;
  const x = 40;
  const all = [title, ...lines].slice(0, 55);
  const streamParts: string[] = [];
  streamParts.push(`BT /F1 ${fontSize} Tf ${x} ${startY} Td`);
  for (let i = 0; i < all.length; i++) {
    streamParts.push(`(${clean(all[i] || '')}) Tj`);
    if (i !== all.length - 1) streamParts.push(`0 -${lineHeight} Td`);
  }
  streamParts.push('ET');
  const stream = streamParts.join('\n');

  const encoder = new TextEncoder();
  const xref: number[] = [0];
  let out = '%PDF-1.4\n';
  const pushObj = (obj: string) => {
    xref.push(out.length);
    out += obj;
  };
  pushObj('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  pushObj('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  pushObj('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n');
  pushObj('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');
  const streamBytes = encoder.encode(stream);
  pushObj(`5 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n${stream}\nendstream\nendobj\n`);
  const startXref = out.length;
  out += `xref\n0 ${xref.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < xref.length; i++) out += `${String(xref[i]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${xref.length} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;
  return encoder.encode(out);
};

const csvCell = (v: string) => {
  const s = (v ?? '').replace(/\r?\n/g, ' ').trim();
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

export async function GET(request: Request, ctx: { params: Promise<{ action: string[] }> }) {
  const { action } = await ctx.params;
  const role = getRole(request);
  const seg0 = action[0] || '';
  const url = new URL(request.url);

  if (seg0 === 'form-options') {
    const includeEmployees = url.searchParams.get('includeEmployees') === '1';
    const rows = await readRows();
    const assignableEmployees = rows.filter(assignmentActive).map(toEmployeeOption).sort((a, b) => `${a.fullName} ${a.employeeId}`.localeCompare(`${b.fullName} ${b.employeeId}`));
    return jsonOk({ ...formOptions(rows), employees: includeEmployees ? assignableEmployees : [] });
  }

  if (seg0 === 'summary') {
    if (role === 'Employee') return jsonErr(403, 'Permission denied');
    const rows = await readRows();
    const s = stores();
    const totalEmployees = rows.length;
    const pendingChanges = Array.from(s.requests.values()).filter((req: any) => req && !['Approved', 'Cancelled', 'Completed'].includes(String(req.status || ''))).length;
    const missingManagers = rows.filter((row) => !row.managerName).length;
    const approvalChainGaps = rows.filter((row) => !row.managerName || !row.departmentHead || !row.hrBusinessPartner).length;
    const circularRiskFlags = rows.filter((row) => row.managerName && row.managerName.toLowerCase() === row.fullName.toLowerCase()).length;
    return jsonOk({
      totalEmployees,
      pendingChanges,
      missingManagers,
      approvalChainGaps,
      delegationExpiringSoon: 0,
      circularRiskFlags,
      uniqueManagers: uniqueSorted(rows.map((row) => row.managerName)).length,
      lastUpdatedAt: new Date().toISOString(),
    });
  }

  if (seg0 === 'supervisor-assignments') {
    if (role === 'Employee') return jsonErr(403, 'Permission denied');
    const assignmentBatch = url.searchParams.get('assignmentBatch') || undefined;
    const supervisorEmployeeCode = url.searchParams.get('supervisorEmployeeCode') || undefined;
    return jsonOk(await readSupervisorAssignments({ assignmentBatch, supervisorEmployeeCode }));
  }

  if (seg0 === 'department-reporting-audit') {
    if (role === 'Employee') return jsonErr(403, 'Permission denied');
    return jsonOk(await auditDepartmentReportingManagers());
  }

  if (seg0 === 'ai-insights') {
    if (role === 'Employee') return jsonErr(403, 'Permission denied');
    const employeeId = url.searchParams.get('employeeId') || '';
    const rows = await readRows();
    const row = employeeId ? rows.find((item) => item.employeeId.toLowerCase() === employeeId.toLowerCase() || item.employeeCode.toLowerCase() === employeeId.toLowerCase()) : null;
    const missingManagers = rows.filter((item) => !item.managerName).length;
    const wideManagers = Array.from(
      rows.reduce((map, item) => {
        const key = item.managerName || '';
        if (!key) return map;
        map.set(key, (map.get(key) || 0) + 1);
        return map;
      }, new Map<string, number>()),
    ).filter(([, count]) => count > 12);
    const out: ReportingInsight[] = [];
    const add = (severity: Severity, title: string, confidence: number, recommendation: string, actionLabel: string, actionKey: string) =>
      out.push({ id: `rep-ai-${employeeId || 'org'}-${Math.random().toString(16).slice(2)}`, severity, confidence, title, recommendation, actionLabel, action: actionKey });

    if (row && !row.managerName) add('high', 'Direct reporting manager is missing', 0.88, 'Assign a direct manager to restore approval routing and accountability.', 'Assign Manager', 'open_request');
    if (row && !row.departmentHead) add('medium', 'Department head is missing', 0.76, 'Assign department head coverage for escalation and departmental approvals.', 'Open Chain', 'open_approval_chain');
    if (row && row.managerName && row.managerName.toLowerCase() === row.fullName.toLowerCase()) add('high', 'Circular reporting risk detected', 0.9, 'Employee cannot report to self. Submit a corrected manager assignment.', 'Resolve', 'open_request');
    if (missingManagers > 0) add('high', `${missingManagers} employee${missingManagers === 1 ? '' : 's'} without direct managers`, 0.82, 'Review unassigned reporting lines and route manager assignment requests.', 'Open Records', 'open_manager');
    if (wideManagers.length > 0) add('medium', `${wideManagers.length} manager${wideManagers.length === 1 ? '' : 's'} above span threshold`, 0.72, 'Review span of control and consider supervisor layers where teams are too large.', 'Review Manager', 'open_manager');
    if (out.length === 0) add('low', 'Reporting lines are within expected controls', 0.64, 'No urgent manager, department head, or circular reporting exceptions were detected.', 'Review Org Chart', 'open_org_chart');
    return jsonOk(out.slice(0, 12));
  }

  if (seg0 === 'export') {
    if (role === 'Employee') return jsonErr(403, 'Permission denied');
    const format = (url.searchParams.get('format') || 'csv').toLowerCase();
    const employeeId = url.searchParams.get('employeeId') || '';
    const stamp = new Date().toISOString().slice(0, 10);
    const fileBase = employeeId ? `reporting_line_${employeeId}_${stamp}` : `reporting_line_report_${stamp}`;

    const header = [
      'Employee ID',
      'Employee Name',
      'Direct Manager',
      'Functional Manager',
      'Department Head',
      'Unit Head',
      'Business Unit Head',
      'Project Manager',
      'Site Supervisor',
      'Matrix Manager',
      'Dotted-Line Manager',
      'HR Business Partner',
      'Delegated Approver',
      'Effective Date',
      'End Date',
      'Status',
      'Reason',
    ];
    const employees = (await listEmployees()).slice(0, 1000);
    const rows = employees
      .filter((e) => (employeeId ? e.employeeId === employeeId : true))
      .map((e) => [
        e.employeeId,
        e.fullName,
        e.currentManager,
        e.functionalManager,
        e.departmentHead,
        '',
        '',
        '',
        '',
        e.functionalManager,
        '',
        e.hrBusinessPartner,
        '',
        '',
        '',
        'Active',
        'System database reporting line',
      ]);

    if (format === 'xls' || format === 'excel') {
      const html = `<!doctype html><html><head><meta charset="utf-8"/></head><body>
        <table border="1">
          <tr>${header.map((h) => `<th>${h}</th>`).join('')}</tr>
          ${rows.map((r) => `<tr>${r.map((c) => `<td>${String(c ?? '')}</td>`).join('')}</tr>`).join('')}
        </table>
      </body></html>`;
      return new NextResponse(html, {
        headers: {
          'content-type': 'application/vnd.ms-excel;charset=utf-8',
          'content-disposition': `attachment; filename="${fileBase}.xls"`,
        },
      });
    }
    if (format === 'pdf') {
      const lines: string[] = [];
      lines.push(employeeId ? `Employee: ${employeeId}` : 'Reporting Line Report');
      lines.push(`Generated: ${new Date().toISOString()}`);
      lines.push('');
      for (const r of rows.slice(0, 40)) {
        lines.push(`${r[0]} | ${r[1]} | Direct: ${r[2]} | Dept Head: ${r[4]} | BU Head: ${r[6]}`);
      }
      const bytes = buildPdfBytes('DLE HRIS — Reporting Line Export', lines);
      return new NextResponse(bytes, {
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': `attachment; filename="${fileBase}.pdf"`,
        },
      });
    }
    if (format === 'png') {
      return jsonErr(501, 'PNG export is not available for this report format.');
    }

    const csv = [header, ...rows].map((r) => r.map((c) => csvCell(String(c ?? ''))).join(',')).join('\n');
    return new NextResponse(csv, {
      headers: {
        'content-type': 'text/csv;charset=utf-8',
        'content-disposition': `attachment; filename="${fileBase}.csv"`,
      },
    });
  }

  return jsonErr(404, 'Not found');
}

export async function POST(request: Request, ctx: { params: Promise<{ action: string[] }> }) {
  const { action } = await ctx.params;
  const role = getRole(request);
  const seg0 = action[0] || '';
  if (role === 'Employee') return jsonErr(403, 'Permission denied');

  if (seg0 === 'sync-department-reporting') {
    const body = (await request.json().catch(() => null)) as { dryRun?: boolean; departments?: string[] } | null;
    const result = await syncDepartmentReportingManagers({
      dryRun: Boolean(body?.dryRun),
      departments: Array.isArray(body?.departments) ? body.departments.map((item) => String(item || '').trim()).filter(Boolean) : undefined,
      performedBy: role,
    });
    return jsonOk(result);
  }

  if (seg0 !== 'bulk-reassignment') return jsonErr(404, 'Not found');

  const body = (await request.json().catch(() => null)) as any;
  const currentManager = typeof body?.currentManager === 'string' ? body.currentManager.trim() : '';
  const newManager = typeof body?.newManager === 'string' ? body.newManager.trim() : '';
  const employeeIds = Array.isArray(body?.employeeIds) ? (body.employeeIds as any[]).filter((x) => typeof x === 'string').map((x) => x.trim()).filter(Boolean) : [];
  if (!currentManager && !employeeIds.length) return jsonErr(400, 'Current manager/supervisor or selected employees are required');
  if (!newManager) return jsonErr(400, 'New manager/supervisor is required');
  if (newManager.toLowerCase().includes('inactive')) return jsonErr(400, 'Cannot assign to inactive manager/supervisor');

  const s = stores();
  const employees = await listEmployees();
  const resolveSupervisor = (value: string) => {
    const needle = value.trim().toLowerCase();
    const match = employees.find((e) => e.employeeId.toLowerCase() === needle || e.fullName.toLowerCase() === needle);
    return match?.fullName || value.trim();
  };
  const resolveSupervisorCode = (value: string) => {
    const fromLabel = extractSupervisorEmployeeCode(value);
    if (fromLabel) {
      const byCode = employees.find((e) => supervisorCodesMatch(e.employeeId, fromLabel));
      return byCode?.employeeId || fromLabel;
    }
    const needle = value.trim().toLowerCase();
    const exact = employees.find((e) =>
      e.employeeId.toLowerCase() === needle
      || e.fullName.toLowerCase() === needle
      || `${e.employeeId} - ${e.fullName}`.toLowerCase() === needle
    );
    if (exact) return exact.employeeId;
    const named = employees.filter((e) => e.fullName.toLowerCase() === needle);
    if (named.length === 1) return named[0].employeeId;
    return value.trim();
  };
  const currentSupervisor = resolveSupervisor(currentManager);
  const newSupervisor = resolveSupervisor(newManager);
  const newSupervisorCode = resolveSupervisorCode(newManager);
  const candidates = currentManager
    ? employees.filter((e) => e.currentManager === currentManager || e.currentManager === currentSupervisor).map((e) => e.employeeId)
    : [];
  const impacted = (employeeIds.length ? employeeIds : candidates).slice(0, 250);
  if (impacted.length === 0) return jsonErr(400, 'No employees found for the selected current manager/supervisor');

  const databaseAssignment = await assignEmployeesToSupervisor({
    supervisorEmployeeCode: newSupervisorCode,
    employeeCodes: impacted,
    assignmentBatch: typeof body?.assignmentBatch === 'string' && body.assignmentBatch.trim() ? body.assignmentBatch.trim() : undefined,
    assignmentGroup: typeof body?.assignmentGroup === 'string' && body.assignmentGroup.trim() ? body.assignmentGroup.trim() : 'Reporting Line',
    reason: typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim() : `Bulk reassignment from ${currentSupervisor || 'selected employees'} to ${newSupervisor}`,
    performedBy: role,
    sourceRows: impacted.map((employeeCode) => ({
      employeeCode,
      sourceLabel: employeeCode,
      matchConfidence: 'SelectedEmployeeCode',
    })),
  });

  const now = new Date().toISOString();
  const requestId = `repreq-bulk-${Math.random().toString(16).slice(2)}`;
  const req = {
    id: requestId,
    employeeId: 'BULK',
    employeeName: 'Bulk Supervisor Reassignment',
    changeType: 'Bulk Manager Reassignment',
    status: 'Draft',
    effectiveDate: typeof body?.effectiveDate === 'string' && body.effectiveDate.trim() ? body.effectiveDate.trim() : now.slice(0, 10),
    endDate: null,
    reason: typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim() : `Bulk reassignment from ${currentSupervisor} to ${newSupervisor}`,
    notes: typeof body?.notes === 'string' && body.notes.trim() ? body.notes.trim() : null,
    previousValues: { directManager: currentSupervisor },
    newValues: { directManager: newSupervisor },
    delegations: [],
    supportingDocuments: [],
    approvals: [],
    audit: [
      {
        id: `audit-${Math.random().toString(16).slice(2)}`,
        at: now,
        action: 'Bulk reassignment draft created',
        performedBy: role,
        reason: typeof body?.reason === 'string' ? body.reason : undefined,
      },
    ],
    createdBy: role,
    createdAt: now,
    updatedAt: now,
    isBulk: true,
    bulkEmployeeIds: impacted,
  };
  s.requests.set(requestId, req);
  for (const empId of impacted) addToIndex(empId, requestId);
  return jsonOk({
    requestId,
    impactedEmployees: impacted.length,
    previewEmployeeIds: impacted.slice(0, 30),
    databaseUpdated: true,
    assignmentBatch: databaseAssignment.assignmentBatch,
    supervisor: databaseAssignment.supervisor,
    assignments: databaseAssignment.assignments,
  });
}
