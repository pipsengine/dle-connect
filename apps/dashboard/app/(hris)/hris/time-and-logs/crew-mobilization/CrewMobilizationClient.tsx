'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Anchor,
  ClipboardPaste,
  Download,
  RefreshCcw,
  Ship,
  Upload,
  UserMinus,
  XCircle,
} from 'lucide-react';
import { PageTemplate } from '@/components/layout/page-template';

type TimesheetMobilization = {
  id: string;
  employeeCode: string;
  employeeName: string;
  homeWorkCenterName: string | null;
  supervisorId: string;
  supervisorName: string;
  projectCode: string;
  workCenterName: string;
  startDate: string;
  endDate: string | null;
  status: string;
};

type EmployeeOption = {
  employeeCode: string;
  employeeName: string;
  jobTitle: string;
  department: string;
  homeWorkCenterName: string | null;
};

type SupervisorOption = { value: string; label: string; employeeCode: string; fullName: string };
type ProjectOption = { code: string; name: string; site: string };

type Payload = {
  generatedAt: string;
  permissions: { actor: string; role: string; canManage: boolean };
  mobilizations: TimesheetMobilization[];
  options: {
    employees: EmployeeOption[];
    supervisors: SupervisorOption[];
    projects: ProjectOption[];
  };
};

type UploadReport = {
  matchedCount: number;
  unmatchedCodes: string[];
  duplicateCodes: string[];
  uploadedCount: number;
  fileName?: string;
};

const today = new Date().toISOString().slice(0, 10);
const CREW_UPLOAD_TEMPLATE_CSV = 'Employee Code\nC2225\nP0425\n';

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read upload file.'));
    reader.readAsDataURL(file);
  });

export default function CrewMobilizationClient() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('Active');
  const [query, setQuery] = useState('');

  const [supervisorId, setSupervisorId] = useState('');
  const [projectCode, setProjectCode] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('Offshore project mobilization');
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [uploadReport, setUploadReport] = useState<UploadReport | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ status: statusFilter });
      const res = await fetch(`/api/hris/time-and-logs/crew-mobilization?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to load crew mobilization');
      setPayload(json.data as Payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load crew mobilization');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedSupervisor = payload?.options.supervisors.find((item) => item.value === supervisorId);
  const selectedProject = payload?.options.projects.find((item) => item.code === projectCode);

  const filteredEmployees = useMemo(() => {
    const needle = employeeQuery.trim().toLowerCase();
    return (payload?.options.employees || []).filter((employee) => {
      if (!needle) return true;
      return [employee.employeeCode, employee.employeeName, employee.department, employee.jobTitle]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [employeeQuery, payload?.options.employees]);

  const filteredSelectedCount = useMemo(
    () => filteredEmployees.filter((employee) => selectedCodes.includes(employee.employeeCode)).length,
    [filteredEmployees, selectedCodes],
  );
  const allFilteredSelected = filteredEmployees.length > 0 && filteredSelectedCount === filteredEmployees.length;

  const roster = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (payload?.mobilizations || []).filter((item) => {
      if (!needle) return true;
      return [item.employeeCode, item.employeeName, item.supervisorName, item.projectCode, item.workCenterName]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [payload?.mobilizations, query]);

  const applyMatchedCodes = (matchedCodes: string[], report: Omit<UploadReport, 'matchedCount'> & { matchedCount?: number }) => {
    setSelectedCodes((current) => Array.from(new Set([...current, ...matchedCodes])));
    setUploadReport({
      matchedCount: matchedCodes.length,
      unmatchedCodes: report.unmatchedCodes,
      duplicateCodes: report.duplicateCodes,
      uploadedCount: report.uploadedCount,
      fileName: report.fileName,
    });
    if (matchedCodes.length) {
      setNotice(`Selected ${matchedCodes.length} employee${matchedCodes.length === 1 ? '' : 's'} from upload.`);
    }
  };

  const parseCodes = async (input: { file?: File; text?: string }) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const body: Record<string, string> = { action: 'PARSE_CODES' };
      if (input.file) {
        body.fileName = input.file.name;
        body.fileBase64 = await fileToBase64(input.file);
      } else {
        body.text = input.text || '';
        body.fileName = 'paste.txt';
      }
      const res = await fetch('/api/hris/time-and-logs/crew-mobilization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to parse crew upload');
      applyMatchedCodes(json.data.matchedCodes || [], {
        unmatchedCodes: json.data.unmatchedCodes || [],
        duplicateCodes: json.data.duplicateCodes || [],
        uploadedCount: json.data.uploadedCount || 0,
        fileName: input.file?.name,
      });
      if (!(json.data.matchedCodes || []).length) {
        setError('No uploaded codes matched active employees. Check the Employee Code column and try again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to parse crew upload');
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([CREW_UPLOAD_TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'crew-mobilization-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const selectAllFiltered = () => {
    const codes = filteredEmployees.map((employee) => employee.employeeCode);
    setSelectedCodes((current) => Array.from(new Set([...current, ...codes])));
    setNotice(`Selected all ${codes.length} filtered employee${codes.length === 1 ? '' : 's'}.`);
  };

  const clearFilteredSelection = () => {
    const filtered = new Set(filteredEmployees.map((employee) => employee.employeeCode));
    setSelectedCodes((current) => current.filter((code) => !filtered.has(code)));
  };

  const clearAllSelection = () => {
    setSelectedCodes([]);
    setUploadReport(null);
  };

  const createRoster = async () => {
    if (!supervisorId || !projectCode || !startDate || !selectedCodes.length) {
      setError('Select a host supervisor, project, start date, and at least one employee.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const employees = selectedCodes.map((code) => {
        const employee = payload?.options.employees.find((item) => item.employeeCode === code);
        return {
          employeeCode: code,
          employeeName: employee?.employeeName || code,
          homeWorkCenterName: employee?.homeWorkCenterName || null,
        };
      });
      const res = await fetch('/api/hris/time-and-logs/crew-mobilization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE',
          supervisorId,
          supervisorName: selectedSupervisor?.label || supervisorId,
          projectCode,
          projectName: selectedProject?.name || projectCode,
          startDate,
          endDate: endDate || null,
          reason,
          employees,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to mobilize crew');
      setNotice(json.data?.message || 'Crew mobilized.');
      setSelectedCodes([]);
      setUploadReport(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to mobilize crew');
    } finally {
      setBusy(false);
    }
  };

  const act = async (action: 'DEMOBILIZE' | 'CANCEL', id: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/hris/time-and-logs/crew-mobilization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id, endDate: today }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to update mobilization');
      setNotice(json.data?.message || 'Updated.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update mobilization');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageTemplate
      title="Crew Mobilization"
      description="HR roster for offshore tours. Host supervisor books 8h payroll + 1h break on a dedicated project sheet. 4h offshore allowance is stored but paid outside payroll."
      breadcrumbs={[
        { label: 'HRIS', href: '/hris' },
        { label: 'Workforce Management', href: '/hris/workforce-management' },
        { label: 'Crew Mobilization' },
      ]}
      primaryAction={{ label: loading ? 'Refreshing' : 'Refresh', onClick: load, icon: RefreshCcw }}
    >
      <div className="space-y-5">
        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
        {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{notice}</div> : null}

        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          <div className="flex items-start gap-2">
            <Anchor className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-black">Offshore booking rules</p>
              <p className="mt-1 font-semibold">
                Mobilized crew drop off their home work centre for these dates. The host supervisor opens location OFFSHORE and work centre <span className="font-black">OFFSHORE · PROJECT</span>. Payroll sees 8h work + 1h break. The extra 4h is offshore allowance, not overtime.
              </p>
            </div>
          </div>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center gap-2">
            <Ship className="h-4 w-4 text-slate-500" />
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-700">Mobilize crew</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-xs font-bold text-slate-600">
              Host supervisor
              <select value={supervisorId} onChange={(event) => setSupervisorId(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold">
                <option value="">Select supervisor</option>
                {(payload?.options.supervisors || []).map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold text-slate-600">
              Project
              <select value={projectCode} onChange={(event) => setProjectCode(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold">
                <option value="">Select project</option>
                {(payload?.options.projects || []).map((item) => (
                  <option key={item.code} value={item.code}>{item.code} · {item.name}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold text-slate-600">
              Start date
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold" />
            </label>
            <label className="text-xs font-bold text-slate-600">
              End date (optional)
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold" />
            </label>
          </div>
          <label className="mt-3 block text-xs font-bold text-slate-600">
            Reason
            <input value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold" />
          </label>

          <div className="mt-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-black uppercase text-slate-500">Crew ({selectedCodes.length} selected)</p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50"
                >
                  <Download className="h-3.5 w-3.5" /> Template
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (file) void parseCodes({ file });
                  }}
                />
                <button
                  type="button"
                  disabled={busy || !payload?.permissions.canManage}
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 text-xs font-black text-sky-900 hover:bg-sky-100 disabled:opacity-50"
                >
                  <Upload className="h-3.5 w-3.5" /> Upload Excel / CSV
                </button>
                <button
                  type="button"
                  onClick={() => setPasteOpen((open) => !open)}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50"
                >
                  <ClipboardPaste className="h-3.5 w-3.5" /> Paste codes
                </button>
                <input
                  value={employeeQuery}
                  onChange={(event) => setEmployeeQuery(event.target.value)}
                  placeholder="Search employee, code, department"
                  className="h-10 w-full max-w-xs rounded-xl border border-slate-200 px-3 text-sm font-semibold"
                />
              </div>
            </div>

            <div className="mb-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!filteredEmployees.length}
                onClick={() => (allFilteredSelected ? clearFilteredSelection() : selectAllFiltered())}
                className="inline-flex h-9 items-center rounded-lg border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                {allFilteredSelected ? 'Clear filtered' : `Select all filtered (${filteredEmployees.length})`}
              </button>
              {selectedCodes.length ? (
                <button
                  type="button"
                  onClick={clearAllSelection}
                  className="inline-flex h-9 items-center rounded-lg border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50"
                >
                  Clear all selected
                </button>
              ) : null}
              <span className="text-xs font-semibold text-slate-500">
                Showing {filteredEmployees.length} of {(payload?.options.employees || []).length} employees
              </span>
            </div>

            {pasteOpen ? (
              <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-600">Paste employee codes separated by new lines, commas, or tabs.</p>
                <textarea
                  value={pasteText}
                  onChange={(event) => setPasteText(event.target.value)}
                  rows={4}
                  placeholder="C2225&#10;P0425&#10;C1830"
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button type="button" onClick={() => { setPasteOpen(false); setPasteText(''); }} className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-black text-slate-700">
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={busy || !pasteText.trim()}
                    onClick={() => void parseCodes({ text: pasteText }).then(() => { setPasteText(''); setPasteOpen(false); })}
                    className="h-9 rounded-lg bg-slate-950 px-3 text-xs font-black text-white disabled:opacity-50"
                  >
                    Match pasted codes
                  </button>
                </div>
              </div>
            ) : null}

            {uploadReport ? (
              <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                <p>
                  {uploadReport.fileName ? <span className="font-black">{uploadReport.fileName}: </span> : null}
                  matched {uploadReport.matchedCount} of {uploadReport.uploadedCount}
                  {uploadReport.duplicateCodes.length ? ` · ${uploadReport.duplicateCodes.length} duplicate` : ''}
                  {uploadReport.unmatchedCodes.length ? ` · ${uploadReport.unmatchedCodes.length} unmatched` : ''}
                </p>
                {uploadReport.unmatchedCodes.length ? (
                  <p className="mt-1 text-amber-800">
                    Unmatched: {uploadReport.unmatchedCodes.slice(0, 12).join(', ')}
                    {uploadReport.unmatchedCodes.length > 12 ? ` +${uploadReport.unmatchedCodes.length - 12} more` : ''}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="max-h-80 overflow-auto rounded-xl border border-slate-200">
              {filteredEmployees.map((employee) => {
                const checked = selectedCodes.includes(employee.employeeCode);
                return (
                  <label key={employee.employeeCode} className="flex items-center gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        setSelectedCodes((current) => event.target.checked
                          ? [...current, employee.employeeCode]
                          : current.filter((code) => code !== employee.employeeCode));
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-bold text-slate-900">{employee.employeeName}</span>
                      <span className="ml-2 text-xs font-semibold text-slate-500">{employee.employeeCode} · {employee.department || employee.jobTitle || 'Unassigned'}</span>
                    </span>
                  </label>
                );
              })}
              {!filteredEmployees.length ? (
                <p className="px-3 py-6 text-center text-sm font-semibold text-slate-500">No employees match the current search.</p>
              ) : null}
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => void createRoster()}
              disabled={busy || !payload?.permissions.canManage}
              className="inline-flex h-11 items-center rounded-xl bg-slate-950 px-4 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Mobilize selected crew{selectedCodes.length ? ` (${selectedCodes.length})` : ''}
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-700">Active roster</h2>
            <div className="flex flex-wrap gap-2">
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold">
                <option value="Active">Active</option>
                <option value="Mobilized">Mobilized</option>
                <option value="Planned">Planned</option>
                <option value="Demobilized">Demobilized</option>
                <option value="Cancelled">Cancelled</option>
              </select>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search roster" className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold" />
            </div>
          </div>
          {roster.length === 0 ? (
            <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              No mobilizations for this filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-black uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">Employee</th>
                    <th className="px-3 py-2">Host supervisor</th>
                    <th className="px-3 py-2">Sheet</th>
                    <th className="px-3 py-2">Dates</th>
                    <th className="px-3 py-2">Home WC</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((item) => (
                    <tr key={item.id} className="border-b border-slate-100">
                      <td className="px-3 py-3">
                        <div className="font-bold text-slate-900">{item.employeeName}</div>
                        <div className="text-xs font-semibold text-slate-500">{item.employeeCode}</div>
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-700">{item.supervisorName}</td>
                      <td className="px-3 py-3 font-semibold text-slate-700">{item.workCenterName}</td>
                      <td className="px-3 py-3 font-semibold text-slate-700">{item.startDate}{item.endDate ? ` → ${item.endDate}` : ''}</td>
                      <td className="px-3 py-3 font-semibold text-slate-500">{item.homeWorkCenterName || '—'}</td>
                      <td className="px-3 py-3 font-black text-slate-800">{item.status}</td>
                      <td className="px-3 py-3">
                        {item.status === 'Planned' || item.status === 'Mobilized' ? (
                          <div className="flex flex-wrap gap-2">
                            <button type="button" disabled={busy} onClick={() => void act('DEMOBILIZE', item.id)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                              <UserMinus className="h-3.5 w-3.5" /> Demobilize
                            </button>
                            <button type="button" disabled={busy} onClick={() => void act('CANCEL', item.id)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-red-200 px-2 text-xs font-black text-red-700 hover:bg-red-50 disabled:opacity-50">
                              <XCircle className="h-3.5 w-3.5" /> Cancel
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </PageTemplate>
  );
}
