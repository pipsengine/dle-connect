"use client";

import React, { useState, useMemo } from "react";
import {
  Bell,
  Building2,
  Calendar,
  Camera,
  CheckCircle2,
  Clock,
  Download,
  Footprints,
  IdCard,
  Mail,
  MapPin,
  Phone,
  Printer,
  QrCode,
  Search,
  ThumbsDown,
  ThumbsUp,
  Users,
  X,
  UserPlus,
  ScanLine,
  ListChecks,
  Siren,
  ArrowRight,
} from "lucide-react";
import { useRouter } from "next/navigation";

// ---------- types ----------
interface TimelineEvent {
  time: string;
  action: string;
  staff: string;
  note?: string;
}

interface ActivityItem {
  id: string;
  name: string;
  company: string;
  host: string;
  purpose: string;
  status: "Checked In" | "Awaiting Approval" | "Badge Printed" | "Checked Out";
  time: string;
  initials: string;
  color: string;
  timeline: TimelineEvent[];
}

interface ScheduleItem {
  id: string;
  time: string;
  title: string;
  room: string;
  visitor: string;
  host: string;
  status: "Upcoming" | "Arrived" | "In Progress" | "Completed";
  countdown: string;
}

interface HostAwaiting {
  id: string;
  name: string;
  department: string;
  expectedVisitor: string;
  scheduledTime: string;
  arrivalStatus: "Waiting" | "Visitor En Route" | "Visitor Arrived";
  initials: string;
}

interface ApprovalRequest {
  id: string;
  name: string;
  company: string;
  host: string;
  purpose: string;
  requestedTime: string;
  priority: "Low" | "Medium" | "High";
}

interface FlowPoint {
  time: string;
  label: string;
  icon: "arrival" | "checkin" | "meeting" | "departure" | "visit";
}

type StatDetail =
  | { kind: "activity"; title: string; items: ActivityItem[] }
  | { kind: "schedule"; title: string; items: ScheduleItem[] }
  | { kind: "approvals"; title: string; items: ApprovalRequest[] };

// ---------- mock data ----------
const initialActivity: ActivityItem[] = [
  {
    id: "act-1", name: "Sarah Johnson", company: "ABC Technologies", host: "Finance Team", purpose: "Vendor Meeting", status: "Checked In", time: "10:24 AM", initials: "SJ", color: "bg-emerald-500",
    timeline: [
      { time: "10:05 AM", action: "Visitor Registered", staff: "System" },
      { time: "10:20 AM", action: "Visitor Arrived", staff: "Reception" },
      { time: "10:22 AM", action: "ID Verified", staff: "Reception" },
      { time: "10:23 AM", action: "Badge Printed", staff: "Reception" },
      { time: "10:24 AM", action: "Checked In", staff: "Reception" },
    ],
  },
  {
    id: "act-2", name: "Michael Ade", company: "Coastal Logistics", host: "David Wilson", purpose: "Awaiting Host Approval", status: "Awaiting Approval", time: "10:32 AM", initials: "MA", color: "bg-amber-500",
    timeline: [
      { time: "10:20 AM", action: "Visitor Registered", staff: "System" },
      { time: "10:30 AM", action: "Visitor Arrived", staff: "Reception" },
      { time: "10:32 AM", action: "Awaiting Host Approval", staff: "Reception" },
    ],
  },
  {
    id: "act-3", name: "Grace Lee", company: "Nimbus Consulting", host: "Emily Carter", purpose: "Proceeding to Meeting Room B", status: "Badge Printed", time: "10:35 AM", initials: "GL", color: "bg-blue-500",
    timeline: [
      { time: "10:15 AM", action: "Visitor Registered", staff: "System" },
      { time: "10:30 AM", action: "Visitor Arrived", staff: "Reception" },
      { time: "10:33 AM", action: "ID Verified", staff: "Reception" },
      { time: "10:35 AM", action: "Badge Printed", staff: "Reception" },
    ],
  },
  {
    id: "act-4", name: "Tunde Bakare", company: "Zenith Freight", host: "James Okafor", purpose: "Interview — Operations", status: "Checked In", time: "10:41 AM", initials: "TB", color: "bg-emerald-500",
    timeline: [
      { time: "10:25 AM", action: "Visitor Registered", staff: "System" },
      { time: "10:38 AM", action: "Visitor Arrived", staff: "Reception" },
      { time: "10:39 AM", action: "ID Verified", staff: "Reception" },
      { time: "10:40 AM", action: "Badge Printed", staff: "Reception" },
      { time: "10:41 AM", action: "Checked In", staff: "Reception" },
    ],
  },
  {
    id: "act-5", name: "Amara Chukwu", company: "Coral Partners", host: "Sarah Johnson (HR)", purpose: "Contract Signing", status: "Checked Out", time: "09:58 AM", initials: "AC", color: "bg-slate-400",
    timeline: [
      { time: "09:10 AM", action: "Visitor Registered", staff: "System" },
      { time: "09:20 AM", action: "Visitor Arrived", staff: "Reception" },
      { time: "09:22 AM", action: "ID Verified", staff: "Reception" },
      { time: "09:24 AM", action: "Badge Printed", staff: "Reception" },
      { time: "09:25 AM", action: "Checked In", staff: "Reception" },
      { time: "09:58 AM", action: "Checked Out", staff: "Reception", note: "Contract signed" },
    ],
  },
  {
    id: "act-6", name: "Ifeoma Nwosu", company: "BluePeak Analytics", host: "Michael Adams", purpose: "Software Demo", status: "Checked In", time: "09:40 AM", initials: "IN", color: "bg-emerald-500",
    timeline: [
      { time: "09:15 AM", action: "Visitor Registered", staff: "System" },
      { time: "09:35 AM", action: "Visitor Arrived", staff: "Reception" },
      { time: "09:37 AM", action: "ID Verified", staff: "Reception" },
      { time: "09:39 AM", action: "Badge Printed", staff: "Reception" },
      { time: "09:40 AM", action: "Checked In", staff: "Reception" },
    ],
  },
];

const initialSchedule: ScheduleItem[] = [
  { id: "sc-1", time: "09:00", title: "Vendor Meeting", room: "Conference Room A", visitor: "Sarah Johnson", host: "Finance Team", status: "Completed", countdown: "Completed" },
  { id: "sc-2", time: "10:30", title: "Software Demo", room: "Meeting Room 2", visitor: "Ifeoma Nwosu", host: "Michael Adams", status: "In Progress", countdown: "In progress" },
  { id: "sc-3", time: "11:15", title: "Interview — Operations", room: "Meeting Room B", visitor: "Tunde Bakare", host: "James Okafor", status: "Arrived", countdown: "Starting soon" },
  { id: "sc-4", time: "13:00", title: "Client Presentation", room: "Executive Boardroom", visitor: "Coral Partners Team", host: "Sarah Johnson (HR)", status: "Upcoming", countdown: "in 2h 15m" },
  { id: "sc-5", time: "14:30", title: "Facility Walkthrough", room: "Lobby → Floor 3", visitor: "Coastal Logistics", host: "David Wilson", status: "Upcoming", countdown: "in 3h 45m" },
];

const initialHosts: HostAwaiting[] = [
  { id: "ha-1", name: "David Wilson", department: "Procurement", expectedVisitor: "Michael Ade", scheduledTime: "10:30 AM", arrivalStatus: "Visitor Arrived", initials: "DW" },
  { id: "ha-2", name: "Emily Carter", department: "Consulting Relations", expectedVisitor: "Grace Lee", scheduledTime: "10:30 AM", arrivalStatus: "Visitor Arrived", initials: "EC" },
  { id: "ha-3", name: "James Okafor", department: "Operations", expectedVisitor: "Tunde Bakare", scheduledTime: "11:15 AM", arrivalStatus: "Visitor En Route", initials: "JO" },
  { id: "ha-4", name: "Sarah Johnson (HR)", department: "Human Resources", expectedVisitor: "Coral Partners Team", scheduledTime: "1:00 PM", arrivalStatus: "Waiting", initials: "SJ" },
];

const initialApprovals: ApprovalRequest[] = [
  { id: "ap-1", name: "Michael Ade", company: "Coastal Logistics", host: "David Wilson", purpose: "Contract renewal discussion", requestedTime: "10:32 AM", priority: "High" },
  { id: "ap-2", name: "Chidi Eze", company: "Freelance Auditor", host: "Finance Team", purpose: "Quarterly audit review", requestedTime: "10:45 AM", priority: "Medium" },
  { id: "ap-3", name: "Ngozi Umeh", company: "BluePeak Analytics", host: "Michael Adams", purpose: "Follow-up demo session", requestedTime: "11:00 AM", priority: "Low" },
];

const flowTimeline: FlowPoint[] = [
  { time: "08:00", label: "6 Arrivals", icon: "arrival" },
  { time: "09:00", label: "12 Arrivals", icon: "arrival" },
  { time: "10:00", label: "Peak Check-ins", icon: "checkin" },
  { time: "11:00", label: "Meetings Started", icon: "meeting" },
  { time: "12:00", label: "Lunch Departures", icon: "departure" },
  { time: "14:00", label: "Client Visits", icon: "visit" },
];

const occupancy = { totalCapacity: 300, currentVisitors: 22, employeesOnsite: 184, availableCapacity: 300 - 22 - 184 };

// ---------- utility ----------
const statusColor = (status: string) =>
  status === "Checked In" || status === "Arrived" || status === "Visitor Arrived" ? "bg-emerald-50 text-emerald-700" :
  status === "Awaiting Approval" || status === "Waiting" || status === "Upcoming" ? "bg-amber-50 text-amber-700" :
  status === "Badge Printed" || status === "Visitor En Route" || status === "In Progress" ? "bg-blue-50 text-blue-700" :
  status === "Checked Out" || status === "Completed" ? "bg-slate-100 text-slate-500" : "bg-red-50 text-red-700";

const priorityColor = (p: string) => p === "High" ? "bg-red-50 text-red-700" : p === "Medium" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600";

const flowIcon = (icon: FlowPoint["icon"]) => {
  const props = { size: 14 };
  switch (icon) {
    case "arrival": return <Footprints {...props} />;
    case "checkin": return <IdCard {...props} />;
    case "meeting": return <Users {...props} />;
    case "departure": return <ArrowRight {...props} />;
    case "visit": return <Building2 {...props} />;
  }
};

// ---------- component ----------
export default function VisitorManagementDashboard() {
  const [activity, setActivity] = useState<ActivityItem[]>(initialActivity);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>(initialApprovals);
  const [toast, setToast] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activitySearchQuery, setActivitySearchQuery] = useState("");
  const [selectedActivityId, setSelectedActivityId] = useState<string>(initialActivity[0].id);
  const router = useRouter();

  // modal state
  const [showRegisterVisitor, setShowRegisterVisitor] = useState(false);
  const [showQuickCheckin, setShowQuickCheckin] = useState(false);
  const [showPrintBadge, setShowPrintBadge] = useState(false);
  const [showExportLog, setShowExportLog] = useState(false);
  const [showScanQr, setShowScanQr] = useState(false);
  const [showSearchVisitor, setShowSearchVisitor] = useState(false);
  const [showRegisterWalkin, setShowRegisterWalkin] = useState(false);
  const [showNotifyHost, setShowNotifyHost] = useState(false);
  const [showVisitorDirectory, setShowVisitorDirectory] = useState(false);
  const [showEmergencyList, setShowEmergencyList] = useState(false);
  const [approvalDetail, setApprovalDetail] = useState<ApprovalRequest | null>(null);
  const [hostContact, setHostContact] = useState<HostAwaiting | null>(null);
  const [scheduleDetail, setScheduleDetail] = useState<ScheduleItem | null>(null);
  const [statDetail, setStatDetail] = useState<StatDetail | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  const logActivity = (name: string, company: string, host: string, purpose: string, status: ActivityItem["status"], color: string) => {
    const initials = name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
    const id = `act-${Date.now()}`;
    const firstEvent: TimelineEvent = {
      time: "Just now",
      action: status === "Awaiting Approval" ? "Visitor Registered" : "Checked In",
      staff: "Reception",
    };
    setActivity(prev => [{ id, name, company, host, purpose, status, time: "Just now", initials, color, timeline: [firstEvent] }, ...prev]);
    setSelectedActivityId(id);
  };

  const approveRequest = (id: string) => {
    const req = approvals.find(a => a.id === id);
    setApprovals(prev => prev.filter(a => a.id !== id));
    if (req) logActivity(req.name, req.company, req.host, "Approved — proceeding to reception", "Badge Printed", "bg-blue-500");
    showToast(`${req?.name} approved`);
  };
  const rejectRequest = (id: string) => {
    const req = approvals.find(a => a.id === id);
    setApprovals(prev => prev.filter(a => a.id !== id));
    showToast(`${req?.name}'s request declined`);
  };

  const todayLabel = "Wednesday, July 16, 2026";
  const expectedToday = 48;
  const checkedInActivity = activity.filter(a => a.status === "Checked In" || a.status === "Badge Printed");
  const checkedOutActivity = activity.filter(a => a.status === "Checked Out");
  const checkedIn = checkedInActivity.length + 25;
  const currentlyInside = occupancy.currentVisitors;
  const checkedOut = checkedOutActivity.length + 8;
  const pendingApprovalsCount = approvals.length;

  const occupancyPct = Math.round((occupancy.currentVisitors / occupancy.totalCapacity) * 100);
  const occupancyCircumference = 2 * Math.PI * 52;

  const selectedActivity = activity.find(a => a.id === selectedActivityId) || activity[0];

  const filteredActivity = useMemo(() => {
    const q = activitySearchQuery.trim().toLowerCase();
    if (!q) return activity;
    return activity.filter(item =>
      item.name.toLowerCase().includes(q) ||
      item.company.toLowerCase().includes(q) ||
      item.host.toLowerCase().includes(q) ||
      item.purpose.toLowerCase().includes(q) ||
      item.status.toLowerCase().includes(q)
    );
  }, [activity, activitySearchQuery]);

  const selectActivityFromStatDetail = (id: string) => {
    setSelectedActivityId(id);
    setStatDetail(null);
  };
  const openScheduleFromStatDetail = (item: ScheduleItem) => {
    setScheduleDetail(item);
    setStatDetail(null);
  };
  const openApprovalFromStatDetail = (item: ApprovalRequest) => {
    setApprovalDetail(item);
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

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl px-6 py-4 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Visitor Management Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500 max-w-xl">
            Monitor visitor arrivals, check-ins, approvals, and building occupancy in real time.
          </p>
          <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><Calendar size={12} /> {todayLabel}</span>
            <span className="flex items-center gap-1 text-emerald-600 font-medium"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Reception Open</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Live Sync</span>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => router.push("/security/visitor-management/visitor-registration")} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2">
            <UserPlus size={16} /> Register Visitor
          </button>
          <button onClick={() => setShowQuickCheckin(true)} className="border border-slate-200 px-3 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"><IdCard size={16} /> Quick Check-in</button>
          <button onClick={() => setShowPrintBadge(true)} className="border border-slate-200 px-3 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"><Printer size={16} /> Print Badge</button>
          <button onClick={() => setShowExportLog(true)} className="border border-slate-200 px-3 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"><Download size={16} /> Export Visitor Log</button>
        </div>
      </div>

      {/* Section 1 - Today's Reception Overview */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          {
            label: "Visitors Expected Today", value: expectedToday, sub: "Scheduled", icon: <Users size={22} />, gradient: "from-blue-500 to-indigo-600",
            open: () => setStatDetail({ kind: "schedule", title: "Visitors Expected Today", items: initialSchedule }),
          },
          {
            label: "Checked In", value: checkedIn, sub: "Visitors", icon: <CheckCircle2 size={22} />, gradient: "from-emerald-500 to-teal-600",
            open: () => setStatDetail({ kind: "activity", title: "Checked In", items: checkedInActivity }),
          },
          {
            label: "Currently Inside", value: currentlyInside, sub: "Visitors", icon: <Building2 size={22} />, gradient: "from-indigo-500 to-blue-600",
            open: () => setStatDetail({ kind: "activity", title: "Currently Inside", items: checkedInActivity }),
          },
          {
            label: "Checked Out", value: checkedOut, sub: "Visitors", icon: <ArrowRight size={22} />, gradient: "from-slate-400 to-slate-500",
            open: () => setStatDetail({ kind: "activity", title: "Checked Out", items: checkedOutActivity }),
          },
          {
            label: "Pending Approvals", value: pendingApprovalsCount, sub: "Requests", icon: <Clock size={22} />, gradient: "from-amber-500 to-orange-500",
            open: () => setStatDetail({ kind: "approvals", title: "Pending Approvals", items: approvals }),
          },
        ].map(tile => (
          <button
            key={tile.label}
            onClick={tile.open}
            className={`text-left rounded-2xl p-4 text-white shadow-sm bg-gradient-to-br ${tile.gradient} hover:brightness-110 active:scale-[0.98] transition cursor-pointer`}
          >
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center">{tile.icon}</div>
            </div>
            <div className="mt-3 text-3xl font-bold">{tile.value}</div>
            <div className="text-xs text-white/80 mt-0.5">{tile.sub}</div>
            <div className="text-[11px] text-white/70 mt-1">{tile.label}</div>
          </button>
        ))}
      </div>

      {/* Section 2 & 3 - Live Visitor Activity + Building Occupancy */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Live Visitor Activity</h2>
            <span className="text-xs text-emerald-600 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live</span>
          </div>
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={activitySearchQuery}
              onChange={e => setActivitySearchQuery(e.target.value)}
              placeholder="Search activity..."
              className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-300"
            />
          </div>
          <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
            {filteredActivity.map(a => (
              <button
                key={a.id}
                onClick={() => setSelectedActivityId(a.id)}
                className={`w-full text-left flex items-center gap-3 border rounded-xl p-3 hover:bg-slate-50 transition ${selectedActivityId === a.id ? "border-blue-300 ring-1 ring-blue-200 bg-blue-50/40" : "border-slate-100"}`}
              >
                <span className={`w-10 h-10 rounded-full ${a.color} text-white flex items-center justify-center text-xs font-bold flex-shrink-0`}>{a.initials}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900 truncate">{a.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${statusColor(a.status)}`}>{a.status}</span>
                  </div>
                  <div className="text-xs text-slate-500 truncate">{a.company} · {a.purpose}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Host: {a.host}</div>
                </div>
                <span className="text-xs text-slate-400 flex-shrink-0">{a.time}</span>
              </button>
            ))}
            {filteredActivity.length === 0 && (
              <div className="p-8 text-center text-sm text-slate-400">No activity entries match this search.</div>
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Building Occupancy</h2>
          <div className="flex flex-col items-center">
            <div className="relative" style={{ width: 130, height: 130 }}>
              <svg width={130} height={130} viewBox="0 0 130 130">
                <circle cx={65} cy={65} r={52} fill="none" stroke="#e2e8f0" strokeWidth="12" />
                <circle
                  cx={65} cy={65} r={52} fill="none" stroke="#4F46E5" strokeWidth="12"
                  strokeDasharray={occupancyCircumference} strokeDashoffset={occupancyCircumference - (occupancyPct / 100) * occupancyCircumference}
                  strokeLinecap="round" transform="rotate(-90 65 65)"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-slate-900">{occupancyPct}%</span>
                <span className="text-[10px] text-slate-400">Occupied</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 w-full mt-4 text-center">
              <div className="border border-slate-100 rounded-xl p-2.5">
                <div className="text-[10px] text-slate-400">Total Capacity</div>
                <div className="text-sm font-bold text-slate-800">{occupancy.totalCapacity}</div>
              </div>
              <div className="border border-slate-100 rounded-xl p-2.5">
                <div className="text-[10px] text-slate-400">Visitors</div>
                <div className="text-sm font-bold text-indigo-600">{occupancy.currentVisitors}</div>
              </div>
              <div className="border border-slate-100 rounded-xl p-2.5">
                <div className="text-[10px] text-slate-400">Employees On-site</div>
                <div className="text-sm font-bold text-slate-800">{occupancy.employeesOnsite}</div>
              </div>
              <div className="border border-slate-100 rounded-xl p-2.5">
                <div className="text-[10px] text-slate-400">Available</div>
                <div className="text-sm font-bold text-emerald-600">{occupancy.availableCapacity}</div>
              </div>
            </div>
            <div className="w-full mt-4">
              <div className="text-[11px] text-slate-400 mb-1.5">Occupancy Today</div>
              <div className="flex items-end gap-1.5 h-10">
                {[10, 25, 45, 68, 82, 90, 74, 55].map((v, i) => (
                  <div key={i} className="flex-1 bg-indigo-400/70 rounded-t" style={{ height: `${v}%` }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section: Check-in Timeline (for selected visitor) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-slate-900">Check-in Timeline — {selectedActivity.name}</h2>
          <span className="text-xs text-slate-400">{selectedActivity.company}</span>
        </div>
        <p className="text-xs text-slate-400 mb-4">Select a visitor from Live Visitor Activity to view their timeline.</p>
        {selectedActivity.timeline && selectedActivity.timeline.length > 0 ? (
          <div className="flex items-start overflow-x-auto pb-2">
            {selectedActivity.timeline.map((ev, idx) => (
              <React.Fragment key={idx}>
                <div className="flex flex-col items-center min-w-[130px] text-center flex-shrink-0">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${idx === selectedActivity.timeline.length - 1 ? "bg-blue-500" : "bg-slate-300"}`} />
                  <div className="text-xs font-semibold text-slate-500 mt-1.5">{ev.time}</div>
                  <div className="text-xs text-slate-800 mt-0.5">{ev.action}</div>
                  <div className="text-[10px] text-slate-400">{ev.staff}</div>
                  {ev.note && <div className="text-[10px] text-slate-500 italic mt-0.5">"{ev.note}"</div>}
                </div>
                {idx < selectedActivity.timeline.length - 1 && <div className="flex-1 h-0.5 bg-slate-200 min-w-[24px] mt-[5px]" />}
              </React.Fragment>
            ))}
          </div>
        ) : (
          <div className="text-sm text-slate-400 text-center py-6">No timeline events yet for this visitor.</div>
        )}
      </div>

      {/* Section 4 & 5 - Today's Schedule + Hosts Awaiting Visitors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Today's Schedule</h2>
          <div className="space-y-3">
            {initialSchedule.map(s => (
              <button key={s.id} onClick={() => setScheduleDetail(s)} className="w-full text-left flex items-center gap-3 border border-slate-100 rounded-xl p-3 hover:bg-slate-50">
                <div className="w-14 flex-shrink-0 text-center">
                  <div className="text-sm font-bold text-indigo-600">{s.time}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate">{s.title}</div>
                  <div className="text-xs text-slate-500 flex items-center gap-1"><MapPin size={11} /> {s.room}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{s.visitor} · Host: {s.host}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusColor(s.status)}`}>{s.status}</span>
                  <div className="text-[10px] text-slate-400 mt-1">{s.countdown}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Hosts Awaiting Visitors</h2>
          <div className="space-y-3">
            {initialHosts.map(h => (
              <div key={h.id} className="flex items-center gap-3 border border-slate-100 rounded-xl p-3">
                <span className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0">{h.initials}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate">{h.name}</div>
                  <div className="text-xs text-slate-500">{h.department}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Expecting {h.expectedVisitor} · {h.scheduledTime}</div>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusColor(h.arrivalStatus)}`}>{h.arrivalStatus}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setHostContact(h)} className="p-1 border border-slate-200 rounded-lg hover:bg-slate-50" title="Call Host"><Phone size={12} className="text-slate-500" /></button>
                    <button onClick={() => showToast(`Reminder sent to ${h.name}`)} className="p-1 border border-slate-200 rounded-lg hover:bg-slate-50" title="Send Reminder"><Bell size={12} className="text-slate-500" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Section 6 & 7 - Quick Check-in Hub + Pending Approvals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Quick Check-in Hub</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Scan QR Code", icon: <ScanLine size={20} />, action: () => setShowScanQr(true), color: "text-blue-600 bg-blue-50" },
              { label: "Manual Check-in", icon: <IdCard size={20} />, action: () => setShowQuickCheckin(true), color: "text-emerald-600 bg-emerald-50" },
              { label: "Print Badge", icon: <Printer size={20} />, action: () => setShowPrintBadge(true), color: "text-indigo-600 bg-indigo-50" },
              { label: "Search Visitor", icon: <Search size={20} />, action: () => setShowSearchVisitor(true), color: "text-slate-600 bg-slate-100" },
              { label: "Register Walk-in", icon: <UserPlus size={20} />, action: () => setShowRegisterWalkin(true), color: "text-amber-600 bg-amber-50" },
            ].map(item => (
              <button key={item.label} onClick={item.action} className="flex flex-col items-center gap-2 border border-slate-200 rounded-xl p-4 hover:shadow-md transition text-center">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${item.color}`}>{item.icon}</div>
                <span className="text-sm font-medium text-slate-700">{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Pending Approvals</h2>
            <span className="text-xs text-slate-400">{approvals.length} requests</span>
          </div>
          {approvals.length === 0 ? (
            <div className="text-sm text-slate-400 text-center py-10">No pending approvals right now.</div>
          ) : (
            <div className="space-y-3">
              {approvals.map(a => (
                <div key={a.id} className="border border-amber-100 bg-amber-50/30 rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900">{a.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${priorityColor(a.priority)}`}>{a.priority} Priority</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{a.company} · Host: {a.host}</div>
                  <div className="text-xs text-slate-600 mt-1">{a.purpose}</div>
                  <div className="text-[11px] text-slate-400 mt-1">Requested {a.requestedTime}</div>
                  <div className="flex items-center gap-1.5 mt-2.5">
                    <button onClick={() => approveRequest(a.id)} className="text-[11px] px-2 py-1 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-1"><ThumbsUp size={11} /> Approve</button>
                    <button onClick={() => rejectRequest(a.id)} className="text-[11px] px-2 py-1 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 flex items-center gap-1"><ThumbsDown size={11} /> Reject</button>
                    <button onClick={() => setApprovalDetail(a)} className="text-[11px] px-2 py-1 border border-slate-200 rounded-lg hover:bg-white">Details</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Section 8 - Visitor Flow Timeline */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Visitor Flow Timeline</h2>
        <div className="flex items-center overflow-x-auto pb-2">
          {flowTimeline.map((f, idx) => (
            <React.Fragment key={f.time}>
              <div className="flex flex-col items-center min-w-[110px]">
                <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">{flowIcon(f.icon)}</div>
                <div className="text-xs font-semibold text-slate-700 mt-2">{f.time}</div>
                <div className="text-[11px] text-slate-500 text-center">{f.label}</div>
              </div>
              {idx < flowTimeline.length - 1 && <div className="flex-1 h-0.5 bg-slate-200 min-w-[24px]" />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Quick Actions Panel */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Register Walk-in", icon: <UserPlus size={18} />, action: () => setShowRegisterWalkin(true) },
            { label: "Check In Visitor", icon: <IdCard size={18} />, action: () => setShowQuickCheckin(true) },
            { label: "Print Badge", icon: <Printer size={18} />, action: () => setShowPrintBadge(true) },
            { label: "Notify Host", icon: <Bell size={18} />, action: () => setShowNotifyHost(true) },
            { label: "Visitor Directory", icon: <ListChecks size={18} />, action: () => setShowVisitorDirectory(true) },
            { label: "Emergency Visitor List", icon: <Siren size={18} />, action: () => setShowEmergencyList(true) },
          ].map(qa => (
            <button key={qa.label} onClick={qa.action} className="flex flex-col items-center gap-2 border border-slate-200 rounded-xl p-3 hover:bg-slate-50 transition text-center">
              <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">{qa.icon}</div>
              <span className="text-xs font-medium text-slate-700">{qa.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ---------- Modals ---------- */}
      {showRegisterVisitor && (
        <RegisterVisitorModal onClose={() => setShowRegisterVisitor(false)} onSubmit={(data) => {
          logActivity(data.name, data.company, data.host, data.purpose, "Awaiting Approval", "bg-amber-500");
          showToast(`${data.name} registered — awaiting host approval`);
          setShowRegisterVisitor(false);
        }} />
      )}

      {showQuickCheckin && (
        <QuickCheckinModal onClose={() => setShowQuickCheckin(false)} onSubmit={(data) => {
          logActivity(data.name, data.company, data.host, "Checked in", "Checked In", "bg-emerald-500");
          showToast(`${data.name} checked in`);
          setShowQuickCheckin(false);
        }} />
      )}

      {showPrintBadge && (
        <PrintBadgeModal onClose={() => setShowPrintBadge(false)} onPrint={(name) => { showToast(`Badge printed for ${name}`); setShowPrintBadge(false); }} />
      )}

      {showExportLog && (
        <ExportLogModal onClose={() => setShowExportLog(false)} onExport={() => { showToast("Visitor log exported"); setShowExportLog(false); }} />
      )}

      {showScanQr && (
        <ScanQrModal onClose={() => setShowScanQr(false)} onScan={(name) => {
          logActivity(name, "Pre-registered visitor", "Auto-detected host", "Checked in via QR", "Checked In", "bg-emerald-500");
          showToast(`${name} checked in via QR code`);
          setShowScanQr(false);
        }} />
      )}

      {showSearchVisitor && (
        <SearchVisitorModal activity={activity} onClose={() => setShowSearchVisitor(false)} />
      )}

      {showRegisterWalkin && (
        <RegisterWalkinModal onClose={() => setShowRegisterWalkin(false)} onSubmit={(data) => {
          logActivity(data.name, data.company, data.host, "Walk-in — awaiting host", "Awaiting Approval", "bg-amber-500");
          showToast(`Walk-in ${data.name} registered`);
          setShowRegisterWalkin(false);
        }} />
      )}

      {showNotifyHost && (
        <NotifyHostModal onClose={() => setShowNotifyHost(false)} onSubmit={(host) => { showToast(`Notification sent to ${host}`); setShowNotifyHost(false); }} />
      )}

      {showVisitorDirectory && (
        <VisitorDirectoryModal onClose={() => setShowVisitorDirectory(false)} />
      )}

      {showEmergencyList && (
        <EmergencyListModal activity={activity} onClose={() => setShowEmergencyList(false)} />
      )}

      {approvalDetail && (
        <ApprovalDetailModal request={approvalDetail} onClose={() => setApprovalDetail(null)} onApprove={() => { approveRequest(approvalDetail.id); setApprovalDetail(null); }} onReject={() => { rejectRequest(approvalDetail.id); setApprovalDetail(null); }} />
      )}

      {hostContact && (
        <HostContactModal host={hostContact} onClose={() => setHostContact(null)} />
      )}

      {scheduleDetail && (
        <ScheduleDetailModal item={scheduleDetail} onClose={() => setScheduleDetail(null)} />
      )}

      {statDetail && (
        <StatDetailModal
          detail={statDetail}
          onClose={() => setStatDetail(null)}
          onSelectActivity={selectActivityFromStatDetail}
          onSelectSchedule={openScheduleFromStatDetail}
          onSelectApproval={openApprovalFromStatDetail}
        />
      )}
    </div>
  );
}

// ---------- Modal: Stat Detail ----------
function StatDetailModal({
  detail, onClose, onSelectActivity, onSelectSchedule, onSelectApproval,
}: {
  detail: StatDetail;
  onClose: () => void;
  onSelectActivity: (id: string) => void;
  onSelectSchedule: (item: ScheduleItem) => void;
  onSelectApproval: (item: ApprovalRequest) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-1">
          <h3 className="text-lg font-semibold text-slate-900">{detail.title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <p className="text-xs text-slate-400 mb-3">{detail.items.length} item{detail.items.length !== 1 ? "s" : ""} · tap one to view details</p>

        <div className="space-y-2 max-h-80 overflow-y-auto">
          {detail.kind === "activity" && detail.items.map(a => (
            <button key={a.id} onClick={() => onSelectActivity(a.id)} className="w-full text-left flex items-center gap-3 border border-slate-100 rounded-xl p-2.5 hover:bg-slate-50 transition">
              <span className={`w-8 h-8 rounded-full ${a.color} text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0`}>{a.initials}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-800 truncate">{a.name}</div>
                <div className="text-xs text-slate-400 truncate">{a.company} · {a.time}</div>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${statusColor(a.status)}`}>{a.status}</span>
            </button>
          ))}

          {detail.kind === "schedule" && detail.items.map(s => (
            <button key={s.id} onClick={() => onSelectSchedule(s)} className="w-full text-left flex items-center gap-3 border border-slate-100 rounded-xl p-2.5 hover:bg-slate-50 transition">
              <div className="w-12 flex-shrink-0 text-center">
                <div className="text-xs font-bold text-indigo-600">{s.time}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-800 truncate">{s.title}</div>
                <div className="text-xs text-slate-400 truncate">{s.visitor} · Host: {s.host}</div>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${statusColor(s.status)}`}>{s.status}</span>
            </button>
          ))}

          {detail.kind === "approvals" && detail.items.map(a => (
            <button key={a.id} onClick={() => onSelectApproval(a)} className="w-full text-left flex items-center gap-3 border border-slate-100 rounded-xl p-2.5 hover:bg-slate-50 transition">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-800 truncate">{a.name}</div>
                <div className="text-xs text-slate-400 truncate">{a.company} · Host: {a.host}</div>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${priorityColor(a.priority)}`}>{a.priority}</span>
            </button>
          ))}

          {detail.items.length === 0 && <div className="text-sm text-slate-400 text-center py-6">Nothing in this category right now.</div>}
        </div>

        <div className="flex justify-end pt-4">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Close</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Modal: Register Visitor ----------
function RegisterVisitorModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (data: { name: string; company: string; host: string; purpose: string }) => void }) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [host, setHost] = useState("");
  const [purpose, setPurpose] = useState("");
  const [visitDate, setVisitDate] = useState("");
  const [visitTime, setVisitTime] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !host.trim()) return;
    onSubmit({ name, company, host, purpose: purpose || "General Visit" });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><UserPlus size={18} className="text-blue-600" /> Register Visitor</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Visitor Name</label>
            <input required value={name} onChange={e => setName(e.target.value)} placeholder="Full name" className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Company</label>
              <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Company name" className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Host</label>
              <input required value={host} onChange={e => setHost(e.target.value)} placeholder="Employee or team" className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Visit Date</label>
              <input type="date" value={visitDate} onChange={e => setVisitDate(e.target.value)} className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Time</label>
              <input type="time" value={visitTime} onChange={e => setVisitTime(e.target.value)} className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Purpose of Visit</label>
            <input value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="e.g., Vendor meeting" className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700">Register Visitor</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Modal: Quick Check-in ----------
function QuickCheckinModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (data: { name: string; company: string; host: string }) => void }) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [host, setHost] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({ name, company, host: host || "Front Desk" });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><IdCard size={18} className="text-emerald-600" /> Quick Check-in</h3>
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
          <div>
            <label className="text-sm font-medium text-slate-700">Host</label>
            <input value={host} onChange={e => setHost(e.target.value)} placeholder="Employee name" className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm hover:bg-emerald-700">Check In</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Modal: Print Badge ----------
function PrintBadgeModal({ onClose, onPrint }: { onClose: () => void; onPrint: (name: string) => void }) {
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("Standard Visitor");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><Printer size={18} className="text-indigo-600" /> Print Badge</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); if (name.trim()) onPrint(name); }} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Visitor Name</label>
            <input required value={name} onChange={e => setName(e.target.value)} placeholder="Full name" className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Badge Template</label>
            <select value={template} onChange={e => setTemplate(e.target.value)} className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm">
              <option>Standard Visitor</option><option>Contractor</option><option>VIP</option><option>Interview Candidate</option>
            </select>
          </div>
          <div className="border border-dashed border-slate-200 rounded-xl p-4 flex items-center justify-center gap-2 text-slate-400 text-xs">
            <Camera size={16} /> Badge preview will appear here
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm hover:bg-indigo-700">Print Badge</button>
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
          <h3 className="text-lg font-semibold text-slate-900">Export Visitor Log</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Range</label>
            <select value={range} onChange={e => setRange(e.target.value)} className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm">
              <option>Today</option><option>This Week</option><option>This Month</option><option>Custom Range</option>
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

// ---------- Modal: Scan QR Code ----------
function ScanQrModal({ onClose, onScan }: { onClose: () => void; onScan: (name: string) => void }) {
  const [scanning, setScanning] = useState(false);

  const handleScan = () => {
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      onScan("Bola Adeyemi");
    }, 1400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><ScanLine size={18} className="text-blue-600" /> Scan QR Code</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center gap-3 ${scanning ? "border-blue-400 bg-blue-50/40" : "border-slate-200"}`}>
          <QrCode size={48} className={scanning ? "text-blue-500 animate-pulse" : "text-slate-300"} />
          <p className="text-xs text-slate-500">{scanning ? "Scanning pre-registration code..." : "Position visitor's QR code within the frame"}</p>
        </div>
        <button onClick={handleScan} disabled={scanning} className="mt-4 w-full px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700 disabled:opacity-50">{scanning ? "Scanning..." : "Simulate Scan"}</button>
      </div>
    </div>
  );
}

// ---------- Modal: Search Visitor ----------
function SearchVisitorModal({ activity, onClose }: { activity: ActivityItem[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => activity.filter(a => a.name.toLowerCase().includes(query.toLowerCase()) || a.company.toLowerCase().includes(query.toLowerCase())), [activity, query]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><Search size={18} className="text-blue-600" /> Search Visitor</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name or company..." className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-sm" autoFocus />
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {results.map(r => (
            <div key={r.id} className="flex items-center gap-3 border border-slate-100 rounded-xl p-2.5">
              <span className={`w-8 h-8 rounded-full ${r.color} text-white flex items-center justify-center text-[10px] font-bold`}>{r.initials}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-800 truncate">{r.name}</div>
                <div className="text-xs text-slate-400 truncate">{r.company}</div>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${statusColor(r.status)}`}>{r.status}</span>
            </div>
          ))}
          {results.length === 0 && <div className="text-sm text-slate-400 text-center py-6">No visitors found.</div>}
        </div>
      </div>
    </div>
  );
}

// ---------- Modal: Register Walk-in ----------
function RegisterWalkinModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (data: { name: string; company: string; host: string }) => void }) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [host, setHost] = useState("");
  const [reason, setReason] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !host.trim()) return;
    onSubmit({ name, company, host });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><UserPlus size={18} className="text-amber-600" /> Register Walk-in</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Visitor Name</label>
            <input required value={name} onChange={e => setName(e.target.value)} placeholder="Full name" className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Company</label>
              <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Company name" className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Who are they visiting?</label>
              <input required value={host} onChange={e => setHost(e.target.value)} placeholder="Employee name" className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Reason for Visit</label>
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g., Package delivery, unscheduled meeting" className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-amber-500 text-white rounded-xl text-sm hover:bg-amber-600">Register Walk-in</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Modal: Notify Host ----------
function NotifyHostModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (host: string) => void }) {
  const [host, setHost] = useState("");
  const [method, setMethod] = useState("Push Notification");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><Bell size={18} className="text-blue-600" /> Notify Host</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); if (host.trim()) onSubmit(host); }} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Host Name</label>
            <input required value={host} onChange={e => setHost(e.target.value)} placeholder="Employee name" className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Notification Method</label>
            <select value={method} onChange={e => setMethod(e.target.value)} className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm">
              <option>Push Notification</option><option>Email</option><option>SMS</option><option>Desk Phone</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700">Notify</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Modal: Visitor Directory ----------
function VisitorDirectoryModal({ onClose }: { onClose: () => void }) {
  const directory = [
    { name: "Sarah Johnson", company: "ABC Technologies", visits: 4 },
    { name: "Michael Ade", company: "Coastal Logistics", visits: 2 },
    { name: "Grace Lee", company: "Nimbus Consulting", visits: 7 },
    { name: "Tunde Bakare", company: "Zenith Freight", visits: 1 },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><ListChecks size={18} className="text-blue-600" /> Visitor Directory</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="space-y-2">
          {directory.map(d => (
            <div key={d.name} className="flex items-center justify-between border border-slate-100 rounded-xl p-2.5">
              <div>
                <div className="text-sm font-medium text-slate-800">{d.name}</div>
                <div className="text-xs text-slate-400">{d.company}</div>
              </div>
              <span className="text-xs text-slate-500">{d.visits} visits</span>
            </div>
          ))}
        </div>
        <div className="flex justify-end pt-5">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Close</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Modal: Emergency Visitor List ----------
function EmergencyListModal({ activity, onClose }: { activity: ActivityItem[]; onClose: () => void }) {
  const insideNow = activity.filter(a => a.status === "Checked In" || a.status === "Badge Printed");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><Siren size={18} className="text-red-600" /> Emergency Visitor List</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <p className="text-xs text-slate-500 mb-3">All visitors currently checked into the building. Use for evacuation roll call.</p>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {insideNow.map(v => (
            <div key={v.id} className="flex items-center justify-between border border-red-100 bg-red-50/30 rounded-xl p-2.5">
              <div>
                <div className="text-sm font-medium text-slate-800">{v.name}</div>
                <div className="text-xs text-slate-400">{v.company} · Host: {v.host}</div>
              </div>
              <span className="text-xs text-slate-500">{v.time}</span>
            </div>
          ))}
          {insideNow.length === 0 && <div className="text-sm text-slate-400 text-center py-6">No visitors currently inside.</div>}
        </div>
        <div className="flex justify-end pt-5">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Close</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Modal: Approval Detail ----------
function ApprovalDetailModal({ request, onClose, onApprove, onReject }: { request: ApprovalRequest; onClose: () => void; onApprove: () => void; onReject: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900">{request.name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Company</span><span className="font-medium">{request.company}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Host</span><span className="font-medium">{request.host}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Purpose</span><span className="font-medium">{request.purpose}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Requested</span><span className="font-medium">{request.requestedTime}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Priority</span><span className={`px-2 py-0.5 rounded-full text-xs ${priorityColor(request.priority)}`}>{request.priority}</span></div>
        </div>
        <div className="flex justify-end gap-2 pt-5">
          <button onClick={onReject} className="px-4 py-2 border border-red-200 text-red-600 rounded-xl text-sm hover:bg-red-50">Reject</button>
          <button onClick={onApprove} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm hover:bg-emerald-700">Approve</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Modal: Host Contact ----------
function HostContactModal({ host, onClose }: { host: HostAwaiting; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Calling {host.name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <span className="w-16 h-16 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-lg font-bold mx-auto">{host.initials}</span>
        <p className="text-sm text-slate-500 mt-3">{host.department}</p>
        <div className="flex items-center justify-center gap-2 mt-4 text-blue-600">
          <Phone size={16} className="animate-pulse" />
          <span className="text-sm">Dialing extension...</span>
        </div>
        <div className="flex justify-center gap-2 mt-2 text-slate-400 text-xs">
          <Mail size={12} /> Or send an email instead
        </div>
      </div>
    </div>
  );
}

// ---------- Modal: Schedule Detail ----------
function ScheduleDetailModal({ item, onClose }: { item: ScheduleItem; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900">{item.title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Time</span><span className="font-medium">{item.time}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Room</span><span className="font-medium">{item.room}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Visitor</span><span className="font-medium">{item.visitor}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Host</span><span className="font-medium">{item.host}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Status</span><span className={`px-2 py-0.5 rounded-full text-xs ${statusColor(item.status)}`}>{item.status}</span></div>
        </div>
        <div className="flex justify-end pt-5">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Close</button>
        </div>
      </div>
    </div>
  );
}