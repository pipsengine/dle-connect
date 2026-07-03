'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { Download, Mail, Maximize2, Minus, Plus, Printer } from 'lucide-react';
import {
  amountInWords,
  buildPayslipModel,
  fmtDate,
  money2,
  nonZeroPayrollLine,
  nonZeroSummaryRow,
  stableDateTime,
  visibleInfoRow,
  type EssPayrollEmployee,
  type PayrollHistoryRow,
  type PayrollLine,
} from './ess-payslip-shared';

function usePayslipPrintFit() {
  useEffect(() => {
    const fit = () => {
      const el = document.getElementById('ess-payslip-print');
      if (!el) return;
      el.style.zoom = '1';
      el.style.transform = 'none';
      el.classList.add('ess-payslip-print-mode');

      const logo = el.querySelector('.ess-payslip-logo-img') as HTMLImageElement | null;
      const runFit = () => {
        requestAnimationFrame(() => {
          const pageHeight = 1122;
          const scale = Math.min(1, (pageHeight - 16) / el.scrollHeight);
          if (scale < 0.995) {
            el.style.zoom = String(scale);
          }
        });
      };

      if (logo && !logo.complete) {
        logo.addEventListener('load', runFit, { once: true });
        logo.addEventListener('error', runFit, { once: true });
        return;
      }

      requestAnimationFrame(runFit);
    };

    const reset = () => {
      const el = document.getElementById('ess-payslip-print');
      if (!el) return;
      el.classList.remove('ess-payslip-print-mode');
      el.style.zoom = '';
      el.style.transform = '';
    };

    window.addEventListener('beforeprint', fit);
    window.addEventListener('afterprint', reset);
    return () => {
      window.removeEventListener('beforeprint', fit);
      window.removeEventListener('afterprint', reset);
    };
  }, []);
}

const PAYSLIP_LOGO_SRC = '/brand/dorman-long-logo.png';

const sectionHeaderClass = 'bg-[#123f82] px-3 py-1.5 text-center text-[11px] font-black uppercase text-white';

function PayslipTable({ title, lines, totalLabel, total, wide = false }: { title: string; lines: PayrollLine[]; totalLabel: string; total: number; wide?: boolean }) {
  const visibleLines = lines.filter(nonZeroPayrollLine);
  return (
    <div className={`${wide ? 'overflow-hidden' : 'overflow-hidden rounded-[8px] border border-[#2f67b1]'}`}>
      <h3 className={sectionHeaderClass}>{title}</h3>
      <table className="w-full border-collapse text-[11px]">
        <thead className="bg-[#F8FAFC] text-[11px] uppercase">
          <tr>
            <th className="border border-[#9bb9df] px-2 py-1.5 text-left font-black text-[#475569]">Description</th>
            <th className="border border-[#9bb9df] px-2 py-1.5 text-center font-black text-[#475569]">Units</th>
            <th className="border border-[#9bb9df] px-2 py-1.5 text-right font-black text-[#475569]">Amount (NGN)</th>
          </tr>
        </thead>
        <tbody>
          {visibleLines.map((line, index) => (
            <tr key={`${title}-${line.code || line.label}-${index}`}>
              <td className="border border-[#d7e4f4] px-2 py-1 font-semibold uppercase text-[#0F172A]">{line.label}</td>
              <td className="border border-[#d7e4f4] px-2 py-1 text-center">{Number(line.units || 0).toFixed(2)}</td>
              <td className="border border-[#d7e4f4] px-2 py-1 text-right font-black">{money2(line.amount).replace('NGN', '').trim()}</td>
            </tr>
          ))}
          <tr className="bg-[#EFF8FF]">
            <td className="border border-[#2f67b1] px-2 py-1.5 text-[11px] font-black uppercase text-[#123f82]" colSpan={2}>{totalLabel}</td>
            <td className="border border-[#2f67b1] px-2 py-1.5 text-right text-[13px] font-black text-[#123f82]">{money2(total).replace('NGN', '').trim()}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function SummaryBlock({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  if (!rows.length) return null;
  return (
    <section className="overflow-hidden rounded-[8px] border border-[#2f67b1]">
      <h3 className={sectionHeaderClass}>{title}</h3>
      <div className="divide-y divide-[#d7e4f4]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 px-3 py-1.5 text-[11px]">
            <span className="font-bold text-[#475569]">{label}</span>
            <span className="font-black text-[#0F172A]">{value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function EssPayslipDocument({
  selected,
  employee,
  generatedAt,
  zoom: zoomProp = 100,
  showToolbar = true,
  onPrint,
  onDownload,
  onEmail,
}: {
  selected: PayrollHistoryRow;
  employee?: EssPayrollEmployee | null;
  generatedAt?: string;
  zoom?: number;
  showToolbar?: boolean;
  onPrint?: () => void;
  onDownload?: () => void;
  onEmail?: () => void;
}) {
  const [zoom, setZoom] = useState(zoomProp);
  const model = useMemo(() => buildPayslipModel(selected, employee, generatedAt), [selected, employee, generatedAt]);
  usePayslipPrintFit();

  return (
    <div className="ess-payslip-document space-y-4">
      {showToolbar ? (
        <div className="ess-no-print flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-[#6B7280]">Payslip</p>
            <p className="text-[16px] font-bold text-[#111827]">{selected.periodLabel || selected.period}</p>
            <p className="text-[12px] text-[#6B7280]">Payroll No. {selected.payrollNumber || '—'}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-[12px] border border-[#E5E7EB] bg-white">
              <button type="button" onClick={() => setZoom((value) => Math.max(70, value - 10))} className="flex h-10 w-10 items-center justify-center text-[#6B7280] hover:text-[#111827]" aria-label="Zoom out"><Minus className="h-4 w-4" /></button>
              <span className="min-w-[56px] text-center text-[13px] font-semibold text-[#111827]">{zoom}%</span>
              <button type="button" onClick={() => setZoom((value) => Math.min(130, value + 10))} className="flex h-10 w-10 items-center justify-center text-[#6B7280] hover:text-[#111827]" aria-label="Zoom in"><Plus className="h-4 w-4" /></button>
            </div>
            <button type="button" onClick={() => setZoom(100)} className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-[#E5E7EB] bg-white text-[#6B7280] hover:text-[#111827]" aria-label="Fit to screen"><Maximize2 className="h-4 w-4" /></button>
            <button type="button" onClick={onDownload || onPrint} className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-[#E5E7EB] bg-white text-[#2563EB] hover:bg-[#EFF6FF]" aria-label="Download"><Download className="h-4 w-4" /></button>
          </div>
        </div>
      ) : null}

      <article
        id="ess-payslip-print"
        className="ess-payslip-sheet mx-auto rounded-[18px] border border-[#2f67b1] bg-white p-4 text-[11px] leading-tight text-[#0F172A] shadow-[0_12px_32px_rgba(15,23,42,0.08)]"
        style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center', width: 'min(100%, 210mm)' }}
      >
        <header className="ess-payslip-header grid grid-cols-1 gap-3 border-b border-[#2f67b1] pb-3 md:grid-cols-[1fr_auto]">
          <div className="flex items-start gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={PAYSLIP_LOGO_SRC}
              alt="Dorman Long Engineering Limited"
              width={473}
              height={164}
              className="ess-payslip-logo-img h-16 w-auto max-w-[12rem] shrink-0 object-contain object-left"
            />
          </div>
          <div className="text-left md:text-right">
            <h2 className="text-[28px] font-black tracking-normal text-[#123f82]">PAYSLIP</h2>
            <p className="mt-0.5 text-[11px] font-black uppercase text-[#475569]">For the month of</p>
            <p className="text-[18px] font-black text-[#123f82]">{selected.periodLabel || selected.period}</p>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-3 border-b border-[#9bb9df] py-3 md:grid-cols-2">
          <div className="grid grid-cols-[130px_10px_1fr] gap-y-1">
            <p className="font-black">Company Name</p><p>:</p><p>DORMANLONG ENGINEERING LIMITED</p>
            <p className="font-black">Company Address</p><p>:</p><p>12/14 AGEGE MOTOR ROAD, IDI-ORO MUSHIN, LAGOS</p>
            <p className="font-black">RC Number</p><p>:</p><p>744</p>
            <p className="font-black">TIN</p><p>:</p><p>01714597-0001</p>
          </div>
          <div className="grid grid-cols-[120px_10px_1fr] gap-y-1 md:border-l md:border-[#9bb9df] md:pl-6">
            <p className="font-black">Pay Period</p><p>:</p><p>{fmtDate(selected.payPeriodStart)} - {fmtDate(selected.payPeriodEnd)}</p>
            <p className="font-black">Pay Date</p><p>:</p><p>{fmtDate(selected.payDate)}</p>
            <p className="font-black">Payroll No.</p><p>:</p><p>{selected.payrollNumber || '—'}</p>
            <p className="font-black">PAYE Ref. No.</p><p>:</p><p>{selected.payeReference || '—'}</p>
          </div>
        </section>

        <section className="mt-3 overflow-hidden rounded-[8px] border border-[#2f67b1]">
          <h3 className={sectionHeaderClass}>Employee Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2">
            {[model.employeeRows.filter(visibleInfoRow), model.bankRows.filter(visibleInfoRow)].map((rows, idx) => (
              <div key={idx ? 'bank' : 'employee'} className={`grid grid-cols-[128px_10px_1fr] gap-y-1 p-3 ${idx ? 'md:border-l md:border-[#9bb9df]' : ''}`}>
                {rows.map(([label, value]) => (
                  <Fragment key={label}><p className="font-black">{label}</p><p>:</p><p>{String(value || '—')}</p></Fragment>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <PayslipTable title="Earnings" lines={model.earnings} totalLabel="Total Earnings" total={model.grossPay} />
          <PayslipTable title="Deductions" lines={model.deductions} totalLabel="Total Deductions" total={selected.deductions} />
        </section>

        <section className="ess-payslip-net-summary mt-3 rounded-[12px] border border-[#22C55E] bg-[#ECFDF3] p-3 text-center">
          <div className="grid grid-cols-1 gap-2 text-[12px] font-black md:grid-cols-3">
            <p>Gross Pay: <span className="text-[#0F172A]">{money2(model.grossPay)}</span></p>
            <p>Total Deductions: <span className="text-[#B45309]">{money2(selected.deductions)}</span></p>
            <p>Net Pay: <span className="text-[22px] font-black text-[#047857]">{money2(selected.netPay)}</span></p>
          </div>
          <p className="mt-2 text-[11px] font-semibold text-[#475569]">Amount in Words: {amountInWords(selected.netPay)}</p>
        </section>

        <section className="mt-3 overflow-hidden rounded-[8px] border border-[#2f67b1]">
          <PayslipTable title="Company Contributions" lines={model.employerLines} totalLabel="Total Company Contributions" total={model.totalEmployer} wide />
        </section>

        <section className="ess-payslip-summary-grid mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="ess-payslip-leave-block">
            <SummaryBlock title="Leave Information" rows={model.leaveRows.filter(nonZeroSummaryRow)} />
          </div>
          <SummaryBlock title="Year-To-Date Summary" rows={model.ytdRows.filter(nonZeroSummaryRow)} />
        </section>

        <footer className="ess-payslip-footer mt-3 rounded-[12px] border border-[#9bb9df] p-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_110px]">
            <div className="leading-5">
              <p className="font-black text-[#123f82]">NOTES</p>
              <p>1. This is a system generated payslip and does not require any signature.</p>
              <p>2. Payroll Processing Date: {stableDateTime(model.verification.generatedAt)}</p>
              <p>3. HR Approval Status: {model.verification.approvalStatus}</p>
              <p>4. Verification: https://ess.dormanlongeng.com/verify/{selected.period}</p>
            </div>
            <div className="flex flex-col items-center justify-center gap-2">
              <div className="grid h-20 w-20 grid-cols-5 grid-rows-5 gap-0.5 rounded-[8px] border border-[#123f82] bg-white p-1.5">
                {Array.from({ length: 25 }).map((_, index) => (
                  <span key={index} className={(model.verification.qrCode.charCodeAt(index % model.verification.qrCode.length) + index) % 2 ? 'bg-[#123f82]' : 'bg-slate-100'} />
                ))}
              </div>
              <p className="text-center text-[10px] font-black text-[#475569]">Verification QR</p>
            </div>
          </div>
          <p className="mt-2 text-center text-[11px] font-black italic text-[#123f82]">THANK YOU FOR YOUR CONTINUED CONTRIBUTION TO DORMANLONG ENGINEERING LIMITED.</p>
        </footer>
      </article>

      {showToolbar ? (
        <div className="ess-no-print flex flex-wrap gap-2">
          <button type="button" onClick={onPrint} className="inline-flex h-11 items-center gap-2 rounded-[12px] bg-[#2563EB] px-4 text-[14px] font-semibold text-white shadow-[0_2px_10px_rgba(37,99,235,0.18)] hover:bg-[#1D4ED8]"><Printer className="h-4 w-4" /> Print Payslip</button>
          <button type="button" onClick={onDownload || onPrint} className="inline-flex h-11 items-center gap-2 rounded-[12px] border border-[#D1D5DB] bg-white px-4 text-[14px] font-semibold text-[#111827] hover:bg-[#F8FAFC]"><Download className="h-4 w-4" /> Download PDF</button>
          <button type="button" onClick={onEmail} className="inline-flex h-11 items-center gap-2 rounded-[12px] border border-[#D1D5DB] bg-white px-4 text-[14px] font-semibold text-[#111827] hover:bg-[#F8FAFC]"><Mail className="h-4 w-4" /> Email Payslip</button>
        </div>
      ) : null}
    </div>
  );
}

export function EssPayslipPrintStyles() {
  return (
    <style jsx global>{`
      #ess-payslip-print {
        width: min(100%, 210mm);
        overflow: visible;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      @media print {
        @page {
          size: A4 portrait;
          margin: 0;
        }

        html,
        body {
          width: 210mm !important;
          height: 297mm !important;
          max-height: 297mm !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
          background: #ffffff !important;
        }

        aside,
        .ess-no-print {
          display: none !important;
        }

        main {
          padding: 0 !important;
          margin: 0 !important;
        }

        body * {
          visibility: hidden !important;
        }

        #ess-payslip-print,
        #ess-payslip-print * {
          visibility: visible !important;
        }

        .ess-payslip-print-host {
          padding: 0 !important;
          margin: 0 !important;
          border: none !important;
          box-shadow: none !important;
          background: transparent !important;
        }

        #ess-payslip-print,
        #ess-payslip-print.ess-payslip-print-mode {
          position: fixed !important;
          inset: 0 auto auto 0 !important;
          width: 210mm !important;
          max-width: 210mm !important;
          height: auto !important;
          max-height: 297mm !important;
          margin: 0 !important;
          padding: 4mm !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          overflow: hidden !important;
          font-size: 7.6px !important;
          line-height: 1.06 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        #ess-payslip-print header.ess-payslip-header {
          display: grid !important;
          visibility: visible !important;
          padding-bottom: 1.4mm !important;
          gap: 1.5mm !important;
        }

        #ess-payslip-print .ess-payslip-logo-img {
          display: block !important;
          visibility: visible !important;
          width: 42mm !important;
          height: auto !important;
          max-width: 42mm !important;
          max-height: 14mm !important;
          object-fit: contain !important;
          object-position: left center !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        #ess-payslip-print h2,
        #ess-payslip-print .text-\\[28px\\] {
          font-size: 18px !important;
          line-height: 1 !important;
        }

        #ess-payslip-print .text-\\[18px\\] {
          font-size: 12px !important;
          line-height: 1 !important;
        }

        #ess-payslip-print h3 {
          padding: 0.8mm 1.6mm !important;
          font-size: 7.8px !important;
          line-height: 1 !important;
        }

        #ess-payslip-print section,
        #ess-payslip-print footer {
          margin-top: 1.4mm !important;
        }

        #ess-payslip-print .p-3,
        #ess-payslip-print .p-4,
        #ess-payslip-print .p-2\\.5 {
          padding: 1.3mm !important;
        }

        #ess-payslip-print .px-3 {
          padding-left: 1.6mm !important;
          padding-right: 1.6mm !important;
        }

        #ess-payslip-print .py-3 {
          padding-top: 1.4mm !important;
          padding-bottom: 1.4mm !important;
        }

        #ess-payslip-print .gap-3 {
          gap: 1.4mm !important;
        }

        #ess-payslip-print .gap-2 {
          gap: 1mm !important;
        }

        #ess-payslip-print .mt-3 {
          margin-top: 1.4mm !important;
        }

        #ess-payslip-print table {
          font-size: 7.1px !important;
          line-height: 1.03 !important;
        }

        #ess-payslip-print th,
        #ess-payslip-print td {
          padding: 0.45mm 0.8mm !important;
        }

        #ess-payslip-print .text-\\[11px\\],
        #ess-payslip-print .text-\\[12px\\] {
          font-size: 7.5px !important;
          line-height: 1.06 !important;
        }

        #ess-payslip-print .text-\\[22px\\] {
          font-size: 11px !important;
          line-height: 1 !important;
        }

        #ess-payslip-print .text-\\[13px\\] {
          font-size: 8px !important;
        }

        #ess-payslip-print .leading-5 {
          line-height: 1.18 !important;
        }

        #ess-payslip-print .h-20 {
          height: 14mm !important;
        }

        #ess-payslip-print .w-20 {
          width: 14mm !important;
        }

        #ess-payslip-print .rounded-\\[18px\\],
        #ess-payslip-print .rounded-\\[12px\\],
        #ess-payslip-print .rounded-\\[8px\\] {
          border-radius: 2px !important;
        }

        #ess-payslip-print .ess-payslip-leave-block {
          display: none !important;
        }

        #ess-payslip-print .ess-payslip-summary-grid {
          grid-template-columns: 1fr !important;
        }

        #ess-payslip-print .ess-payslip-net-summary {
          padding: 1.2mm !important;
        }

        #ess-payslip-print.ess-payslip-print-mode {
          transform: none !important;
        }
      }
    `}</style>
  );
}

