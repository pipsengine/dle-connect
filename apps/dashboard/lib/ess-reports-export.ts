type LeaveBalanceRow = { label?: string; entitlement?: number; used?: number; balance?: number; carryForward?: number };
type LeaveHistoryRow = { id?: string; type?: string; from?: string; to?: string; days?: number; year?: number; status?: string; approvalStage?: string };
type PayrollHistoryRow = { period?: string; periodLabel?: string; grossPay?: number; deductions?: number; netPay?: number; status?: string; payDate?: string };
type LearningRow = { id?: string; title?: string; status?: string; type?: string; expiresAt?: string };
type ClaimRow = { id?: string; type?: string; status?: string; submittedAt?: string; amount?: number; attachmentStatus?: string };

const csvEscape = (value: unknown) => {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
};

const toCsv = (headers: string[], rows: Array<Array<unknown>>) =>
  [headers.map(csvEscape).join(','), ...rows.map((row) => row.map(csvEscape).join(','))].join('\n');

const reportFileName = (slug: string, ext: string) => `dle-ess-${slug}-${new Date().toISOString().slice(0, 10)}.${ext}`;

export const buildEssReportExport = (
  reportId: string,
  format: string,
  input: {
    employeeName: string;
    employeeCode: string;
    department: string;
    leaveBalances: LeaveBalanceRow[];
    leaveHistory: LeaveHistoryRow[];
    payrollHistory: PayrollHistoryRow[];
    learning: { courses: LearningRow[]; materials: LearningRow[]; certifications: LearningRow[] };
    claims: ClaimRow[];
  },
) => {
  const ext = format === 'pdf' ? 'pdf' : 'csv';
  const normalized = reportId.replace(/^rpt-/, '').replace(/-/g, '_');

  if (reportId === 'rpt-leave-statement' || normalized === 'leave_statement' || reportId === 'rpt-001') {
    if (!input.leaveHistory.length && !input.leaveBalances.length) {
      throw new Error('No leave records are available for your statement yet.');
    }
    const rows: Array<Array<unknown>> = [
      ...input.leaveBalances.map((row) => ['Balance', row.label || 'Leave', row.entitlement ?? '', row.used ?? '', row.balance ?? '', row.carryForward ?? '', 'Current']),
      ...input.leaveHistory.map((row) => ['Application', row.type || '', row.from || '', row.to || '', row.days ?? '', row.status || '', row.approvalStage || '']),
    ];
    const csv = toCsv(
      ['Section', 'Leave Type', 'From', 'To', 'Days / Balance', 'Status', 'Stage'],
      rows,
    );
    const header = `Employee,${input.employeeName}\nCode,${input.employeeCode}\nDepartment,${input.department}\n\n`;
    return {
      contentType: format === 'pdf' ? 'text/html; charset=utf-8' : 'text/csv; charset=utf-8',
      fileName: reportFileName('leave-statement', format === 'pdf' ? 'html' : 'csv'),
      body:
        format === 'pdf'
          ? `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Leave Statement</title><style>body{font-family:Inter,Arial,sans-serif;padding:32px;color:#0f172a}h1{font-size:20px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #e2e8f0;padding:8px;font-size:12px;text-align:left}th{background:#f8fafc}</style></head><body><h1>My Leave Statement</h1><p><strong>${input.employeeName}</strong> · ${input.employeeCode} · ${input.department}</p><table><thead><tr><th>Section</th><th>Leave Type</th><th>From</th><th>To</th><th>Days / Balance</th><th>Status</th><th>Stage</th></tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`
          : `${header}${csv}`,
    };
  }

  if (reportId === 'rpt-payroll-history' || normalized === 'payroll_history' || reportId === 'rpt-002') {
    if (!input.payrollHistory.length) throw new Error('No released payroll history is available yet.');
    const rows = input.payrollHistory.map((row) => [
      row.periodLabel || row.period || '',
      row.payDate || '',
      row.grossPay ?? 0,
      row.deductions ?? 0,
      row.netPay ?? 0,
      row.status || '',
    ]);
    const csv = toCsv(['Period', 'Pay Date', 'Gross Pay', 'Deductions', 'Net Pay', 'Status'], rows);
    const header = `Employee,${input.employeeName}\nCode,${input.employeeCode}\n\n`;
    return {
      contentType: format === 'pdf' ? 'text/html; charset=utf-8' : 'text/csv; charset=utf-8',
      fileName: reportFileName('payroll-history', format === 'pdf' ? 'html' : 'csv'),
      body:
        format === 'pdf'
          ? `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Payroll History</title><style>body{font-family:Inter,Arial,sans-serif;padding:32px;color:#0f172a}h1{font-size:20px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #e2e8f0;padding:8px;font-size:12px;text-align:left}th{background:#f8fafc}</style></head><body><h1>Payroll History Report</h1><p><strong>${input.employeeName}</strong> · ${input.employeeCode}</p><table><thead><tr><th>Period</th><th>Pay Date</th><th>Gross Pay</th><th>Deductions</th><th>Net Pay</th><th>Status</th></tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`
          : `${header}${csv}`,
    };
  }

  if (reportId === 'rpt-training-transcript' || normalized === 'training_transcript' || reportId === 'rpt-003') {
    const items = [
      ...input.learning.courses.map((row) => ['Course', row.title || '', row.type || '', row.status || '']),
      ...input.learning.certifications.map((row) => ['Certification', row.title || '', row.expiresAt || '', row.status || '']),
      ...input.learning.materials.map((row) => ['Material', row.title || '', row.type || '', row.status || '']),
    ];
    if (!items.length) throw new Error('No training records are available for your transcript yet.');
    const csv = toCsv(['Category', 'Title', 'Type / Expiry', 'Status'], items);
    return {
      contentType: format === 'pdf' ? 'text/html; charset=utf-8' : 'text/csv; charset=utf-8',
      fileName: reportFileName('training-transcript', format === 'pdf' ? 'html' : 'csv'),
      body:
        format === 'pdf'
          ? `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Training Transcript</title><style>body{font-family:Inter,Arial,sans-serif;padding:32px;color:#0f172a}h1{font-size:20px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #e2e8f0;padding:8px;font-size:12px;text-align:left}th{background:#f8fafc}</style></head><body><h1>Training Transcript</h1><p><strong>${input.employeeName}</strong> · ${input.employeeCode}</p><table><thead><tr><th>Category</th><th>Title</th><th>Type / Expiry</th><th>Status</th></tr></thead><tbody>${items.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`
          : csv,
    };
  }

  if (reportId === 'rpt-claim-status' || normalized === 'claim_status' || reportId === 'rpt-004') {
    if (!input.claims.length) throw new Error('No claim records are available yet.');
    const rows = input.claims.map((row) => [row.id || '', row.type || '', row.amount ?? 0, row.status || '', row.submittedAt || '', row.attachmentStatus || '']);
    const csv = toCsv(['Claim ID', 'Type', 'Amount', 'Status', 'Submitted', 'Attachments'], rows);
    return {
      contentType: 'text/csv; charset=utf-8',
      fileName: reportFileName('claim-status', 'csv'),
      body: csv,
    };
  }

  throw new Error('Report type is not recognized.');
};
