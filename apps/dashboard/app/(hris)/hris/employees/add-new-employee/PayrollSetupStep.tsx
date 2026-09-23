'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import PayrollLinesEditor, { DEDUCTION_LINE_PRESETS, EARNING_LINE_PRESETS, PERIOD_EARNING_LINE_PRESETS } from '@/components/payroll/PayrollLinesEditor';
import {
  sumMonthlyPackageGross,
  draftPayrollLineToStored,
  newDraftPayrollLineId,
  splitDraftEarningLinesByScope,
  stampPeriodOnlyDraftLine,
  type FlexiblePayrollLineDraft,
} from '@/lib/payroll-package-lines';
import { formatPayrollMoney } from '@/lib/payroll-currency';
import {
  convertAmountText,
  convertPayrollMoney,
  formatPayrollRunFxCaption,
  payrollLinesForDisplay,
  payrollLinesFromDisplay,
  type PayrollRunFx,
} from '@/lib/payroll-fx-display';
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
  hint,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: string[];
  placeholder?: string;
  hint?: string;
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
    {hint ? <div className="mt-1 text-[11px] font-semibold text-slate-500">{hint}</div> : null}
  </div>
);

function PackageMoneyField({
  label,
  nativeValue,
  onNativeChange,
  hint,
  converting,
  rate,
}: {
  label: string;
  nativeValue: string;
  onNativeChange: (next: string) => void;
  hint?: string;
  converting: boolean;
  rate: number;
}) {
  const shown = converting ? convertAmountText(nativeValue, 'USD', 'NGN', rate) : nativeValue;
  const [text, setText] = useState(shown);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(shown);
  }, [focused, shown]);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="text-[11px] font-extrabold text-slate-600">{label}</div>
      <input
        type="number"
        value={focused ? text : shown}
        onFocus={() => {
          setText(shown);
          setFocused(true);
        }}
        onChange={(e) => {
          setText(e.target.value);
          onNativeChange(converting ? convertAmountText(e.target.value, 'NGN', 'USD', rate) : e.target.value);
        }}
        onBlur={() => setFocused(false)}
        className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-200"
      />
      {hint ? <div className="mt-1 text-[11px] font-semibold text-slate-500">{hint}</div> : null}
    </div>
  );
}

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

  const items = useMemo((): BankCatalogItem[] => {
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
    const withCurrent: BankCatalogItem[] = value && !hasCurrent ? [{ name: value }, ...matched] : matched;
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
  timesheetWages = false,
  payrollPeriod = '',
  packageCurrency,
  displayCurrency = 'USD',
  onDisplayCurrencyChange,
  payrollFx = null,
}: {
  payroll: PayrollSetupDraft;
  onChange: (next: PayrollSetupDraft) => void;
  options: FormOptionsSlice;
  canViewPayroll: boolean;
  employmentType: string;
  assignLabel?: string;
  contractStartDate?: string;
  contractEndDate?: string;
  timesheetWages?: boolean;
  payrollPeriod?: string;
  /** Saved package currency. Dollar packages keep this when Naira is only a view. */
  packageCurrency?: string;
  displayCurrency?: 'USD' | 'NGN';
  onDisplayCurrencyChange?: (next: 'USD' | 'NGN') => void;
  payrollFx?: PayrollRunFx | null;
}) {
  const savedPackageCurrency = packageCurrency
    ? resolvePayrollDraftCurrency({ ...payroll, payCurrency: packageCurrency })
    : '';
  const fxRate = Number(payrollFx?.rate || 0);
  const nairaView = savedPackageCurrency === 'USD' && displayCurrency === 'NGN' && fxRate > 0;
  const nairaSelectedWithoutRate = savedPackageCurrency === 'USD' && displayCurrency === 'NGN' && !(fxRate > 0);
  const currency = nairaView ? 'NGN' : resolvePayrollDraftCurrency(payroll);
  const patch = (partial: Partial<PayrollSetupDraft>) => onChange({ ...payroll, ...partial });
  const formatMoney = (value: number) => formatPayrollMoney(
    value,
    currency,
    nairaView || currency.toUpperCase() === 'USD' ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : undefined,
  );
  const currencySymbol = currency.toUpperCase() === 'USD' ? '$' : '₦';
  const asShown = (lines: FlexiblePayrollLineDraft[]) =>
    nairaView ? payrollLinesForDisplay(lines, 'USD', 'NGN', fxRate) : lines;
  const asNative = (lines: FlexiblePayrollLineDraft[]) =>
    nairaView ? payrollLinesFromDisplay(lines, 'USD', 'NGN', fxRate) : lines;

  const storedEarnings = payroll.earningLines
    .map((line) => draftPayrollLineToStored(line, true))
    .filter((line): line is NonNullable<ReturnType<typeof draftPayrollLineToStored>> => line !== null);
  const monthlyGross = sumMonthlyPackageGross(storedEarnings);
  const monthlyFromPeriodSalary = Number(payroll.periodSalary || 0);
  const displayMonthlyGross = monthlyGross > 0 ? monthlyGross : monthlyFromPeriodSalary;
  const shownMonthlyGross = nairaView
    ? convertPayrollMoney(displayMonthlyGross, 'USD', 'NGN', fxRate)
    : displayMonthlyGross;
  const isDailyRate = timesheetWages || employmentType === 'Daily Rate';
  const isLumpsum = employmentType === 'Lumpsum';
  const showMonthlyPackageField = !isDailyRate;
  const { standing, thisPeriod, leftover } = splitDraftEarningLinesByScope(payroll.earningLines, payrollPeriod);
  const periodLabel = payrollPeriod
    ? new Date(`${payrollPeriod}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    : 'this payroll period';

  const replaceEarningScope = (
    nextStanding: FlexiblePayrollLineDraft[],
    nextPeriod: FlexiblePayrollLineDraft[],
    nextLeftover: FlexiblePayrollLineDraft[] = leftover,
  ) => patch({
    earningLines: [
      ...nextStanding.map((line) => stampPeriodOnlyDraftLine(line)),
      ...nextPeriod.map((line) => stampPeriodOnlyDraftLine(line, payrollPeriod)),
      ...nextLeftover,
    ],
  });

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
        <div className="text-sm font-extrabold text-blue-900">{isDailyRate ? 'Daily-rate payroll' : 'Flexible payroll package'}</div>
        <div className="mt-1 text-xs font-semibold text-blue-800">
          {isDailyRate
            ? 'Weekday pay still comes from approved timesheets × daily rate. Meal, overtime, night, site and other amounts you save on earning lines update this payroll for the period you assign.'
            : 'Standing lines repeat every month. Overtime, arrears and other this-period items pay only in the month you capture them — they do not roll forward.'}
        </div>
        {!isDailyRate && displayMonthlyGross > 0 ? (
          <div className="mt-3 inline-flex rounded-xl bg-white px-3 py-2 text-xs font-extrabold text-slate-800 border border-blue-200">
            Estimated monthly package gross: {formatMoney(shownMonthlyGross)}
          </div>
        ) : null}
        {isLumpsum && Number(payroll.contractAmount || 0) > 0 && contractStartDate && contractEndDate ? (
          <div className="mt-2 text-[11px] font-semibold text-blue-800">
            Contract {formatMoney(nairaView ? convertPayrollMoney(Number(payroll.contractAmount), 'USD', 'NGN', fxRate) : Number(payroll.contractAmount))} over {contractMonthsInclusive(contractStartDate, contractEndDate)} month(s) ≈ {formatMoney(nairaView ? convertPayrollMoney(monthlyLumpsumFromContract(Number(payroll.contractAmount), contractStartDate, contractEndDate), 'USD', 'NGN', fxRate) : monthlyLumpsumFromContract(Number(payroll.contractAmount), contractStartDate, contractEndDate))} / month
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <SelectField
          label="Pay Currency"
          value={savedPackageCurrency === 'USD' && onDisplayCurrencyChange ? displayCurrency : (payroll.payCurrency || 'NGN')}
          onChange={(v) => {
            if (savedPackageCurrency === 'USD' && onDisplayCurrencyChange && (v === 'NGN' || v === 'USD')) {
              onDisplayCurrencyChange(v);
              return;
            }
            patch({ payCurrency: v });
          }}
          options={['NGN', 'USD']}
          placeholder="Select currency"
          hint={savedPackageCurrency === 'USD'
            ? 'NGN shows the naira equivalent of this dollar package for the payroll run. The saved currency stays USD.'
            : undefined}
        />
        <SelectField label="Payroll Group" value={payroll.payrollGroup} onChange={(v) => patch({ payrollGroup: v })} options={options.payrollGroups} placeholder="e.g. DLE / Daily Rate" />
        <Field label="Salary Grade (optional label)" value={payroll.salaryGrade} onChange={(v) => patch({ salaryGrade: v })} hint="Descriptive only — not used to auto-split pay" />
        {showMonthlyPackageField ? (
          <PackageMoneyField
            label={`Monthly Package Gross (${currencySymbol})`}
            nativeValue={payroll.periodSalary}
            onNativeChange={syncPeriodSalary}
            converting={nairaView}
            rate={fxRate}
            hint={isLumpsum ? 'Base lumpsum package only — overtime belongs in this-period lines below' : 'Total monthly pay before this-period supplements'}
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
        <PackageMoneyField
          label={`Additional Voluntary Pension (${currencySymbol} / month)`}
          nativeValue={payroll.additionalEmployeePensionMonthly}
          onNativeChange={(v) => patch({ additionalEmployeePensionMonthly: v })}
          converting={nairaView}
          rate={fxRate}
        />
        <PackageMoneyField
          label={`Annual Rent Relief (${currencySymbol})`}
          nativeValue={payroll.annualRentRelief}
          onNativeChange={(v) => patch({ annualRentRelief: v })}
          converting={nairaView}
          rate={fxRate}
        />
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
          <PackageMoneyField label={`Daily Rate (${currencySymbol} / day)`} nativeValue={payroll.ratePerDay || payroll.dailyRate} onNativeChange={(v) => patch({ ratePerDay: v, dailyRate: v })} converting={nairaView} rate={fxRate} hint="Approved timesheets × this rate drive weekday pay on the payroll run" />
          <PackageMoneyField label={`Rate Per Hour (${currencySymbol})`} nativeValue={payroll.ratePerHour} onNativeChange={(v) => patch({ ratePerHour: v })} converting={nairaView} rate={fxRate} />
          <Field label="Hours Per Day" type="number" value={payroll.hoursPerDay} onChange={(v) => patch({ hoursPerDay: v })} />
        </div>
      ) : null}

      {nairaView && payrollFx ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-950">
          {formatPayrollRunFxCaption(payrollFx)}
        </div>
      ) : null}
      {nairaSelectedWithoutRate ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-950">
          The CBN rate for this payroll run is not available, so the dollar amounts are still shown. Naira equivalents appear once that rate is on the payroll run.
        </div>
      ) : null}

      <>
          <PayrollLinesEditor
            title="Standing monthly package"
            description={isDailyRate
              ? 'Repeats every payroll until you change it. Use this for a fixed meal, site or transport amount. Weekday days stay on the timesheet.'
              : 'Repeats every payroll until you change it. Examples: Basic, lumpsum, meal, housing, site, weekly transport.'}
            lines={asShown(standing)}
            presets={EARNING_LINE_PRESETS}
            onChange={(nextStanding) => replaceEarningScope(asNative(nextStanding), thisPeriod)}
            lineKind="earning"
            currency={currency}
            scope="standing"
            preciseMoney={nairaView}
          />
          <PayrollLinesEditor
            title={`This period only${payrollPeriod ? ` — ${periodLabel}` : ''}`}
            description="Overtime, arrears, stock count, night and other variable pay. These pay only in this month. They will not compute again next month."
            lines={asShown(thisPeriod)}
            presets={PERIOD_EARNING_LINE_PRESETS}
            onChange={(nextPeriod) => replaceEarningScope(standing, asNative(nextPeriod))}
            lineKind="earning"
            currency={currency}
            scope="period"
            payrollPeriod={payrollPeriod}
            preciseMoney={nairaView}
          />
          {leftover.length ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-sm font-extrabold text-amber-950">Stopped leftover variable earnings</div>
              <div className="mt-1 text-xs font-semibold text-amber-900">
                These amounts were left on the package from a previous month. They will not be paid unless you assign them to {periodLabel}.
              </div>
              <ul className="mt-3 space-y-1 text-xs font-semibold text-amber-950">
                {leftover.map((line) => (
                  <li key={line.id}>{line.name || line.code}: {formatMoney(nairaView ? convertPayrollMoney(Number(line.amount || 0), 'USD', 'NGN', fxRate) : Number(line.amount || 0))}</li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => replaceEarningScope(standing, [...thisPeriod, ...leftover], [])}
                  className="rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-[11px] font-extrabold text-amber-950 hover:bg-amber-100"
                >
                  Pay in {periodLabel}
                </button>
                <button
                  type="button"
                  onClick={() => replaceEarningScope(standing, thisPeriod, [])}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-extrabold text-slate-700 hover:bg-slate-50"
                >
                  Remove leftover lines
                </button>
              </div>
            </div>
          ) : null}
      </>

      <PayrollLinesEditor
        title="Deduction Lines"
        description="Flexible recurring or one-off deductions — loan recovery, cooperative, union dues, etc."
        lines={asShown(payroll.deductionLines)}
        presets={DEDUCTION_LINE_PRESETS}
        onChange={(deductionLines) => patch({ deductionLines: asNative(deductionLines) })}
        lineKind="deduction"
        currency={currency}
        preciseMoney={nairaView}
      />
    </div>
  );
}
