"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Ban,
  Building2,
  Car,
  CheckCircle2,
  Clock,
  Download,
  IdCard,
  LogIn,
  LogOut,
  Package,
  Phone,
  Radio,
  ScanLine,
  Search,
  Shield,
  ShieldCheck,
  Siren,
  UserPlus,
  Users,
  X,
  XCircle,
} from "lucide-react";

// ---------- types ----------
type Stage =
  | "Pending Security Check-in"
  | "Pending Reception Check-in"
  | "Checked In"
  | "Pending Reception Check-out"
  | "Pending Security Check-out"
  | "Completed"
  | "Rejected";

interface TimelineEvent {
  time: string;
  actor: string;
  action: string;
}

interface Visit {
  id: string;
  visitorName: string;
  initials: string;
  color: string;
  company: string;
  host: string;
  purpose: string;
  visitTime: string;
  idType: string;
  idNumber: string;
  itemsCarried: string;
  vehicleRegistered: string | null;
  idVerified: boolean;
  stage: Stage;
  timeline: TimelineEvent[];
}

type StatDetail = {
  title: string;
  items: Visit[];
  emptyMessage: string;
};

// ---------- mock data ----------
const initialVisits: Visit[] = [
  {
    id: "REQ-3302", visitorName: "Mary Johnson", initials: "MJ", color: "bg-emerald-500", company: "Google", host: "Sarah Johnson", purpose: "Software Demo", visitTime: "10:30 AM",
    idType: "International Passport", idNumber: "P0091823", itemsCarried: "Demo equipment", vehicleRegistered: null, idVerified: false, stage: "Pending Security Check-in",
    timeline: [{ time: "09:10", actor: "Requester", action: "Visitor request submitted" }],
  },
  {
    id: "REQ-3303", visitorName: "Tunde Bakare", initials: "TB", color: "bg-blue-500", company: "Zenith Freight", host: "James Okafor", purpose: "Interview — Operations", visitTime: "11:15 AM",
    idType: "National ID", idNumber: "N-40218Y", itemsCarried: "Resume documents", vehicleRegistered: null, idVerified: false, stage: "Pending Security Check-in",
    timeline: [{ time: "10:40", actor: "Requester", action: "Visitor request submitted" }],
  },
  {
    id: "REQ-3299", visitorName: "Bola Adeyemi", initials: "BA", color: "bg-indigo-500", company: "Coral Partners", host: "Sarah Johnson (HR)", purpose: "Contract Signing", visitTime: "1:00 PM",
    idType: "International Passport", idNumber: "P0119873", itemsCarried: "Contract documents", vehicleRegistered: "SUV · ABJ-901-KL", idVerified: false, stage: "Pending Security Check-in",
    timeline: [{ time: "12:30", actor: "Requester", action: "Visitor request submitted" }],
  },
  {
    id: "REQ-3296", visitorName: "Grace Lee", initials: "GL", color: "bg-blue-500", company: "Nimbus Consulting", host: "Emily Carter", purpose: "Follow-up Session", visitTime: "10:30 AM",
    idType: "Driver's License", idNumber: "DL-660219", itemsCarried: "None", vehicleRegistered: null, idVerified: true, stage: "Pending Security Check-out",
    timeline: [
      { time: "09:55", actor: "Requester", action: "Visitor request submitted" },
      { time: "10:05", actor: "Security", action: "ID verified — cleared to reception" },
      { time: "10:15", actor: "Reception", action: "Badge issued — checked in" },
      { time: "11:20", actor: "Reception", action: "Checked out — badge collected" },
    ],
  },
  {
    id: "REQ-3300", visitorName: "Ifeoma Nwosu", initials: "IN", color: "bg-emerald-500", company: "BluePeak Analytics", host: "Michael Adams", purpose: "Software Demo", visitTime: "09:30 AM",
    idType: "National ID", idNumber: "N-77213X", itemsCarried: "Laptop", vehicleRegistered: null, idVerified: true, stage: "Pending Security Check-out",
    timeline: [
      { time: "09:00", actor: "Requester", action: "Visitor request submitted" },
      { time: "09:10", actor: "Security", action: "ID verified — cleared to reception" },
      { time: "09:18", actor: "Reception", action: "Badge issued — checked in" },
      { time: "10:05", actor: "Reception", action: "Checked out — badge collected" },
    ],
  },
];

// ---------- utility ----------
const stageColor = (stage: Stage) =>
  stage === "Completed" ? "bg-emerald-50 text-emerald-700" :
  stage === "Rejected" ? "bg-red-50 text-red-700" :
  stage === "Checked In" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700";

const workflowStatus = (stage: Stage) => {
  switch (stage) {
    case "Pending Security Check-in":
      return {
        badge: "Entry Review",
        tone: "bg-amber-100 text-amber-700",
        title: "Awaiting identity verification",
        points: ["ID and access screening is in progress", "Reception handoff will happen after clearance"],
        cta: "Security can either clear the visitor or deny entry",
      };
    case "Pending Reception Check-in":
      return {
        badge: "Reception Handoff",
        tone: "bg-blue-100 text-blue-700",
        title: "Visitor cleared to front desk",
        points: ["Reception will issue a badge and welcome the visitor", "The requester can see that the visit is progressing"],
        cta: "This handoff is ready for reception to complete",
      };
    case "Pending Reception Check-out":
      return {
        badge: "Departure Review",
        tone: "bg-indigo-100 text-indigo-700",
        title: "Visitor has checked out at reception",
        points: ["Reception has completed departure", "Final exit clearance is still required at security"],
        cta: "Security is the last checkpoint before completion",
      };
    case "Pending Security Check-out":
      return {
        badge: "Final Exit",
        tone: "bg-slate-100 text-slate-700",
        title: "Awaiting exit confirmation",
        points: ["Security confirms the visitor has fully exited", "The requester will be notified once the visit closes"],
        cta: "Final clearance completes the visit record",
      };
    case "Completed":
      return {
        badge: "Completed",
        tone: "bg-emerald-100 text-emerald-700",
        title: "Visit fully closed",
        points: ["All handoffs are complete", "The activity log is ready for review"],
        cta: "The workflow is complete and archived",
      };
    default:
      return {
        badge: "Blocked",
        tone: "bg-red-100 text-red-700",
        title: "Entry has been denied",
        points: ["The visitor was not allowed to proceed", "The requester will see the reason in the record"],
        cta: "This case is now marked as an exception",
      };
  }
};

export default function SecurityDashboard() {
  const router = useRouter();
  const [visits, setVisits] = useState<Visit[]>(initialVisits);
  const [selectedId, setSelectedId] = useState<string>(initialVisits[0].id);
  const [searchQuery, setSearchQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [statDetail, setStatDetail] = useState<StatDetail | null>(null);
  const [activity, setActivity] = useState<{ id: string; text: string; time: string }[]>([
    { id: "a1", text: "Grace Lee checked out by Reception — awaiting exit clearance", time: "3 min ago" },
    { id: "a2", text: "Ifeoma Nwosu checked out by Reception — awaiting exit clearance", time: "20 min ago" },
  ]);

  const [showDenyEntry, setShowDenyEntry] = useState<Visit | null>(null);
  const [showScanId, setShowScanId] = useState(false);
  const [showCallBackup, setShowCallBackup] = useState(false);
  const [showEmergencyList, setShowEmergencyList] = useState(false);
  const [showExportLog, setShowExportLog] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  const logActivity = (text: string) => setActivity(prev => [{ id: `a-${Date.now()}`, text, time: "just now" }, ...prev]);

  const selected = visits.find(v => v.id === selectedId) || visits[0];

  const entryQueue = visits.filter(v => v.stage === "Pending Security Check-in");
  const exitQueue = visits.filter(v => v.stage === "Pending Security Check-out");
  const insideVisitors = visits.filter(v => v.stage === "Checked In" || v.stage === "Pending Reception Check-out" || v.stage === "Pending Security Check-out");
  const deniedToday = visits.filter(v => v.stage === "Rejected");
  const insideCount = insideVisitors.length;

  const filtered = useMemo(() => {
    const list = [...entryQueue, ...exitQueue];
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(v => v.visitorName.toLowerCase().includes(q) || v.company.toLowerCase().includes(q) || v.id.toLowerCase().includes(q));
  }, [visits, searchQuery]);

  const clearToReception = (id: string) => {
    const v = visits.find(x => x.id === id);
    if (!v) return;
    const time = new Date().toTimeString().slice(0, 5);
    setVisits(prev => prev.map(x => x.id === id ? { ...x, idVerified: true, stage: "Pending Reception Check-in", timeline: [...x.timeline, { time, actor: "Security", action: "ID verified — cleared to reception" }] } : x));
    showToast(`${v.visitorName} cleared to reception`);
    logActivity(`${v.visitorName} cleared to reception`);
  };

  const denyEntry = (id: string, reason: string) => {
    const v = visits.find(x => x.id === id);
    if (!v) return;
    const time = new Date().toTimeString().slice(0, 5);
    setVisits(prev => prev.map(x => x.id === id ? { ...x, stage: "Rejected", timeline: [...x.timeline, { time, actor: "Security", action: `Entry denied — ${reason}` }] } : x));
    showToast(`${v.visitorName}'s entry denied`);
    logActivity(`${v.visitorName}'s entry was denied — ${reason}`);
    setShowDenyEntry(null);
  };

  const clearExit = (id: string) => {
    const v = visits.find(x => x.id === id);
    if (!v) return;
    const time = new Date().toTimeString().slice(0, 5);
    setVisits(prev => prev.map(x => x.id === id ? { ...x, stage: "Completed", timeline: [...x.timeline, { time, actor: "Security", action: "Exit cleared — badge returned" }] } : x));
    showToast(`${v.visitorName}'s exit cleared — requester notified`);
    logActivity(`${v.visitorName}'s visit completed — requester notified`);
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
          <h1 className="text-2xl font-semibold text-slate-900">Security Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500 max-w-xl">Verify visitor identity at entry and confirm final exit clearance before a visit is marked complete.</p>
          <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
            <span className="flex items-center gap-1 text-emerald-600 font-medium"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Checkpoint Active</span>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => setShowScanId(true)} className="border border-slate-200 px-3 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"><ScanLine size={16} /> Scan ID</button>
          <button onClick={() => setShowCallBackup(true)} className="border border-slate-200 px-3 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"><Radio size={16} /> Call Backup</button>
          <button onClick={() => router.push("/security/visitor-management/visitor-registration")} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2"><UserPlus size={16} /> Register Visitor</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Awaiting Entry Check", value: entryQueue.length, icon: <LogIn size={20} />, gradient: "from-amber-500 to-orange-500", items: entryQueue, emptyMessage: "No visitors awaiting entry check." },
          { label: "Awaiting Exit Clearance", value: exitQueue.length, icon: <LogOut size={20} />, gradient: "from-indigo-500 to-purple-600", items: exitQueue, emptyMessage: "No visitors awaiting exit clearance." },
          { label: "Currently In Building", value: insideCount, icon: <Users size={20} />, gradient: "from-blue-500 to-indigo-600", items: insideVisitors, emptyMessage: "No visitors currently inside the building." },
          { label: "Denied Today", value: deniedToday.length, icon: <Ban size={20} />, gradient: "from-red-500 to-rose-600", items: deniedToday, emptyMessage: "No entry denials today." },
        ].map(tile => (
          <button key={tile.label} onClick={() => setStatDetail({ title: tile.label, items: tile.items, emptyMessage: tile.emptyMessage })} className={`text-left rounded-2xl p-4 text-white shadow-sm bg-gradient-to-br ${tile.gradient} hover:brightness-110 active:scale-[0.98] transition`}>
            <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center">{tile.icon}</div>
            <div className="mt-3 text-2xl font-bold">{tile.value}</div>
            <div className="text-[11px] text-white/80 mt-1">{tile.label}</div>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search by visitor name, company, or request ID..." className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm" />
        </div>
      </div>

      {/* Entry & Exit queues + detail */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900 mb-3 flex items-center gap-2"><LogIn size={16} className="text-amber-600" /> Awaiting Security Check-in</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {entryQueue.filter(v => filtered.includes(v)).map(v => (
                <button key={v.id} onClick={() => setSelectedId(v.id)} className={`w-full text-left flex items-center gap-3 border rounded-xl p-2.5 hover:bg-slate-50 transition ${selectedId === v.id ? "border-blue-300 ring-1 ring-blue-200" : "border-slate-200"}`}>
                  <span className={`w-8 h-8 rounded-full ${v.color} text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0`}>{v.initials}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-800 truncate">{v.visitorName}</div>
                    <div className="text-xs text-slate-400 truncate">{v.company} · {v.visitTime}</div>
                  </div>
                </button>
              ))}
              {entryQueue.length === 0 && <div className="text-sm text-slate-400 text-center py-6">No visitors awaiting entry.</div>}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900 mb-3 flex items-center gap-2"><LogOut size={16} className="text-indigo-600" /> Awaiting Security Check-out</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {exitQueue.filter(v => filtered.includes(v)).map(v => (
                <button key={v.id} onClick={() => setSelectedId(v.id)} className={`w-full text-left flex items-center gap-3 border rounded-xl p-2.5 hover:bg-slate-50 transition ${selectedId === v.id ? "border-blue-300 ring-1 ring-blue-200" : "border-slate-200"}`}>
                  <span className={`w-8 h-8 rounded-full ${v.color} text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0`}>{v.initials}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-800 truncate">{v.visitorName}</div>
                    <div className="text-xs text-slate-400 truncate">{v.company} · Checked out by reception</div>
                  </div>
                </button>
              ))}
              {exitQueue.length === 0 && <div className="text-sm text-slate-400 text-center py-6">No visitors awaiting exit clearance.</div>}
            </div>
          </div>
        </div>

        {/* Detail */}
        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <span className={`w-14 h-14 rounded-full ${selected.color} text-white flex items-center justify-center text-lg font-bold flex-shrink-0`}>{selected.initials}</span>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{selected.visitorName}</h2>
                <div className="text-xs text-slate-500">{selected.company} · {selected.id}</div>
              </div>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${stageColor(selected.stage)}`}>{selected.stage}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4 text-sm">
            <div><div className="text-xs text-slate-400 flex items-center gap-1"><Building2 size={11} /> Host</div><div className="font-medium">{selected.host}</div></div>
            <div><div className="text-xs text-slate-400 flex items-center gap-1"><Clock size={11} /> Time</div><div className="font-medium">{selected.visitTime}</div></div>
            <div className="sm:col-span-1"><div className="text-xs text-slate-400">Purpose</div><div className="font-medium">{selected.purpose}</div></div>
          </div>

          {(() => {
            const workflow = workflowStatus(selected.stage);
            return (
              <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Workflow handoff</div>
                    <div className="text-sm font-semibold text-slate-800">{workflow.title}</div>
                  </div>
                  <span className={`text-[10px] px-2 py-1 rounded-full ${workflow.tone}`}>{workflow.badge}</span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {workflow.points.map((point, idx) => (
                    <div key={idx} className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-600">{point}</div>
                  ))}
                </div>
                <div className="mt-3 text-xs text-slate-500">{workflow.cta}</div>
              </div>
            );
          })()}

          <div className="mb-4">
            <h3 className="text-xs font-semibold text-slate-600 uppercase mb-1.5">Identity & Security Check</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className={`border rounded-lg p-2 flex items-center gap-1.5 ${selected.idVerified ? "border-emerald-100 bg-emerald-50/50 text-emerald-700" : "border-slate-100 text-slate-400"}`}>
                <ShieldCheck size={13} /> ID {selected.idVerified ? "Verified" : "Pending"}
              </div>
              <div className="border border-slate-100 rounded-lg p-2 flex items-center gap-1.5 text-slate-600">
                <IdCard size={13} /> {selected.idType} · {selected.idNumber}
              </div>
              <div className="border border-slate-100 rounded-lg p-2 flex items-center gap-1.5 text-slate-600">
                <Package size={13} /> {selected.itemsCarried}
              </div>
              <div className={`border rounded-lg p-2 flex items-center gap-1.5 ${selected.vehicleRegistered ? "border-indigo-100 bg-indigo-50/50 text-indigo-700" : "border-slate-100 text-slate-400"}`}>
                <Car size={13} /> {selected.vehicleRegistered || "No Vehicle"}
              </div>
            </div>
          </div>

          <div className="mb-5">
            <h3 className="text-xs font-semibold text-slate-600 uppercase mb-1.5">Timeline</h3>
            <div className="space-y-0">
              {selected.timeline.map((ev, idx) => (
                <div key={idx} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${idx === selected.timeline.length - 1 ? "bg-blue-500" : "bg-slate-300"}`} />
                    {idx < selected.timeline.length - 1 && <div className="w-0.5 flex-1 bg-slate-200 my-0.5" style={{ minHeight: "18px" }} />}
                  </div>
                  <div className="pb-3">
                    <div className="text-xs font-semibold text-slate-500">{ev.time} · {ev.actor}</div>
                    <div className="text-sm text-slate-800">{ev.action}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
            {selected.stage === "Pending Security Check-in" && (
              <>
                <button onClick={() => clearToReception(selected.id)} className="text-sm px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 flex items-center gap-1.5"><ShieldCheck size={15} /> Verify ID & Clear to Reception</button>
                <button onClick={() => setShowDenyEntry(selected)} className="text-sm px-4 py-2 border border-red-200 text-red-600 rounded-xl hover:bg-red-50 flex items-center gap-1.5"><XCircle size={15} /> Deny Entry</button>
              </>
            )}
            {selected.stage === "Pending Security Check-out" && (
              <button onClick={() => clearExit(selected.id)} className="text-sm px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 flex items-center gap-1.5"><LogOut size={15} /> Confirm Exit & Complete Visit</button>
            )}
            {(selected.stage === "Completed" || selected.stage === "Rejected" || selected.stage === "Checked In" || selected.stage === "Pending Reception Check-in" || selected.stage === "Pending Reception Check-out") && (
              <span className="text-xs text-slate-400">No security action required at this stage.</span>
            )}
          </div>
        </div>
      </div>

      {/* Security Log + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Security Activity Log</h2>
          <div className="space-y-2.5 max-h-64 overflow-y-auto">
            {activity.map(a => (
              <div key={a.id} className="flex items-start gap-2.5 text-sm border border-slate-100 rounded-xl p-2.5">
                <Shield size={14} className="text-slate-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-slate-700">{a.text}</p>
                  <div className="text-xs text-slate-400 mt-0.5">{a.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Scan ID / QR", icon: <ScanLine size={18} />, action: () => setShowScanId(true) },
              { label: "Register Visitor", icon: <UserPlus size={18} />, action: () => router.push("/security/visitor-management/visitor-registration") },
              { label: "Call Backup", icon: <Radio size={18} />, action: () => setShowCallBackup(true) },
              { label: "Emergency Roster", icon: <AlertTriangle size={18} />, action: () => setShowEmergencyList(true) },
              { label: "Export Security Log", icon: <Download size={18} />, action: () => setShowExportLog(true) },
              { label: "Raise Alert", icon: <Siren size={18} />, action: () => showToast("Security alert raised") },
            ].map(qa => (
              <button key={qa.label} onClick={qa.action} className="flex flex-col items-center gap-2 border border-slate-200 rounded-xl p-3 hover:bg-slate-50 transition text-center">
                <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">{qa.icon}</div>
                <span className="text-[11px] font-medium text-slate-700">{qa.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ---------- Modals ---------- */}
      {showDenyEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <DenyEntryModal visitor={showDenyEntry} onClose={() => setShowDenyEntry(null)} onConfirm={(reason) => denyEntry(showDenyEntry.id, reason)} />
        </div>
      )}

      {showScanId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><ScanLine size={18} className="text-blue-600" /> Scan ID</h3>
              <button onClick={() => setShowScanId(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="border-2 border-dashed border-slate-200 rounded-2xl p-10 flex flex-col items-center justify-center gap-3">
              <IdCard size={40} className="text-slate-300" />
              <p className="text-xs text-slate-500">Position ID or QR code within the frame</p>
            </div>
            <button onClick={() => { showToast("ID scanned and matched to request"); setShowScanId(false); }} className="mt-4 w-full px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700">Simulate Scan</button>
          </div>
        </div>
      )}

      {showCallBackup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Call Backup</h3>
              <button onClick={() => setShowCallBackup(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="flex items-center justify-center gap-2 text-blue-600 py-6">
              <Phone size={18} className="animate-pulse" /> <span className="text-sm">Dialing backup security officer...</span>
            </div>
            <button onClick={() => { showToast("Backup officer notified"); setShowCallBackup(false); }} className="w-full px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700">Confirm Call</button>
          </div>
        </div>
      )}

      {showEmergencyList && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><AlertTriangle size={18} className="text-red-600" /> Emergency Roster</h3>
              <button onClick={() => setShowEmergencyList(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <p className="text-xs text-slate-500 mb-3">All visitors currently inside the building.</p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {visits.filter(v => v.stage === "Checked In" || v.stage === "Pending Reception Check-out" || v.stage === "Pending Security Check-out").map(v => (
                <div key={v.id} className="flex items-center justify-between border border-red-100 bg-red-50/30 rounded-xl p-2.5">
                  <div>
                    <div className="text-sm font-medium text-slate-800">{v.visitorName}</div>
                    <div className="text-xs text-slate-400">{v.company} · Host: {v.host}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-4">
              <button onClick={() => setShowEmergencyList(false)} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Close</button>
            </div>
          </div>
        </div>
      )}

      {showExportLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Export Security Log</h3>
              <button onClick={() => setShowExportLog(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <select className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm mb-4">
              <option>Today</option><option>This Week</option><option>This Month</option>
            </select>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowExportLog(false)} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Cancel</button>
              <button onClick={() => { showToast("Security log exported"); setShowExportLog(false); }} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700">Export</button>
            </div>
          </div>
        </div>
      )}

      {statDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-slate-900">{statDetail.title}</h3>
              <button onClick={() => setStatDetail(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {statDetail.items.length === 0 ? (
                <div className="text-sm text-slate-400 text-center py-6">{statDetail.emptyMessage}</div>
              ) : (
                statDetail.items.map(item => (
                  <button key={item.id} onClick={() => { setSelectedId(item.id); setStatDetail(null); }} className="w-full text-left border border-slate-200 rounded-xl p-3 hover:bg-slate-50 transition">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{item.visitorName}</div>
                        <div className="text-xs text-slate-500">{item.company} · {item.id}</div>
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${stageColor(item.stage)}`}>{item.stage}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Modal: Deny Entry ----------
function DenyEntryModal({ visitor, onClose, onConfirm }: { visitor: Visit; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><XCircle size={18} className="text-red-600" /> Deny Entry</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
      </div>
      <p className="text-sm text-slate-500 mb-3">Denying entry for <strong>{visitor.visitorName}</strong>. Please provide a reason — the requester will be notified.</p>
      <form onSubmit={e => { e.preventDefault(); if (reason.trim()) onConfirm(reason); }} className="space-y-4">
        <textarea required value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Reason for denial (required)" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Cancel</button>
          <button type="submit" className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm hover:bg-red-700">Deny Entry</button>
        </div>
      </form>
    </div>
  );
}