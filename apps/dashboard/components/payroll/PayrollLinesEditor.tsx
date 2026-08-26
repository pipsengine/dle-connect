'use client';

import { Plus, Trash2 } from 'lucide-react';
import {
  EARNING_LINE_PRESETS,
  DEDUCTION_LINE_PRESETS,
  newDraftPayrollLineId,
  monthlyPayrollAmountFromLine,
  type FlexiblePayrollLineDraft,
  type PayrollLineFrequency,
} from '@/lib/payroll-package-lines';
import { formatPayrollMoney } from '@/lib/payroll-currency';

export { EARNING_LINE_PRESETS, DEDUCTION_LINE_PRESETS };

const frequencyLabel = (frequency: PayrollLineFrequency) => {
  if (frequency === 'weekly') return 'Weekly';
  if (frequency === 'one-off') return 'One-off';
  return 'Monthly';
};

export default function PayrollLinesEditor({
  title,
  description,
  lines,
  presets,
  onChange,
  lineKind,
  readOnly = false,
  currency = 'NGN',
}: {
  title: string;
  description: string;
  lines: FlexiblePayrollLineDraft[];
  presets: Array<Omit<FlexiblePayrollLineDraft, 'id' | 'amount'>>;
  onChange: (lines: FlexiblePayrollLineDraft[]) => void;
  lineKind: 'earning' | 'deduction';
  readOnly?: boolean;
  currency?: string;
}) {
  const formatMoney = (value: number) => formatPayrollMoney(value, currency);
  const updateLine = (id: string, patch: Partial<FlexiblePayrollLineDraft>) => {
    onChange(lines.map((line) => {
      if (line.id !== id) return line;
      const next = { ...line, ...patch };
      const codeOrName = `${next.code || ''} ${next.name || ''}`;
      // When naming a line as overtime, default to one-off unless frequency was just set explicitly.
      if (
        !('frequency' in patch)
        && next.frequency === 'monthly'
        && /OVERTIME|\bOVT\b|\bOT\b|WEEKDAYOVT/i.test(codeOrName)
        && !/LUMPSUM/i.test(codeOrName)
      ) {
        next.frequency = 'one-off';
      }
      return next;
    }));
  };

  const removeLine = (id: string) => onChange(lines.filter((line) => line.id !== id));

  const addLine = (preset?: Omit<FlexiblePayrollLineDraft, 'id' | 'amount'>) => {
    onChange([
      ...lines,
      {
        id: newDraftPayrollLineId(),
        code: preset?.code || '',
        name: preset?.name || '',
        amount: '',
        taxable: preset?.taxable ?? lineKind === 'earning',
        frequency: preset?.frequency || 'monthly',
      },
    ]);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="border-b border-slate-100 px-4 py-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-extrabold text-slate-900">{title}</div>
          <div className="text-xs font-semibold text-slate-600 mt-1">{description}</div>
        </div>
        {!readOnly ? (
          <div className="flex flex-wrap gap-2">
            {presets.slice(0, 4).map((preset) => (
              <button
                key={preset.code}
                type="button"
                onClick={() => addLine(preset)}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-extrabold text-slate-700 hover:bg-slate-100"
              >
                <Plus className="h-3.5 w-3.5" />
                {preset.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => addLine()}
              className="inline-flex items-center gap-1 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-extrabold text-blue-800 hover:bg-blue-100"
            >
              <Plus className="h-3.5 w-3.5" />
              Custom line
            </button>
          </div>
        ) : null}
      </div>

      {lines.length === 0 ? (
        <div className="px-4 py-6 text-sm font-semibold text-slate-500">No {lineKind} lines configured.</div>
      ) : (
        <div className="overflow-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-3 py-2 text-[11px] font-extrabold text-slate-600">Name</th>
                <th className="px-3 py-2 text-[11px] font-extrabold text-slate-600">Code</th>
                <th className="px-3 py-2 text-[11px] font-extrabold text-slate-600">Amount (₦)</th>
                <th className="px-3 py-2 text-[11px] font-extrabold text-slate-600">Frequency</th>
                {lineKind === 'earning' ? <th className="px-3 py-2 text-[11px] font-extrabold text-slate-600">Taxable</th> : null}
                <th className="px-3 py-2 text-[11px] font-extrabold text-slate-600">Monthly eq.</th>
                {!readOnly ? <th className="px-3 py-2 text-[11px] font-extrabold text-slate-600" /> : null}
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const amount = Number(line.amount || 0);
                const monthlyEq = monthlyPayrollAmountFromLine(amount, line.frequency);
                return (
                  <tr key={line.id} className="border-b border-slate-100">
                    <td className="px-3 py-2 text-xs font-semibold text-slate-800">
                      {readOnly ? line.name : (
                        <input
                          value={line.name}
                          onChange={(e) => updateLine(line.id, { name: e.target.value })}
                          placeholder="e.g. Outstation Allowance"
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold"
                        />
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs font-semibold text-slate-800 uppercase">
                      {readOnly ? line.code : (
                        <input
                          value={line.code}
                          onChange={(e) => updateLine(line.id, { code: e.target.value.toUpperCase() })}
                          placeholder="AUTO"
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold uppercase"
                        />
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs font-semibold text-slate-800">
                      {readOnly ? amount.toLocaleString() : (
                        <input
                          type="number"
                          min="0"
                          value={line.amount}
                          onChange={(e) => updateLine(line.id, { amount: e.target.value })}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold"
                        />
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs font-semibold text-slate-800">
                      {readOnly ? frequencyLabel(line.frequency) : (
                        <select
                          value={line.frequency}
                          onChange={(e) => updateLine(line.id, { frequency: e.target.value as PayrollLineFrequency })}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold"
                        >
                          <option value="monthly">Monthly</option>
                          <option value="weekly">Weekly</option>
                          <option value="one-off">One-off</option>
                        </select>
                      )}
                    </td>
                    {lineKind === 'earning' ? (
                      <td className="px-3 py-2 text-xs font-semibold text-slate-700">
                        {readOnly ? (line.taxable ? 'Yes' : 'No') : (
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={line.taxable}
                              onChange={(e) => updateLine(line.id, { taxable: e.target.checked })}
                            />
                            Taxable
                          </label>
                        )}
                      </td>
                    ) : null}
                    <td className="px-3 py-2 text-xs font-extrabold text-slate-700">
                      {line.frequency === 'one-off' ? '—' : formatMoney(monthlyEq)}
                      {line.frequency === 'weekly' && amount > 0 ? (
                        <div className="text-[10px] font-semibold text-slate-500">{frequencyLabel(line.frequency)} {formatMoney(amount)}</div>
                      ) : null}
                    </td>
                    {!readOnly ? (
                      <td className="px-3 py-2">
                        <button type="button" onClick={() => removeLine(line.id)} className="rounded-lg p-1.5 text-red-600 hover:bg-red-50">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
