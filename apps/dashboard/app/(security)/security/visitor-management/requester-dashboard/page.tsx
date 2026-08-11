"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  IdCard,
  LogOut,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Siren,
  Users,
  UserX,
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

interface VisitRequest {
  id: string;
  visitorName: string;
  initials: string;
  color: string;
  company: string;
  host: string;
  purpose: string;
  visitDate: string;
  visitTime: string;
  stage: Stage;
  rejectionReason?: string;
  timeline: TimelineEvent[];
}

interface NotificationItem {
  id: string;
  text: string;
  time: string;
  read: boolean;
  icon: "security" | "reception" | "checkin" | "checkout" | "reject" | "info";
}

type StatDetail = {
  title: string;
  items: VisitRequest[];
  emptyMessage: string;
};

// ---------- stage pipeline ----------
const stagePipeline: Stage[] = [
  "Pending Security Check-in",
  "Pending Reception Check-in",
  "Checked In",
  "Pending Reception Check-out",
  "Pending Security Check-out",
  "Completed",
];

const stageShortLabel: Record<Stage, string> = {
  "Pending Security Check-in": "Security",
  "Pending Reception Check-in": "Reception In",
  "Checked In": "On Site",
  "Pending Reception Check-out": "Reception Out",
  "Pending Security Check-out": "Security Out",
  "Completed": "Done",
  "Rejected": "Rejected",
};

// ---------- mock data ----------
const initialRequests: VisitRequest[] = [
  {
    id: "REQ-3301", visitorName: "John Smith", initials: "JS", color: "bg-blue-500", company: "ABC Technologies", host: "Sarah Johnson", purpose: "Vendor Meeting", visitDate: "Today", visitTime: "09:00 AM",
    stage: "Checked In",
    timeline: [
      { time: "08:20", actor: "You", action: "Visitor request submitted" },
      { time: "08:35", actor: "Security", action: "ID verified — cleared to reception" },
      { time: "08:52", actor: "Reception", action: "Badge issued — checked in" },
    ],
  },
  {
    id: "REQ-3302", visitorName: "Mary Johnson", initials: "MJ", color: "bg-emerald-500", company: "Google", host: "Sarah Johnson", purpose: "Software Demo", visitDate: "Today", visitTime: "10:30 AM",
    stage: "Pending Security Check-in",
    timeline: [{ time: "09:10", actor: "You", action: "Visitor request submitted" }],
  },
  {
    id: "REQ-3298", visitorName: "David Lee", initials: "DL", color: "bg-slate-400", company: "Microsoft", host: "Sarah Johnson", purpose: "Partnership Discussion", visitDate: "Yesterday", visitTime: "10:45 AM",
    stage: "Completed",
    timeline: [
      { time: "10:20", actor: "You", action: "Visitor request submitted" },
      { time: "10:30", actor: "Security", action: "ID verified — cleared to reception" },
      { time: "10:43", actor: "Reception", action: "Badge issued — checked in" },
      { time: "11:15", actor: "Reception", action: "Checked out" },
      { time: "11:18", actor: "Security", action: "Exit cleared — badge returned" },
    ],
  },
  {
    id: "REQ-3295", visitorName: "Chidi Eze", initials: "CE", color: "bg-red-400", company: "Freelance Auditor", host: "Sarah Johnson", purpose: "Quarterly Audit", visitDate: "2 days ago", visitTime: "09:00 AM",
    stage: "Rejected", rejectionReason: "Unauthorized photography flagged on a prior visit.",
    timeline: [
      { time: "08:50", actor: "You", action: "Visitor request submitted" },
      { time: "08:58", actor: "Security", action: "Entry denied" },
    ],
  },
  {
    id: "REQ-3296", visitorName: "Grace Lee", initials: "GL", color: "bg-blue-500", company: "Nimbus Consulting", host: "Sarah Johnson", purpose: "Follow-up Session", visitDate: "Today", visitTime: "10:30 AM",
    stage: "Pending Reception Check-out",
    timeline: [
      { time: "09:55", actor: "You", action: "Visitor request submitted" },
      { time: "10:05", actor: "Security", action: "ID verified — cleared to reception" },
      { time: "10:15", actor: "Reception", action: "Badge issued — checked in" },
    ],
  },
];

const initialNotifications: NotificationItem[] = [
  { id: "n1", text: "Security cleared Mary Johnson's ID — awaiting reception check-in.", time: "2 min ago", read: false, icon: "security" },
  { id: "n2", text: "David Lee's visit is complete — security confirmed exit.", time: "yesterday", read: true, icon: "checkout" },
  { id: "n3", text: "Chidi Eze's request was denied by Security.", time: "2 days ago", read: true, icon: "reject" },
];

// ---------- utility ----------
const stageColor = (stage: Stage) =>
  stage === "Completed" ? "bg-emerald-50 text-emerald-700" :
  stage === "Rejected" ? "bg-red-50 text-red-700" :
  stage === "Checked In" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700";

const notifIcon = (icon: NotificationItem["icon"]) => {
  const props = { size: 14 };
  switch (icon) {
    case "security": return <ShieldCheck {...props} className="text-blue-600" />;
    case "reception": return <IdCard {...props} className="text-indigo-600" />;
    case "checkin": return <CheckCircle2 {...props} className="text-emerald-600" />;
    case "checkout": return <LogOut {...props} className="text-slate-600" />;
    case "reject": return <XCircle {...props} className="text-red-600" />;
    default: return <Bell {...props} className="text-amber-600" />;
  }
};

const workflowStatus = (stage: Stage) => {
  switch (stage) {
    case "Pending Security Check-in":
      return {
        badge: "Security Review",
        tone: "bg-amber-100 text-amber-700",
        title: "Awaiting security verification",
        points: ["Security checks ID and access risk", "A host approval may be requested before reception"],
        cta: "Next step: security clears the visitor to reception",
      };
    case "Pending Reception Check-in":
      return {
        badge: "Reception Handoff",
        tone: "bg-blue-100 text-blue-700",
        title: "Security has cleared the visitor",
        points: ["The visitor is being handed over to reception", "Front desk can issue the badge and complete check-in"],
        cta: "Next step: reception completes the check-in",
      };
    case "Checked In":
      return {
        badge: "On Site",
        tone: "bg-emerald-100 text-emerald-700",
        title: "Visitor is currently on site",
        points: ["The visit is active and in progress", "Reception can announce or support the visitor if needed"],
        cta: "Next step: the visit will move to check-out at the end",
      };
    case "Pending Reception Check-out":
      return {
        badge: "Check-out Pending",
        tone: "bg-indigo-100 text-indigo-700",
        title: "Visitor is ready to leave",
        points: ["Reception is preparing the departure handoff", "The visit will move to final security clearance"],
        cta: "Next step: reception completes departure and hands off for exit clearance",
      };
    case "Pending Security Check-out":
      return {
        badge: "Final Clearance",
        tone: "bg-slate-100 text-slate-700",
        title: "Waiting for final security exit",
        points: ["Security confirms the visitor has exited", "The requester receives a completion notification"],
        cta: "Next step: security closes the visit and notifies you",
      };
    case "Completed":
      return {
        badge: "Completed",
        tone: "bg-emerald-100 text-emerald-700",
        title: "Visit finished successfully",
        points: ["The visit has completed end to end", "A final confirmation is available in activity history"],
        cta: "This request is fully closed",
      };
    default:
      return {
        badge: "Action Needed",
        tone: "bg-red-100 text-red-700",
        title: "The visit was not accepted",
        points: ["Security denied entry for the visitor", "The request is now flagged for follow-up"],
        cta: "Please review the rejection details",
      };
  }
};

// ---------- component ----------
export default function RequesterDashboard() {
  const router = useRouter();
  const [requests, setRequests] = useState<VisitRequest[]>(initialRequests);
  const [notifications, setNotifications] = useState<NotificationItem[]>(initialNotifications);
  const [selectedId, setSelectedId] = useState<string>(initialRequests[0].id);
  const [searchQuery, setSearchQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [statDetail, setStatDetail] = useState<StatDetail | null>(null);

  const [showCancelRequest, setShowCancelRequest] = useState(false);
  const [showResendInvite, setShowResendInvite] = useState(false);
  const [showMessageReception, setShowMessageReception] = useState(false);
  const [showContactSecurity, setShowContactSecurity] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  const goToRegistration = () => router.push("/security/visitor-management/visitor-registration");

  const selected = requests.find(r => r.id === selectedId) || requests[0];

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return requests;
    const q = searchQuery.toLowerCase();
    return requests.filter(r => r.visitorName.toLowerCase().includes(q) || r.company.toLowerCase().includes(q) || r.id.toLowerCase().includes(q));
  }, [requests, searchQuery]);

  const activeRequests = requests.filter(r => r.stage !== "Completed" && r.stage !== "Rejected");
  const onSiteRequests = requests.filter(r => r.stage === "Checked In");
  const completedRequests = requests.filter(r => r.stage === "Completed");
  const rejectedRequests = requests.filter(r => r.stage === "Rejected");
  const activeCount = activeRequests.length;
  const onSiteCount = onSiteRequests.length;
  const completedCount = completedRequests.length;
  const rejectedCount = rejectedRequests.length;
  const unreadCount = notifications.filter(n => !n.read).length;

  const cancelRequest = (id: string) => {
    setRequests(prev => prev.filter(r => r.id !== id));
    showToast("Visitor request cancelled");
    setShowCancelRequest(false);
  };

  const markAllRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })));

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
          <h1 className="text-2xl font-semibold text-slate-900">Requester Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500 max-w-xl">Submit visitor requests and track them through security clearance and reception check-in.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => setShowNotifications(true)} className="relative border border-slate-200 px-3 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-1.5">
            <Bell size={16} /> Notifications
            {unreadCount > 0 && <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center">{unreadCount}</span>}
          </button>
          <button onClick={goToRegistration} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2">
            <Plus size={16} /> New Visitor Request
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Active Requests", value: activeCount, icon: <Clock size={20} />, gradient: "from-amber-500 to-orange-500", items: activeRequests, emptyMessage: "No active requests right now." },
          { label: "Currently On Site", value: onSiteCount, icon: <Users size={20} />, gradient: "from-blue-500 to-indigo-600", items: onSiteRequests, emptyMessage: "No visitors currently checked in." },
          { label: "Completed", value: completedCount, icon: <CheckCircle2 size={20} />, gradient: "from-emerald-500 to-teal-600", items: completedRequests, emptyMessage: "No completed requests yet." },
          { label: "Rejected", value: rejectedCount, icon: <UserX size={20} />, gradient: "from-slate-400 to-slate-500", items: rejectedRequests, emptyMessage: "No rejected requests yet." },
        ].map(tile => (
          <button key={tile.label} onClick={() => setStatDetail({ title: tile.label, items: tile.items, emptyMessage: tile.emptyMessage })} className={`text-left rounded-2xl p-4 text-white shadow-sm bg-gradient-to-br ${tile.gradient} hover:brightness-110 active:scale-[0.98] transition`}>
            <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center">{tile.icon}</div>
            <div className="mt-3 text-2xl font-bold">{tile.value}</div>
            <div className="text-[11px] text-white/80 mt-1">{tile.label}</div>
          </button>
        ))}
      </div>

      {/* Requests list + detail */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-900 mb-2">My Visitor Requests</h2>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search requests..." className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-sm" />
            </div>
          </div>
          <div className="divide-y divide-slate-100 max-h-[560px] overflow-y-auto">
            {filtered.map(r => (
              <button key={r.id} onClick={() => setSelectedId(r.id)} className={`w-full text-left flex items-center gap-3 p-3.5 hover:bg-slate-50 transition ${selectedId === r.id ? "bg-blue-50/60" : ""}`}>
                <span className={`w-9 h-9 rounded-full ${r.color} text-white flex items-center justify-center text-xs font-bold flex-shrink-0`}>{r.initials}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-900 truncate">{r.visitorName}</div>
                  <div className="text-xs text-slate-500 truncate">{r.company} · {r.visitDate}, {r.visitTime}</div>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${stageColor(r.stage)}`}>{stageShortLabel[r.stage]}</span>
              </button>
            ))}
            {filtered.length === 0 && <div className="p-8 text-center text-sm text-slate-400">No requests match your search.</div>}
          </div>
        </div>

        {/* Detail panel */}
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

          {selected.stage === "Rejected" && selected.rejectionReason && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 mb-4">
              <XCircle size={13} className="flex-shrink-0" /> {selected.rejectionReason}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5 text-sm">
            <div><div className="text-xs text-slate-400 flex items-center gap-1"><Building2 size={11} /> Host</div><div className="font-medium">{selected.host}</div></div>
            <div><div className="text-xs text-slate-400 flex items-center gap-1"><Calendar size={11} /> Visit Date</div><div className="font-medium">{selected.visitDate}, {selected.visitTime}</div></div>
            <div className="sm:col-span-1"><div className="text-xs text-slate-400">Purpose</div><div className="font-medium">{selected.purpose}</div></div>
          </div>

          {(() => {
            const workflow = workflowStatus(selected.stage);
            return (
              <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Workflow status</div>
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

          {/* Pipeline stepper */}
          {selected.stage !== "Rejected" && (
            <div className="mb-5">
              <h3 className="text-xs font-semibold text-slate-600 uppercase mb-2">Approval Pipeline</h3>
              <div className="flex items-stretch overflow-x-auto pb-2">
                {stagePipeline.map((stg, idx) => {
                  const currentIdx = stagePipeline.indexOf(selected.stage);
                  const done = idx < currentIdx || selected.stage === "Completed";
                  const current = idx === currentIdx && selected.stage !== "Completed";
                  return (
                    <React.Fragment key={stg}>
                      <div className="flex flex-col items-center min-w-[100px]">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                          done ? "bg-emerald-100 text-emerald-700" : current ? "bg-blue-100 text-blue-700 ring-4 ring-blue-200" : "bg-slate-100 text-slate-400"
                        }`}>
                          {done ? <CheckCircle2 size={14} /> : idx + 1}
                        </div>
                        <div className={`text-[10px] text-center mt-1.5 ${current ? "text-blue-700 font-medium" : done ? "text-emerald-600" : "text-slate-400"}`}>{stg}</div>
                      </div>
                      {idx < stagePipeline.length - 1 && <div className={`flex-1 h-0.5 self-center mt-[-18px] min-w-[16px] ${idx < currentIdx ? "bg-emerald-300" : "bg-slate-200"}`} />}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="mb-5">
            <h3 className="text-xs font-semibold text-slate-600 uppercase mb-2">Activity</h3>
            <div className="space-y-0">
              {selected.timeline.map((ev, idx) => (
                <div key={idx} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${idx === selected.timeline.length - 1 ? "bg-blue-500" : "bg-slate-300"}`} />
                    {idx < selected.timeline.length - 1 && <div className="w-0.5 flex-1 bg-slate-200 my-0.5" style={{ minHeight: "20px" }} />}
                  </div>
                  <div className="pb-4">
                    <div className="text-xs font-semibold text-slate-500">{ev.time} · {ev.actor}</div>
                    <div className="text-sm text-slate-800">{ev.action}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
            {selected.stage !== "Completed" && selected.stage !== "Rejected" && (
              <button onClick={() => setShowCancelRequest(true)} className="text-sm px-3 py-2 border border-red-200 text-red-600 rounded-xl hover:bg-red-50 flex items-center gap-1.5"><XCircle size={15} /> Cancel Request</button>
            )}
            <button onClick={() => setShowResendInvite(true)} className="text-sm px-3 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 flex items-center gap-1.5"><Send size={15} /> Resend Invite</button>
            <button onClick={() => setShowMessageReception(true)} className="text-sm px-3 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 flex items-center gap-1.5"><MessageSquare size={15} /> Message Reception</button>
            <button onClick={() => setShowContactSecurity(true)} className="text-sm px-3 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 flex items-center gap-1.5"><Siren size={15} /> Contact Security</button>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "New Visitor Request", icon: <Plus size={17} />, action: goToRegistration },
            { label: "Copy Visit Details", icon: <Copy size={17} />, action: () => showToast("Visit details copied") },
            { label: "Message Reception", icon: <MessageSquare size={17} />, action: () => setShowMessageReception(true) },
            { label: "Contact Security", icon: <Siren size={17} />, action: () => setShowContactSecurity(true) },
          ].map(qa => (
            <button key={qa.label} onClick={qa.action} className="flex flex-col items-center gap-2 border border-slate-200 rounded-xl p-3 hover:bg-slate-50 transition text-center">
              <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">{qa.icon}</div>
              <span className="text-[11px] font-medium text-slate-700">{qa.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ---------- Modals ---------- */}
      {showNotifications && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-1">
              <h3 className="text-lg font-semibold text-slate-900">Notifications</h3>
              <button onClick={() => setShowNotifications(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <button onClick={markAllRead} className="text-xs text-blue-600 hover:underline mb-3">Mark all as read</button>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {notifications.map(n => (
                <div key={n.id} className={`flex items-start gap-2.5 border rounded-xl p-3 ${n.read ? "border-slate-100" : "border-blue-200 bg-blue-50/40"}`}>
                  <span className="mt-0.5 flex-shrink-0">{notifIcon(n.icon)}</span>
                  <div className="min-w-0">
                    <p className="text-sm text-slate-700">{n.text}</p>
                    <div className="text-xs text-slate-400 mt-0.5">{n.time}</div>
                  </div>
                </div>
              ))}
              {notifications.length === 0 && <div className="text-sm text-slate-400 text-center py-6">No notifications.</div>}
            </div>
            <div className="flex justify-end pt-4">
              <button onClick={() => setShowNotifications(false)} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Close</button>
            </div>
          </div>
        </div>
      )}

      {showCancelRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Cancel Request</h3>
              <button onClick={() => setShowCancelRequest(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <p className="text-sm text-slate-500">Cancel the visit request for <strong>{selected.visitorName}</strong>? This cannot be undone.</p>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowCancelRequest(false)} className="flex-1 px-4 py-2 border border-slate-200 rounded-xl text-sm">Keep Request</button>
              <button onClick={() => cancelRequest(selected.id)} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-xl text-sm hover:bg-red-700">Cancel Request</button>
            </div>
          </div>
        </div>
      )}

      {showResendInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><Mail size={18} className="text-blue-600" /> Resend Invite</h3>
              <button onClick={() => setShowResendInvite(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <p className="text-sm text-slate-500 mb-4">Resend the visit invitation and QR code to {selected.visitorName}.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowResendInvite(false)} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Cancel</button>
              <button onClick={() => { showToast(`Invite resent to ${selected.visitorName}`); setShowResendInvite(false); }} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700">Resend</button>
            </div>
          </div>
        </div>
      )}

      {showMessageReception && (
        <MessageModal title="Message Reception" icon={<IdCard size={18} className="text-indigo-600" />} onClose={() => setShowMessageReception(false)} onSend={() => { showToast("Message sent to reception"); setShowMessageReception(false); }} />
      )}

      {showContactSecurity && (
        <MessageModal title="Contact Security" icon={<Siren size={18} className="text-red-600" />} onClose={() => setShowContactSecurity(false)} onSend={() => { showToast("Message sent to security"); setShowContactSecurity(false); }} />
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
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${stageColor(item.stage)}`}>{stageShortLabel[item.stage]}</span>
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

// ---------- Modal: generic message ----------
function MessageModal({ title, icon, onClose, onSend }: { title: string; icon: React.ReactNode; onClose: () => void; onSend: () => void }) {
  const [message, setMessage] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">{icon} {title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} placeholder="Type your message..." className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
        <div className="flex justify-end gap-2 pt-4">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Cancel</button>
          <button onClick={onSend} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700 flex items-center gap-1.5"><Send size={14} /> Send</button>
        </div>
      </div>
    </div>
  );
}