'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BadgeCheck,
  Banknote,
  Building2,
  ChevronRight,
  Download,
  FileText,
  Landmark,
  LockKeyhole,
  Mail,
  MoreHorizontal,
  Printer,
  Share2,
  Shield,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import EmployeeAvatar from '@/components/hris/EmployeeAvatar';
import { EssCard, EssSectionHeader } from './ess-portal-ui';
import { EssPayslipDocument, EssPayslipPrintStyles } from './ess-payslip-document';
import {
  buildPayslipModel,
  fmtDate,
  money,
  money2,
  type EssPayrollEmployee,
  type PayrollHistoryRow,
} from './ess-payslip-shared';
import type { EssTab } from './ess-portal-shell';

export type EssPayrollPayload = {
  generatedAt?: string;
  employee?: EssPayrollEmployee;
  payrollHistory?: PayrollHistoryRow[];
  payrollAccess?: {
    currentPeriod: string;
    currentPeriodReleased: boolean;
    releasedPeriodCount: number;
    message: string;
  };
  widgets?: {
    payroll: { monthlyPay: number; currency: string; payslips: number; deductions: number; pension: number; allowances: number };
  };
};

function PayrollKpiCard({
  label,
  value,
  subtitle,
  icon: Icon,
  accent,
  iconBg,
  onViewDetails,
}: {
  label: string;
  value: string;
  subtitle: string;
  icon: LucideIcon;
  accent: string;
  iconBg: string;
  onViewDetails?: () => void;
}) {
  return (
    <div className="flex min-h-[130px] flex-col rounded-[18px] border border-[#E5E7EB] bg-white p-5 shadow-[0_4px_16px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(15,23,42,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-[#6B7280]">{label}</p>
          <p className="mt-2 truncate text-[28px] font-bold leading-none text-[#111827]">{value}</p>
          <p className="mt-2 text-[12px] font-medium text-[#94A3B8]">{subtitle}</p>
        </div>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: iconBg, color: accent }}>
          <Icon className="h-5 w-5" strokeWidth={2} />
        </span>
      </div>
      <button type="button" onClick={onViewDetails} className="mt-auto pt-4 text-left text-[12px] font-semibold text-[#2563EB] hover:underline">
        View details
      </button>
    </div>
  );
}

function WorkflowStepper({ payDate, status }: { payDate?: string; status: string }) {
  const released = /processed|released|paid|closed|approved/i.test(status);
  const steps = [
    { title: 'Created', date: '01 May 2026' },
    { title: 'Validated', date: '03 May 2026' },
    { title: 'Approved', date: '05 May 2026' },
    { title: 'Processed', date: fmtDate(payDate) },
    { title: 'Paid', date: released ? fmtDate(payDate) : 'Pending' },
    { title: 'Closed', date: released ? fmtDate(payDate) : 'Pending' },
  ];

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max items-start gap-2">
        {steps.map((step, index) => (
          <div key={step.title} className="flex min-w-[92px] flex-col items-center">
            <div className="flex w-full items-center">
              {index > 0 ? <span className={`h-0.5 flex-1 ${released || index <= 3 ? 'bg-[#22C55E]' : 'bg-[#E5E7EB]'}`} /> : null}
              <span className={`flex h-8 w-8 items-center justify-center rounded-full ${released || index <= 3 ? 'bg-[#22C55E] text-white' : 'bg-[#E5E7EB] text-[#94A3B8]'}`}>
                <BadgeCheck className="h-4 w-4" />
              </span>
              {index < steps.length - 1 ? <span className={`h-0.5 flex-1 ${released || index < 3 ? 'bg-[#22C55E]' : 'bg-[#E5E7EB]'}`} /> : null}
            </div>
            <p className="mt-2 text-center text-[11px] font-semibold text-[#111827]">{step.title}</p>
            <p className="text-center text-[10px] text-[#6B7280]">{step.date}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EssPayrollDashboardView({
  payload,
  onNavigate,
}: {
  payload: EssPayrollPayload | null;
  onNavigate: (tab: EssTab) => void;
}) {
  const periods = payload?.payrollHistory || [];
  const employee = payload?.employee;
  const employeeCode = employee?.employeeCode || employee?.employeeId || '';
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [leftTab, setLeftTab] = useState<'Overview' | 'Analytics'>('Overview');

  const selected = periods.find((item) => item.period === selectedPeriod) || periods[0];

  useEffect(() => {
    const preferred = payload?.payrollAccess?.currentPeriod || periods[0]?.period || '';
    if (!selectedPeriod && preferred) setSelectedPeriod(preferred);
  }, [periods, payload?.payrollAccess?.currentPeriod, selectedPeriod]);

  const model = useMemo(
    () => (selected ? buildPayslipModel(selected, employee, payload?.generatedAt) : null),
    [selected, employee, payload?.generatedAt],
  );

  const previous = useMemo(() => {
    if (!selected) return null;
    const index = periods.findIndex((item) => item.period === selected.period);
    return index >= 0 ? periods[index + 1] : null;
  }, [periods, selected]);

  const netChangePct = useMemo(() => {
    if (!selected || !previous?.netPay) return null;
    return ((selected.netPay - previous.netPay) / previous.netPay) * 100;
  }, [previous, selected]);

  const insights = useMemo(() => {
    if (!selected) return [];
    const rows: Array<{ title: string; tone: 'green' | 'blue' | 'orange'; icon: LucideIcon }> = [];
    if (netChangePct !== null) {
      rows.push({
        title: `Your net pay ${netChangePct >= 0 ? 'increased' : 'decreased'} by ${Math.abs(netChangePct).toFixed(1)}% compared to ${previous?.periodLabel || previous?.period || 'last period'}`,
        tone: netChangePct >= 0 ? 'green' : 'orange',
        icon: netChangePct >= 0 ? TrendingUp : TrendingDown,
      });
    }
    rows.push({
      title: `PAYE tax for this period is ${money2(model?.payeTax || 0)}`,
      tone: 'blue',
      icon: FileText,
    });
    rows.push({
      title: `Pension contribution recorded at ${money2(model?.pensionEmployee || 0)}`,
      tone: 'blue',
      icon: Landmark,
    });
    return rows;
  }, [model?.payeTax, model?.pensionEmployee, netChangePct, previous, selected]);

  const printPayslip = () => typeof window !== 'undefined' && window.print();
  const emailPayslip = () => {
    if (!selected) return;
    const subject = encodeURIComponent(`Payslip ${selected.periodLabel || selected.period}`);
    const body = encodeURIComponent(`Please find my payslip for ${selected.periodLabel || selected.period}. Net pay: ${money2(selected.netPay)}.`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  if (!selected) {
    const pendingMessage = payload?.payrollAccess?.message
      || 'No payslip is available yet. Payslips are published here only after payroll approval and release.';
    return (
      <EssCard className="p-8 text-center">
        <LockKeyhole className="mx-auto h-10 w-10 text-[#F59E0B]" />
        <p className="mt-4 text-[18px] font-bold text-[#111827]">Payslip not yet released</p>
        <p className="mx-auto mt-2 max-w-xl text-[14px] leading-relaxed text-[#6B7280]">{pendingMessage}</p>
      </EssCard>
    );
  }

  const periodTitle = selected.periodLabel || selected.period;
  const statusLabel = /processed|released|paid|closed/i.test(selected.status) ? 'Processed' : selected.status;

  return (
    <div className="space-y-6">
      <EssPayslipPrintStyles />

      <div className="ess-no-print flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[14px] font-medium text-[#6B7280]">
            <span>Payroll</span>
            <ChevronRight className="mx-1 inline h-3.5 w-3.5" />
            <span>Payslip</span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-[28px] font-bold text-[#111827]">Payroll Summary — {periodTitle}</h1>
            <span className="rounded-full bg-[#ECFDF3] px-3 py-1 text-[12px] font-semibold text-[#047857] ring-1 ring-[#BBF7D0]">{statusLabel}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={printPayslip} className="inline-flex h-11 items-center gap-2 rounded-[12px] bg-[#2563EB] px-4 text-[14px] font-semibold text-white shadow-[0_2px_10px_rgba(37,99,235,0.18)] hover:bg-[#1D4ED8]">
            <Download className="h-4 w-4" />
            Download PDF
          </button>
          <button type="button" onClick={emailPayslip} className="inline-flex h-11 items-center gap-2 rounded-[12px] border border-[#D1D5DB] bg-white px-4 text-[14px] font-semibold text-[#111827] hover:bg-[#F8FAFC]">
            <Mail className="h-4 w-4" />
            Email Payslip
          </button>
          <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-[12px] border border-[#D1D5DB] bg-white text-[#6B7280] hover:bg-[#F8FAFC]">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="ess-no-print grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <PayrollKpiCard label="Gross Pay" value={money(model?.grossPay || selected.grossPay)} subtitle="Current period earnings" icon={Wallet} accent="#8B5CF6" iconBg="#F5F3FF" />
        <PayrollKpiCard label="Net Pay" value={money(selected.netPay)} subtitle="Take-home pay" icon={Banknote} accent="#22C55E" iconBg="#ECFDF3" />
        <PayrollKpiCard label="Total Deductions" value={money(selected.deductions)} subtitle="Statutory and other deductions" icon={Shield} accent="#F59E0B" iconBg="#FFF7ED" />
        <PayrollKpiCard label="Total Tax (PAYE)" value={money(model?.payeTax || 0)} subtitle="Income tax withheld" icon={FileText} accent="#0EA5E9" iconBg="#EFF8FF" />
        <PayrollKpiCard label="Pension Contribution" value={money(model?.pensionEmployee || 0)} subtitle="Employee contribution" icon={Users} accent="#06B6D4" iconBg="#E0F7FA" />
        <PayrollKpiCard label="Payslips on File" value={String(periods.length)} subtitle="Released payroll periods" icon={Building2} accent="#8B5CF6" iconBg="#F3E8FF" />
      </div>

      <div className="ess-no-print grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <EssCard className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            <EmployeeAvatar
              fullName={employee?.fullName || 'Employee'}
              employeeCode={employeeCode}
              photoUrl={employee?.photoUrl}
              hasPhoto={employee?.hasPhoto}
              tryPhoto={Boolean(employeeCode)}
              size="lg"
              className="h-16 w-16 ring-2 ring-[#EFF6FF]"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[18px] font-bold text-[#111827]">{employee?.fullName || 'Employee'}</h2>
                <span className="rounded-full bg-[#ECFDF3] px-2.5 py-0.5 text-[11px] font-semibold text-[#047857]">{employee?.status || 'Active'}</span>
              </div>
              <p className="text-[14px] font-medium text-[#6B7280]">{employee?.jobTitle || '—'}</p>
              <p className="text-[12px] text-[#94A3B8]">{employeeCode}</p>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
                {[
                  ['Department', employee?.department],
                  ['Grade Level', employee?.salaryGrade],
                  ['Location', employee?.location],
                  ['Employment Type', 'Permanent'],
                  ['Payroll Group', employee?.payrollGroup],
                  ['Cost Centre', employee?.businessUnit || '—'],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-[#94A3B8]">{label}</p>
                    <p className="mt-0.5 text-[13px] font-semibold text-[#111827]">{value || '—'}</p>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => onNavigate('profile')} className="mt-4 text-[13px] font-semibold text-[#2563EB] hover:underline">
                View Profile
              </button>
            </div>
          </div>
        </EssCard>

        <EssCard className="p-5">
          <EssSectionHeader title="Payroll Status" />
          <WorkflowStepper payDate={selected.payDate} status={selected.status} />
        </EssCard>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[320px_minmax(0,1fr)_300px]">
        <div className="ess-no-print space-y-5">
          <EssCard className="p-5">
            <div className="mb-4 flex gap-4 border-b border-[#E5E7EB]">
              {(['Overview', 'Analytics'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setLeftTab(tab)}
                  className={`relative pb-3 text-[12px] font-bold uppercase tracking-wide ${leftTab === tab ? 'text-[#2563EB]' : 'text-[#6B7280]'}`}
                >
                  {tab}
                  {leftTab === tab ? <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[#2563EB]" /> : null}
                </button>
              ))}
            </div>
            {leftTab === 'Overview' ? (
              <>
                <EssSectionHeader title="Year-To-Date Summary" />
                <div className="space-y-2">
                  {(model?.ytdRows || []).slice(0, 7).map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-3 rounded-[10px] px-1 py-1.5">
                      <span className="text-[13px] font-medium text-[#6B7280]">{label.replace('YTD ', '')}</span>
                      <span className="text-[14px] font-bold text-[#111827]">{value}</span>
                    </div>
                  ))}
                </div>
                <button type="button" className="mt-4 text-[13px] font-semibold text-[#2563EB] hover:underline">View Full Report</button>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-[13px] text-[#6B7280]">Monthly payroll analytics for your released payslips.</p>
                <div className="rounded-[12px] border border-[#E5E7EB] bg-[#F8FAFC] p-4">
                  <p className="text-[12px] font-medium text-[#6B7280]">Average Net Pay</p>
                  <p className="mt-1 text-[24px] font-bold text-[#111827]">
                    {money(periods.reduce((sum, item) => sum + item.netPay, 0) / Math.max(periods.length, 1))}
                  </p>
                </div>
              </div>
            )}
          </EssCard>

          <EssCard className="p-5">
            <EssSectionHeader title="Payroll Insights" action={<span className="rounded-full bg-[#F5F3FF] px-2 py-0.5 text-[10px] font-bold text-[#8B5CF6]">AI</span>} />
            <div className="space-y-2">
              {insights.map((item) => {
                const Icon = item.icon;
                const toneClass = item.tone === 'green' ? 'bg-[#ECFDF3] text-[#047857]' : item.tone === 'orange' ? 'bg-[#FFF7ED] text-[#B45309]' : 'bg-[#EFF8FF] text-[#1D4ED8]';
                return (
                  <div key={item.title} className="flex items-start gap-3 rounded-[12px] border border-[#E5E7EB] bg-[#FAFBFD] p-3">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${toneClass}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <p className="text-[13px] font-medium leading-relaxed text-[#111827]">{item.title}</p>
                  </div>
                );
              })}
            </div>
          </EssCard>
        </div>

        <EssCard className="ess-payslip-print-host overflow-visible border-0 bg-transparent p-0 shadow-none sm:p-0">
          <EssPayslipDocument
            selected={selected}
            employee={employee}
            generatedAt={payload?.generatedAt}
            showToolbar
            onPrint={printPayslip}
            onDownload={printPayslip}
            onEmail={emailPayslip}
          />
        </EssCard>

        <div className="ess-no-print space-y-5">
          <EssCard className="p-5">
            <EssSectionHeader title="Payslip History" />
            <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
              {periods.map((item) => (
                <button
                  key={item.period}
                  type="button"
                  onClick={() => setSelectedPeriod(item.period)}
                  className={`flex w-full items-center justify-between gap-2 rounded-[12px] border px-3 py-3 text-left transition ${
                    item.period === selected.period ? 'border-[#2563EB] bg-[#EFF6FF]' : 'border-[#E5E7EB] bg-[#F8FAFC] hover:border-[#93C5FD]'
                  }`}
                >
                  <div>
                    <p className="text-[14px] font-semibold text-[#111827]">{item.periodLabel || item.period}</p>
                    <p className="text-[11px] text-[#6B7280]">{fmtDate(item.payDate)}</p>
                  </div>
                  <span className="rounded-full bg-[#ECFDF3] px-2 py-0.5 text-[10px] font-semibold text-[#047857]">{item.status}</span>
                </button>
              ))}
            </div>
            <button type="button" className="mt-4 text-[13px] font-semibold text-[#2563EB] hover:underline">View All</button>
          </EssCard>

          <EssCard className="p-5">
            <EssSectionHeader title="Actions" />
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Download PDF', icon: Download, action: printPayslip },
                { label: 'Print Payslip', icon: Printer, action: printPayslip },
                { label: 'Email Payslip', icon: Mail, action: emailPayslip },
                { label: 'Share Secure Link', icon: Share2, action: () => undefined },
                { label: 'Report an Issue', icon: AlertCircle, action: () => onNavigate('services') },
                { label: 'Download Tax Slip', icon: FileText, action: printPayslip },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <button key={item.label} type="button" onClick={item.action} className="flex flex-col items-start gap-2 rounded-[12px] border border-[#E5E7EB] bg-[#F8FAFC] p-3 text-left transition hover:border-[#2563EB]/30 hover:bg-[#EFF6FF]">
                    <Icon className="h-4 w-4 text-[#2563EB]" />
                    <span className="text-[12px] font-semibold text-[#111827]">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </EssCard>

          <EssCard className="p-5">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ECFDF3] text-[#047857]">
                <BadgeCheck className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[14px] font-bold text-[#111827]">Document Verification</p>
                <p className="text-[12px] text-[#047857]">Valid Signature · Digitally Signed</p>
              </div>
            </div>
            <div className="mt-4 space-y-2 text-[12px]">
              {[
                ['Document Hash', `${selected.period}-${employeeCode}`.slice(0, 18).toUpperCase()],
                ['Issue Date', fmtDate(selected.payDate)],
                ['Version', '1.0'],
                ['Status', 'Verified'],
                ['Verification URL', 'ess.dormanlongeng.com/verify'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3 border-b border-[#F3F4F6] pb-2 last:border-0">
                  <span className="text-[#6B7280]">{label}</span>
                  <span className="max-w-[140px] truncate text-right font-semibold text-[#111827]">{value}</span>
                </div>
              ))}
            </div>
          </EssCard>
        </div>
      </div>
    </div>
  );
}
