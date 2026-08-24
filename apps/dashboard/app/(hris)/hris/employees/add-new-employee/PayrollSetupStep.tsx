'use client';

import PayrollLinesEditor, { DEDUCTION_LINE_PRESETS, EARNING_LINE_PRESETS } from '@/components/payroll/PayrollLinesEditor';
import {
  sumMonthlyPackageGross,
  draftPayrollLineToStored,
  type FlexiblePayrollLineDraft,
} from '@/lib/payroll-package-lines';
import { formatPayrollMoney } from '@/lib/payroll-currency';

export type PayrollSetupDraft = {
  payrollGroup: string;
  salaryGrade: string;
  basicSalary: string;
  periodSalary: string;
  annualSalary: string;
  dailyRate: string;
  ratePerDay: string;
  ratePerHour: string;
  hoursPerDay: string;
  additionalEmployeePensionMonthly: string;
  annualRentRelief: string;
  paymentRun: string;
  paymentType: string;
  allowancesTemplate: string;
  deductionTemplate: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  pensionProvider: string;
  pensionPin: string;
  taxId: string;
  nhfApplicable: boolean;
  nhfNumber: string;
  healthInsurancePlan: string;
  benefitGroup: string;
  setupAssignedToPayroll: boolean;
  contractAmount?: string;
  earningLines: FlexiblePayrollLineDraft[];
  deductionLines: FlexiblePayrollLineDraft[];
};

type FormOptionsSlice = {
  payrollGroups: string[];
  banks: string[];
  pensionProviders: string[];
  benefitGroups: string[];
};

const Field = ({
  label,
  value,
  onChange,
  placeholder,
  required,
  type = 'text',
  hint,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: 'text' | 'number';
  hint?: string;
}) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-3">
    <div className="text-[11px] font-extrabold text-slate-600">
      {label} {required ? <span className="text-red-600">*</span> : null}
    </div>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-200"
    />
    {hint ? <div className="mt-1 text-[11px] font-semibold text-slate-500">{hint}</div> : null}
  </div>
);

const SelectField = ({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: string[];
  placeholder?: string;
}) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-3">
    <div className="text-[11px] font-extrabold text-slate-600">{label}</div>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none"
    >
      <option value="">{placeholder || 'Select…'}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  </div>
);

export default function PayrollSetupStep({
  payroll,
  onChange,
  options,
  canViewPayroll,
  employmentType,
  assignLabel = 'Assign employee to payroll run on create',
  currency = 'NGN',
}: {
  payroll: PayrollSetupDraft;
  onChange: (next: PayrollSetupDraft) => void;
  options: FormOptionsSlice;
  canViewPayroll: boolean;
  employmentType: string;
  assignLabel?: string;
  currency?: string;
}) {
  const patch = (partial: Partial<PayrollSetupDraft>) => onChange({ ...payroll, ...partial });
  const formatMoney = (value: number) => formatPayrollMoney(value, currency);
  const currencySymbol = currency.toUpperCase() === 'USD' ? '$' : '₦';

  const storedEarnings = payroll.earningLines
    .map((line) => draftPayrollLineToStored(line, true))
    .filter((line): line is NonNullable<ReturnType<typeof draftPayrollLineToStored>> => line !== null);
  const monthlyGross = sumMonthlyPackageGross(storedEarnings);
  const isDailyRate = employmentType === 'Daily Rate';

  if (!canViewPayroll) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm font-semibold text-slate-600">
        Payroll setup is restricted for your role. A Payroll Officer will configure earnings and deductions.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
        <div className="text-sm font-extrabold text-blue-900">Flexible payroll package</div>
        <div className="mt-1 text-xs font-semibold text-blue-800">
          Add earning and deduction lines with weekly, monthly, or one-off frequency. No fixed salary grade is required — each employee gets a custom package.
        </div>
        {monthlyGross > 0 ? (
          <div className="mt-3 inline-flex rounded-xl bg-white px-3 py-2 text-xs font-extrabold text-slate-800 border border-blue-200">
            Estimated monthly package gross: {formatMoney(monthlyGross)}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <SelectField label="Payroll Group" value={payroll.payrollGroup} onChange={(v) => patch({ payrollGroup: v })} options={options.payrollGroups} placeholder="e.g. DLE / Daily Rate" />
        <Field label="Salary Grade (optional label)" value={payroll.salaryGrade} onChange={(v) => patch({ salaryGrade: v })} hint="Descriptive only — not used to auto-split pay" />
        <SelectField label="Bank Name" value={payroll.bankName} onChange={(v) => patch({ bankName: v })} options={options.banks} />
        <Field label="Account Number" value={payroll.accountNumber} onChange={(v) => patch({ accountNumber: v })} />
        <Field label="Account Name" value={payroll.accountName} onChange={(v) => patch({ accountName: v })} />
        <SelectField label="Pension Provider (PFA)" value={payroll.pensionProvider} onChange={(v) => patch({ pensionProvider: v })} options={options.pensionProviders} />
        <Field label="Pension PIN" value={payroll.pensionPin} onChange={(v) => patch({ pensionPin: v })} />
        <Field label="Tax ID (TIN)" value={payroll.taxId} onChange={(v) => patch({ taxId: v })} />
        <Field label="NHF Number" value={payroll.nhfNumber} onChange={(v) => patch({ nhfNumber: v })} />
        <SelectField label="Benefit Group" value={payroll.benefitGroup} onChange={(v) => patch({ benefitGroup: v })} options={options.benefitGroups} />
        <Field label={`Additional Voluntary Pension (${currencySymbol} / month)`} type="number" value={payroll.additionalEmployeePensionMonthly} onChange={(v) => patch({ additionalEmployeePensionMonthly: v })} />
        <Field label={`Annual Rent Relief (${currencySymbol})`} type="number" value={payroll.annualRentRelief} onChange={(v) => patch({ annualRentRelief: v })} />
      </div>

      <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800">
        <input type="checkbox" checked={payroll.nhfApplicable} onChange={(e) => patch({ nhfApplicable: e.target.checked })} />
        NHF applicable (2.5% auto-deduction unless NHF line is added manually)
      </label>

      <label className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
        <input type="checkbox" checked={payroll.setupAssignedToPayroll} onChange={(e) => patch({ setupAssignedToPayroll: e.target.checked })} />
        {assignLabel}
      </label>

      {isDailyRate ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label={`Daily Rate (${currencySymbol} / day)`} type="number" value={payroll.ratePerDay || payroll.dailyRate} onChange={(v) => patch({ ratePerDay: v, dailyRate: v })} hint="Timesheet-driven wages in addition to fixed lines below" />
          <Field label={`Rate Per Hour (${currencySymbol})`} type="number" value={payroll.ratePerHour} onChange={(v) => patch({ ratePerHour: v })} />
          <Field label="Hours Per Day" type="number" value={payroll.hoursPerDay} onChange={(v) => patch({ hoursPerDay: v })} />
        </div>
      ) : null}

      <PayrollLinesEditor
        title="Earning Lines"
        description="Examples: Basic Salary, Outstation Allowance (deployed staff), Weekly Transport Claim. Weekly amounts are converted to monthly (× 52/12) in payroll."
        lines={payroll.earningLines}
        presets={EARNING_LINE_PRESETS}
        onChange={(earningLines) => patch({ earningLines })}
        lineKind="earning"
        currency={currency}
      />

      <PayrollLinesEditor
        title="Deduction Lines"
        description="Flexible recurring or one-off deductions — loan recovery, cooperative, union dues, etc."
        lines={payroll.deductionLines}
        presets={DEDUCTION_LINE_PRESETS}
        onChange={(deductionLines) => patch({ deductionLines })}
        lineKind="deduction"
        currency={currency}
      />
    </div>
  );
}
