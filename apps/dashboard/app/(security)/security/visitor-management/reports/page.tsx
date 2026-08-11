"use client";

import React, { useState, useMemo } from "react";
import {
  BarChart3,
  Building2,
  Calendar,
  Car,
  CheckCircle2,
  Cloud,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  Mail,
  Maximize2,
  Pause,
  Play,
  Printer,
  Repeat,
  Search,
  Share2,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  X,
  ZoomIn,
  ZoomOut,
  Edit3,
} from "lucide-react";

// ---------- types ----------
interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  estTime: string;
  favorite: boolean;
}

interface ScheduledReport {
  id: string;
  name: string;
  cadence: string;
  time: string;
  recipients: string[];
  status: "Active" | "Paused";
}

interface RecentReport {
  id: string;
  name: string;
  generatedBy: string;
  date: string;
  format: string;
  size: string;
  status: "Ready" | "Processing" | "Failed";
}

// ---------- mock data ----------
const initialTemplates: ReportTemplate[] = [
  { id: "t1", name: "Daily Visitor Summary", description: "A concise overview of all visitor activity for a single day.", icon: <BarChart3 size={20} />, estTime: "~10 sec", favorite: true },
  { id: "t2", name: "Visitor Attendance Report", description: "Track total attendance across a custom date range.", icon: <Users size={20} />, estTime: "~15 sec", favorite: false },
  { id: "t3", name: "Department Visits", description: "Breakdown of visits by host department.", icon: <Building2 size={20} />, estTime: "~12 sec", favorite: false },
  { id: "t4", name: "Security Audit Report", description: "ID verification, badge issuance, and access compliance log.", icon: <ShieldCheck size={20} />, estTime: "~20 sec", favorite: true },
  { id: "t5", name: "Frequent Visitors", description: "Visitors with the highest visit counts over time.", icon: <Star size={20} />, estTime: "~10 sec", favorite: false },
  { id: "t6", name: "Check-in/Check-out Report", description: "Detailed arrival and departure timestamps for all visits.", icon: <Calendar size={20} />, estTime: "~14 sec", favorite: false },
  { id: "t7", name: "Visitor Trends", description: "Traffic patterns and volume trends over time.", icon: <TrendingUp size={20} />, estTime: "~18 sec", favorite: false },
  { id: "t8", name: "Vehicle Entry Report", description: "All vehicles registered and parked during visits.", icon: <Car size={20} />, estTime: "~10 sec", favorite: false },
];

const visitorTypes = ["Guest", "Vendor", "Contractor", "Interview Candidate", "Delivery", "VIP"];
const departments = ["All Departments", "Finance", "HR", "Procurement", "Operations", "Platform Engineering", "Consulting Relations"];
const hostOptions = ["Sarah Johnson", "David Wilson", "Emily Carter", "Michael Adams", "James Okafor", "Finance Team"];
const statusFilters = ["Checked In", "Checked Out", "Pending", "Rejected"];
const outputFormats = ["PDF", "Excel", "CSV"];

const initialScheduled: ScheduledReport[] = [
  { id: "sc-1", name: "Weekly Visitor Summary", cadence: "Every Monday", time: "08:00 AM", recipients: ["HR", "Security"], status: "Active" },
  { id: "sc-2", name: "Monthly Security Audit", cadence: "1st of Every Month", time: "09:00 AM", recipients: ["Facilities Manager"], status: "Active" },
  { id: "sc-3", name: "Executive Monthly Report", cadence: "Last Friday of Month", time: "05:00 PM", recipients: ["Management"], status: "Paused" },
];

const initialRecent: RecentReport[] = [
  { id: "rr-1", name: "Daily Visitor Summary — Jul 16", generatedBy: "Sarah Johnson", date: "Today, 08:02 AM", format: "PDF", size: "1.2 MB", status: "Ready" },
  { id: "rr-2", name: "Security Audit Report — Q2 2026", generatedBy: "Security Team", date: "Yesterday", format: "Excel", size: "3.8 MB", status: "Ready" },
  { id: "rr-3", name: "Department Visits — Jun 2026", generatedBy: "Facilities Manager", date: "3 days ago", format: "CSV", size: "640 KB", status: "Ready" },
  { id: "rr-4", name: "Frequent Visitors — H1 2026", generatedBy: "Sarah Johnson", date: "5 days ago", format: "PDF", size: "980 KB", status: "Processing" },
];

const savedFilterSets = ["Weekly Reception Report", "Executive Monthly Report", "Vendor Visits"];

const exportCards = [
  { id: "ex-1", label: "PDF Report", icon: <FileText size={20} />, sizeEst: "~1.4 MB", timeEst: "~8 sec" },
  { id: "ex-2", label: "Excel Workbook", icon: <FileSpreadsheet size={20} />, sizeEst: "~2.1 MB", timeEst: "~10 sec" },
  { id: "ex-3", label: "CSV Dataset", icon: <FileText size={20} />, sizeEst: "~620 KB", timeEst: "~5 sec" },
  { id: "ex-4", label: "Email Report", icon: <Mail size={20} />, sizeEst: "Sent as attachment", timeEst: "Instant" },
  { id: "ex-5", label: "Cloud Storage", icon: <Cloud size={20} />, sizeEst: "Synced to Drive", timeEst: "~6 sec" },
];

// ---------- utility ----------
const statusColor = (status: string) =>
  status === "Ready" || status === "Active" ? "bg-emerald-50 text-emerald-700" :
  status === "Processing" || status === "Paused" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700";

// ---------- component ----------
export default function VisitorReportsPage() {
  const [templates, setTemplates] = useState<ReportTemplate[]>(initialTemplates);
  const [scheduled, setScheduled] = useState<ScheduledReport[]>(initialScheduled);
  const [recentReports, setRecentReports] = useState<RecentReport[]>(initialRecent);
  const [toast, setToast] = useState<string | null>(null);

  // report builder state
  const [reportType, setReportType] = useState(initialTemplates[0].name);
  const [dateRange, setDateRange] = useState("Last 7 Days");
  const [selectedVisitorTypes, setSelectedVisitorTypes] = useState<string[]>(["Guest", "Vendor"]);
  const [department, setDepartment] = useState("All Departments");
  const [hostSearch, setHostSearch] = useState("");
  const [selectedHost, setSelectedHost] = useState("");
  const [statusChecks, setStatusChecks] = useState<string[]>(["Checked In", "Checked Out"]);
  const [outputFormat, setOutputFormat] = useState("PDF");
  const [generatedReport, setGeneratedReport] = useState({ title: initialTemplates[0].name, generatedAt: "Not yet generated", page: 1 });
  const [zoom, setZoom] = useState(100);

  const [showCreateReport, setShowCreateReport] = useState(false);
  const [showScheduleReport, setShowScheduleReport] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showFullscreenPreview, setShowFullscreenPreview] = useState(false);
  const [editSchedule, setEditSchedule] = useState<ScheduledReport | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  const toggleFavorite = (id: string) => setTemplates(prev => prev.map(t => t.id === id ? { ...t, favorite: !t.favorite } : t));

  const toggleVisitorType = (t: string) => setSelectedVisitorTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  const toggleStatusFilter = (s: string) => setStatusChecks(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const hostSuggestions = useMemo(() => {
    if (!hostSearch) return [];
    return hostOptions.filter(h => h.toLowerCase().includes(hostSearch.toLowerCase()));
  }, [hostSearch]);

  const generateReport = () => {
    setGeneratedReport({ title: reportType, generatedAt: "Just now", page: 1 });
    showToast(`"${reportType}" generated — ${outputFormat} ready`);
    setRecentReports(prev => [{ id: `rr-${Date.now()}`, name: `${reportType} — ${dateRange}`, generatedBy: "You", date: "Just now", format: outputFormat, size: "1.1 MB", status: "Ready" }, ...prev]);
  };

  const useTemplate = (tpl: ReportTemplate) => {
    setReportType(tpl.name);
    showToast(`Loaded "${tpl.name}" into Report Builder`);
  };

  const toggleScheduleStatus = (id: string) => {
    setScheduled(prev => prev.map(s => s.id === id ? { ...s, status: s.status === "Active" ? "Paused" : "Active" } : s));
  };

  const runScheduleNow = (s: ScheduledReport) => {
    setRecentReports(prev => [{ id: `rr-${Date.now()}`, name: s.name, generatedBy: "Scheduled Run", date: "Just now", format: "PDF", size: "1.3 MB", status: "Ready" }, ...prev]);
    showToast(`"${s.name}" generated and sent to ${s.recipients.join(", ")}`);
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
          <h1 className="text-2xl font-semibold text-slate-900">Visitor Reports</h1>
          <p className="mt-1 text-sm text-slate-500 max-w-xl">Generate, customize, schedule, and export visitor reports for operational and compliance analysis.</p>
          <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><FileText size={12} /> Last Generated: {recentReports[0]?.date}</span>
            <span className="flex items-center gap-1"><BarChart3 size={12} /> {templates.length} Available Templates</span>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => setShowCreateReport(true)} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2"><FileText size={16} /> Create Report</button>
          <button onClick={() => setShowScheduleReport(true)} className="border border-slate-200 px-3 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"><Calendar size={16} /> Schedule Report</button>
          <button onClick={() => setShowExportModal(true)} className="border border-slate-200 px-3 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"><Download size={16} /> Export</button>
          <button onClick={() => setShowShareModal(true)} className="border border-slate-200 px-3 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"><Share2 size={16} /> Share</button>
        </div>
      </div>

      {/* Section 1 - Report Templates */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Report Templates</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {templates.map(tpl => (
            <div key={tpl.id} className="border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">{tpl.icon}</div>
                <button onClick={() => toggleFavorite(tpl.id)} className={tpl.favorite ? "text-amber-400" : "text-slate-300 hover:text-amber-400"}>
                  <Star size={16} fill={tpl.favorite ? "currentColor" : "none"} />
                </button>
              </div>
              <div className="text-sm font-semibold text-slate-900 mt-2">{tpl.name}</div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{tpl.description}</p>
              <div className="text-[11px] text-slate-400 mt-2">Est. generation: {tpl.estTime}</div>
              <div className="flex items-center gap-1.5 mt-3">
                <button onClick={() => { useTemplate(tpl); generateReport(); }} className="text-[11px] px-2 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex-1">Generate</button>
                <button onClick={() => useTemplate(tpl)} className="text-[11px] px-2 py-1 border border-slate-200 rounded-lg hover:bg-slate-50">Customize</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section 2 & 3 - Report Builder + Report Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Report Builder</h2>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Report Type</label>
              <select value={reportType} onChange={e => setReportType(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm">
                {templates.map(t => <option key={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Date Range</label>
              <select value={dateRange} onChange={e => setDateRange(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm">
                <option>Today</option><option>Last 7 Days</option><option>Last 30 Days</option><option>This Quarter</option><option>Custom Range</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1.5 block">Visitor Type</label>
              <div className="flex flex-wrap gap-1.5">
                {visitorTypes.map(t => (
                  <button key={t} type="button" onClick={() => toggleVisitorType(t)} className={`text-xs px-2.5 py-1 rounded-full border ${selectedVisitorTypes.includes(t) ? "bg-blue-600 border-blue-600 text-white" : "border-slate-200 text-slate-600"}`}>{t}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Department</label>
              <select value={department} onChange={e => setDepartment(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm">
                {departments.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div className="relative">
              <label className="text-xs font-medium text-slate-600 mb-1 block">Host</label>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={selectedHost || hostSearch}
                  onChange={e => { setHostSearch(e.target.value); setSelectedHost(""); }}
                  placeholder="Search host by name..."
                  className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-sm"
                />
              </div>
              {hostSuggestions.length > 0 && !selectedHost && (
                <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                  {hostSuggestions.map(h => (
                    <button key={h} type="button" onClick={() => { setSelectedHost(h); setHostSearch(""); }} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50">{h}</button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1.5 block">Status</label>
              <div className="grid grid-cols-2 gap-1.5">
                {statusFilters.map(s => (
                  <label key={s} className="flex items-center gap-2 text-xs text-slate-600">
                    <input type="checkbox" checked={statusChecks.includes(s)} onChange={() => toggleStatusFilter(s)} className="rounded border-slate-300" /> {s}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1.5 block">Output Format</label>
              <div className="flex gap-2">
                {outputFormats.map(f => (
                  <button key={f} type="button" onClick={() => setOutputFormat(f)} className={`flex-1 text-xs px-3 py-1.5 rounded-lg border ${outputFormat === f ? "bg-indigo-600 border-indigo-600 text-white" : "border-slate-200 text-slate-600"}`}>{f}</button>
                ))}
              </div>
            </div>
            <button onClick={generateReport} className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">Generate Report</button>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Report Preview</h2>
            <div className="flex items-center gap-1">
              <button onClick={() => setZoom(z => Math.max(60, z - 10))} className="p-1.5 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50"><ZoomOut size={13} /></button>
              <span className="text-xs text-slate-400 w-10 text-center">{zoom}%</span>
              <button onClick={() => setZoom(z => Math.min(140, z + 10))} className="p-1.5 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50"><ZoomIn size={13} /></button>
              <button onClick={() => showToast("Report downloaded")} className="p-1.5 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50"><Download size={13} /></button>
              <button onClick={() => showToast("Sending to printer...")} className="p-1.5 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50"><Printer size={13} /></button>
              <button onClick={() => setShowFullscreenPreview(true)} className="p-1.5 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50"><Maximize2 size={13} /></button>
            </div>
          </div>
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 overflow-auto" style={{ minHeight: 380 }}>
            <div style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top left", width: `${10000 / zoom}%` }}>
              <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
                <div className="text-xs text-slate-400">{dateRange} · Generated {generatedReport.generatedAt}</div>
                <h3 className="text-lg font-bold text-slate-900 mt-1">{generatedReport.title}</h3>
                <p className="text-xs text-slate-500 mt-1">Summary: {statusChecks.join(", ") || "All statuses"} · {selectedVisitorTypes.join(", ") || "All visitor types"} · {department}</p>
                <div className="flex items-end gap-1.5 h-16 mt-4">
                  {[40, 65, 52, 78, 90, 60, 45].map((v, i) => <div key={i} className="flex-1 bg-blue-500/70 rounded-t" style={{ height: `${v}%` }} />)}
                </div>
                <table className="w-full text-xs mt-4">
                  <thead className="text-slate-400 border-b border-slate-100">
                    <tr><th className="text-left py-1.5 font-medium">Visitor</th><th className="text-left py-1.5 font-medium">Host</th><th className="text-left py-1.5 font-medium">Date</th><th className="text-left py-1.5 font-medium">Status</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[["John Smith", "Sarah Johnson", "Jul 16", "Checked In"], ["Mary Johnson", "David Wilson", "Jul 16", "Checked In"], ["David Lee", "Emily Carter", "Jul 15", "Checked Out"]].map((row, i) => (
                      <tr key={i}>{row.map((cell, j) => <td key={j} className="py-1.5 text-slate-600">{cell}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between mt-2 text-xs text-slate-400">
            <span>Page {generatedReport.page} of 4</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setGeneratedReport(r => ({ ...r, page: Math.max(1, r.page - 1) }))} className="px-2 py-0.5 border border-slate-200 rounded">Prev</button>
              <button onClick={() => setGeneratedReport(r => ({ ...r, page: Math.min(4, r.page + 1) }))} className="px-2 py-0.5 border border-slate-200 rounded">Next</button>
            </div>
          </div>
        </div>
      </div>

      {/* Section 4 & 5 - Visitor Insights + Scheduled Reports */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900 mb-4">Visitor Insights</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Most Visited Department", value: "Finance" },
              { label: "Peak Visiting Day", value: "Tuesday" },
              { label: "Average Visit Duration", value: "1h 42m" },
              { label: "Top Host", value: "Sarah Johnson" },
              { label: "Repeat Visitor Rate", value: "38%" },
              { label: "Vendor Share of Visits", value: "42%" },
            ].map(card => (
              <div key={card.label} className="border border-slate-100 rounded-xl p-3">
                <div className="text-[11px] text-slate-400">{card.label}</div>
                <div className="text-sm font-bold text-slate-800 mt-0.5">{card.value}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 border border-purple-100 bg-purple-50/40 rounded-xl p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-700 mb-1"><Sparkles size={13} /> AI Summary</div>
            <ul className="text-xs text-slate-700 space-y-1 list-disc list-inside">
              <li>Visitor traffic increased by 18% compared to last month.</li>
              <li>Tuesdays remain the busiest visitor day.</li>
              <li>Vendor visits account for 42% of all registrations.</li>
              <li>The average check-in process takes 3 minutes.</li>
            </ul>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Scheduled Reports</h2>
          <div className="space-y-3">
            {scheduled.map(s => (
              <div key={s.id} className="border border-slate-200 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">{s.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusColor(s.status)}`}>{s.status}</span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                  <Repeat size={11} /> {s.cadence} · {s.time}
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {s.recipients.map(r => <span key={r} className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">{r}</span>)}
                </div>
                <div className="flex items-center gap-1.5 mt-2.5">
                  <button onClick={() => setEditSchedule(s)} className="text-[11px] px-2 py-1 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1"><Edit3 size={11} /> Edit</button>
                  <button onClick={() => toggleScheduleStatus(s.id)} className="text-[11px] px-2 py-1 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1">
                    {s.status === "Active" ? <><Pause size={11} /> Pause</> : <><Play size={11} /> Resume</>}
                  </button>
                  <button onClick={() => runScheduleNow(s)} className="text-[11px] px-2 py-1 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 flex items-center gap-1"><Play size={11} /> Run Now</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Section 6 & 7 - Export Center + Recent Reports */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Export Center</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {exportCards.map(ex => (
              <button key={ex.id} onClick={() => showToast(`Exporting as ${ex.label}...`)} className="border border-slate-200 rounded-xl p-3 hover:shadow-sm transition text-left">
                <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">{ex.icon}</div>
                <div className="text-sm font-semibold text-slate-900 mt-2">{ex.label}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{ex.sizeEst} · {ex.timeEst}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Recent Reports</h2>
          <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
            {recentReports.map(r => (
              <div key={r.id} className="border border-slate-100 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-900 truncate">{r.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${statusColor(r.status)}`}>{r.status}</span>
                </div>
                <div className="text-xs text-slate-400 mt-0.5">By {r.generatedBy} · {r.date}</div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[11px] text-slate-500">{r.format} · {r.size}</span>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => showToast(`Downloading "${r.name}"`)} className="p-1 text-slate-400 hover:text-blue-600" title="Download"><Download size={13} /></button>
                    <button onClick={() => showToast(`Share link copied for "${r.name}"`)} className="p-1 text-slate-400 hover:text-blue-600" title="Share"><Share2 size={13} /></button>
                    <button onClick={() => { setRecentReports(prev => [{ ...r, id: `rr-${Date.now()}`, name: `${r.name} (Copy)`, date: "Just now" }, ...prev]); showToast("Report duplicated"); }} className="p-1 text-slate-400 hover:text-blue-600" title="Duplicate"><Copy size={13} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ---------- Modals ---------- */}
      {showCreateReport && (
        <CreateReportModal templates={templates} onClose={() => setShowCreateReport(false)} onSubmit={(name) => { setReportType(name); generateReport(); setShowCreateReport(false); }} />
      )}

      {showScheduleReport && (
        <ScheduleReportModal templates={templates} onClose={() => setShowScheduleReport(false)} onSubmit={(data) => {
          setScheduled(prev => [{ id: `sc-${Date.now()}`, name: data.name, cadence: data.cadence, time: data.time, recipients: data.recipients, status: "Active" }, ...prev]);
          showToast(`"${data.name}" scheduled`);
          setShowScheduleReport(false);
        }} />
      )}

      {showExportModal && (
        <ExportModal onClose={() => setShowExportModal(false)} onExport={(format) => { showToast(`Report exported as ${format}`); setShowExportModal(false); }} />
      )}

      {showShareModal && (
        <ShareModal onClose={() => setShowShareModal(false)} onShare={(email) => { showToast(`Report shared with ${email}`); setShowShareModal(false); }} />
      )}

      {showFullscreenPreview && (
        <FullscreenPreviewModal report={generatedReport} onClose={() => setShowFullscreenPreview(false)} />
      )}

      {editSchedule && (
        <EditScheduleModal schedule={editSchedule} onClose={() => setEditSchedule(null)} onSave={(data) => {
          setScheduled(prev => prev.map(s => s.id === editSchedule.id ? { ...s, ...data } : s));
          showToast(`"${editSchedule.name}" updated`);
          setEditSchedule(null);
        }} />
      )}
    </div>
  );
}

// ---------- Modal: Create Report ----------
function CreateReportModal({ templates, onClose, onSubmit }: { templates: ReportTemplate[]; onClose: () => void; onSubmit: (name: string) => void }) {
  const [name, setName] = useState(templates[0]?.name || "");
  const [format, setFormat] = useState("PDF");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><FileText size={18} className="text-blue-600" /> Create Report</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Report Type</label>
            <select value={name} onChange={e => setName(e.target.value)} className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm">
              {templates.map(t => <option key={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Format</label>
            <select value={format} onChange={e => setFormat(e.target.value)} className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm">
              <option>PDF</option><option>Excel</option><option>CSV</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Cancel</button>
            <button type="button" onClick={() => onSubmit(name)} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700">Generate</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Modal: Schedule Report ----------
function ScheduleReportModal({ templates, onClose, onSubmit }: { templates: ReportTemplate[]; onClose: () => void; onSubmit: (data: { name: string; cadence: string; time: string; recipients: string[] }) => void }) {
  const [name, setName] = useState(templates[0]?.name || "");
  const [cadence, setCadence] = useState("Every Monday");
  const [time, setTime] = useState("08:00");
  const [recipients, setRecipients] = useState<string[]>(["HR"]);

  const toggleRecipient = (r: string) => setRecipients(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><Calendar size={18} className="text-blue-600" /> Schedule Report</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Report Type</label>
            <select value={name} onChange={e => setName(e.target.value)} className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm">
              {templates.map(t => <option key={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-700">Cadence</label>
              <select value={cadence} onChange={e => setCadence(e.target.value)} className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm">
                <option>Every Monday</option><option>Daily</option><option>1st of Every Month</option><option>Last Friday of Month</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Time</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">Recipients</label>
            <div className="flex flex-wrap gap-1.5">
              {["HR", "Security", "Facilities Manager", "Management"].map(r => (
                <button key={r} type="button" onClick={() => toggleRecipient(r)} className={`text-xs px-2.5 py-1 rounded-full border ${recipients.includes(r) ? "bg-blue-600 border-blue-600 text-white" : "border-slate-200 text-slate-600"}`}>{r}</button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Cancel</button>
            <button type="button" onClick={() => onSubmit({ name, cadence, time: time + (time < "12:00" ? " AM" : " PM"), recipients })} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700">Schedule</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Modal: Export ----------
function ExportModal({ onClose, onExport }: { onClose: () => void; onExport: (format: string) => void }) {
  const [format, setFormat] = useState("PDF");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Export Report</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <select value={format} onChange={e => setFormat(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm">
          <option>PDF</option><option>Excel</option><option>CSV</option>
        </select>
        <div className="flex justify-end gap-2 pt-4">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Cancel</button>
          <button onClick={() => onExport(format)} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700">Export</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Modal: Share ----------
function ShareModal({ onClose, onShare }: { onClose: () => void; onShare: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [access, setAccess] = useState("View Only");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Share Report</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); if (email.trim()) onShare(email); }} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Recipient Email</label>
            <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="colleague@company.com" className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Access</label>
            <select value={access} onChange={e => setAccess(e.target.value)} className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm">
              <option>View Only</option><option>Can Comment</option><option>Can Edit</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700">Share</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Modal: Fullscreen Preview ----------
function FullscreenPreviewModal({ report, onClose }: { report: { title: string; generatedAt: string; page: number }; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-6">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-8">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-semibold text-slate-900">{report.title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={22} /></button>
        </div>
        <p className="text-sm text-slate-500 mb-6">Generated {report.generatedAt}</p>
        <div className="flex items-end gap-2 h-32 mb-6">
          {[40, 65, 52, 78, 90, 60, 45, 70, 55].map((v, i) => <div key={i} className="flex-1 bg-blue-500/70 rounded-t" style={{ height: `${v}%` }} />)}
        </div>
        <table className="w-full text-sm">
          <thead className="text-slate-500 border-b border-slate-200">
            <tr><th className="text-left py-2 font-medium">Visitor</th><th className="text-left py-2 font-medium">Host</th><th className="text-left py-2 font-medium">Date</th><th className="text-left py-2 font-medium">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {[["John Smith", "Sarah Johnson", "Jul 16", "Checked In"], ["Mary Johnson", "David Wilson", "Jul 16", "Checked In"], ["David Lee", "Emily Carter", "Jul 15", "Checked Out"], ["Michael Ade", "David Wilson", "Jul 15", "Checked In"]].map((row, i) => (
              <tr key={i}>{row.map((cell, j) => <td key={j} className="py-2 text-slate-700">{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- Modal: Edit Schedule ----------
function EditScheduleModal({ schedule, onClose, onSave }: { schedule: ScheduledReport; onClose: () => void; onSave: (data: { cadence: string; time: string; recipients: string[] }) => void }) {
  const [cadence, setCadence] = useState(schedule.cadence);
  const [time, setTime] = useState(schedule.time);
  const [recipients, setRecipients] = useState<string[]>(schedule.recipients);

  const toggleRecipient = (r: string) => setRecipients(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Edit — {schedule.name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-700">Cadence</label>
              <select value={cadence} onChange={e => setCadence(e.target.value)} className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm">
                <option>Every Monday</option><option>Daily</option><option>1st of Every Month</option><option>Last Friday of Month</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Time</label>
              <input value={time} onChange={e => setTime(e.target.value)} className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">Recipients</label>
            <div className="flex flex-wrap gap-1.5">
              {["HR", "Security", "Facilities Manager", "Management"].map(r => (
                <button key={r} type="button" onClick={() => toggleRecipient(r)} className={`text-xs px-2.5 py-1 rounded-full border ${recipients.includes(r) ? "bg-blue-600 border-blue-600 text-white" : "border-slate-200 text-slate-600"}`}>{r}</button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Cancel</button>
            <button type="button" onClick={() => onSave({ cadence, time, recipients })} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}