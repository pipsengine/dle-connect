'use client';

import { useMemo, useState } from 'react';
import { Download, FileBarChart, FileSpreadsheet } from 'lucide-react';
import {
  LEAVE_REPORT_CATALOGUE,
  buildLeaveReportTable,
  type LeaveReportId,
  type LeaveReportTable,
} from '@/lib/leave-reports-engine';
import { buildLeaveReportExcelXml, leaveReportExcelFilename } from '@/lib/leave-excel-export';

type AppRecord = {
  id: string;
  employeeId: string;
  fullName: string;
  department: string;
  managerName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  status: string;
  stage: string;
  approvalStatus: string;
  policyComplianceStatus: string;
  actingOfficer: string;
  exceptions: string[];
  allowanceStatus?: string;
  allowanceEligible?: boolean;
  allowancePaid?: boolean;
};

type BalanceRecord = {
  employeeId: string;
  fullName: string;
  department: string;
  leaveType: string;
  currentBalance: number;
  accruedBalance: number;
  usedBalance: number;
  pendingBalance: number;
  forfeitedBalance: number;
  carryForwardBalance: number;
  liabilityValue: number;
  status: string;
  exceptions: string[];
};

type AllowanceExceptionRecord = {
  id: string;
  severity: 'Critical' | 'Review' | 'Pending';
  employeeId: string;
  fullName: string;
  department: string;
  leaveYear: number;
  payrollPeriod: string;
  requestDays: number;
  approvedAnnualLeaveDays: number;
  allowanceAmount: number;
  allowanceStatus: string;
  eventStatus: string;
  linkedRequestId?: string;
  recommendation: string;
};

type ReportsPayload = {
  applications?: AppRecord[];
  balances?: BalanceRecord[];
  allowanceExceptions?: AllowanceExceptionRecord[];
  summary?: {
    leaveUtilizationPct?: number;
    pendingApprovals?: number;
    employeesOnLeave?: number;
    leaveLiability?: number;
  };
};

const defaultReportForSection = (section: string): LeaveReportId => {
  if (section === 'leave-utilization') return 'utilization';
  if (section === 'leave-liability') return 'liability';
  if (section === 'leave-trends') return 'trends';
  if (section === 'approval-reports') return 'approval';
  if (section === 'leave-allowance-exceptions') return 'allowance-exceptions';
  return 'utilization';
};

const downloadExcel = (report: LeaveReportTable) => {
  const xml = buildLeaveReportExcelXml(report);
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = leaveReportExcelFilename(report);
  anchor.click();
  URL.revokeObjectURL(url);
};

const downloadExcelFromApi = async (reportId: LeaveReportId) => {
  const url = `/api/hris/leave-management?format=excel&report=${encodeURIComponent(reportId)}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('Unable to export Excel report');
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const disposition = res.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/i);
  anchor.href = objectUrl;
  anchor.download = match?.[1] || `leave-${reportId}.xls`;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
};

export default function LeaveReportsAnalyticsView({
  section,
  payload,
}: {
  section: string;
  payload: ReportsPayload | null;
}) {
  const [activeReportId, setActiveReportId] = useState<LeaveReportId>(() => defaultReportForSection(section));
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState('');

  const report = useMemo(() => {
    if (!payload) return null;
    return buildLeaveReportTable(activeReportId, payload as never);
  }, [activeReportId, payload]);

  const catalogue = useMemo(() => {
    if (section === 'leave-reports') return LEAVE_REPORT_CATALOGUE;
    return LEAVE_REPORT_CATALOGUE.filter((item) => item.sectionHints.includes(section) || item.id === defaultReportForSection(section));
  }, [section]);

  const exportActive = async () => {
    if (!report) return;
    setExporting(true);
    setToast('');
    try {
      try {
        await downloadExcelFromApi(activeReportId);
      } catch {
        downloadExcel(report);
      }
      setToast(`${report.title} exported to Excel.`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Excel export failed');
    } finally {
      setExporting(false);
    }
  };

  const exportAll = async () => {
    if (!payload) return;
    setExporting(true);
    setToast('');
    try {
      for (const item of LEAVE_REPORT_CATALOGUE) {
        const table = buildLeaveReportTable(item.id, payload as never);
        downloadExcel(table);
        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }
      setToast('All leave reports exported to Excel.');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Bulk Excel export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-base font-black text-slate-950">Leave Reports & Analytics</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Live operational reports with Excel export. Exception reports are pre-formatted as Excel tables with highlighted severity rows.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={exporting || !report}
              onClick={() => void exportActive()}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white disabled:bg-slate-200 disabled:text-slate-500"
            >
              <Download className="h-4 w-4" />
              {exporting ? 'Exporting…' : 'Export Excel'}
            </button>
            {section === 'leave-reports' ? (
              <button
                type="button"
                disabled={exporting || !payload}
                onClick={() => void exportAll()}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 disabled:opacity-50"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Export All
              </button>
            ) : null}
          </div>
        </div>
        {toast ? <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">{toast}</p> : null}
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {catalogue.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveReportId(item.id)}
            className={`rounded-2xl border p-4 text-left transition ${
              activeReportId === item.id ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:border-blue-300'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-black text-slate-950">{item.title}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">{item.description}</p>
              </div>
              <FileBarChart className={`h-5 w-5 ${activeReportId === item.id ? 'text-blue-600' : 'text-slate-400'}`} />
            </div>
            <p className="mt-3 text-[11px] font-black uppercase tracking-wide text-emerald-700">Excel table export ready</p>
          </button>
        ))}
      </section>

      {report ? (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-base font-black text-slate-950">{report.title}</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">{report.description}</p>
            </div>
            <button
              type="button"
              disabled={exporting}
              onClick={() => void exportActive()}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"
            >
              <Download className="h-4 w-4" />
              Export this report
            </button>
          </div>

          {report.summary?.length ? (
            <div className="grid grid-cols-1 gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 xl:grid-cols-4">
              {report.summary.map((item) => (
                <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{item.label}</p>
                  <p className="mt-1 text-xl font-black text-slate-950">{item.value}</p>
                </div>
              ))}
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50">
                <tr>
                  {report.headers.map((header) => (
                    <th key={header} className="px-4 py-3 text-left text-xs font-black uppercase text-slate-500">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {report.rows.length ? report.rows.map((row, rowIndex) => {
                  const isException = (report.exceptionRowIndexes || []).includes(rowIndex);
                  return (
                    <tr key={`${report.id}-${rowIndex}`} className={isException ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-slate-50'}>
                      {row.map((cell, cellIndex) => (
                        <td key={`${rowIndex}-${cellIndex}`} className={`px-4 py-3 text-sm ${isException ? 'font-bold text-red-900' : 'font-semibold text-slate-700'}`}>
                          {String(cell)}
                        </td>
                      ))}
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={report.headers.length} className="px-4 py-8 text-center text-sm font-semibold text-slate-500">
                      No records available for this report.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500">
          Loading leave report data…
        </div>
      )}
    </div>
  );
}
