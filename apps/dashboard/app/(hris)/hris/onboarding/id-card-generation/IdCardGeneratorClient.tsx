'use client';

import { ChevronRight, IdCard, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { EmployeeSelector } from './components/EmployeeSelector';
import { ExportSettings } from './components/ExportSettings';
import { GeneratedResults } from './components/GeneratedResults';
import { IssuanceHistory } from './components/IssuanceHistory';
import { PreviewPanel } from './components/PreviewPanel';
import { TEMPLATES } from './lib/card-template';
import { fetchIdCardWorkspace, recordIdCards, type Employee, type IdCardIssue } from './lib/employees';
import { buildPdf, buildSheets, buildZip, CARDS_PER_PAGE, downloadBlob, pageCount, renderCard, type ExportFormat, type RenderedCard, type Sheet } from './lib/export';

export default function IdCardGeneratorClient() {
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [issues, setIssues] = useState<IdCardIssue[]>([]);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [templateId, setTemplateId] = useState(TEMPLATES.find((t) => t.isDefault)?.id ?? TEMPLATES[0].id);
  const [format, setFormat] = useState<ExportFormat>('png');
  const [previewIndex, setPreviewIndex] = useState(0);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<Sheet[]>([]);
  const [resultsFormat, setResultsFormat] = useState<ExportFormat>('png');
  const [genError, setGenError] = useState('');
  const [saveError, setSaveError] = useState('');
  const pendingIssue = useRef<{ codes: string[]; format: ExportFormat } | null>(null);

  const applyWorkspace = (workspace: { employees: Employee[]; issues: IdCardIssue[] }) => {
    setEmployees(workspace.employees);
    setIssues(workspace.issues);
  };

  useEffect(() => {
    let active = true;
    fetchIdCardWorkspace()
      .then((workspace) => {
        if (!active) return;
        applyWorkspace(workspace);
        const wanted = new URLSearchParams(window.location.search).get('employees')?.toUpperCase().split(',') ?? [];
        const known = new Set(workspace.employees.map((employee) => employee.id));
        setSelected(wanted.map((id) => id.trim()).filter((id) => known.has(id)));
      })
      .catch((error) => active && setLoadError(error instanceof Error ? error.message : 'Could not load employees from the Employee Directory.'));
    return () => {
      active = false;
    };
  }, []);

  const template = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0];
  const byId = useMemo(() => new Map((employees ?? []).map((employee) => [employee.id, employee])), [employees]);
  const selectedEmployees = useMemo(() => selected.map((id) => byId.get(id)).filter((employee): employee is Employee => !!employee), [selected, byId]);
  const busy = progress !== null;

  const changeSelection = (next: string[]) => {
    setSelected(next);
    setPreviewIndex((index) => Math.min(index, Math.max(0, next.length - 1)));
  };

  const reset = () => {
    changeSelection([]);
    setResults([]);
    setGenError('');
    setSaveError('');
  };

  const saveIssuance = async (codes: string[], exportFormat: ExportFormat) => {
    const workspace = await recordIdCards({ employeeCodes: codes, templateId, format: exportFormat });
    applyWorkspace(workspace);
    setSaveError('');
  };

  const generate = async () => {
    if (!selectedEmployees.length) return;
    setGenError('');
    setSaveError('');
    setResults([]);
    setProgress({ done: 0, total: selectedEmployees.length });
    const cards: RenderedCard[] = [];
    try {
      for (const employee of selectedEmployees) {
        cards.push(await renderCard(employee, template));
        setProgress({ done: cards.length, total: selectedEmployees.length });
      }
      const sheets = await buildSheets(cards, format);
      setResults(sheets);
      setResultsFormat(format);
      const issued = { codes: selectedEmployees.map((employee) => employee.id), format };
      pendingIssue.current = issued;
      try {
        await saveIssuance(issued.codes, issued.format);
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : 'The cards were created, but the HRIS issuance record was not saved.');
      }
    } catch (error) {
      setGenError(error instanceof Error ? error.message : 'Generation failed. Please try again.');
    } finally {
      setProgress(null);
    }
  };

  const downloadAll = async () => {
    if (!results.length) return;
    if (results.length === 1) return downloadBlob(results[0].blob, results[0].filename);
    const stamp = new Date().toISOString().slice(0, 10);
    if (resultsFormat === 'pdf') downloadBlob(buildPdf(results.flatMap((sheet) => (sheet.pdf ? [sheet.pdf] : []))), `ID-Cards_${stamp}.pdf`);
    else downloadBlob(await buildZip(results.map((sheet) => ({ name: sheet.filename, blob: sheet.blob }))), `ID-Cards_${stamp}.zip`);
  };

  return (
    <div className="max-w-[1440px] mx-auto space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-slate-500" aria-label="Breadcrumb">
        <Link href="/hris" className="hover:text-slate-900 transition-colors">
          HRIS
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
        <Link href="/hris/onboarding/onboarding-dashboard" className="hover:text-slate-900 transition-colors">
          Onboarding
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
        <span className="font-medium text-slate-900">ID Card Generation</span>
      </nav>

      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#2d2a6e] to-[#1c1b46] flex items-center justify-center text-white shadow-lg shadow-indigo-900/20 shrink-0">
            <IdCard className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl md:text-[28px] font-bold text-slate-900 tracking-tight">Employee ID Card Generator</h1>
            <p className="text-slate-500 mt-0.5">Generate cards from the Employee Directory. Each generation is recorded in HRIS.</p>
          </div>
        </div>
        <Stepper selected={selected.length > 0} generated={results.length > 0} />
      </header>

      {loadError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,11fr)_minmax(0,10fr)] gap-6 items-start">
        <div className="space-y-6 min-w-0">
          <EmployeeSelector employees={employees} selected={selected} onChange={changeSelection} />
          <ExportSettings template={template} templates={TEMPLATES} onTemplate={setTemplateId} format={format} onFormat={setFormat} />

          <div className="grid grid-cols-1 sm:grid-cols-[1.5fr_1fr] gap-3">
            <button
              onClick={generate}
              disabled={!selected.length || busy}
              className="group relative overflow-hidden flex items-center justify-center gap-3 rounded-xl bg-[#1c1b46] text-white font-semibold py-3.5 shadow-lg shadow-indigo-900/20 hover:bg-[#26245c] disabled:bg-[#1c1b46]/45 disabled:text-white/80 disabled:shadow-none disabled:cursor-not-allowed transition-colors"
            >
              {busy && progress && <span className="absolute inset-y-0 left-0 bg-white/10 transition-[width] duration-300" style={{ width: `${(progress.done / progress.total) * 100}%` }} />}
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <IdCard className="w-5 h-5" />}
              <span className="relative">
                {busy && progress
                  ? `Generating ${progress.done} of ${progress.total}…`
                  : selected.length > 1
                    ? `Generate ${selected.length} ID Cards`
                    : 'Generate ID Card'}
              </span>
              {!busy && <ChevronRight className="w-5 h-5 transition-transform group-enabled:group-hover:translate-x-0.5" />}
            </button>
            <button
              onClick={reset}
              disabled={busy || (!selected.length && !results.length)}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-700 py-3.5 hover:bg-slate-50 hover:border-slate-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Reset Selection
            </button>
          </div>
          {!selected.length ? (
            <p className="-mt-3 text-sm text-slate-400 text-center sm:text-left">Select at least one employee to generate cards.</p>
          ) : (
            <p className="-mt-3 text-sm text-slate-500 text-center sm:text-left">
              {selected.length} card{selected.length === 1 ? '' : 's'} on {pageCount(selected.length)} A4 page{pageCount(selected.length) === 1 ? '' : 's'} · up to {CARDS_PER_PAGE} per page
            </p>
          )}
          {genError && <p className="text-sm text-red-600">{genError}</p>}
          {saveError && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p>{saveError}</p>
              <button
                type="button"
                className="mt-2 font-semibold text-amber-900 underline"
                onClick={() => {
                  const pending = pendingIssue.current;
                  if (!pending) return;
                  saveIssuance(pending.codes, pending.format).catch((error) => setSaveError(error instanceof Error ? error.message : 'Unable to save the issuance record.'));
                }}
              >
                Save issuance record
              </button>
            </div>
          )}
        </div>

        <div className="space-y-6 min-w-0 xl:sticky xl:top-6">
          <PreviewPanel employees={selectedEmployees} index={previewIndex} onIndex={setPreviewIndex} template={template} />
          {results.length > 0 && <GeneratedResults results={results} format={resultsFormat} onDownloadAll={downloadAll} />}
        </div>
      </div>
      <IssuanceHistory issues={issues} />
    </div>
  );
}

function Stepper({ selected, generated }: { selected: boolean; generated: boolean }) {
  const steps = [
    { label: 'Select', done: selected },
    { label: 'Configure', done: selected },
    { label: 'Export', done: generated },
  ];
  return (
    <ol className="hidden lg:flex items-center gap-2 text-sm">
      {steps.map((step, index) => (
        <li key={step.label} className="flex items-center gap-2">
          <span
            className={`flex items-center gap-2 rounded-full px-3 py-1.5 font-medium transition-colors ${
              step.done ? 'bg-emerald-50 text-emerald-700' : 'bg-white text-slate-500 border border-slate-200'
            }`}
          >
            <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center ${step.done ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
              {step.done ? '✓' : index + 1}
            </span>
            {step.label}
          </span>
          {index < steps.length - 1 && <span className="w-6 h-px bg-slate-300" />}
        </li>
      ))}
    </ol>
  );
}
