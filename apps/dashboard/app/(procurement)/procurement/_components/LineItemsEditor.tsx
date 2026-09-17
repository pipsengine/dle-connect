'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { Download, FileSpreadsheet, Loader2, Plus, Trash2 } from 'lucide-react';
import { inputClass, secondaryBtnClass } from './proc-ui';
import { procurementPost } from '../lib/procurement-api';
import type { ProcLineItem } from '@/lib/procurement/catalog';
import { PROCUREMENT_UOMS, lineAmount } from '@/lib/procurement/catalog';
import { parsePrImportText, prLineImportTemplateCsv, type PrImportResult } from '@/lib/procurement/pr-line-import';

const emptyLine = (): ProcLineItem => ({
  id: crypto.randomUUID(),
  description: '',
  quantity: 1,
  uom: 'EA',
  unitPrice: 0,
  taxRate: 0,
});

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('Unable to read that file.'));
    reader.readAsDataURL(file);
  });

export function LineItemsEditor({
  lines,
  onChange,
  onImported,
  allowImport = true,
}: {
  lines: ProcLineItem[];
  onChange: (lines: ProcLineItem[]) => void;
  onImported?: (result: PrImportResult) => void;
  allowImport?: boolean;
}) {
  const importRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [consolidate, setConsolidate] = useState(false);
  const [importNote, setImportNote] = useState('');

  const patch = (index: number, key: keyof ProcLineItem, value: string | number) =>
    onChange(lines.map((line, i) => (i === index ? { ...line, [key]: value } : line)));

  const addRowAndFocus = () => {
    const next = emptyLine();
    onChange(lines.length ? [...lines, next] : [next]);
    window.requestAnimationFrame(() => {
      const el = document.querySelector<HTMLTextAreaElement>(`[data-pr-line="${next.id}"][data-pr-field="description"]`);
      el?.focus();
    });
  };

  const onLastCellTab = (e: KeyboardEvent, rowIndex: number) => {
    if (e.key !== 'Tab' || e.shiftKey) return;
    if (rowIndex !== Math.max(lines.length - 1, 0)) return;
    e.preventDefault();
    addRowAndFocus();
  };

  const applyImport = (result: PrImportResult) => {
    const kept = lines.filter((line) => String(line.description || '').trim());
    onChange([...kept, ...result.lines]);
    onImported?.(result);
    const extra = result.meta.consolidatedFrom
      ? ` Consolidated ${result.meta.consolidatedFrom} rows into ${result.lines.length}.`
      : '';
    setImportNote(`Imported ${result.lines.length} line${result.lines.length === 1 ? '' : 's'} from ${result.meta.source === 'mto' ? 'MTO' : 'Excel'}.${extra}`);
  };

  const importFile = async (file: File) => {
    setImporting(true);
    setImportError('');
    setImportNote('');
    try {
      const name = file.name.toLowerCase();
      if (name.endsWith('.csv') || name.endsWith('.txt')) {
        applyImport(parsePrImportText(await file.text()));
        return;
      }
      const result = await procurementPost<PrImportResult>('parse-pr-import', {
        fileName: file.name,
        content: await fileToBase64(file),
        consolidate,
      });
      applyImport(result);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Unable to import that file.');
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = '';
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([prLineImportTemplateCsv()], { type: 'text/csv;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = 'purchase-requisition-lines.csv';
    a.click();
    URL.revokeObjectURL(href);
  };

  const total = lines.reduce((sum, line) => sum + lineAmount(line), 0);
  const rows = lines.length ? lines : [];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-black text-slate-900">Line items</div>
          <p className="text-xs text-slate-500">
            Tab from the last Required date cell to add a row. Import an MTO or Excel file to fill detailed descriptions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {allowImport ? (
            <>
              <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={consolidate} onChange={(e) => setConsolidate(e.target.checked)} />
                Consolidate matching items
              </label>
              <button type="button" className={secondaryBtnClass} onClick={downloadTemplate}>
                <Download className="h-4 w-4" /> Template
              </button>
              <button type="button" className={secondaryBtnClass} disabled={importing} onClick={() => importRef.current?.click()}>
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                {importing ? 'Importing…' : 'Import Excel'}
              </button>
              <input
                ref={importRef}
                type="file"
                accept=".xls,.xlsx,.csv,.txt,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importFile(file);
                }}
              />
            </>
          ) : null}
          <button type="button" className={secondaryBtnClass} onClick={addRowAndFocus}>
            <Plus className="h-4 w-4" /> Add line
          </button>
        </div>
      </div>
      {importError ? <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{importError}</div> : null}
      {importNote ? <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{importNote}</div> : null}
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
            {rows.length ? (
              rows.map((line, i) => (
                <tr key={line.id || line.lineId || i} className="border-t border-slate-100">
                  <td className="p-2">
                    <textarea
                      data-pr-line={line.id || line.lineId || i}
                      data-pr-field="description"
                      rows={2}
                      className={`${inputClass} min-h-[42px] min-w-72 py-2`}
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
                    <input
                      className={`${inputClass} w-20`}
                      list="pr-uom-options"
                      value={line.uom}
                      onChange={(e) => patch(i, 'uom', e.target.value)}
                    />
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
                      onKeyDown={(e) => onLastCellTab(e, i)}
                    />
                  </td>
                  <td className="p-2 tabular-nums text-slate-800">
                    {lineAmount(line).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="p-2">
                    <button type="button" tabIndex={-1} onClick={() => onChange(lines.filter((_, n) => n !== i))} aria-label="Remove line">
                      <Trash2 className="h-4 w-4 text-slate-500" />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  No lines yet. Tab or add a line, or import an MTO / Excel file.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <datalist id="pr-uom-options">
        {PROCUREMENT_UOMS.map((uom) => (
          <option key={uom} value={uom} />
        ))}
      </datalist>
      <div className="mt-2 text-right text-sm font-semibold text-slate-700">
        Total (incl. tax): {total.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
    </div>
  );
}
