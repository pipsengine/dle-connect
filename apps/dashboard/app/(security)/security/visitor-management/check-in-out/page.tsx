"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  AlertTriangle,
  Bell,
  Briefcase,
  Car,
  CheckCircle2,
  Clock,
  Download,
  History,
  IdCard,
  LogOut,
  MapPin,
  Package,
  Printer,
  QrCode,
  RefreshCw,
  ScanLine,
  Search,
  ShieldCheck,
  Siren,
  Timer,
  User,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { EmployeeHostField } from "../_components/employee-host-field";
import { loadVisitorWorkspace, patchVisitorVisit, saveVisitorVisit } from "@/lib/security/visitor-client";
import type { DirectoryEmployee, VisitorVisit } from "@/lib/security/visitor-types";
import { durationToMinutes, epochOrNull, formatVisitTime, minutesToDuration, todayISO, toDeskStatus, visibleOnDesk, visitorColor, visitorInitials, visitorStageAction } from "@/lib/security/visitor-views";

// ---------- types ----------
type VisitorStatus = "Ready for Check-in" | "Waiting for Host" | "Checked In" | "Checked Out";

interface TimelineEvent {
  time: string;
  action: string;
  staff: string;
  note?: string;
}

interface Visitor {
  id: string;
  name: string;
  initials: string;
  color: string;
  company: string;
  host: string;
  department: string;
  meetingRoom: string;
  purpose: string;
  visitorType: string;
  expectedDurationMin: number;
  appointmentTime: string;
  status: VisitorStatus;
  idVerified: boolean;
  badgeIssued: boolean;
  badgeNumber: string | null;
  itemsCarried: string;
  vehicleRegistered: string | null;
  checkInAt: number | null; // epoch ms
  checkOutAt: number | null;
  floor: string;
  timeline: TimelineEvent[];
}

interface StatDetail {
  title: string;
  visitors: Visitor[];
}

const EMPTY_VISITOR: Visitor = {
  id: "", name: "No visitor selected", initials: "", color: "bg-slate-300", company: "", host: "", department: "", meetingRoom: "", purpose: "", visitorType: "",
  expectedDurationMin: 60, appointmentTime: "", status: "Ready for Check-in", idVerified: false, badgeIssued: false, badgeNumber: null, itemsCarried: "", vehicleRegistered: null,
  checkInAt: null, checkOutAt: null, floor: "", timeline: [],
};

const toDeskVisitor = (visit: VisitorVisit): Visitor => ({
  id: visit.id,
  name: visit.visitorName,
  initials: visitorInitials(visit.visitorName),
  color: visitorColor(visit.visitorName),
  company: visit.company,
  host: visit.hostName,
  department: visit.department,
  meetingRoom: visit.meetingRoom || visit.location || "Reception",
  purpose: visit.purpose,
  visitorType: visit.visitorType || "Guest",
  expectedDurationMin: durationToMinutes(visit.duration),
  appointmentTime: formatVisitTime(visit.visitTime),
  status: toDeskStatus(visit.status) || "Ready for Check-in",
  idVerified: visit.idVerified,
  badgeIssued: Boolean(visit.badgeNumber),
  badgeNumber: visit.badgeNumber,
  itemsCarried: visit.itemsCarried,
  vehicleRegistered: visit.vehicleRegistered,
  checkInAt: epochOrNull(visit.checkInAt),
  checkOutAt: epochOrNull(visit.checkOutAt),
  floor: visit.floor || visit.location,
  timeline: visit.timeline.map((event) => ({ time: event.time, action: event.action, staff: event.actor, note: event.note })),
});

// ---------- utility ----------
const statusColor = (status: VisitorStatus) =>
  status === "Ready for Check-in" ? "bg-emerald-50 text-emerald-700" :
  status === "Waiting for Host" ? "bg-amber-50 text-amber-700" :
  status === "Checked In" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500";

const statusDot = (status: VisitorStatus) =>
  status === "Ready for Check-in" ? "bg-emerald-500" :
  status === "Waiting for Host" ? "bg-amber-500" :
  status === "Checked In" ? "bg-blue-500" : "bg-slate-400";

function formatElapsed(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

// ---------- component ----------
export default function VisitorCheckInOutPage() {
  const router = useRouter();
  const [records, setRecords] = useState<VisitorVisit[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [queueSearchQuery, setQueueSearchQuery] = useState("");
  const [clock, setClock] = useState(new Date());

  // modal state
  const [showRegisterWalkin, setShowRegisterWalkin] = useState(false);
  const [showPrintBadge, setShowPrintBadge] = useState(false);
  const [showScanQr, setShowScanQr] = useState(false);
  const [showExtendVisit, setShowExtendVisit] = useState(false);
  const [showCallSecurity, setShowCallSecurity] = useState(false);
  const [showVisitorRecords, setShowVisitorRecords] = useState(false);
  const [showEmergencyList, setShowEmergencyList] = useState(false);
  const [showExportLog, setShowExportLog] = useState(false);
  const [hostNotified, setHostNotified] = useState<string | null>(null);
  const [badgePreview, setBadgePreview] = useState<Visitor | null>(null);
  const [historyVisitor, setHistoryVisitor] = useState<Visitor | null>(null);
  const [statDetail, setStatDetail] = useState<StatDetail | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  // live clock for timers
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    loadVisitorWorkspace()
      .then((workspace) => {
        setRecords(workspace.visits);
        const desk = workspace.visits.filter(visibleOnDesk);
        setSelectedId((current) => current || desk[0]?.id || "");
      })
      .catch((error) => showToast(error instanceof Error ? error.message : "Unable to load visitors."));
  }, []);

  const visitors = useMemo(() => records.filter(visibleOnDesk).map(toDeskVisitor), [records]);
  const selected = visitors.find(v => v.id === selectedId) || visitors[0] || EMPTY_VISITOR;

  // reception overview stats
  const totalVisitorsToday = visitors.length;
  const readyForCheckinCount = visitors.filter(v => v.status === "Ready for Check-in").length;
  const waitingForHostCount = visitors.filter(v => v.status === "Waiting for Host").length;
  const checkedInCount = visitors.filter(v => v.status === "Checked In").length;
  const checkedOutCount = visitors.filter(v => v.status === "Checked Out").length;

  const filteredVisitors = useMemo(() => {
    if (!searchQuery.trim()) return visitors;
    const q = searchQuery.toLowerCase();
    return visitors.filter(v => v.name.toLowerCase().includes(q) || v.company.toLowerCase().includes(q) || v.id.toLowerCase().includes(q) || v.host.toLowerCase().includes(q));
  }, [visitors, searchQuery]);

  const queueFilteredVisitors = useMemo(() => {
    const base = filteredVisitors;
    const q = queueSearchQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter(v =>
      v.name.toLowerCase().includes(q) ||
      v.company.toLowerCase().includes(q) ||
      v.id.toLowerCase().includes(q) ||
      v.host.toLowerCase().includes(q) ||
      v.meetingRoom.toLowerCase().includes(q) ||
      v.visitorType.toLowerCase().includes(q)
    );
  }, [filteredVisitors, queueSearchQuery]);

  const updateVisitor = (id: string, patch: Partial<Visitor>, timelineEntry?: Omit<TimelineEvent, "time">) => {
    if (!id) return;
    const current = visitors.find((visitor) => visitor.id === id);
    if (!current) return;
    const record = records.find((item) => item.id === id);
    const step = patch.status && record ? visitorStageAction(record.status) : null;
    void patchVisitorVisit(id, {
      status: step?.status,
      idVerified: patch.idVerified,
      badgeStatus: patch.badgeIssued ? "Active" : undefined,
      badgeNumber: patch.badgeNumber || undefined,
      checkInAt: patch.checkInAt ? new Date(patch.checkInAt).toISOString() : undefined,
      checkOutAt: patch.checkOutAt ? new Date(patch.checkOutAt).toISOString() : undefined,
      duration: patch.expectedDurationMin ? minutesToDuration(patch.expectedDurationMin) : undefined,
    }, timelineEntry ? { time: "", action: timelineEntry.action, actor: timelineEntry.staff, note: timelineEntry.note } : undefined)
      .then((saved) => setRecords((prev) => prev.map((item) => item.id === saved.id ? saved : item)))
      .catch((error) => showToast(error instanceof Error ? error.message : "Unable to update the visit."));
  };

  const checkIn = (id: string) => {
    const v = visitors.find(x => x.id === id);
    const step = visitorStageAction(records.find((item) => item.id === id)?.status || "Checked Out");
    if (!v || !step?.label.includes("check-in")) { showToast("This visit is not waiting for check-in."); return; }
    updateVisitor(id, { status: "Checked In", idVerified: true, badgeIssued: true, checkInAt: Date.now() }, { action: step.action, staff: step.role === "security" ? "Security" : "Reception" });
    showToast(`${v.name}: ${step.label} completed`);
    setHostNotified(v.host);
    setTimeout(() => setHostNotified(null), 4000);
  };

  const checkOut = (id: string) => {
    const v = visitors.find(x => x.id === id);
    const step = visitorStageAction(records.find((item) => item.id === id)?.status || "Checked Out");
    if (!v || !step?.label.includes("check-out")) { showToast("This visit is not waiting for check-out."); return; }
    updateVisitor(id, { status: "Checked Out", checkOutAt: Date.now() }, { action: step.action, staff: step.role === "security" ? "Security" : "Reception" });
    showToast(`${v.name}: ${step.label} completed`);
  };

  const notifyHost = (id: string) => {
    const v = visitors.find(x => x.id === id);
    if (!v) return;
    updateVisitor(id, {}, { action: `Host ${v.host} notified`, staff: "Reception" });
    setHostNotified(v.host);
    setTimeout(() => setHostNotified(null), 4000);
  };

  const activeVisitors = visitors.filter(v => v.status === "Checked In");
  const primaryActionFor = (v: Visitor) => v.status === "Checked In" ? "checkout" : v.status === "Checked Out" ? "none" : "checkin";

  const selectFromStatDetail = (id: string) => {
    setSelectedId(id);
    setStatDetail(null);
  };

  return (
    <div className="space-y-6 relative">
      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-[60] bg-slate-900 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2">
          <CheckCircle2 size={16} className="text-emerald-400" /> {toast}
        </div>
      )}
      {/* Host notification banner */}
      {hostNotified && (
        <div className="fixed top-20 right-6 z-[60] bg-white border border-emerald-200 shadow-lg rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-slate-700">
          <CheckCircle2 size={16} className="text-emerald-500" /> Host <strong>{hostNotified}</strong> has been notified.
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl px-6 py-4 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Visitor Check-in &amp; Check-out</h1>
          <p className="mt-1 text-sm text-slate-500 max-w-xl">Manage visitor arrivals, departures, badge issuance, and host notifications in real time.</p>
          <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
            <span className="flex items-center gap-1 text-emerald-600 font-medium"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Live Status</span>
            <span className="flex items-center gap-1"><Clock size={12} /> {clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
            <span className="flex items-center gap-1"><MapPin size={12} /> Reception Desk</span>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => router.push("/security/visitor-management/visitor-registration")} className="border border-slate-200 px-3 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"><UserPlus size={16} /> Register Walk-in</button>
          <button onClick={() => setShowPrintBadge(true)} className="border border-slate-200 px-3 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"><Printer size={16} /> Print Badge</button>
          <button onClick={() => setShowScanQr(true)} className="border border-slate-200 px-3 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"><QrCode size={16} /> Scan QR Code</button>
          <button onClick={() => showToast("Queue refreshed")} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2"><RefreshCw size={16} /> Refresh</button>
        </div>
      </div>

      {/* Hero - Reception Overview */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="relative mb-4">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search visitor by name, QR code, phone number, company, or visitor ID..."
            className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-300"
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Visitors Today", value: totalVisitorsToday, sub: "Total", icon: <Users size={20} />, gradient: "from-blue-500 to-indigo-600", getItems: () => visitors },
            { label: "Ready for Check-in", value: readyForCheckinCount, sub: "Pending arrival", icon: <User size={20} />, gradient: "from-slate-400 to-slate-500", getItems: () => visitors.filter(v => v.status === "Ready for Check-in") },
            { label: "Waiting for Host", value: waitingForHostCount, sub: "In lobby", icon: <Clock size={20} />, gradient: "from-amber-500 to-orange-500", getItems: () => visitors.filter(v => v.status === "Waiting for Host") },
            { label: "Checked In", value: checkedInCount, sub: "On site", icon: <CheckCircle2 size={20} />, gradient: "from-emerald-500 to-teal-600", getItems: () => activeVisitors },
            { label: "Checked Out", value: checkedOutCount, sub: "Completed", icon: <LogOut size={20} />, gradient: "from-indigo-500 to-purple-600", getItems: () => visitors.filter(v => v.status === "Checked Out") },
          ].map(tile => (
            <button
              key={tile.label}
              onClick={() => setStatDetail({ title: tile.label, visitors: tile.getItems() })}
              className={`text-left rounded-2xl p-4 text-white shadow-sm bg-gradient-to-br ${tile.gradient} hover:brightness-110 active:scale-[0.98] transition cursor-pointer`}
            >
              <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center">{tile.icon}</div>
              <div className="mt-3 text-2xl font-bold">{tile.value}</div>
              <div className="text-xs text-white/80 mt-0.5">{tile.sub}</div>
              <div className="text-[11px] text-white/70 mt-1">{tile.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Today's Visitors - horizontal scroll */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Today's Visitors</h2>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {visitors.map(v => (
            <button key={v.id} onClick={() => setSelectedId(v.id)} className={`flex-shrink-0 w-52 border rounded-xl p-3 text-left hover:shadow-md transition ${selectedId === v.id ? "border-blue-300 ring-1 ring-blue-200" : "border-slate-200"}`}>
              <div className="flex items-center gap-2">
                <span className={`w-9 h-9 rounded-full ${v.color} text-white flex items-center justify-center text-xs font-bold flex-shrink-0`}>{v.initials}</span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate">{v.name}</div>
                  <div className="text-xs text-slate-400 truncate">{v.company}</div>
                </div>
              </div>
              <div className="text-xs text-slate-500 mt-2">Meeting {v.host}</div>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[11px] text-slate-400">{v.appointmentTime}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusColor(v.status)}`}>{v.status}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Live Visitor Queue + Visitor Details */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-900">Live Visitor Queue</h2>
            <p className="text-xs text-slate-400 mt-0.5">{queueFilteredVisitors.length} visitors</p>
            <div className="relative mt-2">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={queueSearchQuery}
                onChange={e => setQueueSearchQuery(e.target.value)}
                placeholder="Search queue..."
                className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-300"
              />
            </div>
          </div>
          <div className="divide-y divide-slate-100 max-h-[560px] overflow-y-auto">
            {queueFilteredVisitors.map(v => (
              <button key={v.id} onClick={() => setSelectedId(v.id)} className={`w-full text-left flex items-center gap-3 p-3.5 hover:bg-slate-50 transition ${selectedId === v.id ? "bg-blue-50/60" : ""}`}>
                <span className={`w-9 h-9 rounded-full ${v.color} text-white flex items-center justify-center text-xs font-bold flex-shrink-0`}>{v.initials}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900 truncate">{v.name}</span>
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot(v.status)}`} />
                  </div>
                  <div className="text-xs text-slate-500 truncate">{v.company} · {v.appointmentTime}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Host: {v.host}</div>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${statusColor(v.status)}`}>{v.status}</span>
              </button>
            ))}
            {queueFilteredVisitors.length === 0 && (
              <div className="p-8 text-center text-sm text-slate-400">No visitors match this search.</div>
            )}
          </div>
        </div>

        {/* Visitor Details Panel */}
        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <span className={`w-14 h-14 rounded-full ${selected.color} text-white flex items-center justify-center text-lg font-bold flex-shrink-0`}>{selected.initials}</span>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{selected.name}</h2>
                <div className="text-xs text-slate-500">{selected.company} · {selected.visitorType}</div>
              </div>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${statusColor(selected.status)}`}>{selected.status}</span>
          </div>

          {selected.status === "Checked In" && selected.checkInAt && (
            <VisitTimer checkInAt={selected.checkInAt} expectedDurationMin={selected.expectedDurationMin} now={clock} />
          )}

          {/* Visit Information */}
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-slate-600 uppercase mb-1.5">Visit Information</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div><div className="text-xs text-slate-400 flex items-center gap-1"><User size={11} /> Host</div><div className="font-medium">{selected.host}</div></div>
              <div><div className="text-xs text-slate-400 flex items-center gap-1"><Briefcase size={11} /> Department</div><div className="font-medium">{selected.department}</div></div>
              <div><div className="text-xs text-slate-400 flex items-center gap-1"><MapPin size={11} /> Meeting Room</div><div className="font-medium">{selected.meetingRoom}</div></div>
              <div className="sm:col-span-2"><div className="text-xs text-slate-400">Purpose</div><div className="font-medium">{selected.purpose}</div></div>
              <div><div className="text-xs text-slate-400">Expected Duration</div><div className="font-medium">{selected.expectedDurationMin} min</div></div>
            </div>
          </div>

          {/* Security */}
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-slate-600 uppercase mb-1.5">Security</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className={`border rounded-lg p-2 flex items-center gap-1.5 ${selected.idVerified ? "border-emerald-100 bg-emerald-50/50 text-emerald-700" : "border-slate-100 text-slate-400"}`}>
                <ShieldCheck size={13} /> ID {selected.idVerified ? "Verified" : "Pending"}
              </div>
              <div className={`border rounded-lg p-2 flex items-center gap-1.5 ${selected.badgeIssued ? "border-emerald-100 bg-emerald-50/50 text-emerald-700" : "border-slate-100 text-slate-400"}`}>
                <IdCard size={13} /> Badge {selected.badgeIssued ? `#${selected.badgeNumber}` : "Not Issued"}
              </div>
              <div className="border border-slate-100 rounded-lg p-2 flex items-center gap-1.5 text-slate-600">
                <Package size={13} /> {selected.itemsCarried}
              </div>
              <div className={`border rounded-lg p-2 flex items-center gap-1.5 ${selected.vehicleRegistered ? "border-indigo-100 bg-indigo-50/50 text-indigo-700" : "border-slate-100 text-slate-400"}`}>
                <Car size={13} /> {selected.vehicleRegistered || "No Vehicle"}
              </div>
            </div>
          </div>

          {/* Check-in Timeline (horizontal) */}
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-slate-600 uppercase mb-1.5">Check-in Timeline</h3>
            <div className="flex items-start overflow-x-auto pb-2">
              {selected.timeline.map((ev, idx) => (
                <React.Fragment key={idx}>
                  <div className="flex flex-col items-center min-w-[120px] text-center flex-shrink-0">
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${idx === selected.timeline.length - 1 ? "bg-blue-500" : "bg-slate-300"}`} />
                    <div className="text-xs font-semibold text-slate-500 mt-1.5">{ev.time}</div>
                    <div className="text-xs text-slate-800 mt-0.5">{ev.action}</div>
                    <div className="text-[10px] text-slate-400">{ev.staff}</div>
                    {ev.note && <div className="text-[10px] text-slate-500 italic mt-0.5">"{ev.note}"</div>}
                  </div>
                  {idx < selected.timeline.length - 1 && <div className="flex-1 h-0.5 bg-slate-200 min-w-[24px] mt-[5px]" />}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
            {primaryActionFor(selected) === "checkin" && (
              <button onClick={() => checkIn(selected.id)} className="text-sm px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 flex items-center gap-1.5"><CheckCircle2 size={15} /> Check In</button>
            )}
            {primaryActionFor(selected) === "checkout" && (
              <button onClick={() => checkOut(selected.id)} className="text-sm px-4 py-2 bg-amber-500 text-white rounded-xl hover:bg-amber-600 flex items-center gap-1.5"><LogOut size={15} /> Check Out</button>
            )}
            <button onClick={() => notifyHost(selected.id)} className="text-sm px-3 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 flex items-center gap-1.5"><Bell size={15} /> Notify Host</button>
            <button onClick={() => setBadgePreview(selected)} className="text-sm px-3 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 flex items-center gap-1.5"><Printer size={15} /> Print Badge</button>
            <button onClick={() => setHistoryVisitor(selected)} className="text-sm px-3 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 flex items-center gap-1.5"><History size={15} /> View History</button>
          </div>
        </div>
      </div>

      {/* Active Visitors */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Active Visitors</h2>
          <span className="text-xs text-slate-400">{activeVisitors.length} on site</span>
        </div>
        {activeVisitors.length === 0 ? (
          <div className="text-sm text-slate-400 text-center py-8">No visitors currently on site.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {activeVisitors.map(v => {
              const elapsedMs = clock.getTime() - (v.checkInAt || clock.getTime());
              const overdue = elapsedMs > v.expectedDurationMin * 60 * 1000;
              return (
                <button key={v.id} onClick={() => setSelectedId(v.id)} className={`text-left border rounded-xl p-3 ${overdue ? "border-amber-200 bg-amber-50/40" : "border-slate-200"}`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-8 h-8 rounded-full ${v.color} text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0`}>{v.initials}</span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">{v.name}</div>
                      <div className="text-[11px] text-slate-400 truncate">Host: {v.host}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1"><MapPin size={10} /> {v.floor}</span>
                    <span>Badge #{v.badgeNumber}</span>
                  </div>
                  <div className={`mt-2 text-xs font-mono font-semibold ${overdue ? "text-amber-600" : "text-blue-600"}`}>{formatElapsed(elapsedMs)}</div>
                  {overdue && <div className="text-[10px] text-amber-600 mt-0.5">Exceeded expected {v.expectedDurationMin} min</div>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Actions Panel */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {[
            { label: "Register New Visitor", icon: <UserPlus size={17} />, action: () => setShowRegisterWalkin(true) },
            { label: "Extend Visit", icon: <Timer size={17} />, action: () => setShowExtendVisit(true) },
            { label: "Reprint Badge", icon: <Printer size={17} />, action: () => setShowPrintBadge(true) },
            { label: "Notify Host", icon: <Bell size={17} />, action: () => notifyHost(selected.id) },
            { label: "Call Security", icon: <Siren size={17} />, action: () => setShowCallSecurity(true) },
            { label: "Visitor Records", icon: <Users size={17} />, action: () => setShowVisitorRecords(true) },
            { label: "Emergency List", icon: <AlertTriangle size={17} />, action: () => setShowEmergencyList(true) },
            { label: "Export Visitor Log", icon: <Download size={17} />, action: () => setShowExportLog(true) },
          ].map(qa => (
            <button key={qa.label} onClick={qa.action} className="flex flex-col items-center gap-2 border border-slate-200 rounded-xl p-3 hover:bg-slate-50 transition text-center">
              <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">{qa.icon}</div>
              <span className="text-[11px] font-medium text-slate-700">{qa.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ---------- Modals ---------- */}
      {showRegisterWalkin && (
        <RegisterWalkinModal onClose={() => setShowRegisterWalkin(false)} onSubmit={(data) => {
          void saveVisitorVisit({
            visitorName: data.name,
            company: data.company || "Walk-in",
            hostName: data.host,
            hostEmployeeCode: data.hostCode,
            department: data.department,
            location: data.location,
            meetingRoom: "Reception",
            purpose: "Walk-in visit",
            visitorType: "Guest",
            duration: "30 min",
            visitDate: todayISO(),
            status: "Pending Security Check-in",
          }).then((saved) => {
            setRecords((prev) => [saved, ...prev]);
            setSelectedId(saved.id);
            showToast(`${data.name} registered as walk-in`);
          }).catch((error) => showToast(error instanceof Error ? error.message : "Unable to register the walk-in."));
          setShowRegisterWalkin(false);
        }} />
      )}

      {showPrintBadge && (
        <PrintBadgeModal visitors={visitors} defaultId={selected.id} onClose={() => setShowPrintBadge(false)} onPrint={(v) => {
          updateVisitor(v.id, { badgeIssued: true }, { action: "Badge printed", staff: "Reception" });
          showToast(`Badge printed for ${v.name}`);
          setShowPrintBadge(false);
        }} />
      )}

      {showScanQr && (
        <ScanQrModal onClose={() => setShowScanQr(false)} onScan={() => {
          checkIn(selected.id);
          showToast(`${selected.name} checked in via QR scan`);
          setShowScanQr(false);
        }} />
      )}

      {showExtendVisit && (
        <ExtendVisitModal visitor={selected} onClose={() => setShowExtendVisit(false)} onExtend={(min) => {
          updateVisitor(selected.id, { expectedDurationMin: selected.expectedDurationMin + min }, { action: `Visit extended by ${min} minutes`, staff: "Reception" });
          showToast(`${selected.name}'s visit extended by ${min} minutes`);
          setShowExtendVisit(false);
        }} />
      )}

      {showCallSecurity && (
        <CallSecurityModal onClose={() => setShowCallSecurity(false)} onCall={() => { showToast("Security team notified"); setShowCallSecurity(false); }} />
      )}

      {showVisitorRecords && (
        <VisitorRecordsModal visitors={visitors} onClose={() => setShowVisitorRecords(false)} />
      )}

      {showEmergencyList && (
        <EmergencyListModal visitors={activeVisitors} onClose={() => setShowEmergencyList(false)} />
      )}

      {showExportLog && (
        <ExportLogModal onClose={() => setShowExportLog(false)} onExport={() => { showToast("Visitor log exported"); setShowExportLog(false); }} />
      )}

      {badgePreview && (
        <BadgePreviewModal visitor={badgePreview} onClose={() => setBadgePreview(null)} onPrint={() => { showToast(`Badge printed for ${badgePreview.name}`); setBadgePreview(null); }} />
      )}

      {historyVisitor && (
        <HistoryModal visitor={historyVisitor} onClose={() => setHistoryVisitor(null)} />
      )}

      {statDetail && (
        <StatDetailModal title={statDetail.title} visitors={statDetail.visitors} onClose={() => setStatDetail(null)} onSelect={selectFromStatDetail} />
      )}
    </div>
  );
}

// ---------- Visit Timer ----------
function VisitTimer({ checkInAt, expectedDurationMin, now }: { checkInAt: number; expectedDurationMin: number; now: Date }) {
  const elapsedMs = now.getTime() - checkInAt;
  const overdue = elapsedMs > expectedDurationMin * 60 * 1000;
  return (
    <div className={`rounded-xl p-3 mb-4 flex items-center justify-between ${overdue ? "bg-amber-50 border border-amber-200" : "bg-blue-50 border border-blue-200"}`}>
      <span className={`text-xs font-medium flex items-center gap-1.5 ${overdue ? "text-amber-700" : "text-blue-700"}`}><Timer size={14} /> On Site</span>
      <span className={`text-lg font-mono font-bold ${overdue ? "text-amber-700" : "text-blue-700"}`}>{formatElapsed(elapsedMs)}</span>
      {overdue && <span className="text-[11px] text-amber-600">Exceeded expected {expectedDurationMin} min</span>}
    </div>
  );
}

// ---------- Modal: Stat Detail ----------
function StatDetailModal({ title, visitors, onClose, onSelect }: { title: string; visitors: Visitor[]; onClose: () => void; onSelect: (id: string) => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-1">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <p className="text-xs text-slate-400 mb-3">{visitors.length} visitor{visitors.length !== 1 ? "s" : ""} · tap one to view details</p>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {visitors.map(v => (
            <button key={v.id} onClick={() => onSelect(v.id)} className="w-full text-left flex items-center gap-3 border border-slate-100 rounded-xl p-2.5 hover:bg-slate-50 transition">
              <span className={`w-8 h-8 rounded-full ${v.color} text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0`}>{v.initials}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-800 truncate">{v.name}</div>
                <div className="text-xs text-slate-400 truncate">{v.company} · {v.appointmentTime}</div>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${statusColor(v.status)}`}>{v.status}</span>
            </button>
          ))}
          {visitors.length === 0 && <div className="text-sm text-slate-400 text-center py-6">No visitors in this category.</div>}
        </div>
        <div className="flex justify-end pt-4">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Close</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Modal: Register Walk-in ----------
function RegisterWalkinModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (data: { name: string; company: string; host: string; hostCode?: string; department?: string; location?: string }) => void }) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [host, setHost] = useState("");
  const [hostEmployee, setHostEmployee] = useState<DirectoryEmployee | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !host.trim()) return;
    onSubmit({ name, company, host, hostCode: hostEmployee?.code, department: hostEmployee?.department, location: hostEmployee?.location });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><UserPlus size={18} className="text-amber-600" /> Register Walk-in</h3>
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
          <EmployeeHostField required label="Who are they visiting?" value={host} onPick={(employee, typed) => { setHost(typed); setHostEmployee(employee); }} />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-amber-500 text-white rounded-xl text-sm hover:bg-amber-600">Register</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Modal: Print Badge ----------
function PrintBadgeModal({ visitors, defaultId, onClose, onPrint }: { visitors: Visitor[]; defaultId: string; onClose: () => void; onPrint: (v: Visitor) => void }) {
  const [id, setId] = useState(defaultId);
  const v = visitors.find(x => x.id === id) || visitors[0];
  if (!v) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><Printer size={18} className="text-indigo-600" /> Print Badge</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <select value={id} onChange={e => setId(e.target.value)} className="w-full mb-3 border border-slate-200 rounded-xl px-3 py-2 text-sm">
          {visitors.map(vi => <option key={vi.id} value={vi.id}>{vi.name}</option>)}
        </select>
        <BadgeCard visitor={v} />
        <button onClick={() => onPrint(v)} className="mt-4 w-full px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm hover:bg-indigo-700">Print Badge</button>
      </div>
    </div>
  );
}

function BadgeCard({ visitor }: { visitor: Visitor }) {
  return (
    <div className="border-2 border-dashed border-indigo-200 rounded-xl p-4 bg-indigo-50/30 text-center">
      <div className="text-[10px] uppercase tracking-wide text-indigo-500 font-semibold">Visitor Badge</div>
      <div className="text-lg font-bold text-slate-900 mt-1">{visitor.name}</div>
      <div className="text-xs text-slate-500">{visitor.visitorType}</div>
      <div className="text-xs text-slate-500 mt-1">Host: {visitor.host}</div>
      <div className="w-16 h-16 bg-slate-800 rounded-lg mx-auto mt-3 flex items-center justify-center">
        <QrCode size={36} className="text-white" />
      </div>
      <div className="text-[11px] text-slate-400 mt-2 font-mono">Badge #{visitor.badgeNumber || "————"}</div>
    </div>
  );
}

// ---------- Modal: Scan QR ----------
function ScanQrModal({ onClose, onScan }: { onClose: () => void; onScan: () => void }) {
  const [scanning, setScanning] = useState(false);
  const handleScan = () => { setScanning(true); setTimeout(() => { setScanning(false); onScan(); }, 1300); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><ScanLine size={18} className="text-blue-600" /> Scan QR Code</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center gap-3 ${scanning ? "border-blue-400 bg-blue-50/40" : "border-slate-200"}`}>
          <QrCode size={48} className={scanning ? "text-blue-500 animate-pulse" : "text-slate-300"} />
          <p className="text-xs text-slate-500">{scanning ? "Reading QR invitation..." : "Position visitor's QR code, badge, or ID within the frame"}</p>
        </div>
        <button onClick={handleScan} disabled={scanning} className="mt-4 w-full px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700 disabled:opacity-50">{scanning ? "Scanning..." : "Simulate Scan"}</button>
      </div>
    </div>
  );
}

// ---------- Modal: Extend Visit ----------
function ExtendVisitModal({ visitor, onClose, onExtend }: { visitor: Visitor; onClose: () => void; onExtend: (min: number) => void }) {
  const [minutes, setMinutes] = useState(30);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><Timer size={18} className="text-blue-600" /> Extend Visit</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <p className="text-sm text-slate-500 mb-3">Extend expected duration for <strong>{visitor.name}</strong> (currently {visitor.expectedDurationMin} min).</p>
        <div className="flex gap-2">
          {[15, 30, 60].map(m => (
            <button key={m} onClick={() => setMinutes(m)} className={`flex-1 text-sm px-3 py-2 rounded-lg border ${minutes === m ? "bg-blue-600 border-blue-600 text-white" : "border-slate-200 text-slate-600"}`}>+{m} min</button>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Cancel</button>
          <button onClick={() => onExtend(minutes)} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700">Extend</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Modal: Call Security ----------
function CallSecurityModal({ onClose, onCall }: { onClose: () => void; onCall: () => void }) {
  const [reason, setReason] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><Siren size={18} className="text-red-600" /> Call Security</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Briefly describe the situation..." className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
        <div className="flex justify-end gap-2 pt-4">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Cancel</button>
          <button onClick={onCall} className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm hover:bg-red-700">Alert Security</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Modal: Visitor Records ----------
function VisitorRecordsModal({ visitors, onClose }: { visitors: Visitor[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><Users size={18} className="text-blue-600" /> Visitor Records</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {visitors.map(v => (
            <div key={v.id} className="flex items-center justify-between border border-slate-100 rounded-xl p-2.5">
              <div className="flex items-center gap-2">
                <span className={`w-8 h-8 rounded-full ${v.color} text-white flex items-center justify-center text-[10px] font-bold`}>{v.initials}</span>
                <div>
                  <div className="text-sm font-medium text-slate-800">{v.name}</div>
                  <div className="text-xs text-slate-400">{v.company} · {v.id}</div>
                </div>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusColor(v.status)}`}>{v.status}</span>
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

// ---------- Modal: Emergency List ----------
function EmergencyListModal({ visitors, onClose }: { visitors: Visitor[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><AlertTriangle size={18} className="text-red-600" /> Emergency Evacuation List</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <p className="text-xs text-slate-500 mb-3">All visitors currently checked in. Use for evacuation roll call.</p>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {visitors.map(v => (
            <div key={v.id} className="flex items-center justify-between border border-red-100 bg-red-50/30 rounded-xl p-2.5">
              <div>
                <div className="text-sm font-medium text-slate-800">{v.name}</div>
                <div className="text-xs text-slate-400">{v.company} · Host: {v.host} · {v.floor}</div>
              </div>
              <span className="text-xs text-slate-500 font-mono">#{v.badgeNumber}</span>
            </div>
          ))}
          {visitors.length === 0 && <div className="text-sm text-slate-400 text-center py-6">No visitors currently inside.</div>}
        </div>
        <div className="flex justify-end pt-4">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Close</button>
        </div>
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
          <h3 className="text-lg font-semibold text-slate-900">Export Visitor Log</h3>
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

// ---------- Modal: Badge Preview ----------
function BadgePreviewModal({ visitor, onClose, onPrint }: { visitor: Visitor; onClose: () => void; onPrint: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Badge Preview</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <BadgeCard visitor={visitor} />
        <div className="flex justify-end gap-2 pt-4">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Close</button>
          <button onClick={onPrint} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm hover:bg-indigo-700 flex items-center gap-1.5"><Printer size={14} /> Print</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Modal: History ----------
function HistoryModal({ visitor, onClose }: { visitor: Visitor; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><History size={18} className="text-slate-600" /> {visitor.name} — Full History</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {visitor.timeline.map((ev, idx) => (
            <div key={idx} className="border border-slate-100 rounded-xl p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-800">{ev.action}</span>
                <span className="text-xs text-slate-400">{ev.time}</span>
              </div>
              <div className="text-xs text-slate-400">{ev.staff}</div>
              {ev.note && <div className="text-xs text-slate-500 italic mt-0.5">"{ev.note}"</div>}
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