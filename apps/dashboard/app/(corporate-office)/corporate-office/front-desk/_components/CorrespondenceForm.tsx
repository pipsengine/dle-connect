'use client';

import { AlertTriangle, Check, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { formatBytes } from './AttachmentViewer';
import { EmployeeSearch } from './EmployeeSearch';
import {
  ACCEPTED_ATTACHMENT_TYPES,
  CORRESPONDENCE_TYPES,
  MAX_ATTACHMENT_BYTES,
  SENDER_CATEGORIES,
  type Attachment,
  type Correspondence,
  type CorrespondenceInput,
  type CorrespondenceType,
  type DepartmentRouteInput,
  type CorrespondenceDirection,
  type Priority,
  type SenderCategory,
} from '@/lib/corporate-office/front-desk-types';
import { todayISO } from '@/lib/corporate-office/front-desk-format';

const inputClass = 'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm transition-colors focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100';

function Field({
  label,
  required,
  error,
  className = '',
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}
    </label>
  );
}

function SearchableSelect({
  label,
  value,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => setQuery(value), [value]);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const choices = [...options];
  if (value && !choices.some((option) => option.toLowerCase() === value.toLowerCase())) choices.unshift(value);
  const needle = query.trim().toLowerCase();
  const matches = choices.filter((option) => option.toLowerCase().includes(needle)).slice(0, 12);
  const choose = (option: string) => {
    onChange(option);
    setQuery(option);
    setOpen(false);
  };
  return (
    <Field label={label}>
      <div ref={box} className="relative">
        <input
          value={query}
          placeholder={placeholder}
          className={inputClass}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            if (!event.target.value.trim()) onChange('');
          }}
          onBlur={() => {
            const exact = choices.find((option) => option.toLowerCase() === query.trim().toLowerCase());
            if (exact) choose(exact);
            else setQuery(value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && matches[0]) {
              event.preventDefault();
              choose(matches[0]);
            }
          }}
        />
        {open && matches.length ? (
          <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            {matches.map((option) => (
              <li key={option}>
                <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50" onMouseDown={(event) => { event.preventDefault(); choose(option); }}>
                  {option}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Field>
  );
}

const seedRoutes = (initial?: Correspondence): DepartmentRouteInput[] => {
  if (initial?.routes?.length) {
    return initial.routes.map((route) => ({
      department: route.department,
      lead: route.lead,
      assigneeCode: route.assigneeCode,
      assigneeName: route.assigneeName,
      hodCode: route.hodCode,
      hodName: route.hodName,
      actionRequired: route.actionRequired,
      priority: route.priority,
      dueDate: route.dueDate || initial.dueDate,
      status: route.status,
    }));
  }
  if (initial?.department) {
    return [{
      department: initial.department,
      lead: true,
      assigneeCode: initial.assignedEmployeeCode,
      assigneeName: initial.assignedEmployeeName,
      priority: initial.priority,
      dueDate: initial.dueDate,
    }];
  }
  return [];
};

export function CorrespondenceForm({
  initial,
  onSave,
  onCancel,
  submitLabel,
}: {
  initial?: Correspondence;
  onSave: (data: CorrespondenceInput, files: Record<string, File>, removedAttachmentIds: string[]) => Promise<void> | void;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const [form, setForm] = useState<CorrespondenceInput>(() => ({
    direction: initial?.direction ?? 'Incoming',
    dateReceived: initial?.dateReceived ?? todayISO(),
    dateSent: initial?.dateSent ?? '',
    subject: initial?.subject ?? '',
    description: initial?.description ?? '',
    senderCompany: initial?.senderCompany ?? '',
    senderCategory: initial?.senderCategory ?? '' as SenderCategory,
    assignedEmployeeCode: initial?.assignedEmployeeCode ?? '',
    assignedEmployeeName: initial?.assignedEmployeeName ?? '',
    addressedTo: initial?.addressedTo ?? '',
    addressedEmployeeCode: initial?.addressedEmployeeCode ?? '',
    department: initial?.department ?? '',
    location: initial?.location ?? '',
    type: initial?.type ?? 'Letter',
    copies: initial?.copies ?? 1,
    remarks: initial?.remarks ?? '',
    priority: initial?.priority ?? 'Medium',
    dueDate: initial?.dueDate ?? '',
    attachments: initial?.attachments ?? [],
    routes: seedRoutes(initial),
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingFiles, setPendingFiles] = useState<Record<string, File>>({});
  const [fileError, setFileError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [departments, setDepartments] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/corporate-office/front-desk?resource=directories', { credentials: 'same-origin', cache: 'no-store' })
      .then((response) => response.json())
      .then((json) => {
        const nextDepartments = Array.isArray(json.data?.departments) ? json.data.departments.filter((item: unknown) => typeof item === 'string' && item) : [];
        const nextLocations = Array.isArray(json.data?.locations) ? json.data.locations.filter((item: unknown) => typeof item === 'string' && item) : [];
        if (nextDepartments.length) setDepartments(nextDepartments);
        if (nextLocations.length) setLocations(nextLocations);
      })
      .catch(() => undefined);
  }, []);

  const set = <K extends keyof CorrespondenceInput>(key: K, value: CorrespondenceInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const withLead = (routes: DepartmentRouteInput[]) => {
    const lead = routes.find((route) => route.lead);
    return { routes, department: lead?.department || '' };
  };

  const addDepartment = (name: string) => {
    const department = name.trim();
    if (!department) return;
    setForm((current) => {
      if ((current.routes || []).some((route) => route.department.toLowerCase() === department.toLowerCase())) return current;
      const route: DepartmentRouteInput = {
        department,
        lead: !(current.routes || []).length,
        priority: current.priority,
        dueDate: current.dueDate || undefined,
      };
      return { ...current, ...withLead([...(current.routes || []), route]) };
    });
    fetch(`/api/corporate-office/front-desk?resource=hod&department=${encodeURIComponent(department)}`, { credentials: 'same-origin', cache: 'no-store' })
      .then((response) => response.json())
      .then((json) => {
        const head = json.data;
        if (!head?.code || !head?.name) return;
        setForm((current) => ({
          ...current,
          routes: (current.routes || []).map((route) => route.department === department && !route.hodCode
            ? { ...route, hodCode: head.code, hodName: head.name }
            : route),
        }));
      })
      .catch(() => undefined);
  };

  const updateRoute = (department: string, patch: Partial<DepartmentRouteInput>) => {
    setForm((current) => ({
      ...current,
      routes: (current.routes || []).map((route) => route.department === department ? { ...route, ...patch } : route),
    }));
  };

  const makeLead = (department: string) => {
    setForm((current) => ({
      ...current,
      ...withLead((current.routes || []).map((route) => ({ ...route, lead: route.department === department }))),
    }));
  };

  const removeDepartment = (department: string) => {
    setForm((current) => {
      let routes = (current.routes || []).filter((route) => route.department.toLowerCase() !== department.toLowerCase());
      if (routes.length && !routes.some((route) => route.lead)) routes = routes.map((route, index) => ({ ...route, lead: index === 0 }));
      return { ...current, ...withLead(routes) };
    });
  };

  const rememberLocation = (location?: string) => {
    if (!location || location.toLowerCase() === 'unassigned location') return;
    setForm((current) => current.location ? current : { ...current, location });
  };

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const rejected: string[] = [];
    const added: Attachment[] = [];
    const blobs: Record<string, File> = {};
    Array.from(files).forEach((file) => {
      if (!ACCEPTED_ATTACHMENT_TYPES.includes(file.type as (typeof ACCEPTED_ATTACHMENT_TYPES)[number])) {
        rejected.push(`${file.name} (not a PDF or image)`);
        return;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        rejected.push(`${file.name} (over ${formatBytes(MAX_ATTACHMENT_BYTES)})`);
        return;
      }
      const id = `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      added.push({ id, name: file.name, type: file.type, size: file.size, addedAt: new Date().toISOString() });
      blobs[id] = file;
    });
    setFileError(rejected.length ? `Not added: ${rejected.join(', ')}` : '');
    setPendingFiles((current) => ({ ...current, ...blobs }));
    setForm((current) => ({ ...current, attachments: [...current.attachments, ...added] }));
  };

  const removeAttachment = (id: string) => {
    setForm((current) => ({ ...current, attachments: current.attachments.filter((attachment) => attachment.id !== id) }));
    setPendingFiles((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!form.dateReceived) next.dateReceived = 'Date received is required';
    if (!form.description.trim()) next.description = 'Describe the item received';
    if (!form.senderCompany.trim()) next.senderCompany = 'Sender is required';
    if (!(SENDER_CATEGORIES as readonly string[]).includes(form.senderCategory)) next.senderCategory = 'Choose who sent this letter';
    if (!form.addressedEmployeeCode) next.addressedTo = 'Choose the addressee from the employee directory';
    if ((form.assignedEmployeeName || '').trim() && !form.assignedEmployeeCode) next.assignedEmployeeCode = 'Choose the assignee from the employee directory';
    if (!form.dueDate) next.dueDate = 'Response due date is required';
    else if (form.dueDate < form.dateReceived) next.dueDate = 'Cannot be before the date received';
    if (!(form.routes || []).length) next.routes = 'Choose at least one department';
    setErrors(next);
    if (Object.keys(next).length) return;

    const keptIds = new Set(form.attachments.map((attachment) => attachment.id));
    const removedAttachmentIds = (initial?.attachments ?? []).filter((attachment) => !keptIds.has(attachment.id)).map((attachment) => attachment.id);
    setSaving(true);
    setFileError('');
    try {
      await onSave({
        ...form,
        direction: form.direction,
        dateSent: form.dateSent || undefined,
        subject: form.subject.trim() || form.description.trim(),
        description: form.description.trim(),
        senderCompany: form.senderCompany.trim(),
        assignedEmployeeCode: form.assignedEmployeeCode || undefined,
        assignedEmployeeName: form.assignedEmployeeName || undefined,
        addressedEmployeeCode: form.addressedEmployeeCode || undefined,
        addressedTo: form.addressedTo.trim(),
        department: (form.routes || []).find((route) => route.lead)?.department || form.department,
        location: form.location?.trim() || undefined,
        remarks: form.remarks?.trim() || undefined,
        dueDate: form.dueDate,
        routes: form.routes,
      }, pendingFiles, removedAttachmentIds);
    } catch (error) {
      setSaving(false);
      setFileError(error instanceof Error ? error.message : 'Could not save this correspondence.');
    }
  };

  const selectedRoutes = form.routes || [];
  const selectedDepartments = new Set(selectedRoutes.map((route) => route.department.toLowerCase()));
  const departmentChoices = [
    ...departments,
    ...selectedRoutes
      .map((route) => route.department)
      .filter((name) => !departments.some((option) => option.toLowerCase() === name.toLowerCase())),
  ];
  const leadDepartment = selectedRoutes.find((route) => route.lead)?.department || '';
  const supportingDepartments = selectedRoutes.filter((route) => !route.lead).map((route) => route.department);
  const toggleDepartment = (name: string) => {
    if (selectedDepartments.has(name.toLowerCase())) removeDepartment(name);
    else addDepartment(name);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Item Received</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Direction">
            <select value={form.direction} onChange={(event) => set('direction', event.target.value as CorrespondenceDirection)} className={inputClass}>
              <option value="Incoming">Incoming</option>
              <option value="Outgoing">Outgoing</option>
            </select>
          </Field>
          <Field label="Date Received" required error={errors.dateReceived}>
            <input type="date" value={form.dateReceived} max={todayISO()} onChange={(event) => set('dateReceived', event.target.value)} className={inputClass} />
          </Field>
          <Field label="Subject" className="md:col-span-2">
            <input value={form.subject || ''} onChange={(event) => set('subject', event.target.value)} placeholder="e.g. Project approval letter" className={inputClass} />
          </Field>
          <Field label="Type">
            <select value={form.type} onChange={(event) => set('type', event.target.value as CorrespondenceType)} className={inputClass}>
              {CORRESPONDENCE_TYPES.map((type) => <option key={type}>{type}</option>)}
            </select>
          </Field>
          <Field label="Description of Item" required error={errors.description} className="md:col-span-2">
            <textarea rows={2} value={form.description} onChange={(event) => set('description', event.target.value)} placeholder="e.g. Suit No. FHC/L/CP/856/2026" className={inputClass} />
          </Field>
          <Field label="Sender (Company / Organisation)" required error={errors.senderCompany}>
            <input value={form.senderCompany} onChange={(event) => set('senderCompany', event.target.value)} placeholder="e.g. Federal High Court" className={inputClass} />
          </Field>
          <Field label="Sender Category" required error={errors.senderCategory}>
            <select value={form.senderCategory} onChange={(event) => set('senderCategory', event.target.value as SenderCategory)} className={inputClass}>
              <option value="">Select category</option>
              {SENDER_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </Field>
          <Field label="No. of Copies / Letters">
            <input type="number" min={1} value={form.copies} onChange={(event) => set('copies', Math.max(1, Number(event.target.value) || 1))} className={inputClass} />
          </Field>
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Routing</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <EmployeeSearch
            label="Addressed To"
            required
            error={errors.addressedTo}
            selectedName={form.addressedTo}
            selectedCode={form.addressedEmployeeCode}
            placeholder="Search the employee directory"
            onSelect={(person) => {
              set('addressedEmployeeCode', person.code);
              set('addressedTo', person.name);
              rememberLocation(person.location);
            }}
            onClear={() => {
              set('addressedEmployeeCode', '');
              set('addressedTo', '');
            }}
          />
          <EmployeeSearch
            label="Assign To"
            error={errors.assignedEmployeeCode}
            selectedName={form.assignedEmployeeName || ''}
            selectedCode={form.assignedEmployeeCode}
            placeholder="Search the employee directory"
            onSelect={(person) => {
              set('assignedEmployeeCode', person.code);
              set('assignedEmployeeName', person.name);
              rememberLocation(person.location);
            }}
            onClear={() => {
              set('assignedEmployeeCode', '');
              set('assignedEmployeeName', '');
            }}
          />
          <div className="md:col-span-2 rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-medium text-slate-800">Departments Involved (Multiple Selection) <span className="text-red-500">*</span></p>
            <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              {departmentChoices.map((name) => {
                const selected = selectedDepartments.has(name.toLowerCase());
                return (
                  <button key={name} type="button" onClick={() => toggleDepartment(name)} className="flex items-center gap-2.5 text-left text-sm text-slate-800">
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white'}`}>
                      {selected ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                    </span>
                    {name}
                  </button>
                );
              })}
              {!departmentChoices.length ? <p className="text-sm text-slate-400">Loading departments from the organization structure…</p> : null}
            </div>
            <p className="mt-3 text-xs text-slate-500">Departments should be loaded dynamically from DLE Connect&apos;s Organization Structure.</p>
            {errors.routes ? <p className="mt-1 text-xs text-red-600">{errors.routes}</p> : null}
            <label className="mt-4 block">
              <span className="mb-1 block text-sm font-medium text-slate-800">Lead / Primary Department</span>
              <select
                value={leadDepartment}
                disabled={!selectedRoutes.length}
                onChange={(event) => { if (event.target.value) makeLead(event.target.value); }}
                className={inputClass}
              >
                <option value="">{selectedRoutes.length ? 'Select the lead department' : 'Select departments first'}</option>
                {selectedRoutes.map((route) => <option key={route.department} value={route.department}>{route.department}</option>)}
              </select>
            </label>
            <div className="mt-4 border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold text-slate-900">Routing preview</h4>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{selectedRoutes.length} department{selectedRoutes.length === 1 ? '' : 's'}</span>
              </div>
              <p className="mt-2 text-sm text-slate-700"><span className="font-medium">Lead:</span> {leadDepartment || '—'}</p>
              <p className="mt-1 text-sm text-slate-700"><span className="font-medium">Supporting:</span> {supportingDepartments.length ? supportingDepartments.join(', ') : '—'}</p>
            </div>
          </div>
          <SearchableSelect
            label="Location"
            value={form.location || ''}
            options={locations}
            placeholder="Search locations"
            onChange={(value) => set('location', value)}
          />
          <Field label="Remarks">
            <input value={form.remarks} onChange={(event) => set('remarks', event.target.value)} placeholder="Optional" className={inputClass} />
          </Field>
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Deadline</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Priority">
            <select value={form.priority} onChange={(event) => set('priority', event.target.value as Priority)} className={inputClass}>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </Field>
          <Field label="Response Due Date" required error={errors.dueDate}>
            <input
              type="date"
              required
              value={form.dueDate || ''}
              min={form.dateReceived}
              onChange={(event) => {
                const dueDate = event.target.value;
                setForm((current) => ({
                  ...current,
                  dueDate,
                  routes: (current.routes || []).map((route) => !route.dueDate || route.dueDate === current.dueDate ? { ...route, dueDate } : route),
                }));
              }}
              className={inputClass}
            />
          </Field>
        </div>
        <p className="mt-2 text-xs text-slate-400">Every logged item needs a response due date. Department deadlines follow this date until you set a different one.</p>
      </section>

      {(form.routes || []).length ? (
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Department assignments</h3>
        <div className="space-y-3">
          {(form.routes || []).map((route) => {
            const locked = route.status === 'Completed' || route.status === 'Waived';
            return (
              <article key={route.department} className={`rounded-xl border p-4 ${route.lead ? 'border-sky-200 bg-sky-50/50' : 'border-slate-200 bg-white'}`}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-slate-900">{route.department}</h4>
                    {route.lead ? <span className="rounded-full bg-[#2f6fed] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Lead</span> : null}
                    {route.status ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{route.status}</span> : null}
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" disabled={locked || route.lead} onClick={() => makeLead(route.department)} className={`rounded-lg px-2 py-1 text-xs font-medium ${route.lead ? 'text-[#2f6fed]' : 'text-slate-600 hover:bg-slate-50'}`}>
                      {route.lead ? 'Lead' : 'Make lead'}
                    </button>
                    {locked ? null : (
                      <button type="button" onClick={() => removeDepartment(route.department)} className="rounded p-1 text-slate-400 hover:text-red-600" title="Remove department">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                {route.lead ? <p className="mb-3 text-xs text-slate-500">This department coordinates the consolidated response.</p> : null}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <EmployeeSearch
                    label="Assigned officer"
                    selectedName={route.assigneeName || ''}
                    selectedCode={route.assigneeCode}
                    department={route.department}
                    placeholder="Search the employee directory"
                    disabled={locked}
                    onSelect={(person) => updateRoute(route.department, { assigneeCode: person.code, assigneeName: person.name })}
                    onClear={() => updateRoute(route.department, { assigneeCode: undefined, assigneeName: undefined })}
                  />
                  <EmployeeSearch
                    label="HOD"
                    selectedName={route.hodName || ''}
                    selectedCode={route.hodCode}
                    department={route.department}
                    placeholder="Search the employee directory"
                    disabled={locked}
                    onSelect={(person) => updateRoute(route.department, { hodCode: person.code, hodName: person.name })}
                    onClear={() => updateRoute(route.department, { hodCode: undefined, hodName: undefined })}
                  />
                  <Field label="Action required" className="md:col-span-2">
                    <input value={route.actionRequired || ''} disabled={locked} onChange={(event) => updateRoute(route.department, { actionRequired: event.target.value })} placeholder="What this department needs to do" className={inputClass} />
                  </Field>
                  <Field label="Priority">
                    <select value={route.priority} disabled={locked} onChange={(event) => updateRoute(route.department, { priority: event.target.value as Priority })} className={inputClass}>
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  </Field>
                  <Field label="Response deadline">
                    <input type="date" value={route.dueDate || ''} disabled={locked} min={form.dateReceived} onChange={(event) => updateRoute(route.department, { dueDate: event.target.value })} className={inputClass} />
                  </Field>
                </div>
              </article>
            );
          })}
        </div>
      </section>
      ) : null}

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Documents</h3>
        <div
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}
          onClick={() => fileInput.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-5 text-center transition-colors ${dragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'}`}
        >
          <Upload className="h-5 w-5 text-slate-400" />
          <p className="text-sm text-slate-600"><span className="font-medium text-indigo-600">Click to upload</span> or drag and drop the scanned document</p>
          <p className="text-xs text-slate-400">PDF, Word, PNG, JPG or WebP · up to {formatBytes(MAX_ATTACHMENT_BYTES)} each</p>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={ACCEPTED_ATTACHMENT_TYPES.join(',')}
            className="hidden"
            onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }}
          />
        </div>
        {fileError ? (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-red-600">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {fileError}
          </p>
        ) : null}
        {form.attachments.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {form.attachments.map((attachment) => (
              <li key={attachment.id} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-slate-700">{attachment.name}</span>
                <span className="shrink-0 text-xs text-slate-400">{formatBytes(attachment.size)}</span>
                <button type="button" onClick={() => removeAttachment(attachment.id)} className="rounded p-1 text-slate-400 hover:text-red-600" title="Remove">
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <div className="flex justify-end gap-3 border-t border-slate-100 pt-2">
        {onCancel ? (
          <button type="button" onClick={onCancel} className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50">Cancel</button>
        ) : null}
        <button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60">
          {saving ? 'Saving…' : submitLabel ?? (initial ? 'Save Changes' : 'Log Correspondence')}
        </button>
      </div>
    </form>
  );
}
