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
  FileText,
  IdCard,
  Mail,
  MapPin,
  MessageSquareWarning,
  Package,
  Paperclip,
  Phone,
  Printer,
  Settings,
  Shield,
  ThumbsDown,
  ThumbsUp,
  Users,
  X,
  CheckSquare,
  Square,
  UserPlus,
  Zap,
  ScrollText,
} from "lucide-react";

// ---------- types ----------
type Priority = "Low" | "Medium" | "High";
type RequestStatus = "Pending Review" | "Approved" | "Rejected" | "More Info Requested";

interface Attachment {
  name: string;
  type: string;
}

interface ApprovalRequest {
  id: string;
  visitorName: string;
  initials: string;
  color: string;
  company: string;
  host: string;
  visitDate: string;
  visitTime: string;
  purpose: string;
  priority: Priority;
  status: RequestStatus;
  phone: string;
  email: string;
  visitorType: string;
  duration: string;
  meetingRoom: string;
  idType: string;
  idNumber: string;
  vehicleRegistered: string | null;
  itemsCarried: string;
  attachments: Attachment[];
  slaDeadline: number; // epoch ms
  conflicts: string[];
  timelineStep: number; // 0..4
  submittedAt: number; // epoch ms, for sorting
}

interface HostInfo {
  name: string;
  department: string;
  office: string;
  available: boolean;
  upcomingMeetings: number;
  initials: string;
}

interface ActivityEntry {
  id: string;
  actor: string;
  initials: string;
  action: string;
  time: string;
  icon: "approve" | "reject" | "info" | "clear";
}

const timelineSteps = ["Visitor Registered", "Submitted for Approval", "Host Review", "Security Review", "Final Decision"];

// ---------- mock data ----------
const nowTs = Date.now();
const initialRequests: ApprovalRequest[] = [
  {
    id: "REQ-2201", visitorName: "John Smith", initials: "JS", color: "bg-blue-500", company: "ABC Technologies", host: "Sarah Johnson", visitDate: "Today", visitTime: "10:00 AM",
    purpose: "Vendor Meeting", priority: "High", status: "Pending Review", phone: "+234 802 555 0134", email: "john.smith@abctech.com", visitorType: "Vendor", duration: "1 hour", meetingRoom: "Conference Room A",
    idType: "International Passport", idNumber: "P0234455", vehicleRegistered: "Sedan · LND-234-XY", itemsCarried: "Laptop bag",
    attachments: [{ name: "vendor_agreement.pdf", type: "PDF" }, { name: "visitor_photo.jpg", type: "Image" }],
    slaDeadline: nowTs + 1000 * 60 * 18, conflicts: ["Host already has another visitor scheduled at this time."], timelineStep: 2, submittedAt: nowTs - 1000 * 60 * 40,
  },
  {
    id: "REQ-2202", visitorName: "Chidi Eze", initials: "CE", color: "bg-red-400", company: "Freelance Auditor", host: "Finance Team", visitDate: "Today", visitTime: "10:45 AM",
    purpose: "Quarterly Audit Review", priority: "Medium", status: "Pending Review", phone: "+234 805 555 0311", email: "chidi.eze@auditpro.com", visitorType: "Contractor", duration: "1.5 hours", meetingRoom: "Meeting Room B",
    idType: "National ID", idNumber: "N-88213X", vehicleRegistered: null, itemsCarried: "Documents",
    attachments: [{ name: "audit_scope.pdf", type: "PDF" }],
    slaDeadline: nowTs + 1000 * 60 * 55, conflicts: ["Visitor has an incomplete ID verification."], timelineStep: 1, submittedAt: nowTs - 1000 * 60 * 15,
  },
  {
    id: "REQ-2203", visitorName: "Ngozi Umeh", initials: "NU", color: "bg-emerald-500", company: "BluePeak Analytics", host: "Michael Adams", visitDate: "Today", visitTime: "11:00 AM",
    purpose: "Follow-up Demo Session", priority: "Low", status: "Pending Review", phone: "+234 806 555 0442", email: "ngozi.umeh@bluepeak.io", visitorType: "Vendor", duration: "1 hour", meetingRoom: "Meeting Room 2",
    idType: "Driver's License", idNumber: "DL-773310", vehicleRegistered: null, itemsCarried: "Laptop",
    attachments: [], slaDeadline: nowTs + 1000 * 60 * 120, conflicts: [], timelineStep: 1, submittedAt: nowTs - 1000 * 60 * 5,
  },
  {
    id: "REQ-2204", visitorName: "Bola Adeyemi", initials: "BA", color: "bg-indigo-500", company: "Coral Partners", host: "Sarah Johnson (HR)", visitDate: "Today", visitTime: "1:00 PM",
    purpose: "Contract Signing", priority: "High", status: "Pending Review", phone: "+234 807 555 0209", email: "bola.a@coralpartners.com", visitorType: "Guest", duration: "45 min", meetingRoom: "Executive Boardroom",
    idType: "International Passport", idNumber: "P0119873", vehicleRegistered: "SUV · ABJ-901-KL", itemsCarried: "Contract documents",
    attachments: [{ name: "contract_draft.pdf", type: "PDF" }, { name: "id_scan.png", type: "Image" }],
    slaDeadline: nowTs - 1000 * 60 * 5, conflicts: ["Meeting room is fully booked."], timelineStep: 3, submittedAt: nowTs - 1000 * 60 * 70,
  },
  {
    id: "REQ-2205", visitorName: "Tunde Bakare", initials: "TB", color: "bg-blue-500", company: "Zenith Freight", host: "James Okafor", visitDate: "Today", visitTime: "11:15 AM",
    purpose: "Interview — Operations", priority: "Medium", status: "Pending Review", phone: "+234 808 555 0621", email: "tunde.b@zenithfreight.com", visitorType: "Interview Candidate", duration: "45 min", meetingRoom: "Meeting Room C",
    idType: "National ID", idNumber: "N-40218Y", vehicleRegistered: null, itemsCarried: "Resume documents",
    attachments: [{ name: "resume.pdf", type: "PDF" }], slaDeadline: nowTs + 1000 * 60 * 32, conflicts: [], timelineStep: 2, submittedAt: nowTs - 1000 * 60 * 25,
  },
];

const hostDirectory: Record<string, HostInfo> = {
  "Sarah Johnson": { name: "Sarah Johnson", department: "Finance", office: "Floor 3, Room 304", available: true, upcomingMeetings: 3, initials: "SJ" },
  "Finance Team": { name: "Finance Team", department: "Finance", office: "Floor 3", available: true, upcomingMeetings: 5, initials: "FT" },
  "Michael Adams": { name: "Michael Adams", department: "Platform Engineering", office: "Floor 5, Room 512", available: true, upcomingMeetings: 2, initials: "MA" },
  "Sarah Johnson (HR)": { name: "Sarah Johnson (HR)", department: "Human Resources", office: "Floor 3, Room 310", available: false, upcomingMeetings: 4, initials: "SJ" },
  "James Okafor": { name: "James Okafor", department: "Operations", office: "Floor 1, Room 108", available: true, upcomingMeetings: 1, initials: "JO" },
};

const initialActivity: ActivityEntry[] = [
  { id: "act-1", actor: "Sarah Johnson", initials: "SJ", action: "approved a vendor visit for Grace Lee", time: "8 min ago", icon: "approve" },
  { id: "act-2", actor: "Michael Adams", initials: "MA", action: "requested additional ID verification for Chidi Eze", time: "18 min ago", icon: "info" },
  { id: "act-3", actor: "Finance Team", initials: "FT", action: "rejected a visitor request from an unlisted contractor", time: "34 min ago", icon: "reject" },
  { id: "act-4", actor: "Security", initials: "SC", action: "cleared an executive guest for the boardroom", time: "52 min ago", icon: "clear" },
];

const sortOptions = ["Oldest First", "Newest", "Priority", "Visit Time"];

// ---------- utility ----------
const priorityColor = (p: Priority) => p === "High" ? "bg-red-50 text-red-700" : p === "Medium" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700";
const priorityDot = (p: Priority) => p === "High" ? "bg-red-500" : p === "Medium" ? "bg-amber-500" : "bg-emerald-500";
const statusColor = (status: RequestStatus) =>
  status === "Approved" ? "bg-emerald-50 text-emerald-700" :
  status === "Rejected" ? "bg-red-50 text-red-700" :
  status === "More Info Requested" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700";

function formatCountdown(ms: number) {
  const overdue = ms < 0;
  const abs = Math.abs(ms);
  const totalSec = Math.floor(abs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const str = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return overdue ? `Overdue by ${str}` : str;
}

const activityIcon = (icon: ActivityEntry["icon"]) => {
  const props = { size: 14 };
  switch (icon) {
    case "approve": return <ThumbsUp {...props} className="text-emerald-600" />;
    case "reject": return <ThumbsDown {...props} className="text-red-600" />;
    case "info": return <MessageSquareWarning {...props} className="text-amber-600" />;
    case "clear": return <Shield {...props} className="text-blue-600" />;
  }
};

// ---------- component ----------
export default function VisitorApprovalsPage() {
  const [requests, setRequests] = useState<ApprovalRequest[]>(initialRequests);
  const [activity, setActivity] = useState<ActivityEntry[]>(initialActivity);
  const [selectedId, setSelectedId] = useState<string>(initialRequests[0].id);
  const [toast, setToast] = useState<string | null>(null);
  const [clock, setClock] = useState(Date.now());
  const [sortBy, setSortBy] = useState("Priority");
  const [selectedForBulk, setSelectedForBulk] = useState<string[]>([]);

  const [decisionNotes, setDecisionNotes] = useState("");
  const [notifyVisitor, setNotifyVisitor] = useState(true);
  const [notifyHost, setNotifyHost] = useState(true);

  const [showExportRequests, setShowExportRequests] = useState(false);
  const [showApprovalSettings, setShowApprovalSettings] = useState(false);
  const [showRejectReason, setShowRejectReason] = useState(false);
  const [showRequestInfo, setShowRequestInfo] = useState(false);
  const [showAssignReviewer, setShowAssignReviewer] = useState(false);
  const [showRegisterWalkin, setShowRegisterWalkin] = useState(false);
  const [showPrintPass, setShowPrintPass] = useState(false);
  const [showManageRules, setShowManageRules] = useState(false);
  const [showAttachmentPreview, setShowAttachmentPreview] = useState<Attachment | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const pendingRequests = requests.filter(r => r.status === "Pending Review");
  const selected = requests.find(r => r.id === selectedId) || requests[0];
  const selectedHost = hostDirectory[selected.host];

  const sortedRequests = useMemo(() => {
    const list = [...pendingRequests];
    if (sortBy === "Oldest First") list.sort((a, b) => a.submittedAt - b.submittedAt);
    else if (sortBy === "Newest") list.sort((a, b) => b.submittedAt - a.submittedAt);
    else if (sortBy === "Priority") { const order = { High: 0, Medium: 1, Low: 2 }; list.sort((a, b) => order[a.priority] - order[b.priority]); }
    else if (sortBy === "Visit Time") list.sort((a, b) => a.visitTime.localeCompare(b.visitTime));
    return list;
  }, [pendingRequests, sortBy]);

  const logActivity = (action: string, icon: ActivityEntry["icon"]) => {
    setActivity(prev => [{ id: `act-${Date.now()}`, actor: "You", initials: "YOU", action, time: "just now", icon }, ...prev]);
  };

  const updateStatus = (id: string, status: RequestStatus, actionLabel: string, icon: ActivityEntry["icon"]) => {
    const r = requests.find(x => x.id === id);
    setRequests(prev => prev.map(x => x.id === id ? { ...x, status, timelineStep: status === "Approved" || status === "Rejected" ? 4 : x.timelineStep } : x));
    if (r) logActivity(`${actionLabel} ${r.visitorName}'s visit`, icon);
    showToast(`${r?.visitorName}'s request ${status.toLowerCase()}`);
    setDecisionNotes("");
  };

  const approveRequest = (id: string) => updateStatus(id, "Approved", "approved", "approve");
  const rejectRequest = (id: string, reason: string) => {
    updateStatus(id, "Rejected", "rejected", "reject");
    showToast(`Request rejected: ${reason}`);
  };
  const requestMoreInfo = (id: string, detail: string) => {
    updateStatus(id, "More Info Requested", "requested more info for", "info");
    showToast(`Sent back to visitor: ${detail}`);
  };

  const toggleBulk = (id: string) => setSelectedForBulk(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const bulkApprove = () => {
    selectedForBulk.forEach(id => approveRequest(id));
    showToast(`${selectedForBulk.length} request(s) approved`);
    setSelectedForBulk([]);
  };
  const bulkReject = () => {
    selectedForBulk.forEach(id => rejectRequest(id, "Bulk rejection"));
    setSelectedForBulk([]);
  };

  const approveAllLowRisk = () => {
    const lowRisk = pendingRequests.filter(r => r.priority === "Low" && r.conflicts.length === 0);
    lowRisk.forEach(r => approveRequest(r.id));
    showToast(`${lowRisk.length} low-risk request(s) approved`);
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
          <h1 className="text-2xl font-semibold text-slate-900">Visitor Approvals</h1>
          <p className="mt-1 text-sm text-slate-500 max-w-xl">Review, approve, or reject visitor requests before granting facility access.</p>
          <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><Clock size={12} /> {pendingRequests.length} Pending Requests</span>
            <span className="flex items-center gap-1 text-amber-600 font-medium"><AlertTriangle size={12} /> {pendingRequests.filter(r => r.slaDeadline - clock < 1000 * 60 * 20).length} Awaiting Your Review</span>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => setShowExportRequests(true)} className="border border-slate-200 px-3 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"><Download size={16} /> Export Requests</button>
          <button onClick={approveAllLowRisk} className="border border-slate-200 px-3 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"><Zap size={16} /> Bulk Approve</button>
          <button onClick={() => setShowApprovalSettings(true)} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2"><Settings size={16} /> Approval Settings</button>
        </div>
      </div>

      {/* Section 1 - Approval Inbox */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">Approval Inbox</h2>
          <div className="flex items-center gap-2">
            {selectedForBulk.length > 0 && (
              <div className="flex items-center gap-1.5 bg-blue-50 rounded-lg px-2 py-1">
                <span className="text-xs text-blue-700 font-medium">{selectedForBulk.length} selected</span>
                <button onClick={bulkApprove} className="text-[11px] px-2 py-0.5 bg-emerald-600 text-white rounded-md hover:bg-emerald-700">Approve</button>
                <button onClick={bulkReject} className="text-[11px] px-2 py-0.5 bg-red-50 text-red-600 rounded-md hover:bg-red-100">Reject</button>
                <button onClick={() => setShowAssignReviewer(true)} className="text-[11px] px-2 py-0.5 border border-slate-200 rounded-md bg-white">Assign</button>
                <button onClick={() => { showToast(`${selectedForBulk.length} request(s) exported`); }} className="text-[11px] px-2 py-0.5 border border-slate-200 rounded-md bg-white">Export</button>
              </div>
            )}
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="border border-slate-200 rounded-lg text-xs px-2 py-1.5">
              {sortOptions.map(s => <option key={s}>Sort: {s}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
          {sortedRequests.map(r => {
            const remaining = r.slaDeadline - clock;
            const overdue = remaining < 0;
            return (
              <div
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className={`border rounded-xl p-3 cursor-pointer hover:shadow-md transition ${selectedId === r.id ? "border-blue-300 ring-1 ring-blue-200" : "border-slate-200"} ${overdue ? "bg-red-50/30" : ""}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <button onClick={e => { e.stopPropagation(); toggleBulk(r.id); }} className="text-slate-300 hover:text-blue-500 flex-shrink-0">
                      {selectedForBulk.includes(r.id) ? <CheckSquare size={15} className="text-blue-600" /> : <Square size={15} />}
                    </button>
                    <span className={`w-8 h-8 rounded-full ${r.color} text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0`}>{r.initials}</span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">{r.visitorName}</div>
                      <div className="text-xs text-slate-400 truncate">{r.company}</div>
                    </div>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 flex items-center gap-1 ${priorityColor(r.priority)}`}><span className={`w-1.5 h-1.5 rounded-full ${priorityDot(r.priority)}`} /> {r.priority}</span>
                </div>
                <div className="text-xs text-slate-500 mt-2">Meeting: {r.host}</div>
                <div className="text-xs text-slate-400">{r.visitDate} · {r.visitTime}</div>
                <div className="flex items-center justify-between mt-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusColor(r.status)}`}>{r.status}</span>
                  <span className={`text-[11px] font-mono ${overdue ? "text-red-600 font-semibold" : remaining < 1000 * 60 * 20 ? "text-amber-600" : "text-slate-400"}`}>{formatCountdown(remaining)}</span>
                </div>
              </div>
            );
          })}
          {sortedRequests.length === 0 && <div className="col-span-full text-center text-sm text-slate-400 py-10">No pending requests. All caught up!</div>}
        </div>
      </div>

      {/* Section 2 - Request Details */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <span className={`w-14 h-14 rounded-full ${selected.color} text-white flex items-center justify-center text-lg font-bold flex-shrink-0`}>{selected.initials}</span>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{selected.visitorName}</h2>
              <div className="text-xs text-slate-500">{selected.company} · {selected.visitorType}</div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(selected.status)}`}>{selected.status}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${priorityColor(selected.priority)}`}>{selected.priority} Priority</span>
          </div>
        </div>

        {selected.conflicts.length > 0 && (
          <div className="space-y-1.5 mb-4">
            {selected.conflicts.map((c, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                <AlertTriangle size={13} className="flex-shrink-0" /> {c}
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <h3 className="text-xs font-semibold text-slate-600 uppercase mb-1.5">Visitor Information</h3>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center gap-1.5 text-slate-600"><Phone size={12} className="text-slate-400" /> {selected.phone}</div>
              <div className="flex items-center gap-1.5 text-slate-600 truncate"><Mail size={12} className="text-slate-400" /> {selected.email}</div>
              <div className="flex items-center gap-1.5 text-slate-600"><Briefcase size={12} className="text-slate-400" /> {selected.visitorType}</div>
            </div>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-slate-600 uppercase mb-1.5">Visit Details</h3>
            <div className="space-y-1.5 text-xs">
              <div className="text-slate-600">{selected.visitDate} · {selected.visitTime}</div>
              <div className="text-slate-600">Duration: {selected.duration}</div>
              <div className="text-slate-600 flex items-center gap-1.5"><MapPin size={12} className="text-slate-400" /> {selected.meetingRoom}</div>
              <div className="text-slate-600">Purpose: {selected.purpose}</div>
            </div>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-slate-600 uppercase mb-1.5">Security Information</h3>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center gap-1.5 text-slate-600"><IdCard size={12} className="text-slate-400" /> {selected.idType} · {selected.idNumber}</div>
              <div className="flex items-center gap-1.5 text-slate-600"><Car size={12} className="text-slate-400" /> {selected.vehicleRegistered || "No vehicle"}</div>
              <div className="flex items-center gap-1.5 text-slate-600"><Package size={12} className="text-slate-400" /> {selected.itemsCarried}</div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-slate-600 uppercase mb-1.5">Supporting Documents</h3>
          {selected.attachments.length === 0 ? (
            <p className="text-xs text-slate-400">No attachments provided.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {selected.attachments.map(a => (
                <button key={a.name} onClick={() => setShowAttachmentPreview(a)} className="flex items-center gap-1.5 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50">
                  <Paperclip size={12} className="text-slate-400" /> {a.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Section 3 & 4 - Approval Timeline + Host Information */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Approval Timeline</h2>
          <div className="flex items-stretch overflow-x-auto pb-2">
            {timelineSteps.map((step, idx) => {
              const done = idx < selected.timelineStep;
              const current = idx === selected.timelineStep;
              return (
                <React.Fragment key={step}>
                  <div className="flex flex-col items-center min-w-[110px]">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      done ? "bg-emerald-100 text-emerald-700" : current ? "bg-blue-100 text-blue-700 ring-4 ring-blue-200" : "bg-slate-100 text-slate-400"
                    }`}>
                      {done ? <CheckCircle2 size={16} /> : idx + 1}
                    </div>
                    <div className={`text-[11px] text-center mt-2 ${current ? "text-blue-700 font-medium" : done ? "text-emerald-600" : "text-slate-400"}`}>{step}</div>
                  </div>
                  {idx < timelineSteps.length - 1 && <div className={`flex-1 h-0.5 self-center mt-[-20px] min-w-[16px] ${idx < selected.timelineStep ? "bg-emerald-300" : "bg-slate-200"}`} />}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Host Information</h2>
          {selectedHost ? (
            <>
              <div className="flex items-center gap-3">
                <span className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold flex-shrink-0">{selectedHost.initials}</span>
                <div>
                  <div className="text-sm font-semibold text-slate-900">{selectedHost.name}</div>
                  <div className="text-xs text-slate-500">{selectedHost.department}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                <div className="flex items-center gap-1 text-slate-500"><MapPin size={12} /> {selectedHost.office}</div>
                <div className="flex items-center gap-1 text-slate-500"><Users size={12} /> {selectedHost.upcomingMeetings} meetings today</div>
              </div>
              <span className={`inline-block mt-2 text-[10px] px-2 py-0.5 rounded-full ${selectedHost.available ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{selectedHost.available ? "Available" : "Busy"}</span>
              <div className="flex items-center gap-2 mt-3">
                <button onClick={() => showToast(`Calling ${selectedHost.name}...`)} className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1"><Phone size={12} /> Call Host</button>
                <button onClick={() => showToast(`Email sent to ${selectedHost.name}`)} className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1"><Mail size={12} /> Email Host</button>
                <button onClick={() => showToast(`Reminder sent to ${selectedHost.name}`)} className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1"><Bell size={12} /> Send Reminder</button>
              </div>
            </>
          ) : (
            <div className="text-sm text-slate-400">No host profile on file.</div>
          )}
        </div>
      </div>

      {/* Section 5 & 6 - Decision Panel + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Decision Panel</h2>
          <div className="grid grid-cols-1 gap-2.5 mb-4">
            <button
              onClick={() => approveRequest(selected.id)}
              disabled={selected.status !== "Pending Review"}
              className="flex items-center gap-3 border border-emerald-200 bg-emerald-50/50 rounded-xl p-3 hover:bg-emerald-50 transition text-left disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0"><ThumbsUp size={18} /></div>
              <div>
                <div className="text-sm font-semibold text-emerald-800">Approve Request</div>
                <div className="text-xs text-emerald-600">Grant visitor access and notify the host.</div>
              </div>
            </button>
            <button
              onClick={() => setShowRejectReason(true)}
              disabled={selected.status !== "Pending Review"}
              className="flex items-center gap-3 border border-red-200 bg-red-50/40 rounded-xl p-3 hover:bg-red-50 transition text-left disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <div className="w-9 h-9 rounded-lg bg-red-100 text-red-700 flex items-center justify-center flex-shrink-0"><ThumbsDown size={18} /></div>
              <div>
                <div className="text-sm font-semibold text-red-800">Reject Request</div>
                <div className="text-xs text-red-600">Reject the request with a required reason.</div>
              </div>
            </button>
            <button
              onClick={() => setShowRequestInfo(true)}
              disabled={selected.status !== "Pending Review"}
              className="flex items-center gap-3 border border-amber-200 bg-amber-50/40 rounded-xl p-3 hover:bg-amber-50 transition text-left disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0"><MessageSquareWarning size={18} /></div>
              <div>
                <div className="text-sm font-semibold text-amber-800">Request More Information</div>
                <div className="text-xs text-amber-600">Send the request back for additional details.</div>
              </div>
            </button>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Decision Notes</label>
            <textarea value={decisionNotes} onChange={e => setDecisionNotes(e.target.value)} rows={2} placeholder="Add context for this decision..." className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
          </div>
          <div className="flex items-center gap-4 mt-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={notifyVisitor} onChange={e => setNotifyVisitor(e.target.checked)} className="rounded border-slate-300" /> Notify Visitor</label>
            <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={notifyHost} onChange={e => setNotifyHost(e.target.checked)} className="rounded border-slate-300" /> Notify Host</label>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Recent Activity</h2>
          <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
            {activity.map(a => (
              <div key={a.id} className="flex items-start gap-3 text-sm">
                <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0">{a.initials}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {activityIcon(a.icon)}
                    <span className="text-slate-700"><strong>{a.actor}</strong> {a.action}</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">{a.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Approve All Low-Risk", icon: <Zap size={17} />, action: approveAllLowRisk },
            { label: "Register Walk-in", icon: <UserPlus size={17} />, action: () => setShowRegisterWalkin(true) },
            { label: "View Visitor Records", icon: <Users size={17} />, action: () => showToast("Opening Visitor Records") },
            { label: "Print Visitor Pass", icon: <Printer size={17} />, action: () => setShowPrintPass(true) },
            { label: "Export Approval Report", icon: <FileText size={17} />, action: () => showToast("Approval report exported") },
            { label: "Manage Approval Rules", icon: <ScrollText size={17} />, action: () => setShowManageRules(true) },
          ].map(qa => (
            <button key={qa.label} onClick={qa.action} className="flex flex-col items-center gap-2 border border-slate-200 rounded-xl p-3 hover:bg-slate-50 transition text-center">
              <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">{qa.icon}</div>
              <span className="text-[11px] font-medium text-slate-700">{qa.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ---------- Modals ---------- */}
      {showExportRequests && (
        <ExportRequestsModal onClose={() => setShowExportRequests(false)} onExport={() => { showToast("Requests exported"); setShowExportRequests(false); }} />
      )}

      {showApprovalSettings && (
        <ApprovalSettingsModal onClose={() => setShowApprovalSettings(false)} onSave={() => { showToast("Approval settings saved"); setShowApprovalSettings(false); }} />
      )}

      {showRejectReason && (
        <RejectReasonModal visitor={selected.visitorName} onClose={() => setShowRejectReason(false)} onSubmit={(reason) => { rejectRequest(selected.id, reason); setShowRejectReason(false); }} />
      )}

      {showRequestInfo && (
        <RequestInfoModal visitor={selected.visitorName} onClose={() => setShowRequestInfo(false)} onSubmit={(detail) => { requestMoreInfo(selected.id, detail); setShowRequestInfo(false); }} />
      )}

      {showAssignReviewer && (
        <AssignReviewerModal onClose={() => setShowAssignReviewer(false)} onAssign={(reviewer) => { showToast(`${selectedForBulk.length} request(s) assigned to ${reviewer}`); setSelectedForBulk([]); setShowAssignReviewer(false); }} />
      )}

      {showRegisterWalkin && (
        <RegisterWalkinModal onClose={() => setShowRegisterWalkin(false)} onSubmit={(name) => { showToast(`${name} registered as walk-in`); setShowRegisterWalkin(false); }} />
      )}

      {showPrintPass && (
        <PrintPassModal visitor={selected} onClose={() => setShowPrintPass(false)} onPrint={() => { showToast(`Visitor pass printed for ${selected.visitorName}`); setShowPrintPass(false); }} />
      )}

      {showManageRules && (
        <ManageRulesModal onClose={() => setShowManageRules(false)} onSave={() => { showToast("Approval rules updated"); setShowManageRules(false); }} />
      )}

      {showAttachmentPreview && (
        <AttachmentPreviewModal attachment={showAttachmentPreview} onClose={() => setShowAttachmentPreview(null)} />
      )}
    </div>
  );
}

// ---------- Modal: Export Requests ----------
function ExportRequestsModal({ onClose, onExport }: { onClose: () => void; onExport: () => void }) {
  const [range, setRange] = useState("Today");
  const [format, setFormat] = useState("CSV");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Export Requests</h3>
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

// ---------- Modal: Approval Settings ----------
function ApprovalSettingsModal({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const [slaWindow, setSlaWindow] = useState("30 minutes");
  const [autoApproveLowRisk, setAutoApproveLowRisk] = useState(false);
  const [requireSecurityReview, setRequireSecurityReview] = useState(true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Approval Settings</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Default SLA Window</label>
            <select value={slaWindow} onChange={e => setSlaWindow(e.target.value)} className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm">
              <option>15 minutes</option><option>30 minutes</option><option>1 hour</option><option>2 hours</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={autoApproveLowRisk} onChange={e => setAutoApproveLowRisk(e.target.checked)} className="rounded border-slate-300" />
            Automatically approve low-risk requests with no conflicts
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={requireSecurityReview} onChange={e => setRequireSecurityReview(e.target.checked)} className="rounded border-slate-300" />
            Require security review for all contractor visits
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

// ---------- Modal: Reject Reason ----------
function RejectReasonModal({ visitor, onClose, onSubmit }: { visitor: string; onClose: () => void; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><ThumbsDown size={18} className="text-red-600" /> Reject Request</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <p className="text-sm text-slate-500 mb-3">Rejecting {visitor}'s request. Please provide a reason.</p>
        <form onSubmit={e => { e.preventDefault(); if (reason.trim()) onSubmit(reason); }} className="space-y-4">
          <textarea required value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Reason for rejection (required)" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm hover:bg-red-700">Reject Request</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Modal: Request More Info ----------
function RequestInfoModal({ visitor, onClose, onSubmit }: { visitor: string; onClose: () => void; onSubmit: (detail: string) => void }) {
  const [detail, setDetail] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><MessageSquareWarning size={18} className="text-amber-600" /> Request More Information</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <p className="text-sm text-slate-500 mb-3">What additional information is needed from {visitor}?</p>
        <form onSubmit={e => { e.preventDefault(); if (detail.trim()) onSubmit(detail); }} className="space-y-4">
          <textarea required value={detail} onChange={e => setDetail(e.target.value)} rows={3} placeholder="e.g., Please upload a valid government-issued ID" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-amber-500 text-white rounded-xl text-sm hover:bg-amber-600">Send Request</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Modal: Assign Reviewer ----------
function AssignReviewerModal({ onClose, onAssign }: { onClose: () => void; onAssign: (reviewer: string) => void }) {
  const [reviewer, setReviewer] = useState("Security Team");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Assign Reviewer</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <select value={reviewer} onChange={e => setReviewer(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm">
          <option>Security Team</option><option>Facility Manager</option><option>Department Head</option><option>Reception Supervisor</option>
        </select>
        <div className="flex justify-end gap-2 pt-4">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Cancel</button>
          <button onClick={() => onAssign(reviewer)} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700">Assign</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Modal: Register Walk-in ----------
function RegisterWalkinModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (name: string) => void }) {
  const [name, setName] = useState("");
  const [host, setHost] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><UserPlus size={18} className="text-amber-600" /> Register Walk-in</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); if (name.trim()) onSubmit(name); }} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Visitor Name</label>
            <input required value={name} onChange={e => setName(e.target.value)} placeholder="Full name" className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Host</label>
            <input value={host} onChange={e => setHost(e.target.value)} placeholder="Employee name" className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-amber-500 text-white rounded-xl text-sm hover:bg-amber-600">Register</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Modal: Print Pass ----------
function PrintPassModal({ visitor, onClose, onPrint }: { visitor: ApprovalRequest; onClose: () => void; onPrint: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Print Visitor Pass</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="border-2 border-dashed border-indigo-200 rounded-xl p-4 bg-indigo-50/30 text-center">
          <div className="text-[10px] uppercase tracking-wide text-indigo-500 font-semibold">Visitor Pass</div>
          <div className="text-lg font-bold text-slate-900 mt-1">{visitor.visitorName}</div>
          <div className="text-xs text-slate-500">{visitor.visitorType} · {visitor.meetingRoom}</div>
          <div className="text-xs text-slate-500 mt-1">Host: {visitor.host}</div>
        </div>
        <button onClick={onPrint} className="mt-4 w-full px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm hover:bg-indigo-700">Print</button>
      </div>
    </div>
  );
}

// ---------- Modal: Manage Rules ----------
function ManageRulesModal({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const [rules, setRules] = useState([
    { id: "r1", label: "Auto-approve VIP visitors with valid ID", enabled: true },
    { id: "r2", label: "Require host confirmation for High priority requests", enabled: true },
    { id: "r3", label: "Flag contractors without prior visit history", enabled: false },
  ]);

  const toggle = (id: string) => setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Manage Approval Rules</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="space-y-2.5">
          {rules.map(r => (
            <div key={r.id} className="flex items-center justify-between border border-slate-200 rounded-xl px-3 py-2.5">
              <span className="text-sm text-slate-700">{r.label}</span>
              <button onClick={() => toggle(r.id)} className={`w-10 h-5 rounded-full relative transition-colors flex-shrink-0 ${r.enabled ? "bg-emerald-500" : "bg-slate-300"}`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${r.enabled ? "translate-x-[22px]" : "translate-x-0.5"}`} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Cancel</button>
          <button onClick={onSave} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700">Save Rules</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Modal: Attachment Preview ----------
function AttachmentPreviewModal({ attachment, onClose }: { attachment: Attachment; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Attachment Preview</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="border-2 border-dashed border-slate-200 rounded-xl p-10 flex flex-col items-center justify-center gap-2 bg-slate-50">
          <FileText size={36} className="text-slate-400" />
          <p className="text-sm font-medium text-slate-700">{attachment.name}</p>
          <p className="text-xs text-slate-400">{attachment.type} file</p>
        </div>
        <button onClick={onClose} className="mt-4 w-full px-4 py-2 border border-slate-200 rounded-xl text-sm">Close</button>
      </div>
    </div>
  );
}