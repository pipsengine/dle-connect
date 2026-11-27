"use client";

import React, { useEffect, useState, useMemo } from "react";
import { EmployeeHostField } from "../_components/employee-host-field";
import { loadVisitorWorkspace, patchVisitorVisit, saveVisitorVisit } from "@/lib/security/visitor-client";
import { emptyDirectories, type VisitorDirectories, type VisitorVisit } from "@/lib/security/visitor-types";
import { groupVisitorProfiles, hostCardsFromVisits, todayISO } from "@/lib/security/visitor-views";
import {
  Award,
  Briefcase,
  Building2,
  Calendar,
  Car,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Filter,
  Globe,
  IdCard,
  Mail,
  Package,
  Phone,
  Printer,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  StickyNote,
  UserPlus,
  Users,
  X,
  ChevronRight,
  Ban,
} from "lucide-react";
import { useRouter } from "next/navigation";

// ---------- types ----------
type VisitorStatus = "Currently Inside" | "Checked Out" | "Expected Today" | "Pre-Registered" | "Blacklisted";

interface VisitEntry {
  date: string;
  host: string;
  department: string;
  purpose: string;
  duration: string;
  status: "Completed" | "Ongoing";
  checkIn: string;
  checkOut: string | null;
  dateISO?: string;
}

interface VisitorRecord {
  id: string;
  name: string;
  initials: string;
  color: string;
  company: string;
  visitorType: string;
  phone: string;
  email: string;
  nationality: string;
  lastVisit: string;
  totalVisits: number;
  status: VisitorStatus;
  host: string;
  avgDuration: string;
  favoriteHost: string;
  mostVisitedDept: string;
  idVerified: boolean;
  badgeHistory: string[];
  vehicleRegistered: string | null;
  itemsCarried: string;
  notes: string;
  isVIP: boolean;
  visits: VisitEntry[];
}

interface HostCard {
  name: string;
  department: string;
  visits: number;
  lastMeeting: string;
  initials: string;
}

const statusOptions = ["All Statuses", "Currently Inside", "Checked Out", "Expected Today", "Pre-Registered", "Blacklisted"];
const quickChips = ["Today", "This Week", "This Month", "VIP", "Frequent Visitors", "Currently Inside", "Checked Out", "Contractors", "Guests"];
const historyFilters = ["All Visits", "Last 30 Days", "Last 6 Months", "This Year"];

const EMPTY_RECORD: VisitorRecord = {
  id: "", name: "No visitor selected", initials: "", color: "bg-slate-300", company: "", visitorType: "", phone: "", email: "", nationality: "", lastVisit: "—", totalVisits: 0, status: "Pre-Registered", host: "", avgDuration: "—", favoriteHost: "", mostVisitedDept: "", idVerified: false, badgeHistory: [], vehicleRegistered: null, itemsCarried: "", notes: "", isVIP: false, visits: [],
};

// ---------- utility ----------
const statusColor = (status: VisitorStatus) =>
  status === "Currently Inside" ? "bg-emerald-50 text-emerald-700" :
  status === "Expected Today" ? "bg-amber-50 text-amber-700" :
  status === "Pre-Registered" ? "bg-blue-50 text-blue-700" :
  status === "Blacklisted" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-500";

// ---------- component ----------
export default function VisitorRecordsPage() {
  const router = useRouter();
  const [records, setRecords] = useState<VisitorVisit[]>([]);
  const [directories, setDirectories] = useState<VisitorDirectories>(emptyDirectories());
  const [selectedId, setSelectedId] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const [searchQuery, setSearchQuery] = useState("");
  const [activeChips, setActiveChips] = useState<string[]>([]);
  const [companyFilter, setCompanyFilter] = useState("All Companies");
  const [typeFilter, setTypeFilter] = useState("All Types");
  const [deptFilter, setDeptFilter] = useState("All Departments");
  const [hostFilter, setHostFilter] = useState("All Hosts");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("All Visits");

  const [showExportRecords, setShowExportRecords] = useState(false);
  const [showRegisterVisitor, setShowRegisterVisitor] = useState(false);
  const [showPrintReport, setShowPrintReport] = useState(false);
  const [showAddNotes, setShowAddNotes] = useState(false);
  const [showRegisterVisit, setShowRegisterVisit] = useState(false);
  const [showCheckVisitorIn, setShowCheckVisitorIn] = useState(false);
  const [showPrintBadge, setShowPrintBadge] = useState(false);
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [showExportProfile, setShowExportProfile] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  useEffect(() => {
    loadVisitorWorkspace()
      .then((workspace) => {
        setRecords(workspace.visits);
        setDirectories(workspace.directories);
        const first = groupVisitorProfiles(workspace.visits)[0];
        setSelectedId((current) => current || first?.id || "");
      })
      .catch((error) => showToast(error instanceof Error ? error.message : "Unable to load visitor records."));
  }, []);

  const visitorRecords = useMemo(() => groupVisitorProfiles(records), [records]);
  const hostCards = useMemo(() => hostCardsFromVisits(records), [records]);
  const companies = ["All Companies", ...Array.from(new Set(visitorRecords.map((record) => record.company).filter(Boolean)))];
  const visitorTypeOptions = ["All Types", ...Array.from(new Set(visitorRecords.map((record) => record.visitorType).filter(Boolean)))];
  const departmentOptions = ["All Departments", ...directories.departments];
  const hostOptions = ["All Hosts", ...Array.from(new Set([...visitorRecords.map((record) => record.host), ...records.map((visit) => visit.hostName)].filter(Boolean)))];
  const selected = visitorRecords.find(v => v.id === selectedId) || visitorRecords[0] || EMPTY_RECORD;
  const remember = (saved: VisitorVisit) => setRecords((prev) => [saved, ...prev.filter((item) => item.id !== saved.id)]);

  const toggleChip = (chip: string) => setActiveChips(prev => prev.includes(chip) ? prev.filter(c => c !== chip) : [...prev, chip]);

  const filteredVisitors = useMemo(() => {
    return visitorRecords.filter(v => {
      const matchSearch = !searchQuery || v.name.toLowerCase().includes(searchQuery.toLowerCase()) || v.company.toLowerCase().includes(searchQuery.toLowerCase()) || v.id.toLowerCase().includes(searchQuery.toLowerCase()) || v.host.toLowerCase().includes(searchQuery.toLowerCase()) || v.email.toLowerCase().includes(searchQuery.toLowerCase()) || v.phone.includes(searchQuery);
      const matchCompany = companyFilter === "All Companies" || v.company === companyFilter;
      const matchType = typeFilter === "All Types" || v.visitorType === typeFilter;
      const matchDept = deptFilter === "All Departments" || v.mostVisitedDept === deptFilter;
      const matchHost = hostFilter === "All Hosts" || v.host === hostFilter;
      const matchStatus = statusFilter === "All Statuses" || v.status === statusFilter;
      const matchChips = activeChips.every(chip => {
        if (chip === "VIP") return v.isVIP;
        if (chip === "Frequent Visitors") return v.totalVisits >= 6;
        if (chip === "Currently Inside") return v.status === "Currently Inside";
        if (chip === "Checked Out") return v.status === "Checked Out";
        if (chip === "Contractors") return v.visitorType === "Contractor";
        if (chip === "Guests") return v.visitorType === "Guest";
        const iso = records.find((visit) => visit.id === v.id)?.visitDate || "";
        if (chip === "Today") return iso.slice(0, 10) === todayISO();
        if (chip === "This Week" || chip === "This Month") {
          if (!iso) return false;
          const days = (Date.now() - new Date(`${iso.slice(0, 10)}T12:00:00`).getTime()) / 86400000;
          return days >= 0 && days <= (chip === "This Week" ? 7 : 31);
        }
        return true;
      });
      return matchSearch && matchCompany && matchType && matchDept && matchHost && matchStatus && matchChips;
    });
  }, [visitorRecords, records, searchQuery, companyFilter, typeFilter, deptFilter, hostFilter, statusFilter, activeChips]);

  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(filteredVisitors.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = filteredVisitors.length === 0 ? 0 : (currentPage - 1) * pageSize;
  const pageRows = filteredVisitors.slice(pageStart, pageStart + pageSize);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, companyFilter, typeFilter, deptFilter, hostFilter, statusFilter, activeChips]);

  const filteredVisits = useMemo(() => {
    return selected.visits.filter((visit) => {
      if (!visit.dateISO || historyFilter === "All Visits") return true;
      const days = (Date.now() - new Date(`${visit.dateISO}T12:00:00`).getTime()) / 86400000;
      if (historyFilter === "Last 30 Days") return days <= 30;
      if (historyFilter === "Last 6 Months") return days <= 183;
      if (historyFilter === "This Year") return visit.dateISO.slice(0, 4) === String(new Date().getFullYear());
      return true;
    });
  }, [selected, historyFilter]);

  const lastUpdated = records[0]?.updatedAt ? new Date(records[0].updatedAt).toLocaleString() : "No records yet";

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
          <h1 className="text-2xl font-semibold text-slate-900">Visitor Records</h1>
          <p className="mt-1 text-sm text-slate-500 max-w-xl">Search, review, and manage visitor profiles and historical visit records.</p>
          <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><Users size={12} /> {visitorRecords.length} Total Records</span>
            <span className="flex items-center gap-1"><Clock size={12} /> Last Updated: {lastUpdated}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => setShowExportRecords(true)} className="border border-slate-200 px-3 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"><Download size={16} /> Export Records</button>
          <button onClick={() => setShowPrintReport(true)} className="border border-slate-200 px-3 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"><Printer size={16} /> Print Visitor Report</button>
          <button onClick={() => router.push("/security/visitor-management/dashboard?register=1")} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2"><UserPlus size={16} /> Register Visitor</button>
        </div>
      </div>

      {/* Hero - Search & Smart Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by visitor name, company, phone number, visitor ID, host, or email..."
            className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-300"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {quickChips.map(chip => (
            <button key={chip} onClick={() => toggleChip(chip)} className={`text-xs font-medium px-3 py-1.5 rounded-full border transition ${activeChips.includes(chip) ? "bg-blue-600 border-blue-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{chip}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button onClick={() => setShowMoreFilters(v => !v)} className="text-xs px-2 py-1.5 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 flex items-center gap-1"><Filter size={12} /> Advanced Filters</button>
          {showMoreFilters && (
            <>
              <select value={companyFilter} onChange={e => setCompanyFilter(e.target.value)} className="border border-slate-200 rounded-lg text-xs px-2 py-1.5">{companies.map(c => <option key={c}>{c}</option>)}</select>
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="border border-slate-200 rounded-lg text-xs px-2 py-1.5">{visitorTypeOptions.map(t => <option key={t}>{t}</option>)}</select>
              <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="border border-slate-200 rounded-lg text-xs px-2 py-1.5">{departmentOptions.map(d => <option key={d}>{d}</option>)}</select>
              <select value={hostFilter} onChange={e => setHostFilter(e.target.value)} className="border border-slate-200 rounded-lg text-xs px-2 py-1.5">{hostOptions.map(h => <option key={h}>{h}</option>)}</select>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border border-slate-200 rounded-lg text-xs px-2 py-1.5">{statusOptions.map(s => <option key={s}>{s}</option>)}</select>
            </>
          )}
        </div>
      </div>

      {/* Visitor Directory */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Visitor Directory</h2>
          <span className="text-xs text-slate-400">{filteredVisitors.length} visitors</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-3 font-semibold">Visitor</th>
                <th className="py-2 pr-3 font-semibold">Company</th>
                <th className="py-2 pr-3 font-semibold">Type</th>
                <th className="py-2 pr-3 font-semibold">Phone</th>
                <th className="py-2 pr-3 font-semibold">Host</th>
                <th className="py-2 pr-3 font-semibold">Last visit</th>
                <th className="py-2 pr-3 font-semibold">Visits</th>
                <th className="py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map(v => (
                <tr
                  key={v.id}
                  onClick={() => setSelectedId(v.id)}
                  className={`border-b border-slate-100 cursor-pointer ${selectedId === v.id ? "bg-blue-50/70" : "hover:bg-slate-50"}`}
                >
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-2.5">
                      <span className={`w-8 h-8 rounded-full ${v.color} text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0`}>{v.initials}</span>
                      <span className="text-sm font-medium text-slate-900">{v.name}</span>
                      {v.isVIP && <Award size={12} className="text-amber-500 flex-shrink-0" />}
                    </div>
                  </td>
                  <td className="py-3 pr-3 text-sm text-slate-600">{v.company || "—"}</td>
                  <td className="py-3 pr-3 text-sm text-slate-600">{v.visitorType || "—"}</td>
                  <td className="py-3 pr-3 text-sm text-slate-600">{v.phone || "—"}</td>
                  <td className="py-3 pr-3 text-sm text-slate-600">{v.host || "—"}</td>
                  <td className="py-3 pr-3 text-sm text-slate-600">{v.lastVisit}</td>
                  <td className="py-3 pr-3 text-sm text-slate-600">{v.totalVisits}</td>
                  <td className="py-3"><span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusColor(v.status)}`}>{v.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredVisitors.length === 0 && <div className="text-center text-sm text-slate-400 py-10">No visitors match these filters.</div>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
          <span className="text-xs text-slate-400">
            {filteredVisitors.length === 0 ? "No visitors" : `Showing ${pageStart + 1}–${Math.min(pageStart + pageSize, filteredVisitors.length)} of ${filteredVisitors.length}`}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 disabled:opacity-40">Previous</button>
            <span className="text-xs text-slate-500">Page {currentPage} of {pageCount}</span>
            <button type="button" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 disabled:opacity-40">Next</button>
          </div>
        </div>
      </div>

      {/* Visitor Profile + Visit History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className={`w-14 h-14 rounded-full ${selected.color} text-white flex items-center justify-center text-lg font-bold flex-shrink-0`}>{selected.initials}</span>
              <div>
                <div className="flex items-center gap-1.5">
                  <h2 className="text-lg font-semibold text-slate-900">{selected.name}</h2>
                  {selected.isVIP && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-0.5"><Award size={10} /> VIP</span>}
                  {selected.totalVisits >= 6 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 flex items-center gap-0.5"><Star size={10} /> Frequent</span>}
                </div>
                <div className="text-xs text-slate-500">{selected.company}</div>
              </div>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${statusColor(selected.status)}`}>{selected.status}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
            <div className="flex items-center gap-1.5 text-slate-600"><Phone size={13} className="text-slate-400" /> {selected.phone}</div>
            <div className="flex items-center gap-1.5 text-slate-600 truncate"><Mail size={13} className="text-slate-400" /> {selected.email}</div>
            <div className="flex items-center gap-1.5 text-slate-600"><Globe size={13} className="text-slate-400" /> {selected.nationality}</div>
            <div className="flex items-center gap-1.5 text-slate-600"><Briefcase size={13} className="text-slate-400" /> {selected.visitorType}</div>
          </div>

          <div className="mb-4">
            <h3 className="text-xs font-semibold text-slate-600 uppercase mb-1.5">Visit Statistics</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <div className="border border-slate-100 rounded-lg p-2"><div className="text-slate-400">Total Visits</div><div className="font-semibold text-slate-800">{selected.totalVisits}</div></div>
              <div className="border border-slate-100 rounded-lg p-2"><div className="text-slate-400">Last Visit</div><div className="font-semibold text-slate-800">{selected.lastVisit}</div></div>
              <div className="border border-slate-100 rounded-lg p-2"><div className="text-slate-400">Avg. Duration</div><div className="font-semibold text-slate-800">{selected.avgDuration}</div></div>
              <div className="border border-slate-100 rounded-lg p-2"><div className="text-slate-400">Favorite Host</div><div className="font-semibold text-slate-800 truncate">{selected.favoriteHost}</div></div>
              <div className="border border-slate-100 rounded-lg p-2 sm:col-span-2"><div className="text-slate-400">Most Visited Dept.</div><div className="font-semibold text-slate-800">{selected.mostVisitedDept}</div></div>
            </div>
          </div>

          <div className="mb-4">
            <h3 className="text-xs font-semibold text-slate-600 uppercase mb-1.5">Security</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className={`border rounded-lg p-2 flex items-center gap-1.5 ${selected.idVerified ? "border-emerald-100 bg-emerald-50/50 text-emerald-700" : "border-red-100 bg-red-50/40 text-red-600"}`}>
                <ShieldCheck size={13} /> ID {selected.idVerified ? "Verified" : "Not Verified"}
              </div>
              <div className="border border-slate-100 rounded-lg p-2 flex items-center gap-1.5 text-slate-600">
                <IdCard size={13} /> {selected.badgeHistory.length} Past Badges
              </div>
              <div className={`border rounded-lg p-2 flex items-center gap-1.5 ${selected.vehicleRegistered ? "border-indigo-100 bg-indigo-50/50 text-indigo-700" : "border-slate-100 text-slate-400"}`}>
                <Car size={13} /> {selected.vehicleRegistered || "No Vehicle"}
              </div>
              <div className="border border-slate-100 rounded-lg p-2 flex items-center gap-1.5 text-slate-600">
                <Package size={13} /> {selected.itemsCarried}
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-slate-600 uppercase mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1"><StickyNote size={12} /> Notes</span>
              <button onClick={() => setShowAddNotes(true)} className="text-blue-600 hover:underline font-normal normal-case text-xs">Edit</button>
            </h3>
            <p className="text-sm text-slate-600 bg-slate-50 border border-slate-100 rounded-xl p-3">{selected.notes || "No internal notes recorded for this visitor."}</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Visit History</h2>
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
              {historyFilters.map(f => (
                <button key={f} onClick={() => setHistoryFilter(f)} className={`text-[11px] px-2 py-1 rounded-md ${historyFilter === f ? "bg-white shadow-sm text-slate-900 font-medium" : "text-slate-500"}`}>{f}</button>
              ))}
            </div>
          </div>
          <div className="space-y-0 max-h-[420px] overflow-y-auto pr-1">
            {filteredVisits.map((visit, idx) => (
              <div key={idx} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${visit.status === "Ongoing" ? "bg-blue-500" : "bg-slate-300"}`} />
                  {idx < filteredVisits.length - 1 && <div className="w-0.5 flex-1 bg-slate-200 my-0.5" style={{ minHeight: "24px" }} />}
                </div>
                <div className="pb-5">
                  <div className="text-xs font-semibold text-slate-500">{visit.date}</div>
                  <div className="text-sm font-medium text-slate-800">{visit.purpose}</div>
                  <div className="text-xs text-slate-500 mt-0.5">Host: {visit.host} · {visit.department}</div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                    <span>Check-in {visit.checkIn}</span>
                    {visit.checkOut && <span>Check-out {visit.checkOut}</span>}
                    <span className={visit.status === "Ongoing" ? "text-blue-600 font-medium" : ""}>{visit.duration}</span>
                  </div>
                </div>
              </div>
            ))}
            {filteredVisits.length === 0 && <div className="text-sm text-slate-400 text-center py-8">No visits recorded in this period.</div>}
          </div>
          <button onClick={() => setShowFullHistory(true)} className="mt-2 text-xs text-blue-600 hover:underline flex items-center gap-1">View Full History <ChevronRight size={12} /></button>
        </div>
      </div>

      {/* Frequently Visited Hosts + Visitor Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Frequently Visited Hosts</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {hostCards.map(h => (
              <div key={h.name} className="border border-slate-200 rounded-xl p-3 flex items-center gap-3">
                <span className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0">{h.initials}</span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate">{h.name}</div>
                  <div className="text-xs text-slate-400 truncate">{h.department}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Visited {h.visits} times · Last {h.lastMeeting}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2"><Sparkles size={18} className="text-purple-600" /> Visitor Insights</h2>
          <div className="space-y-3">
            {[
              { text: `${selected.name} has entered the facility ${selected.totalVisits} times in the past 6 months.`, icon: <Users size={14} /> },
              { text: `Most visits are to the ${selected.mostVisitedDept} Department.`, icon: <Building2 size={14} /> },
              { text: `Average visit duration is ${selected.avgDuration}.`, icon: <Clock size={14} /> },
              { text: selected.idVerified ? "Last security verification was completed on their most recent visit." : "This visitor's ID has not been verified — flag for reception review.", icon: <ShieldCheck size={14} /> },
            ].map((insight, idx) => (
              <div key={idx} className="border border-purple-100 bg-purple-50/40 rounded-xl p-3 flex items-start gap-2">
                <span className="text-purple-600 mt-0.5 flex-shrink-0">{insight.icon}</span>
                <p className="text-sm text-slate-700">{insight.text}</p>
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
            { label: "Register New Visit", icon: <UserPlus size={17} />, action: () => setShowRegisterVisit(true) },
            { label: "Check Visitor In", icon: <CheckCircle2 size={17} />, action: () => setShowCheckVisitorIn(true) },
            { label: "Print Badge", icon: <IdCard size={17} />, action: () => setShowPrintBadge(true) },
            { label: "View Full History", icon: <Calendar size={17} />, action: () => setShowFullHistory(true) },
            { label: "Export Profile", icon: <FileText size={17} />, action: () => setShowExportProfile(true) },
            { label: "Add Notes", icon: <StickyNote size={17} />, action: () => setShowAddNotes(true) },
          ].map(qa => (
            <button key={qa.label} onClick={qa.action} className="flex flex-col items-center gap-2 border border-slate-200 rounded-xl p-3 hover:bg-slate-50 transition text-center">
              <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">{qa.icon}</div>
              <span className="text-[11px] font-medium text-slate-700">{qa.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ---------- Modals ---------- */}
      {showExportRecords && (
        <ExportRecordsModal onClose={() => setShowExportRecords(false)} onExport={() => { showToast("Visitor records exported"); setShowExportRecords(false); }} />
      )}

      {showRegisterVisitor && (
        <RegisterVisitorModal onClose={() => setShowRegisterVisitor(false)} onSubmit={(data) => {
          void saveVisitorVisit({ visitorName: data.name, company: data.company, hostName: data.host, hostEmployeeCode: data.hostCode, department: data.department, location: data.location, status: "Pending Security Check-in", visitDate: todayISO(), purpose: "Registered from visitor records" })
            .then((saved) => { remember(saved); setSelectedId(saved.id); showToast(`${saved.visitorName} registered`); })
            .catch((error) => showToast(error instanceof Error ? error.message : "Unable to register the visitor."));
          setShowRegisterVisitor(false);
        }} />
      )}

      {showPrintReport && (
        <PrintReportModal onClose={() => setShowPrintReport(false)} onPrint={() => { showToast("Visitor report sent to printer"); setShowPrintReport(false); }} />
      )}

      {showAddNotes && (
        <AddNotesModal visitor={selected} onClose={() => setShowAddNotes(false)} onSave={(notes) => {
          if (!selected.id) return;
          void patchVisitorVisit(selected.id, { notes }, { time: "", action: "Notes updated", actor: "Reception" })
            .then((saved) => { remember(saved); showToast(`Notes updated for ${selected.name}`); })
            .catch((error) => showToast(error instanceof Error ? error.message : "Unable to save notes."));
          setShowAddNotes(false);
        }} />
      )}

      {showRegisterVisit && (
        <RegisterVisitModal visitor={selected} onClose={() => setShowRegisterVisit(false)} onSubmit={(data) => {
          if (!selected.id) return;
          void saveVisitorVisit({
            visitorName: selected.name, company: selected.company, phone: selected.phone, email: selected.email, nationality: selected.nationality,
            hostName: selected.host, department: selected.mostVisitedDept, visitorType: selected.visitorType, isVip: selected.isVIP,
            visitDate: data.date, visitTime: data.time, purpose: data.purpose || "Scheduled visit", status: "Pending Security Check-in",
          }).then((saved) => { remember(saved); setSelectedId(saved.id); showToast(`New visit scheduled for ${selected.name}`); })
            .catch((error) => showToast(error instanceof Error ? error.message : "Unable to schedule the visit."));
          setShowRegisterVisit(false);
        }} />
      )}

      {showCheckVisitorIn && (
        <CheckVisitorInModal visitor={selected} onClose={() => setShowCheckVisitorIn(false)} onCheckIn={() => {
          if (!selected.id) return;
          void patchVisitorVisit(selected.id, { status: "Checked In", checkInAt: new Date().toISOString(), idVerified: true, badgeStatus: "Active" }, { time: "", action: "Checked in from records", actor: "Reception" })
            .then((saved) => { remember(saved); showToast(`${selected.name} checked in`); })
            .catch((error) => showToast(error instanceof Error ? error.message : "Unable to check the visitor in."));
          setShowCheckVisitorIn(false);
        }} />
      )}

      {showPrintBadge && (
        <PrintBadgeModal visitor={selected} onClose={() => setShowPrintBadge(false)} onPrint={() => {
          if (!selected.id) return;
          void patchVisitorVisit(selected.id, { badgeStatus: "Active" }, { time: "", action: "Badge printed", actor: "Reception" })
            .then((saved) => { remember(saved); showToast(`Badge printed for ${selected.name}`); })
            .catch((error) => showToast(error instanceof Error ? error.message : "Unable to print the badge."));
          setShowPrintBadge(false);
        }} />
      )}

      {showFullHistory && (
        <FullHistoryModal visitor={selected} onClose={() => setShowFullHistory(false)} />
      )}

      {showExportProfile && (
        <ExportProfileModal visitor={selected} onClose={() => setShowExportProfile(false)} onExport={() => { showToast(`${selected.name}'s profile exported`); setShowExportProfile(false); }} />
      )}
    </div>
  );
}

// ---------- Modal: Export Records ----------
function ExportRecordsModal({ onClose, onExport }: { onClose: () => void; onExport: () => void }) {
  const [range, setRange] = useState("All Time");
  const [format, setFormat] = useState("CSV");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Export Records</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Range</label>
            <select value={range} onChange={e => setRange(e.target.value)} className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm">
              <option>All Time</option><option>This Month</option><option>Last 6 Months</option><option>This Year</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Format</label>
            <select value={format} onChange={e => setFormat(e.target.value)} className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm">
              <option>CSV</option><option>Excel</option><option>PDF</option>
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

// ---------- Modal: Register Visitor ----------
function RegisterVisitorModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (data: { name: string; company: string; host: string; hostCode?: string; department?: string; location?: string }) => void }) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [host, setHost] = useState("");
  const [hostCode, setHostCode] = useState("");
  const [department, setDepartment] = useState("");
  const [location, setLocation] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><UserPlus size={18} className="text-blue-600" /> Register Visitor</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); if (name.trim()) onSubmit({ name, company, host, hostCode, department, location }); }} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Visitor Name</label>
            <input required value={name} onChange={e => setName(e.target.value)} placeholder="Full name" className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Company</label>
            <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Company name" className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm" />
          </div>
          <EmployeeHostField label="Host" value={host} onPick={(employee, typed) => { setHost(typed); setHostCode(employee?.code || ""); setDepartment(employee?.department || ""); setLocation(employee?.location || ""); }} />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700">Register</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Modal: Print Report ----------
function PrintReportModal({ onClose, onPrint }: { onClose: () => void; onPrint: () => void }) {
  const [scope, setScope] = useState("All Visitors");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Print Visitor Report</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Scope</label>
            <select value={scope} onChange={e => setScope(e.target.value)} className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm">
              <option>All Visitors</option><option>Currently Inside</option><option>VIP Visitors</option><option>Blacklisted</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Cancel</button>
            <button type="button" onClick={onPrint} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700">Print</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Modal: Add Notes ----------
function AddNotesModal({ visitor, onClose, onSave }: { visitor: VisitorRecord; onClose: () => void; onSave: (notes: string) => void }) {
  const [notes, setNotes] = useState(visitor.notes);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><StickyNote size={18} className="text-blue-600" /> Notes — {visitor.name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={5} placeholder="Internal reception/security notes visible only to staff..." className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
        <div className="flex justify-end gap-2 pt-4">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Cancel</button>
          <button onClick={() => onSave(notes)} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700">Save Notes</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Modal: Register New Visit ----------
function RegisterVisitModal({ visitor, onClose, onSubmit }: { visitor: VisitorRecord; onClose: () => void; onSubmit: (data: { date: string; time: string; purpose: string }) => void }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [purpose, setPurpose] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900">New Visit — {visitor.name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); onSubmit({ date, time, purpose }); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-700">Date</label>
              <input required type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Time</label>
              <input required type="time" value={time} onChange={e => setTime(e.target.value)} className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Purpose</label>
            <input value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="Purpose of visit" className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700">Schedule Visit</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Modal: Check Visitor In ----------
function CheckVisitorInModal({ visitor, onClose, onCheckIn }: { visitor: VisitorRecord; onClose: () => void; onCheckIn: () => void }) {
  if (visitor.status === "Blacklisted") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
          <Ban size={32} className="text-red-500 mx-auto mb-2" />
          <h3 className="text-lg font-semibold text-slate-900">Access Restricted</h3>
          <p className="text-sm text-slate-500 mt-1">{visitor.name} is currently blacklisted and cannot be checked in.</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 border border-slate-200 rounded-xl text-sm w-full">Close</button>
        </div>
      </div>
    );
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Check In</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <span className={`w-14 h-14 rounded-full ${visitor.color} text-white flex items-center justify-center text-lg font-bold mx-auto`}>{visitor.initials}</span>
        <p className="text-sm text-slate-700 mt-3 font-medium">{visitor.name}</p>
        <p className="text-xs text-slate-400">{visitor.company}</p>
        <button onClick={onCheckIn} className="mt-4 w-full px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm hover:bg-emerald-700">Confirm Check-in</button>
      </div>
    </div>
  );
}

// ---------- Modal: Print Badge ----------
function PrintBadgeModal({ visitor, onClose, onPrint }: { visitor: VisitorRecord; onClose: () => void; onPrint: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Print Badge</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="border-2 border-dashed border-indigo-200 rounded-xl p-4 bg-indigo-50/30 text-center">
          <div className="text-[10px] uppercase tracking-wide text-indigo-500 font-semibold">Visitor Badge</div>
          <div className="text-lg font-bold text-slate-900 mt-1">{visitor.name}</div>
          <div className="text-xs text-slate-500">{visitor.visitorType}</div>
          <div className="text-xs text-slate-500 mt-1">Host: {visitor.host}</div>
        </div>
        <button onClick={onPrint} className="mt-4 w-full px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm hover:bg-indigo-700">Print</button>
      </div>
    </div>
  );
}

// ---------- Modal: Full History ----------
function FullHistoryModal({ visitor, onClose }: { visitor: VisitorRecord; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900">{visitor.name} — Full Visit History</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {visitor.visits.map((v, idx) => (
            <div key={idx} className="border border-slate-100 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-800">{v.date}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${v.status === "Ongoing" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"}`}>{v.status}</span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{v.purpose} · {v.department}</div>
              <div className="text-xs text-slate-400 mt-0.5">Host: {v.host} · {v.checkIn}{v.checkOut ? ` – ${v.checkOut}` : ""} ({v.duration})</div>
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

// ---------- Modal: Export Profile ----------
function ExportProfileModal({ visitor, onClose, onExport }: { visitor: VisitorRecord; onClose: () => void; onExport: () => void }) {
  const [format, setFormat] = useState("PDF");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Export Profile</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <p className="text-sm text-slate-500 mb-3">Export {visitor.name}'s profile and visit history.</p>
        <select value={format} onChange={e => setFormat(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm">
          <option>PDF</option><option>CSV</option>
        </select>
        <div className="flex justify-end gap-2 pt-4">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Cancel</button>
          <button onClick={onExport} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700">Export</button>
        </div>
      </div>
    </div>
  );
}