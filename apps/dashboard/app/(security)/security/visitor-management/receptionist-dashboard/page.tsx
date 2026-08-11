"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Building2,
  CheckCircle2,
  Clock,
  IdCard,
  LogOut,
  MapPin,
  Package,
  Phone,
  Printer,
  QrCode,
  ScanLine,
  Search,
  ShieldCheck,
  Timer,
  UserPlus,
  Users,
  X,
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
  department: string;
  meetingRoom: string;
  purpose: string;
  visitTime: string;
  expectedDurationMin: number;
  badgeNumber: string | null;
  stage: Stage;
  checkInAt: number | null;
  timeline: TimelineEvent[];
}

type StatDetail = {
  title: string;
  items: Visit[];
  emptyMessage: string;
};

// ---------- mock data ----------
const now0 = Date.now();
const initialVisits: Visit[] = [
  {
    id: "REQ-3297", visitorName: "David Wilson's Guest — Amaka Obi", initials: "AO", color: "bg-blue-500", company: "Coastal Logistics", host: "David Wilson", department: "Procurement",
    meetingRoom: "Meeting Room 1", purpose: "Logistics Review", visitTime: "09:45 AM", expectedDurationMin: 45, badgeNumber: null, stage: "Pending Reception Check-in", checkInAt: null,
    timeline: [
      { time: "09:10", actor: "Requester", action: "Visitor request submitted" },
      { time: "09:20", actor: "Security", action: "ID verified — cleared to reception" },
    ],
  },
  {
    id: "REQ-3296", visitorName: "Grace Lee", initials: "GL", color: "bg-emerald-500", company: "Nimbus Consulting", host: "Emily Carter", department: "Consulting Relations",
    meetingRoom: "Meeting Room B", purpose: "Follow-up Session", visitTime: "10:30 AM", expectedDurationMin: 60, badgeNumber: "V-2044", stage: "Checked In", checkInAt: now0 - 1000 * 60 * 25,
    timeline: [
      { time: "09:55", actor: "Requester", action: "Visitor request submitted" },
      { time: "10:05", actor: "Security", action: "ID verified — cleared to reception" },
      { time: "10:15", actor: "Reception", action: "Badge issued — checked in" },
    ],
  },
  {
    id: "REQ-3300", visitorName: "Ifeoma Nwosu", initials: "IN", color: "bg-indigo-500", company: "BluePeak Analytics", host: "Michael Adams", department: "Platform Engineering",
    meetingRoom: "Meeting Room 2", purpose: "Software Demo", visitTime: "09:30 AM", expectedDurationMin: 60, badgeNumber: "V-2039", stage: "Checked In", checkInAt: now0 - 1000 * 60 * 165,
    timeline: [
      { time: "09:00", actor: "Requester", action: "Visitor request submitted" },
      { time: "09:10", actor: "Security", action: "ID verified — cleared to reception" },
      { time: "09:18", actor: "Reception", action: "Badge issued — checked in" },
    ],
  },
];

// ---------- utility ----------
const stageColor = (stage: Stage) =>
  stage === "Checked In" ? "bg-blue-50 text-blue-700" :
  stage === "Pending Reception Check-in" ? "bg-amber-50 text-amber-700" :
  stage === "Pending Reception Check-out" ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-500";

const workflowStatus = (stage: Stage) => {
  switch (stage) {
    case "Pending Reception Check-in":
      return {
        badge: "Ready for Check-in",
        tone: "bg-amber-100 text-amber-700",
        title: "Visitor is waiting at the front desk",
        points: ["Security has already cleared the visitor", "Reception can now issue the badge and check the visitor in"],
        cta: "Next action: issue the badge and confirm arrival",
      };
    case "Checked In":
      return {
        badge: "On Site",
        tone: "bg-blue-100 text-blue-700",
        title: "Visitor is currently inside the building",
        points: ["The visitor is active and on site", "Reception can notify the host or extend the visit if needed"],
        cta: "Next action: support the visit until departure",
      };
    case "Pending Reception Check-out":
      return {
        badge: "Ready to Depart",
        tone: "bg-indigo-100 text-indigo-700",
        title: "Visitor is preparing to leave",
        points: ["Reception has captured the departure request", "The visitor will be forwarded to final security clearance"],
        cta: "Next action: complete the check-out and send to security",
      };
    case "Pending Security Check-out":
      return {
        badge: "Security Finalization",
        tone: "bg-slate-100 text-slate-700",
        title: "Waiting for security exit confirmation",
        points: ["Reception has already checked the visitor out", "Security will complete the final exit and close the visit"],
        cta: "Next action: security confirms exit and notifies the requester",
      };
    default:
      return {
        badge: "Completed",
        tone: "bg-emerald-100 text-emerald-700",
        title: "Visit has been completed",
        points: ["The full workflow has finished", "The record is ready for audit or reporting"],
        cta: "The visit is fully closed",
      };
  }
};

function formatElapsed(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function ReceptionistDashboard() {
  const router = useRouter();
  const [visits, setVisits] = useState<Visit[]>(initialVisits);
  const [selectedId, setSelectedId] = useState<string>(initialVisits[0].id);
  const [searchQuery, setSearchQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [statDetail, setStatDetail] = useState<StatDetail | null>(null);
  const [clock, setClock] = useState(Date.now());
  const [hostNotified, setHostNotified] = useState<string | null>(null);

  const [showPrintBadge, setShowPrintBadge] = useState<Visit | null>(null);
  const [showScanQr, setShowScanQr] = useState(false);
  const [showNotifyHost, setShowNotifyHost] = useState<Visit | null>(null);
  const [showDirectory, setShowDirectory] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const selected = visits.find(v => v.id === selectedId) || visits[0];

  const readyForCheckin = visits.filter(v => v.stage === "Pending Reception Check-in");
  const activeVisitors = visits.filter(v => v.stage === "Checked In");
  const awaitingCheckout = visits.filter(v => v.stage === "Pending Reception Check-out");
  const sentToSecurityExit = visits.filter(v => v.stage === "Pending Security Check-out" || v.stage === "Completed");
  const completedToday = sentToSecurityExit.length;

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return visits;
    const q = searchQuery.toLowerCase();
    return visits.filter(v => v.visitorName.toLowerCase().includes(q) || v.company.toLowerCase().includes(q) || v.host.toLowerCase().includes(q));
  }, [visits, searchQuery]);

  const checkIn = (id: string) => {
    const v = visits.find(x => x.id === id);
    if (!v) return;
    const time = new Date().toTimeString().slice(0, 5);
    const badgeNumber = `V-${2044 + visits.indexOf(v)}`;
    setVisits(prev => prev.map(x => x.id === id ? { ...x, stage: "Checked In", badgeNumber, checkInAt: Date.now(), timeline: [...x.timeline, { time, actor: "Reception", action: "Badge issued — checked in" }] } : x));
    showToast(`${v.visitorName} checked in`);
    setHostNotified(v.host);
    setTimeout(() => setHostNotified(null), 4000);
  };

  const checkOut = (id: string) => {
    const v = visits.find(x => x.id === id);
    if (!v) return;
    const time = new Date().toTimeString().slice(0, 5);
    setVisits(prev => prev.map(x => x.id === id ? { ...x, stage: "Pending Security Check-out", timeline: [...x.timeline, { time, actor: "Reception", action: "Checked out — badge collected, sent to security for exit clearance" }] } : x));
    showToast(`${v.visitorName} checked out — sent to security for exit clearance`);
  };

  const notifyHost = (v: Visit) => {
    setHostNotified(v.host);
    setTimeout(() => setHostNotified(null), 4000);
    showToast(`${v.host} notified`);
    setShowNotifyHost(null);
  };

  return (
    <div className="space-y-6 relative">
      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-[60] bg-slate-900 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 max-w-sm">
          <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" /> {toast}
        </div>
      )}
      {hostNotified && (
        <div className="fixed top-20 right-6 z-[60] bg-white border border-emerald-200 shadow-lg rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-slate-700">
          <CheckCircle2 size={16} className="text-emerald-500" /> Host <strong>{hostNotified}</strong> has been notified.
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl px-6 py-4 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Receptionist Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500 max-w-xl">Check in visitors cleared by security, issue badges, and check them out at the end of their visit.</p>
          <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
            <span className="flex items-center gap-1 text-emerald-600 font-medium"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Reception Open</span>
            <span className="flex items-center gap-1"><Clock size={12} /> {new Date(clock).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => setShowScanQr(true)} className="border border-slate-200 px-3 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"><QrCode size={16} /> Scan QR Code</button>
          <button onClick={() => setShowDirectory(true)} className="border border-slate-200 px-3 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"><Users size={16} /> Visitor Directory</button>
          <button onClick={() => router.push("/security/visitor-management/visitor-registration")} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2"><UserPlus size={16} /> Register Visitor</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Ready for Check-in", value: readyForCheckin.length, icon: <ShieldCheck size={20} />, gradient: "from-amber-500 to-orange-500", items: readyForCheckin, emptyMessage: "No visitors are ready for check-in." },
          { label: "Currently Checked In", value: activeVisitors.length, icon: <Users size={20} />, gradient: "from-blue-500 to-indigo-600", items: activeVisitors, emptyMessage: "No visitors are currently checked in." },
          { label: "Awaiting Check-out", value: awaitingCheckout.length, icon: <LogOut size={20} />, gradient: "from-indigo-500 to-purple-600", items: awaitingCheckout, emptyMessage: "No visitors are awaiting check-out." },
          { label: "Sent to Security Exit", value: completedToday, icon: <CheckCircle2 size={20} />, gradient: "from-emerald-500 to-teal-600", items: sentToSecurityExit, emptyMessage: "No visitors have been sent to security exit." },
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
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search by visitor name, company, or host..." className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm" />
        </div>
      </div>

      {/* Queue + detail */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-900">Front Desk Queue</h2>
          </div>
          <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
            {filtered.filter(v => v.stage === "Pending Reception Check-in" || v.stage === "Checked In").map(v => (
              <button key={v.id} onClick={() => setSelectedId(v.id)} className={`w-full text-left flex items-center gap-3 p-3.5 hover:bg-slate-50 transition ${selectedId === v.id ? "bg-blue-50/60" : ""}`}>
                <span className={`w-9 h-9 rounded-full ${v.color} text-white flex items-center justify-center text-xs font-bold flex-shrink-0`}>{v.initials}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-900 truncate">{v.visitorName}</div>
                  <div className="text-xs text-slate-500 truncate">{v.company} · {v.visitTime}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Host: {v.host}</div>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${stageColor(v.stage)}`}>{v.stage === "Pending Reception Check-in" ? "Ready" : "On Site"}</span>
              </button>
            ))}
            {filtered.filter(v => v.stage === "Pending Reception Check-in" || v.stage === "Checked In").length === 0 && (
              <div className="p-8 text-center text-sm text-slate-400">No visitors in the queue right now.</div>
            )}
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

          {selected.stage === "Checked In" && selected.checkInAt && (
            <div className="rounded-xl p-3 mb-4 flex items-center justify-between bg-blue-50 border border-blue-200">
              <span className="text-xs font-medium flex items-center gap-1.5 text-blue-700"><Timer size={14} /> On Site</span>
              <span className="text-lg font-mono font-bold text-blue-700">{formatElapsed(clock - selected.checkInAt)}</span>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4 text-sm">
            <div><div className="text-xs text-slate-400 flex items-center gap-1"><Building2 size={11} /> Host</div><div className="font-medium">{selected.host}</div></div>
            <div><div className="text-xs text-slate-400 flex items-center gap-1"><MapPin size={11} /> Room</div><div className="font-medium">{selected.meetingRoom}</div></div>
            <div><div className="text-xs text-slate-400">Purpose</div><div className="font-medium">{selected.purpose}</div></div>
            <div><div className="text-xs text-slate-400 flex items-center gap-1"><IdCard size={11} /> Badge</div><div className="font-medium">{selected.badgeNumber || "Not issued"}</div></div>
            <div><div className="text-xs text-slate-400">Expected Duration</div><div className="font-medium">{selected.expectedDurationMin} min</div></div>
          </div>

          {(() => {
            const workflow = workflowStatus(selected.stage);
            return (
              <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Reception workflow</div>
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
            {selected.stage === "Pending Reception Check-in" && (
              <button onClick={() => checkIn(selected.id)} className="text-sm px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 flex items-center gap-1.5"><CheckCircle2 size={15} /> Issue Badge & Check In</button>
            )}
            {selected.stage === "Checked In" && (
              <button onClick={() => checkOut(selected.id)} className="text-sm px-4 py-2 bg-amber-500 text-white rounded-xl hover:bg-amber-600 flex items-center gap-1.5"><LogOut size={15} /> Check Out</button>
            )}
            <button onClick={() => setShowNotifyHost(selected)} className="text-sm px-3 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 flex items-center gap-1.5"><Bell size={15} /> Notify Host</button>
            <button onClick={() => setShowPrintBadge(selected)} className="text-sm px-3 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 flex items-center gap-1.5"><Printer size={15} /> Print Badge</button>
          </div>
        </div>
      </div>

      {/* Active visitors grid */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Active Visitors</h2>
          <span className="text-xs text-slate-400">{activeVisitors.length} on site</span>
        </div>
        {activeVisitors.length === 0 ? (
          <div className="text-sm text-slate-400 text-center py-8">No visitors currently checked in.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {activeVisitors.map(v => {
              const elapsedMs = clock - (v.checkInAt || clock);
              const overdue = elapsedMs > v.expectedDurationMin * 60 * 1000;
              return (
                <button key={v.id} onClick={() => setSelectedId(v.id)} className={`text-left border rounded-xl p-3 ${overdue ? "border-amber-200 bg-amber-50/40" : "border-slate-200"}`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-8 h-8 rounded-full ${v.color} text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0`}>{v.initials}</span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">{v.visitorName}</div>
                      <div className="text-[11px] text-slate-400 truncate">Host: {v.host}</div>
                    </div>
                  </div>
                  <div className={`mt-2 text-xs font-mono font-semibold ${overdue ? "text-amber-600" : "text-blue-600"}`}>{formatElapsed(elapsedMs)}</div>
                  <button onClick={e => { e.stopPropagation(); checkOut(v.id); }} className="mt-2 text-[11px] px-2 py-1 border border-slate-200 rounded-lg hover:bg-white bg-white/60 w-full">Check Out</button>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Register Visitor", icon: <UserPlus size={17} />, action: () => router.push("/security/visitor-management/visitor-registration") },
            { label: "Scan QR Code", icon: <ScanLine size={17} />, action: () => setShowScanQr(true) },
            { label: "Print Badge", icon: <Printer size={17} />, action: () => setShowPrintBadge(selected) },
            { label: "Visitor Directory", icon: <Users size={17} />, action: () => setShowDirectory(true) },
          ].map(qa => (
            <button key={qa.label} onClick={qa.action} className="flex flex-col items-center gap-2 border border-slate-200 rounded-xl p-3 hover:bg-slate-50 transition text-center">
              <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">{qa.icon}</div>
              <span className="text-[11px] font-medium text-slate-700">{qa.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ---------- Modals ---------- */}
      {showPrintBadge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><Printer size={18} className="text-indigo-600" /> Print Badge</h3>
              <button onClick={() => setShowPrintBadge(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="border-2 border-dashed border-indigo-200 rounded-xl p-4 bg-indigo-50/30 text-center">
              <div className="text-[10px] uppercase tracking-wide text-indigo-500 font-semibold">Visitor Badge</div>
              <div className="text-lg font-bold text-slate-900 mt-1">{showPrintBadge.visitorName}</div>
              <div className="text-xs text-slate-500">Host: {showPrintBadge.host}</div>
              <div className="w-16 h-16 bg-slate-800 rounded-lg mx-auto mt-3 flex items-center justify-center"><QrCode size={36} className="text-white" /></div>
              <div className="text-[11px] text-slate-400 mt-2 font-mono">Badge #{showPrintBadge.badgeNumber || "————"}</div>
            </div>
            <button onClick={() => { showToast(`Badge printed for ${showPrintBadge.visitorName}`); setShowPrintBadge(null); }} className="mt-4 w-full px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm hover:bg-indigo-700">Print</button>
          </div>
        </div>
      )}

      {showScanQr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><ScanLine size={18} className="text-blue-600" /> Scan QR Code</h3>
              <button onClick={() => setShowScanQr(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="border-2 border-dashed border-slate-200 rounded-2xl p-10 flex flex-col items-center justify-center gap-3">
              <QrCode size={44} className="text-slate-300" />
              <p className="text-xs text-slate-500">Position visitor's QR invite within the frame</p>
            </div>
            <button onClick={() => { showToast("Visitor matched to a security-cleared request"); setShowScanQr(false); }} className="mt-4 w-full px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700">Simulate Scan</button>
          </div>
        </div>
      )}

      {showNotifyHost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Notify Host</h3>
              <button onClick={() => setShowNotifyHost(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <p className="text-sm text-slate-500">Send an arrival notification to <strong>{showNotifyHost.host}</strong>?</p>
            <button onClick={() => notifyHost(showNotifyHost)} className="mt-4 w-full px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700">Send Notification</button>
          </div>
        </div>
      )}

      {showDirectory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><Users size={18} className="text-blue-600" /> Visitor Directory</h3>
              <button onClick={() => setShowDirectory(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {visits.map(v => (
                <div key={v.id} className="flex items-center justify-between border border-slate-100 rounded-xl p-2.5">
                  <div className="flex items-center gap-2">
                    <span className={`w-8 h-8 rounded-full ${v.color} text-white flex items-center justify-center text-[10px] font-bold`}>{v.initials}</span>
                    <div>
                      <div className="text-sm font-medium text-slate-800">{v.visitorName}</div>
                      <div className="text-xs text-slate-400">{v.company}</div>
                    </div>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${stageColor(v.stage)}`}>{v.stage}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-4">
              <button onClick={() => setShowDirectory(false)} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}