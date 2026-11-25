'use client';

import {
  BID_NO_BID_INDICATORS,
  BID_NO_BID_SECTIONS,
  type BidNoBidField,
} from '@/lib/commercial/bid-no-bid-assessment';

const inputClass = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-600';
const areaClass = 'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-600';

function FieldControl({
  field,
  value,
  error,
  readOnly,
  locked,
  showRestricted,
  onChange,
}: {
  field: BidNoBidField;
  value: string;
  error?: string;
  readOnly?: boolean;
  locked?: boolean;
  showRestricted?: boolean;
  onChange: (next: string) => void;
}) {
  if (field.restricted && !showRestricted && readOnly) {
    return (
      <label className="block text-[12px] font-semibold text-slate-600">
        {field.label}
        <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-500">Restricted — visible to GM Commercial / MD</div>
      </label>
    );
  }
  const disabled = Boolean(readOnly || locked);
  const common = { value, disabled, 'aria-label': field.label };
  return (
    <label className="block text-[12px] font-semibold text-slate-600">
      {field.label}{field.required ? <span className="text-rose-500"> *</span> : null}
      {field.type === 'textarea' ? (
        <textarea {...common} rows={3} onChange={(event) => onChange(event.target.value)} className={areaClass} />
      ) : field.type === 'select' ? (
        <select {...common} onChange={(event) => onChange(event.target.value)} className={`${inputClass} mt-1`}>
          <option value="">Select...</option>
          {(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : (
        <input
          {...common}
          type={field.type === 'date' ? 'date' : field.type === 'percent' || field.type === 'currency' || field.type === 'number' ? 'number' : 'text'}
          min={field.type === 'percent' ? 0 : undefined}
          max={field.type === 'percent' ? 100 : undefined}
          step={field.type === 'currency' ? '0.01' : field.type === 'percent' ? '1' : undefined}
          onChange={(event) => onChange(event.target.value)}
          className={`${inputClass} mt-1`}
        />
      )}
      {field.hint ? <span className="mt-1 block text-[11px] font-medium text-slate-500">{field.hint}</span> : null}
      {error ? <span className="mt-1 block text-[11px] font-semibold text-rose-600">{error}</span> : null}
    </label>
  );
}

export function BidNoBidAssessmentForm({
  values,
  errors = {},
  readOnly = false,
  showRestricted = true,
  lockFromOpportunity = true,
  onChange,
}: {
  values: Record<string, string>;
  errors?: Record<string, string>;
  readOnly?: boolean;
  showRestricted?: boolean;
  lockFromOpportunity?: boolean;
  onChange?: (fieldId: string, value: string) => void;
}) {
  return (
    <div className="space-y-4">
      {BID_NO_BID_SECTIONS.map((section, sectionIndex) => {
        const indicators = BID_NO_BID_INDICATORS.filter((item) => item.section === sectionIndex);
        if (!indicators.length) return null;
        return (
          <section key={section} className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-[13px] font-black text-slate-900">{section}</h3>
            <div className="mt-3 space-y-4">
              {indicators.map((indicator) => (
                <div key={indicator.number} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                  <div className="mb-2 text-[12px] font-bold text-slate-800">
                    <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#2563eb] text-[11px] text-white">{indicator.number}</span>
                    {indicator.title}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {indicator.fields.map((field) => (
                      <div key={field.id} className={field.type === 'textarea' ? 'md:col-span-2' : undefined}>
                        <FieldControl
                          field={field}
                          value={values[field.id] || ''}
                          error={errors[field.id]}
                          readOnly={readOnly}
                          locked={lockFromOpportunity && Boolean(field.fromOpportunity) && !readOnly}
                          showRestricted={showRestricted}
                          onChange={(next) => onChange?.(field.id, next)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
