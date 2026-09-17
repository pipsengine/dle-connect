'use client';

import { Plus, Trash2 } from 'lucide-react';
import { inputClass, secondaryBtnClass } from './proc-ui';
import type { ProcLineItem } from '@/lib/procurement/catalog';
import { lineAmount } from '@/lib/procurement/catalog';

const emptyLine = (): ProcLineItem => ({
  id: crypto.randomUUID(),
  description: '',
  quantity: 1,
  uom: 'EA',
  unitPrice: 0,
  taxRate: 0,
});

export function LineItemsEditor({
  lines,
  onChange,
}: {
  lines: ProcLineItem[];
  onChange: (lines: ProcLineItem[]) => void;
}) {
  const patch = (index: number, key: keyof ProcLineItem, value: string | number) =>
    onChange(lines.map((line, i) => (i === index ? { ...line, [key]: value } : line)));

  const total = lines.reduce((sum, line) => sum + lineAmount(line), 0);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-black text-slate-900">Line items</div>
          <p className="text-xs text-slate-500">Quantities, unit prices and tax drive the estimated value.</p>
        </div>
        <button type="button" className={secondaryBtnClass} onClick={() => onChange([...lines, emptyLine()])}>
          <Plus className="h-4 w-4" /> Add line
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              {['Description / specification', 'Qty', 'UOM', 'Unit price', 'Tax %', 'Required', 'Line total', ''].map((h) => (
                <th key={h} className="px-3 py-2 text-left font-bold uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.length ? (
              lines.map((line, i) => (
                <tr key={line.id || line.lineId || i} className="border-t border-slate-100">
                  <td className="p-2">
                    <input
                      className={`${inputClass} min-w-64`}
                      value={line.description}
                      onChange={(e) => patch(i, 'description', e.target.value)}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      className={`${inputClass} w-20`}
                      type="number"
                      min={0}
                      value={line.quantity ?? line.qty ?? 0}
                      onChange={(e) => patch(i, 'quantity', Number(e.target.value))}
                    />
                  </td>
                  <td className="p-2">
                    <input className={`${inputClass} w-20`} value={line.uom} onChange={(e) => patch(i, 'uom', e.target.value)} />
                  </td>
                  <td className="p-2">
                    <input
                      className={`${inputClass} w-28`}
                      type="number"
                      min={0}
                      value={line.unitPrice ?? line.unitEstimate ?? 0}
                      onChange={(e) => patch(i, 'unitPrice', Number(e.target.value))}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      className={`${inputClass} w-20`}
                      type="number"
                      min={0}
                      value={line.taxRate ?? 0}
                      onChange={(e) => patch(i, 'taxRate', Number(e.target.value))}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      className={inputClass}
                      type="date"
                      value={line.requiredDate || ''}
                      onChange={(e) => patch(i, 'requiredDate', e.target.value)}
                    />
                  </td>
                  <td className="p-2 tabular-nums text-slate-800">
                    {lineAmount(line).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="p-2">
                    <button type="button" onClick={() => onChange(lines.filter((_, n) => n !== i))} aria-label="Remove line">
                      <Trash2 className="h-4 w-4 text-slate-500" />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  No lines yet. Add at least one item for a complete transaction.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-right text-sm font-semibold text-slate-700">
        Total (incl. tax): {total.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
      <p className="mt-2 text-xs text-slate-500">Supporting files belong in Documents & Correspondence after save.</p>
    </div>
  );
}
