"use client";

import React, { useState, useEffect, useMemo } from "react";
import { EmployeeHostField } from "../_components/employee-host-field";
import { loadVisitorWorkspace, patchVisitorVisit, removeVisitorArtifact, saveVisitorArtifact, saveVisitorVisit } from "@/lib/security/visitor-client";
import type { VisitorArtifact, VisitorVisit } from "@/lib/security/visitor-types";
import { durationToMinutes, epochOrNull, todayISO, visitorColor, visitorInitials } from "@/lib/security/visitor-views";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Edit3,
  Eye,
  FileText,
  Layers,
  Play,
  Plus,
  Power,
  Printer,
  QrCode,
  RotateCcw,
  Settings,
  ShieldOff,
  Sliders,
  Users,
  X,
  XCircle,
} from "lucide-react";

// ---------- types ----------
type BadgeStatus = "Active" | "Due for Return" | "Returned" | "Lost";
type PrintStatus = "Ready" | "Printing" | "Waiting" | "Failed";

interface BadgeTemplate {
  id: string;
  name: string;
  visitorType: string;
  lastModified: string;
  accent: string;
}

interface TimelineEvent {
  time: string;
  action: string;
  staff: string;
}

interface IssuedBadge {
  id: string;
  badgeNumber: string;
  visitorName: string;
  initials: string;
  color: string;
  company: string;
  host: string;
  visitorType: string;
  templateName: string;
  issueTime: number; // epoch ms
  expiryTime: number; // epoch ms
  status: BadgeStatus;
  timeline: TimelineEvent[];
}

interface PrintJob {
  id: string;
  visitorName: string;
  template: string;
  printer: string;
  status: PrintStatus;
  eta: string;
}

// ---------- utility ----------
const statusColor = (status: BadgeStatus) =>
  status === "Active" ? "bg-emerald-50 text-emerald-700" :
  status === "Due for Return" ? "bg-amber-50 text-amber-700" :
  status === "Lost" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-500";

const statusDot = (status: BadgeStatus) =>
  status === "Active" ? "bg-emerald-500" : status === "Due for Return" ? "bg-amber-500" : status === "Lost" ? "bg-red-500" : "bg-slate-400";

const printStatusColor = (status: PrintStatus) =>
  status === "Ready" ? "bg-emerald-50 text-emerald-700" : status === "Printing" ? "bg-blue-50 text-blue-700" : status === "Waiting" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700";

function formatDuration(ms: number) {
  const overdue = ms < 0;
  const abs = Math.abs(ms);
  const totalMin = Math.floor(abs / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const str = h > 0 ? `${h}h ${m.toString().padStart(2, "0")}m` : `${m}m`;
  return overdue ? `Overdue by ${str}` : str;
}

// ---------- component ----------
const EMPTY_BADGE: IssuedBadge = {
  id: "", badgeNumber: "", visitorName: "No badge selected", initials: "", color: "bg-slate-300", company: "", host: "", visitorType: "", templateName: "Standard Guest", issueTime: Date.now(), expiryTime: Date.now(), status: "Returned", timeline: [],
};

const badgeFromVisit = (visit: VisitorVisit): IssuedBadge | null => {
  if (!visit.badgeNumber && !visit.badgeStatus) return null;
  const issued = epochOrNull(visit.checkInAt) || Date.parse(visit.updatedAt) || Date.now();
  const status = (visit.badgeStatus === "Lost" || visit.badgeStatus === "Returned" || visit.badgeStatus === "Due for Return" || visit.badgeStatus === "Active"
    ? visit.badgeStatus
    : visit.status === "Checked Out" ? "Returned" : "Active") as BadgeStatus;
  return {
    id: visit.id,
    badgeNumber: visit.badgeNumber || "Pending",
    visitorName: visit.visitorName,
    initials: visitorInitials(visit.visitorName),
    color: visitorColor(visit.visitorName),
    company: visit.company,
    host: visit.hostName,
    visitorType: visit.visitorType || "Guest",
    templateName: visit.badgeTemplate || "Standard Guest",
    issueTime: issued,
    expiryTime: issued + durationToMinutes(visit.duration) * 60 * 1000,
    status,
    timeline: visit.timeline.map((event) => ({ time: event.time, action: event.action, staff: event.actor })),
  };
};

export default function BadgeManagementPage() {
  const [records, setRecords] = useState<VisitorVisit[]>([]);
  const [artifacts, setArtifacts] = useState<VisitorArtifact[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [clock, setClock] = useState(Date.now());

  const [showIssueBadge, setShowIssueBadge] = useState(false);
  const [showPrintBadge, setShowPrintBadge] = useState(false);
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [showExportLog, setShowExportLog] = useState(false);
  const [showEditTemplate, setShowEditTemplate] = useState<BadgeTemplate | null>(null);
  const [showPrinterSettings, setShowPrinterSettings] = useState(false);
  const [showReturnBadge, setShowReturnBadge] = useState<IssuedBadge | null>(null);
  const [showEditLayout, setShowEditLayout] = useState(false);
  const [showBadgeHistory, setShowBadgeHistory] = useState<IssuedBadge | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const refresh = () => loadVisitorWorkspace().then((workspace) => {
    setRecords(workspace.visits);
    setArtifacts(workspace.artifacts);
    const firstBadge = workspace.visits.map(badgeFromVisit).find(Boolean);
    setSelectedId((current) => current || firstBadge?.id || "");
    const firstTemplate = workspace.artifacts.find((item) => item.kind === "badge-template");
    setSelectedTemplateId((current) => current || firstTemplate?.id || "");
  }).catch((error) => showToast(error instanceof Error ? error.message : "Unable to load badges."));

  useEffect(() => { void refresh(); }, []);

  const templates = useMemo<BadgeTemplate[]>(() => artifacts.filter((item) => item.kind === "badge-template").map((item) => ({
    id: item.id,
    name: item.name,
    visitorType: String(item.payload.visitorType || "Guest"),
    lastModified: item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : "Saved",
    accent: String(item.payload.accent || "from-blue-500 to-indigo-600"),
  })), [artifacts]);
  const badges = useMemo(() => records.map(badgeFromVisit).filter((badge): badge is IssuedBadge => Boolean(badge)), [records]);
  const printQueue = useMemo<PrintJob[]>(() => artifacts.filter((item) => item.kind === "print-job").map((item) => ({
    id: item.id,
    visitorName: String(item.payload.visitorName || item.name),
    template: String(item.payload.template || ""),
    printer: String(item.payload.printer || "Reception"),
    status: (item.payload.status as PrintStatus) || "Waiting",
    eta: String(item.payload.eta || "—"),
  })), [artifacts]);
  const selected = badges.find(b => b.id === selectedId) || badges[0] || EMPTY_BADGE;
  const selectedTemplate = templates.find(t => t.id === selectedTemplateId) || templates[0] || { id: "", name: "Standard Guest", visitorType: "Guest", lastModified: "", accent: "from-blue-500 to-indigo-600" };
  const applySaved = (saved: VisitorVisit) => setRecords((prev) => [saved, ...prev.filter((item) => item.id !== saved.id)]);
  const queueJob = (job: PrintJob) => {
    void saveVisitorArtifact({ id: job.id, kind: "print-job", name: job.visitorName, payload: { ...job } })
      .then((saved) => setArtifacts((prev) => [saved, ...prev.filter((item) => item.id !== saved.id)]))
      .catch((error) => showToast(error instanceof Error ? error.message : "Unable to queue the print job."));
  };

  const activeCount = badges.filter(b => b.status === "Active").length;
  const outstanding = badges.filter(b => b.status === "Active" || b.status === "Due for Return");

  const useTemplate = (tpl: BadgeTemplate) => {
    setSelectedTemplateId(tpl.id);
    showToast(`"${tpl.name}" template selected — preview updated`);
  };

  const duplicateTemplate = (tpl: BadgeTemplate) => {
    void saveVisitorArtifact({ kind: "badge-template", name: `${tpl.name} copy`, payload: { visitorType: tpl.visitorType, accent: tpl.accent } })
      .then((saved) => { setArtifacts((prev) => [saved, ...prev]); showToast(`"${tpl.name}" duplicated`); })
      .catch((error) => showToast(error instanceof Error ? error.message : "Unable to duplicate the template."));
  };

  const reprintBadge = (b: IssuedBadge) => {
    if (!b.id) return;
    queueJob({ id: `pq-${Date.now()}`, visitorName: b.visitorName, template: b.templateName, printer: "Zebra ZD421 (Reception)", status: "Waiting", eta: "~20 sec" });
    showToast(`${b.visitorName}'s badge queued for reprint`);
  };

  const deactivateBadge = (b: IssuedBadge) => {
    if (!b.id) return;
    void patchVisitorVisit(b.id, { badgeStatus: "Returned" }, { time: "", action: "Badge deactivated", actor: "Reception" })
      .then((saved) => { applySaved(saved); showToast(`Badge ${b.badgeNumber} deactivated`); })
      .catch((error) => showToast(error instanceof Error ? error.message : "Unable to deactivate the badge."));
  };

  const markReturned = (b: IssuedBadge) => {
    if (!b.id) return;
    void patchVisitorVisit(b.id, { badgeStatus: "Returned" }, { time: "", action: "Badge returned", actor: "Reception" })
      .then((saved) => { applySaved(saved); showToast(`Badge ${b.badgeNumber} marked returned`); setShowReturnBadge(null); })
      .catch((error) => showToast(error instanceof Error ? error.message : "Unable to return the badge."));
  };

  const retryPrintJob = (id: string) => {
    const job = printQueue.find((item) => item.id === id);
    if (!job) return;
    queueJob({ ...job, status: "Waiting", eta: "~15 sec" });
    showToast("Print job retried");
  };
  const cancelPrintJob = (id: string) => {
    void removeVisitorArtifact(id)
      .then(() => { setArtifacts((prev) => prev.filter((item) => item.id !== id)); showToast("Print job cancelled"); })
      .catch((error) => showToast(error instanceof Error ? error.message : "Unable to cancel the print job."));
  };
  const prioritizePrintJob = (id: string) => {
    const job = printQueue.find((item) => item.id === id);
    if (!job) return;
    queueJob(job);
    showToast("Print job prioritized");
  };

  return (
    <div className="space-y-6 relative">
      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-[60] bg-slate-900 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 max-w-sm">
          <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" /> {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl px-6 py-4 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Badge Management</h1>
          <p className="mt-1 text-sm text-slate-500 max-w-xl">Design, issue, print, and manage visitor identification badges.</p>
          <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
            <span className="flex items-center gap-1 text-emerald-600 font-medium"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Printer Online</span>
            <span className="flex items-center gap-1"><Users size={12} /> {activeCount} Active Badges</span>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => setShowIssueBadge(true)} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2"><Plus size={16} /> Issue Badge</button>
          <button onClick={() => setShowPrintBadge(true)} className="border border-slate-200 px-3 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"><Printer size={16} /> Print Badge</button>
          <button onClick={() => setShowCreateTemplate(true)} className="border border-slate-200 px-3 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"><Layers size={16} /> Create Template</button>
          <button onClick={() => setShowExportLog(true)} className="border border-slate-200 px-3 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"><Download size={16} /> Export Badge Log</button>
        </div>
      </div>

      {/* Section 1 - Badge Templates Gallery */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Badge Templates Gallery</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map(tpl => (
            <div key={tpl.id} className={`border rounded-xl overflow-hidden ${selectedTemplateId === tpl.id ? "border-blue-300 ring-1 ring-blue-200" : "border-slate-200"}`}>
              <div className={`bg-gradient-to-br ${tpl.accent} p-4 text-white text-center`}>
                <div className="text-[10px] uppercase tracking-wide opacity-80">Company Logo</div>
                <div className="text-sm font-bold mt-2">JOHN SMITH</div>
                <div className="text-[10px] opacity-80">{tpl.visitorType}</div>
                <div className="w-10 h-10 bg-white/20 rounded-md mx-auto mt-2 flex items-center justify-center"><QrCode size={20} /></div>
                <div className="text-[9px] opacity-70 mt-1">Badge #V-2041</div>
              </div>
              <div className="p-3">
                <div className="text-sm font-semibold text-slate-900">{tpl.name}</div>
                <div className="text-xs text-slate-400">Modified {tpl.lastModified}</div>
                <div className="flex items-center gap-1.5 mt-2.5">
                  <button onClick={() => useTemplate(tpl)} className="text-[11px] px-2 py-1 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 flex-1">Use Template</button>
                  <button onClick={() => setShowEditTemplate(tpl)} className="text-[11px] px-2 py-1 border border-slate-200 rounded-lg hover:bg-slate-50"><Edit3 size={12} /></button>
                  <button onClick={() => duplicateTemplate(tpl)} className="text-[11px] px-2 py-1 border border-slate-200 rounded-lg hover:bg-slate-50"><Copy size={12} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section 2 & 3 - Issued Badges + Badge Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Issued Badges</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {badges.map(b => (
              <div key={b.id} onClick={() => setSelectedId(b.id)} className={`border rounded-xl p-3 cursor-pointer hover:shadow-sm transition ${selectedId === b.id ? "border-blue-300 ring-1 ring-blue-200" : "border-slate-200"}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-8 h-8 rounded-full ${b.color} text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0`}>{b.initials}</span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">{b.visitorName}</div>
                      <div className="text-[11px] text-slate-400 font-mono">#{b.badgeNumber}</div>
                    </div>
                  </div>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot(b.status)}`} />
                </div>
                <div className="text-xs text-slate-500 mt-2">{b.templateName}</div>
                <div className="text-[11px] text-slate-400">Issued {new Date(b.issueTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                <div className="flex items-center justify-between mt-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusColor(b.status)}`}>{b.status}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={e => { e.stopPropagation(); setSelectedId(b.id); }} className="p-1 text-slate-400 hover:text-blue-600" title="View"><Eye size={13} /></button>
                    <button onClick={e => { e.stopPropagation(); reprintBadge(b); }} className="p-1 text-slate-400 hover:text-blue-600" title="Reprint"><RotateCcw size={13} /></button>
                    <button onClick={e => { e.stopPropagation(); deactivateBadge(b); }} disabled={b.status === "Returned"} className="p-1 text-slate-400 hover:text-red-500 disabled:opacity-30" title="Deactivate"><Power size={13} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Badge Preview */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Badge Preview</h2>
          <div className={`rounded-xl p-5 text-white text-center bg-gradient-to-br ${templates.find(t => t.name === selected.templateName)?.accent || "from-blue-500 to-indigo-600"}`}>
            <div className="text-[10px] uppercase tracking-wide opacity-80 flex items-center justify-center gap-1"><Building2 size={11} /> Acme Corp</div>
            <div className="w-14 h-14 rounded-full bg-white/20 mx-auto mt-3 flex items-center justify-center text-lg font-bold">{selected.initials}</div>
            <div className="text-base font-bold mt-2">{selected.visitorName}</div>
            <div className="text-xs opacity-80">{selected.company}</div>
            <div className="text-[11px] opacity-70 mt-1">Host: {selected.host}</div>
            <div className="text-[10px] opacity-70">{selected.visitorType}</div>
            <div className="w-16 h-16 bg-white/20 rounded-lg mx-auto mt-3 flex items-center justify-center"><QrCode size={32} /></div>
            <div className="text-[10px] opacity-70 mt-2 font-mono">Badge #{selected.badgeNumber}</div>
            <div className="text-[10px] opacity-70">Valid Until {new Date(selected.expiryTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
          </div>
          {selected.status === "Active" && (
            <div className={`mt-3 rounded-lg p-2 text-center text-xs font-medium ${selected.expiryTime - clock < 0 ? "bg-red-50 text-red-700" : selected.expiryTime - clock < 1000 * 60 * 15 ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>
              Valid For · {formatDuration(selected.expiryTime - clock)} {selected.expiryTime - clock >= 0 ? "Remaining" : ""}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button onClick={() => showToast(`Printing badge for ${selected.visitorName}`)} className="text-xs px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-1"><Printer size={13} /> Print</button>
            <button onClick={() => reprintBadge(selected)} className="text-xs px-3 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center justify-center gap-1"><RotateCcw size={13} /> Reprint</button>
            <button onClick={() => showToast(`Badge PDF downloaded for ${selected.visitorName}`)} className="text-xs px-3 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center justify-center gap-1"><FileText size={13} /> Download PDF</button>
            <button onClick={() => setShowEditLayout(true)} className="text-xs px-3 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center justify-center gap-1"><Sliders size={13} /> Edit Layout</button>
          </div>
        </div>
      </div>

      {/* Section 4 & 5 - Badge Activity + Return Tracker */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Badge Activity — #{selected.badgeNumber}</h2>
          <div className="space-y-0 max-h-[300px] overflow-y-auto pr-1">
            {selected.timeline.map((ev, idx) => (
              <div key={idx} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${idx === selected.timeline.length - 1 ? "bg-blue-500" : "bg-slate-300"}`} />
                  {idx < selected.timeline.length - 1 && <div className="w-0.5 flex-1 bg-slate-200 my-0.5" style={{ minHeight: "20px" }} />}
                </div>
                <div className="pb-4">
                  <div className="text-xs font-semibold text-slate-500">{ev.time}</div>
                  <div className="text-sm text-slate-800">{ev.action}</div>
                  <div className="text-xs text-slate-400">{ev.staff}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Return Tracker</h2>
            <span className="text-xs text-slate-400">{outstanding.length} outstanding</span>
          </div>
          {outstanding.length === 0 ? (
            <div className="text-sm text-slate-400 text-center py-8">All badges accounted for.</div>
          ) : (
            <div className="space-y-2.5">
              {outstanding.map(b => {
                const remaining = b.expiryTime - clock;
                const overdue = remaining < 0;
                return (
                  <div key={b.id} className={`border rounded-xl p-3 ${overdue ? "border-red-200 bg-red-50/40" : remaining < 1000 * 60 * 15 ? "border-amber-200 bg-amber-50/40" : "border-slate-200"}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-900">{b.visitorName}</span>
                      <span className="text-xs font-mono text-slate-400">#{b.badgeNumber}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1.5 text-xs">
                      <span className="text-slate-500">Issued {new Date(b.issueTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      <span className={`font-medium ${overdue ? "text-red-600" : remaining < 1000 * 60 * 15 ? "text-amber-600" : "text-slate-500"}`}>{overdue ? <span className="flex items-center gap-1"><AlertTriangle size={11} /> {formatDuration(remaining)}</span> : `${formatDuration(remaining)} left`}</span>
                    </div>
                    <button onClick={() => setShowReturnBadge(b)} className="mt-2 text-[11px] px-2 py-1 border border-slate-200 rounded-lg hover:bg-white bg-white/60 w-full">Mark as Returned</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Section 6 - Print Queue + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Print Queue</h2>
          <div className="space-y-2.5">
            {printQueue.map(job => (
              <div key={job.id} className="border border-slate-200 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">{job.visitorName}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${printStatusColor(job.status)}`}>{job.status}</span>
                </div>
                <div className="text-xs text-slate-500 mt-1">{job.template} · {job.printer}</div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[11px] text-slate-400">ETA: {job.eta}</span>
                  <div className="flex items-center gap-1.5">
                    {job.status === "Failed" && <button onClick={() => retryPrintJob(job.id)} className="text-[11px] px-2 py-0.5 border border-slate-200 rounded-md hover:bg-slate-50 flex items-center gap-1"><Play size={10} /> Retry</button>}
                    {job.status === "Waiting" && <button onClick={() => prioritizePrintJob(job.id)} className="text-[11px] px-2 py-0.5 border border-slate-200 rounded-md hover:bg-slate-50">Prioritize</button>}
                    <button onClick={() => cancelPrintJob(job.id)} className="text-[11px] px-2 py-0.5 border border-slate-200 rounded-md hover:bg-red-50 hover:text-red-600 flex items-center gap-1"><XCircle size={10} /> Cancel</button>
                  </div>
                </div>
              </div>
            ))}
            {printQueue.length === 0 && <div className="text-sm text-slate-400 text-center py-6">No pending print jobs.</div>}
          </div>
        </div>

        <div className="space-y-6">
          {/* Printer Status Widget */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 mb-3">Printer Status</h2>
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><Printer size={18} /></span>
              <div>
                <div className="text-sm font-semibold text-slate-900 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Online</div>
                <div className="text-xs text-slate-400">Zebra ZD421 · Reception</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
              <div>
                <div className="flex items-center justify-between text-slate-500 mb-1"><span>Paper</span><span>75%</span></div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full"><div className="h-1.5 bg-emerald-500 rounded-full" style={{ width: "75%" }} /></div>
              </div>
              <div>
                <div className="flex items-center justify-between text-slate-500 mb-1"><span>Ribbon</span><span>Good</span></div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full"><div className="h-1.5 bg-emerald-500 rounded-full" style={{ width: "88%" }} /></div>
              </div>
            </div>
            <button onClick={() => setShowPrinterSettings(true)} className="mt-3 text-xs text-blue-600 hover:underline flex items-center gap-1"><Settings size={12} /> Printer Settings</button>
          </div>

          {/* Quick Actions */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Issue New Badge", icon: <Plus size={17} />, action: () => setShowIssueBadge(true) },
                { label: "Reprint Badge", icon: <RotateCcw size={17} />, action: () => reprintBadge(selected) },
                { label: "Return Badge", icon: <ShieldOff size={17} />, action: () => setShowReturnBadge(selected) },
                { label: "Create Template", icon: <Layers size={17} />, action: () => setShowCreateTemplate(true) },
                { label: "View Badge History", icon: <Clock size={17} />, action: () => setShowBadgeHistory(selected) },
                { label: "Printer Settings", icon: <Settings size={17} />, action: () => setShowPrinterSettings(true) },
              ].map(qa => (
                <button key={qa.label} onClick={qa.action} className="flex flex-col items-center gap-2 border border-slate-200 rounded-xl p-3 hover:bg-slate-50 transition text-center">
                  <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">{qa.icon}</div>
                  <span className="text-[11px] font-medium text-slate-700">{qa.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ---------- Modals ---------- */}
      {showIssueBadge && (
        <IssueBadgeModal templates={templates} onClose={() => setShowIssueBadge(false)} onSubmit={(data) => {
          const templateName = templates.find(t => t.id === data.templateId)?.name || "Standard Guest";
          void saveVisitorVisit({
            visitorName: data.name,
            company: data.company,
            hostName: data.host,
            hostEmployeeCode: data.hostCode,
            department: data.department,
            location: data.location,
            visitorType: data.visitorType,
            badgeStatus: "Active",
            badgeTemplate: templateName,
            status: "Checked In",
            checkInAt: new Date().toISOString(),
            visitDate: todayISO(),
            purpose: "Badge issued",
          }).then((saved) => {
            applySaved(saved);
            setSelectedId(saved.id);
            showToast(`Badge ${saved.badgeNumber || ""} issued for ${saved.visitorName}`);
          }).catch((error) => showToast(error instanceof Error ? error.message : "Unable to issue the badge."));
          setShowIssueBadge(false);
        }} />
      )}

      {showPrintBadge && (
        <PrintBadgeModal badges={badges} defaultId={selected.id} onClose={() => setShowPrintBadge(false)} onPrint={(b) => {
          queueJob({ id: `pq-${Date.now()}`, visitorName: b.visitorName, template: b.templateName, printer: "Zebra ZD421 (Reception)", status: "Waiting", eta: "~20 sec" });
          showToast(`Print job queued for ${b.visitorName}`);
          setShowPrintBadge(false);
        }} />
      )}

      {showCreateTemplate && (
        <CreateTemplateModal onClose={() => setShowCreateTemplate(false)} onSubmit={(name) => {
          void saveVisitorArtifact({ kind: "badge-template", name, payload: { visitorType: "Guest", accent: "from-blue-500 to-indigo-600" } })
            .then((saved) => { setArtifacts((prev) => [saved, ...prev]); setSelectedTemplateId(saved.id); showToast(`Template "${name}" created`); })
            .catch((error) => showToast(error instanceof Error ? error.message : "Unable to create the template."));
          setShowCreateTemplate(false);
        }} />
      )}

      {showExportLog && (
        <ExportLogModal onClose={() => setShowExportLog(false)} onExport={() => { showToast("Badge log exported"); setShowExportLog(false); }} />
      )}

      {showEditTemplate && (
        <EditTemplateModal template={showEditTemplate} onClose={() => setShowEditTemplate(null)} onSave={() => { showToast(`"${showEditTemplate.name}" updated`); setShowEditTemplate(null); }} />
      )}

      {showPrinterSettings && (
        <PrinterSettingsModal onClose={() => setShowPrinterSettings(false)} onSave={() => {
          void saveVisitorArtifact({ id: "printer-settings", kind: "printer-settings", name: "Printer settings", payload: { savedAt: new Date().toISOString() } })
            .then(() => showToast("Printer settings saved"))
            .catch((error) => showToast(error instanceof Error ? error.message : "Unable to save printer settings."));
          setShowPrinterSettings(false);
        }} />
      )}

      {showReturnBadge && (
        <ReturnBadgeModal badge={showReturnBadge} onClose={() => setShowReturnBadge(null)} onConfirm={() => markReturned(showReturnBadge)} />
      )}

      {showEditLayout && (
        <EditLayoutModal onClose={() => setShowEditLayout(false)} onSave={() => { showToast("Badge layout updated"); setShowEditLayout(false); }} />
      )}

      {showBadgeHistory && (
        <BadgeHistoryModal badge={showBadgeHistory} onClose={() => setShowBadgeHistory(null)} />
      )}
    </div>
  );
}

// ---------- Modal: Issue Badge ----------
function IssueBadgeModal({ templates, onClose, onSubmit }: { templates: BadgeTemplate[]; onClose: () => void; onSubmit: (data: { name: string; company: string; host: string; hostCode?: string; department?: string; location?: string; visitorType: string; templateId: string }) => void }) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [host, setHost] = useState("");
  const [hostCode, setHostCode] = useState("");
  const [department, setDepartment] = useState("");
  const [location, setLocation] = useState("");
  const [visitorType, setVisitorType] = useState("Guest");
  const [templateId, setTemplateId] = useState(templates[0]?.id || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({ name, company, host, hostCode, department, location, visitorType, templateId });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><Plus size={18} className="text-blue-600" /> Issue Badge</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Visitor Name</label>
            <input required value={name} onChange={e => setName(e.target.value)} placeholder="Full name" className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Company</label>
            <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Company name" className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm" />
          </div>
          <EmployeeHostField label="Host" value={host} onPick={(employee, typed) => { setHost(typed); setHostCode(employee?.code || ""); setDepartment(employee?.department || ""); setLocation(employee?.location || ""); }} />
          <div>
            <label className="text-sm font-medium text-slate-700">Template</label>
            <select value={templateId} onChange={e => setTemplateId(e.target.value)} className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm">
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700">Issue Badge</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Modal: Print Badge ----------
function PrintBadgeModal({ badges, defaultId, onClose, onPrint }: { badges: IssuedBadge[]; defaultId: string; onClose: () => void; onPrint: (b: IssuedBadge) => void }) {
  const [id, setId] = useState(defaultId);
  const b = badges.find(x => x.id === id) || badges[0];
  if (!b) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><Printer size={18} className="text-blue-600" /> Print Badge</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <select value={id} onChange={e => setId(e.target.value)} className="w-full mb-3 border border-slate-200 rounded-xl px-3 py-2 text-sm">
          {badges.map(bi => <option key={bi.id} value={bi.id}>{bi.visitorName} — #{bi.badgeNumber}</option>)}
        </select>
        <button onClick={() => onPrint(b)} className="w-full px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700">Send to Printer</button>
      </div>
    </div>
  );
}

// ---------- Modal: Create Template ----------
function CreateTemplateModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (name: string) => void }) {
  const [name, setName] = useState("");
  const [visitorType, setVisitorType] = useState("Guest");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><Layers size={18} className="text-blue-600" /> Create Template</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); if (name.trim()) onSubmit(name); }} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Template Name</label>
            <input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Board Member Pass" className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Visitor Type</label>
            <select value={visitorType} onChange={e => setVisitorType(e.target.value)} className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm">
              <option>Guest</option><option>Vendor</option><option>Contractor</option><option>VIP</option><option>Interview</option><option>Delivery</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700">Create</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Modal: Export Log ----------
function ExportLogModal({ onClose, onExport }: { onClose: () => void; onExport: () => void }) {
  const [range, setRange] = useState("Today");
  const [format, setFormat] = useState("CSV");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Export Badge Log</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Range</label>
            <select value={range} onChange={e => setRange(e.target.value)} className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm">
              <option>Today</option><option>This Week</option><option>This Month</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Format</label>
            <select value={format} onChange={e => setFormat(e.target.value)} className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm">
              <option>CSV</option><option>PDF</option><option>Excel</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Cancel</button>
            <button type="button" onClick={onExport} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700">Export</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Modal: Edit Template ----------
function EditTemplateModal({ template, onClose, onSave }: { template: BadgeTemplate; onClose: () => void; onSave: () => void }) {
  const [name, setName] = useState(template.name);
  const [visitorType, setVisitorType] = useState(template.visitorType);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><Edit3 size={18} className="text-blue-600" /> Edit Template</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Template Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Visitor Type</label>
            <select value={visitorType} onChange={e => setVisitorType(e.target.value)} className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm">
              <option>Guest</option><option>Vendor</option><option>Contractor</option><option>VIP</option><option>Interview</option><option>Delivery</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Cancel</button>
            <button type="button" onClick={onSave} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700">Save Changes</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Modal: Printer Settings ----------
function PrinterSettingsModal({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const [printer, setPrinter] = useState("Zebra ZD421 (Reception)");
  const [quality, setQuality] = useState("High");
  const [autoPrint, setAutoPrint] = useState(true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Printer Settings</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Default Printer</label>
            <select value={printer} onChange={e => setPrinter(e.target.value)} className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm">
              <option>Zebra ZD421 (Reception)</option><option>HID FARGO (Lobby)</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Print Quality</label>
            <select value={quality} onChange={e => setQuality(e.target.value)} className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm">
              <option>Draft</option><option>Standard</option><option>High</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={autoPrint} onChange={e => setAutoPrint(e.target.checked)} className="rounded border-slate-300" />
            Automatically print badge upon check-in
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Cancel</button>
            <button type="button" onClick={onSave} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700">Save Settings</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Modal: Return Badge ----------
function ReturnBadgeModal({ badge, onClose, onConfirm }: { badge: IssuedBadge; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Return Badge</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <p className="text-sm text-slate-500">Confirm badge <strong>#{badge.badgeNumber}</strong> ({badge.visitorName}) has been returned to reception.</p>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 rounded-xl text-sm">Cancel</button>
          <button onClick={onConfirm} className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm hover:bg-emerald-700">Confirm Return</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Modal: Edit Layout ----------
function EditLayoutModal({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const [showQr, setShowQr] = useState(true);
  const [showCompanyLogo, setShowCompanyLogo] = useState(true);
  const [showHost, setShowHost] = useState(true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><Sliders size={18} className="text-blue-600" /> Edit Layout</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={showQr} onChange={e => setShowQr(e.target.checked)} className="rounded border-slate-300" /> Show QR Code</label>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={showCompanyLogo} onChange={e => setShowCompanyLogo(e.target.checked)} className="rounded border-slate-300" /> Show Company Logo</label>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={showHost} onChange={e => setShowHost(e.target.checked)} className="rounded border-slate-300" /> Show Host Name</label>
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Cancel</button>
          <button onClick={onSave} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700">Save Layout</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Modal: Badge History ----------
function BadgeHistoryModal({ badge, onClose }: { badge: IssuedBadge; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Badge History — #{badge.badgeNumber}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {badge.timeline.map((ev, idx) => (
            <div key={idx} className="border border-slate-100 rounded-xl p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-800">{ev.action}</span>
                <span className="text-xs text-slate-400">{ev.time}</span>
              </div>
              <div className="text-xs text-slate-400">{ev.staff}</div>
            </div>
          ))}
        </div>
        <div className="flex justify-end pt-4">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Close</button>
        </div>
      </div>
    </div>
  );
}