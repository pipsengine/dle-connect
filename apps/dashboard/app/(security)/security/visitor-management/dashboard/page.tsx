"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Download,
  FileText,
  LogOut,
  Printer,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserPlus,
  Users,
  X,
  Zap,
} from "lucide-react";
import { loadVisitorWorkspace, patchVisitorVisit } from "@/lib/security/visitor-client";
import type { VisitorVisit } from "@/lib/security/visitor-types";
import { emptyVisitorAccess, type VisitorAccess } from "@/lib/security/visitor-access";
import { todayISO, visitorInitials, visitorStageAction } from "@/lib/security/visitor-views";
import { VisitorRegistrationForm } from "../_components/visitor-registration-form";
import "./visitor-dashboard.css";

const lagosDate = (value: string | Date) => new Date(new Date(value).toLocaleString("en-US", { timeZone: "Africa/Lagos" }));

const dayKey = (value: string | Date) => {
  const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? new Date(`${value.slice(0, 10)}T12:00:00`) : lagosDate(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const closed = (visit: VisitorVisit) => ["Checked Out", "Cancelled", "Rejected", "Draft", "Blacklisted"].includes(visit.status);
const inside = (visit: VisitorVisit) => ["Checked In", "Pending Reception Check-out", "Pending Security Check-out"].includes(visit.status);

const clock = (visit: VisitorVisit) => {
  const source = visit.checkInAt || visit.checkOutAt || visit.updatedAt;
  if (!source) return visit.visitTime || "";
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" }).format(new Date(source));
};

let toastTimer: number | undefined;

const statusClass = (status: string) => {
  if (status === "Checked In") return "is-in";
  if (status === "Checked Out" || status === "Cancelled" || status === "Rejected") return "is-out";
  return "is-wait";
};

export default function VisitorManagementDashboardPage() {
  const router = useRouter();
  const [visits, setVisits] = useState<VisitorVisit[]>([]);
  const [access, setAccess] = useState<VisitorAccess>(emptyVisitorAccess());
  const [activitySearch, setActivitySearch] = useState("");
  const [toast, setToast] = useState("");
  const [detailId, setDetailId] = useState("");
  const [busyId, setBusyId] = useState("");
  const [loading, setLoading] = useState(true);
  const [registerOpen, setRegisterOpen] = useState(false);

  const notify = (message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => setToast(""), 2800);
  };

  const refresh = async () => {
    const workspace = await loadVisitorWorkspace();
    setVisits(workspace.visits);
    setAccess({ ...emptyVisitorAccess(), ...workspace.access });
  };

  useEffect(() => {
    refresh()
      .catch((error) => notify(error instanceof Error ? error.message : "Visitor records could not be loaded."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("register") !== "1") return;
    setRegisterOpen(true);
    router.replace("/security/visitor-management/dashboard");
  }, [router]);

  const today = todayISO();
  const expected = visits.filter((visit) => visit.visitDate.slice(0, 10) === today && !["Draft", "Cancelled", "Rejected"].includes(visit.status));
  const checkedInToday = visits.filter((visit) => visit.checkInAt && dayKey(visit.checkInAt) === today);
  const insideNow = visits.filter(inside);
  const checkedOutToday = visits.filter((visit) => visit.status === "Checked Out" && visit.checkOutAt && dayKey(visit.checkOutAt) === today);
  const openVisits = visits.filter((visit) => !closed(visit));
  const blacklisted = visits.filter((visit) => visit.blacklisted || visit.status === "Blacklisted");

  const stats = [
    { id: "expected", visits: expected, value: expected.length, title: "Scheduled", subtitle: "Visitors Expected Today", icon: CalendarDays, color: "blue" },
    { id: "checked-in", visits: checkedInToday, value: checkedInToday.length, title: "Visitors", subtitle: "Checked In", icon: CheckCircle2, color: "green" },
    { id: "inside", visits: insideNow, value: insideNow.length, title: "Visitors", subtitle: "Currently Inside", icon: Building2, color: "purple" },
    { id: "checked-out", visits: checkedOutToday, value: checkedOutToday.length, title: "Visitors", subtitle: "Checked Out", icon: LogOut, color: "slate" },
    { id: "open", visits: openVisits, value: openVisits.length, title: "Active", subtitle: "Open Visits", icon: Activity, color: "orange" },
    { id: "blacklisted", visits: blacklisted, value: blacklisted.length, title: "Blacklisted", subtitle: "Visitors", icon: ShieldAlert, color: "red" },
  ];
  const detail = stats.find((card) => card.id === detailId);

  const roster = visits
    .filter((visit) => !closed(visit))
    .filter((visit) => visit.visitDate.slice(0, 10) === today || inside(visit))
    .filter((visit) => {
      const query = activitySearch.trim().toLowerCase();
      if (!query) return true;
      return `${visit.visitorName} ${visit.hostName} ${visit.company} ${visit.phone} ${visit.purpose} ${visit.visitorType} ${visit.department} ${visit.status}`.toLowerCase().includes(query);
    })
    .sort((a, b) => {
      const rank = (visit: VisitorVisit) => (visitorStageAction(visit.status) ? 0 : inside(visit) ? 1 : 2);
      return rank(a) - rank(b) || (a.visitTime || "").localeCompare(b.visitTime || "");
    });

  const waitingCount = visits.filter((visit) => {
    const step = visitorStageAction(visit.status);
    if (!step) return false;
    return step.role === "security" ? access.canSecurity : access.canReception;
  }).length;

  const advance = async (visit: VisitorVisit) => {
    const step = visitorStageAction(visit.status);
    if (!step) return;
    const allowed = step.role === "security" ? access.canSecurity : access.canReception;
    if (!allowed) {
      notify("Only security, reception, and administrators can check visitors in or out.");
      return;
    }
    setBusyId(visit.id);
    try {
      await patchVisitorVisit(visit.id, {
        status: step.status,
        idVerified: step.status === "Checked In" ? true : visit.idVerified,
        badgeStatus: step.status === "Checked In" ? "Active" : visit.badgeStatus,
      }, { time: "", action: step.action, actor: access.name });
      await refresh();
      notify(`${step.label} completed for ${visit.visitorName}.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "The visit could not be updated.");
    } finally {
      setBusyId("");
    }
  };

  const exportReport = () => {
    const header = ["Visitor", "Company", "Host", "Department", "Date", "Time", "Status"];
    const rows = visits.map((visit) => [visit.visitorName, visit.company, visit.hostName, visit.department, visit.visitDate, visit.visitTime, visit.status]);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `visitor-report-${today}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const headingDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Africa/Lagos" }).format(new Date());

  return (
    <div className="vms-dashboard -mx-5 -my-6 min-h-full bg-[#f4f7fc] px-4 py-5 lg:-mx-8 lg:px-6 xl:-mx-10 xl:px-8">
      <div className="vms-content">
        <section className="vms-page-heading">
          <div className="vms-title-group">
            <div className="vms-title-icon"><ShieldCheck /></div>
            <div>
              <h1>Visitor Management Dashboard</h1>
              <p>Monitor visitor arrivals, check-ins, and building occupancy in real time.</p>
            </div>
          </div>
          <div className="vms-heading-actions">
            <button className="vms-button" type="button"><CalendarDays /> Today, {headingDate} <ChevronDown /></button>
            <button className="vms-button" type="button" onClick={exportReport}><Download /> Export Report</button>
            <button className="vms-button" type="button" onClick={() => window.print()}><Printer /> Print</button>
            <button className="vms-button vms-button-primary" type="button" onClick={() => setRegisterOpen(true)}><UserPlus /> Register Visitor</button>
          </div>
        </section>

        <section className="vms-kpi-grid">
          {stats.map(({ id, value, title, subtitle, icon: Icon, color }) => (
            <button className={`vms-kpi ${color}`} key={id} type="button" onClick={() => setDetailId(id)}>
              <div className="vms-kpi-icon"><Icon /></div>
              <Icon className="vms-kpi-watermark" />
              <strong>{loading ? "–" : value}</strong>
              <b>{title}</b>
              <span>{subtitle}</span>
            </button>
          ))}
        </section>

        <section className="vms-panel vms-roster" id="visitor-check">
          <div className="vms-panel-heading">
            <h2><Users /> Today&apos;s Visitors</h2>
            <div className="vms-roster-tools">
              <span className="vms-live-tag"><i /> Live</span>
              <label className="vms-search">
                <Search />
                <input value={activitySearch} onChange={(event) => setActivitySearch(event.target.value)} placeholder="Search visitors..." />
              </label>
            </div>
          </div>
          {roster.length ? (
            <div className="vms-roster-list">
              {roster.map((visit) => {
                const step = visitorStageAction(visit.status);
                const checkout = step ? /check-out/i.test(step.label) : false;
                const allowed = Boolean(step) && (step?.role === "security" ? access.canSecurity : access.canReception);
                const fields = [
                  ["Company", visit.company],
                  ["Phone", visit.phone],
                  ["Purpose", visit.purpose],
                  ["Visitor type", visit.visitorType],
                  ["Host", visit.hostName],
                  ["Department", visit.department],
                  ["Time", visit.visitTime || clock(visit)],
                  ["Status", visit.status],
                ];
                return (
                  <article className="vms-roster-card" key={visit.id}>
                    <div className="vms-roster-card-head">
                      <div className="vms-initials">{visitorInitials(visit.visitorName)}</div>
                      <div className="vms-roster-meta">
                        <strong>{visit.visitorName || "Unnamed visitor"}</strong>
                        <small>{step ? step.label : "Visit closed"}</small>
                      </div>
                      {step ? (
                        <button
                          className={`vms-row-action ${checkout ? "checkout" : "checkin"}`}
                          type="button"
                          title={step.label}
                          disabled={!allowed || busyId === visit.id}
                          onClick={() => advance(visit)}
                        >
                          {busyId === visit.id ? "Saving..." : checkout ? "Check-Out" : "Check-In"}
                        </button>
                      ) : (
                        <span className="vms-row-done">{visit.status === "Checked Out" ? "Checked out" : visit.status}</span>
                      )}
                    </div>
                    <dl className="vms-roster-fields">
                      {fields.map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd className={label === "Status" ? statusClass(value) : undefined}>{value || "—"}</dd>
                        </div>
                      ))}
                    </dl>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="vms-empty">{activitySearch ? "No matching visitor found." : loading ? "Loading visitors..." : "No open visits right now."}</div>
          )}
        </section>

        <section className="vms-bottom-grid">
          <article className="vms-panel vms-quick-panel">
            <div className="vms-panel-heading"><h2><Zap /> Quick Actions</h2></div>
            <button type="button" onClick={() => setRegisterOpen(true)}><CalendarDays /> Pre-Register Visitor</button>
            <button type="button" onClick={() => document.getElementById("visitor-check")?.scrollIntoView({ behavior: "smooth", block: "center" })}>
              <CheckCircle2 /> Open Visits {waitingCount > 0 ? <b className="vms-alert-count">{waitingCount}</b> : null}
            </button>
            <button type="button" onClick={() => router.push("/security/visitor-management/visitor-records")}><FileText /> View Visitor Records</button>
            <button type="button" onClick={() => router.push("/security/visitor-management/reports")}><BarChart3 /> Generate Reports</button>
          </article>
        </section>

        <footer className="vms-footer">DLE Connect <span>•</span> Security Operations <span>•</span> Visitor Management <small>All activity is recorded in the security audit trail.</small></footer>
      </div>

      {detail ? (
        <div className="vms-modal-back" onClick={() => setDetailId("")}>
          <div className="vms-modal" onClick={(event) => event.stopPropagation()}>
            <div className="vms-panel-heading">
              <h2>{detail.title} · {detail.subtitle}</h2>
              <button className="vms-link" type="button" onClick={() => setDetailId("")}><X /></button>
            </div>
            {detail.visits.length ? (
              <div className="vms-modal-list">
                {detail.visits.map((visit) => (
                  <div className="vms-modal-row" key={visit.id}>
                    <div className="vms-initials">{visitorInitials(visit.visitorName)}</div>
                    <div className="vms-activity-person">
                      <strong>{visit.visitorName}</strong>
                      <small>{visit.hostName || "No host"} · {visit.department || visit.company || "Visitor"}</small>
                    </div>
                    <span className={`vms-detail-status ${statusClass(visit.status)}`}>{visit.status}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="vms-empty">No visitors in this group.</div>
            )}
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="vms-toast"><CheckCircle2 />{toast}<button type="button" onClick={() => setToast("")}><X /></button></div>
      ) : null}

      {registerOpen ? (
        <div className="vms-register-back" role="dialog" aria-modal="true" aria-label="Register Visitor">
          <div className="vms-register-modal">
            <VisitorRegistrationForm onClose={() => setRegisterOpen(false)} onSaved={() => { void refresh(); }} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
