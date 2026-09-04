'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import PayrollLinesEditor, { DEDUCTION_LINE_PRESETS, EARNING_LINE_PRESETS } from '@/components/payroll/PayrollLinesEditor';
import {
  sumMonthlyPackageGross,
  draftPayrollLineToStored,
  newDraftPayrollLineId,
  type FlexiblePayrollLineDraft,
} from '@/lib/payroll-package-lines';
import { formatPayrollMoney } from '@/lib/payroll-currency';
import {
  contractMonthsInclusive,
  isLumpsumBaseDraftLine,
  monthlyLumpsumFromContract,
  resolvePayrollDraftCurrency,
} from '@/lib/payroll-draft-normalize';

export type PayrollSetupDraft = {
  payrollGroup: string;
  salaryGrade: string;
  payCurrency: string;
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

type BankCatalogItem = {
  name: string;
  bankCode?: string;
  sortCode?: string;
  aliases?: string[];
};

type FormOptionsSlice = {
  payrollGroups: string[];
  banks: string[];
  bankCatalog?: BankCatalogItem[];
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

const SearchableBankField = ({
  value,
  onChange,
  banks,
  catalog,
}: {
  value: string;
  onChange: (next: string) => void;
  banks: string[];
  catalog?: BankCatalogItem[];
}) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const items = useMemo(() => {
    if (catalog?.length) return catalog;
    return banks.map((name) => ({ name }));
  }, [banks, catalog]);

  const filtered = useMemo(() => {
    const needle = (query || value).trim().toLowerCase();
    const matched = !needle
      ? items
      : items.filter((item) => {
          const blob = [item.name, item.bankCode, item.sortCode, ...(item.aliases || [])].filter(Boolean).join(' ').toLowerCase();
          return blob.includes(needle);
        });
    const hasCurrent = value && matched.some((item) => item.name.toLowerCase() === value.toLowerCase());
    const withCurrent = value && !hasCurrent ? [{ name: value }, ...matched] : matched;
    return withCurrent.slice(0, 80);
  }, [items, query, value]);

  const selectedMeta = items.find((item) => item.name.toLowerCase() === value.trim().toLowerCase());

  return (
    <div className="relative rounded-2xl border border-slate-200 bg-white p-3">
      <div className="text-[11px] font-extrabold text-slate-600">Bank Name</div>
      <div className="relative mt-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={open ? query : value}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            onChange(e.target.value);
          }}
          onFocus={() => {
            setQuery(value);
            setOpen(true);
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          placeholder="Search Nigeria banks…"
          className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-9 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      </div>
      {selectedMeta?.bankCode || selectedMeta?.sortCode ? (
        <p className="mt-1 text-[11px] font-semibold text-slate-500">
          {selectedMeta.bankCode ? `Code ${selectedMeta.bankCode}` : ''}
          {selectedMeta.bankCode && selectedMeta.sortCode ? ' · ' : ''}
          {selectedMeta.sortCode ? `HO Sort ${selectedMeta.sortCode}` : ''}
        </p>
      ) : (
        <p className="mt-1 text-[11px] font-semibold text-slate-500">Search by bank name, short name, or bank code</p>
      )}
      {open ? (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {filtered.length ? filtered.map((item) => (
            <button
              key={`${item.name}:${item.bankCode || ''}`}
              type="button"
              className="flex w-full flex-col items-start gap-0.5 border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-slate-50"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(item.name);
                setQuery(item.name);
                setOpen(false);
              }}
            >
              <span className="text-sm font-semibold text-slate-900">{item.name}</span>
              {(item.bankCode || item.sortCode) ? (
                <span className="text-[11px] font-semibold text-slate-500">
                  {item.bankCode ? `Code ${item.bankCode}` : ''}
                  {item.bankCode && item.sortCode ? ' · ' : ''}
                  {item.sortCode ? `HO Sort ${item.sortCode}` : ''}
                </span>
              ) : null}
            </button>
          )) : (
            <p className="px-3 py-4 text-sm font-semibold text-slate-500">No banks match “{query || value}”.</p>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default function PayrollSetupStep({
  payroll,
  onChange,
  options,
  canViewPayroll,
  employmentType,
  assignLabel = 'Assign employee to payroll run on create',
  contractStartDate = '',
  contractEndDate = '',
}: {
  payroll: PayrollSetupDraft;
  onChange: (next: PayrollSetupDraft) => void;
  options: FormOptionsSlice;
  canViewPayroll: boolean;
  employmentType: string;
  assignLabel?: string;
  contractStartDate?: string;
  contractEndDate?: string;
}) {
  const currency = resolvePayrollDraftCurrency(payroll);
  const patch = (partial: Partial<PayrollSetupDraft>) => onChange({ ...payroll, ...partial });
  const formatMoney = (value: number) => formatPayrollMoney(value, currency);
  const currencySymbol = currency.toUpperCase() === 'USD' ? '$' : '₦';

  const storedEarnings = payroll.earningLines
    .map((line) => draftPayrollLineToStored(line, true))
    .filter((line): line is NonNullable<ReturnType<typeof draftPayrollLineToStored>> => line !== null);
  const monthlyGross = sumMonthlyPackageGross(storedEarnings);
  const monthlyFromPeriodSalary = Number(payroll.periodSalary || 0);
  const displayMonthlyGross = monthlyGross > 0 ? monthlyGross : monthlyFromPeriodSalary;
  const isDailyRate = employmentType === 'Daily Rate';
  const isLumpsum = employmentType === 'Lumpsum';
  const showMonthlyPackageField = !isDailyRate;

  const syncPeriodSalary = (raw: string) => {
    const amount = Number(raw || 0);
    const earningLines = amount > 0 && isLumpsum
      ? (payroll.earningLines.some(isLumpsumBaseDraftLine)
        ? payroll.earningLines.map((line) => (isLumpsumBaseDraftLine(line) ? { ...line, amount: raw } : line))
        : [...payroll.earningLines, {
          id: newDraftPayrollLineId(),
          code: 'LUMPSUMTAX',
          name: 'LUMPSUM ALLOWANCE',
          amount: raw,
          taxable: true,
          frequency: 'monthly' as const,
        }])
      : payroll.earningLines;
    patch({
      periodSalary: raw,
      basicSalary: payroll.basicSalary || raw,
      annualSalary: amount > 0 ? String(Math.round(amount * 12 * 100) / 100) : payroll.annualSalary,
      earningLines,
    });
  };

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
        {displayMonthlyGross > 0 ? (
          <div className="mt-3 inline-flex rounded-xl bg-white px-3 py-2 text-xs font-extrabold text-slate-800 border border-blue-200">
            Estimated monthly package gross: {formatMoney(displayMonthlyGross)}
          </div>
        ) : null}
        {isLumpsum && Number(payroll.contractAmount || 0) > 0 && contractStartDate && contractEndDate ? (
          <div className="mt-2 text-[11px] font-semibold text-blue-800">
            Contract {formatMoney(Number(payroll.contractAmount))} over {contractMonthsInclusive(contractStartDate, contractEndDate)} month(s) ≈ {formatMoney(monthlyLumpsumFromContract(Number(payroll.contractAmount), contractStartDate, contractEndDate))} / month
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <SelectField
          label="Pay Currency"
          value={payroll.payCurrency || 'NGN'}
          onChange={(v) => patch({ payCurrency: v })}
          options={['NGN', 'USD']}
          placeholder="Select currency"
        />
        <SelectField label="Payroll Group" value={payroll.payrollGroup} onChange={(v) => patch({ payrollGroup: v })} options={options.payrollGroups} placeholder="e.g. DLE / Daily Rate" />
        <Field label="Salary Grade (optional label)" value={payroll.salaryGrade} onChange={(v) => patch({ salaryGrade: v })} hint="Descriptive only — not used to auto-split pay" />
        {showMonthlyPackageField ? (
          <Field
            label={`Monthly Package Gross (${currencySymbol})`}
            type="number"
            value={payroll.periodSalary}
            onChange={syncPeriodSalary}
            hint={isLumpsum ? 'Base lumpsum package only — overtime and other supplements stay on earning lines below' : 'Total monthly pay before one-off supplements'}
          />
        ) : null}
        <SearchableBankField
          value={payroll.bankName}
          onChange={(v) => patch({ bankName: v })}
          banks={options.banks}
          catalog={options.bankCatalog}
        />
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
