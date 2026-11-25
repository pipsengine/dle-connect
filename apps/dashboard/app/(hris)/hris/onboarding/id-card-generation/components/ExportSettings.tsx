"use client";

import { Check, ChevronDown, FileImage, FileText, Image as ImageIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CardTemplate } from '../lib/card-template';
import type { Employee } from '../lib/employees';
import type { ExportFormat } from '../lib/export';
import { CardFace } from './CardFace';
import { Section } from './ui';

const FORMATS: { id: ExportFormat; label: string; hint: string; icon: typeof ImageIcon }[] = [
  { id: 'png', label: 'PNG', hint: 'Lossless image', icon: FileImage },
  { id: 'jpg', label: 'JPG', hint: 'Smaller file', icon: ImageIcon },
  { id: 'pdf', label: 'PDF', hint: 'Print-ready', icon: FileText },
];

const FORMAT_NOTE: Record<ExportFormat, string> = {
  png: 'A4 landscape pages, up to 4 cards per page (front and back side by side), 300 DPI. Multiple pages download as a ZIP.',
  jpg: 'A4 landscape pages, up to 4 cards per page (front and back side by side), 300 DPI. Multiple pages download as a ZIP.',
  pdf: 'A4 landscape pages, up to 4 cards per page at true card size with crop marks. All pages in one PDF.',
};

const SAMPLE: Employee = { id: 'DLE000', firstName: 'Employee', lastName: 'Name', department: '', jobTitle: 'Job Title' };

function TemplateThumb({ template }: { template: CardTemplate }) {
  return (
    <div className="w-[88px] h-[64px] rounded-lg bg-gradient-to-br from-[#2a2760] to-[#1c1b46] shrink-0 flex items-center justify-center gap-1 shadow-inner">
      <div className="w-[34px] rounded-[3px] overflow-hidden shadow">
        <CardFace face="front" employee={SAMPLE} template={template} />
      </div>
      <div className="w-[34px] rounded-[3px] overflow-hidden shadow">
        <CardFace face="back" employee={SAMPLE} template={template} />
      </div>
    </div>
  );
}

export function ExportSettings({
  template,
  templates,
  onTemplate,
  format,
  onFormat,
}: {
  template: CardTemplate;
  templates: CardTemplate[];
  onTemplate: (id: string) => void;
  format: ExportFormat;
  onFormat: (f: ExportFormat) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <Section step={2} title="Export Settings">
      <div className="space-y-5">
        <div>
          <p className="text-sm font-semibold text-slate-800 mb-2">Template</p>
          <div className="relative" ref={ref}>
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
              className={`w-full flex items-center gap-4 rounded-xl border bg-white p-2.5 pr-4 text-left transition ${open ? 'border-indigo-300 ring-4 ring-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <TemplateThumb template={template} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-semibold text-slate-900">
                  <span className="truncate">{template.name}</span>
                  {template.isDefault && <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-xs font-semibold ring-1 ring-inset ring-emerald-100">Default</span>}
                </span>
                <span className="block text-sm text-slate-500 mt-0.5">{template.description} · CR80 (54 × 86 mm)</span>
              </span>
              <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
              <ul role="listbox" className="absolute z-20 mt-2 w-full rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                {templates.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={t.id === template.id}
                      onClick={() => {
                        onTemplate(t.id);
                        setOpen(false);
                      }}
                      className="w-full flex items-center gap-3 rounded-lg p-2 text-left hover:bg-slate-50"
                    >
                      <TemplateThumb template={t} />
                      <span className="flex-1 min-w-0">
                        <span className="block font-medium text-slate-900 truncate">{t.name}</span>
                        <span className="block text-xs text-slate-500">{t.description}</span>
                      </span>
                      {t.id === template.id && <Check className="w-4 h-4 text-indigo-600" />}
                    </button>
                  </li>
                ))}
                <li className="px-3 py-2 text-xs text-slate-400 border-t border-slate-100 mt-1">New templates are added by HR once approved.</li>
              </ul>
            )}
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-800 mb-2">Export Format</p>
          <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Export format">
            {FORMATS.map(({ id, label, hint, icon: Icon }) => {
              const on = format === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => onFormat(id)}
                  className={`relative flex flex-col items-center justify-center gap-1 rounded-xl border py-3 transition ${
                    on ? 'border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-500' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {on && (
                    <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                      <Check className="w-2.5 h-2.5" strokeWidth={3.5} />
                    </span>
                  )}
                  <span className={`flex items-center gap-2 text-sm font-bold ${on ? 'text-indigo-700' : 'text-slate-800'}`}>
                    <Icon className="w-4 h-4" />
                    {label}
                  </span>
                  <span className={`text-xs ${on ? 'text-indigo-600/80' : 'text-slate-400'}`}>{hint}</span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-slate-500 mt-2.5">{FORMAT_NOTE[format]}</p>
        </div>
      </div>
    </Section>
  );
}
