"use client";

import { ChevronLeft, ChevronRight, Eye, RotateCw } from 'lucide-react';
import { useState } from 'react';
import type { CardTemplate, Face } from '../lib/card-template';
import { fullName, type Employee } from '../lib/employees';
import { CardFace } from './CardFace';
import { Avatar, Section } from './ui';

const SAMPLE: Employee = { id: 'DLE000', firstName: 'Employee', lastName: 'Name', department: '', jobTitle: 'Job Title' };

export function PreviewPanel({ employees, index, onIndex, template }: { employees: Employee[]; index: number; onIndex: (i: number) => void; template: CardTemplate }) {
  const [face, setFace] = useState<Face>('front');
  const isSample = employees.length === 0;
  const current = employees[Math.min(index, employees.length - 1)] ?? SAMPLE;
  const faces: Face[] = ['front', 'back'];

  return (
    <Section
      title="ID Card Preview"
      icon={<Eye className="w-5 h-5 text-slate-700" />}
      action={
        <div className="flex rounded-full bg-slate-100 p-1" role="tablist" aria-label="Card side">
          {faces.map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={face === f}
              onClick={() => setFace(f)}
              className={`px-5 py-1.5 rounded-full text-sm font-semibold capitalize transition ${face === f ? 'bg-[#1c1b46] text-white shadow' : 'text-slate-600 hover:text-slate-900'}`}
            >
              {f}
            </button>
          ))}
        </div>
      }
    >
      <div className="relative rounded-xl bg-slate-50 border border-slate-100 px-4 py-7 bg-[radial-gradient(circle,#e2e8f0_1px,transparent_1px)] [background-size:16px_16px]">
        {isSample && (
          <span className="absolute top-3 left-3 z-10 rounded-full bg-white/90 border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 shadow-sm">Template preview</span>
        )}
        <div className="flex justify-center items-end gap-5 sm:gap-8">
          {faces.map((f) => {
            const active = f === face;
            return (
              <button key={f} type="button" onClick={() => setFace(f)} className="group flex flex-col items-center gap-2.5 focus:outline-none" aria-label={`Show ${f}`}>
                <div
                  className={`w-[150px] sm:w-[200px] 2xl:w-[220px] rounded-[10px] overflow-hidden transition-all duration-300 ${
                    active ? 'shadow-[0_18px_40px_-12px_rgba(28,27,70,0.55)] scale-100' : 'shadow-md scale-[0.94] group-hover:scale-[0.97]'
                  }`}
                >
                  <CardFace face={f} employee={current} template={template} />
                </div>
                <span className={`text-xs font-semibold uppercase tracking-wider ${active ? 'text-[#1c1b46]' : 'text-slate-400'}`}>{f}</span>
              </button>
            );
          })}
        </div>
      </div>

      {isSample ? (
        <p className="mt-4 text-sm text-slate-500 text-center">Select employees on the left to preview their cards.</p>
      ) : (
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar employee={current} size={36} />
            <div className="min-w-0">
              <p className="font-semibold text-slate-900 truncate text-sm">{fullName(current)}</p>
              <p className="text-xs text-slate-500 truncate">
                {current.id} · {current.department}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setFace((f) => (f === 'front' ? 'back' : 'front'))}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 sm:hidden"
              aria-label="Flip card"
            >
              <RotateCw className="w-4 h-4" />
            </button>
            <button
              className="p-2 rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40 hover:bg-slate-50"
              onClick={() => onIndex(Math.max(0, index - 1))}
              disabled={index <= 0}
              aria-label="Previous employee"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-slate-600 tabular-nums w-14 text-center">
              {Math.min(index, employees.length - 1) + 1} of {employees.length}
            </span>
            <button
              className="p-2 rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40 hover:bg-slate-50"
              onClick={() => onIndex(Math.min(employees.length - 1, index + 1))}
              disabled={index >= employees.length - 1}
              aria-label="Next employee"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}
