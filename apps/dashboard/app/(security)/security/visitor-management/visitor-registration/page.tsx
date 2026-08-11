"use client";

import React, { useState, useRef, useMemo } from "react";
import {
  Briefcase,
  Building2,
  Calendar,
  Camera,
  Car,
  CheckCircle2,
  FileText,
  IdCard,
  MapPin,
  Package,
  Phone,
  Printer,
  Save,
  Sparkles,
  Trash2,
  UploadCloud,
  User,
} from "lucide-react";

// ---------- reference data ----------
const visitorTypes = ["Guest", "Vendor", "Contractor", "Interview Candidate", "Delivery", "Government Official", "VIP"];
const nationalities = [
  { name: "Nigeria", flag: "🇳🇬" }, { name: "United States", flag: "🇺🇸" }, { name: "United Kingdom", flag: "🇬🇧" },
  { name: "Ghana", flag: "🇬🇭" }, { name: "Kenya", flag: "🇰🇪" }, { name: "South Africa", flag: "🇿🇦" }, { name: "India", flag: "🇮🇳" }, { name: "Other", flag: "🏳️" },
];
const knownCompanies = ["ABC Technologies", "Coastal Logistics", "Nimbus Consulting", "Zenith Freight", "Coral Partners", "BluePeak Analytics"];
const durationChips = ["30 mins", "1 hour", "2 hours", "Half Day", "Full Day"];

interface Employee {
  name: string;
  department: string;
  floor: string;
  ext: string;
  available: boolean;
}

const employees: Employee[] = [
  { name: "Sarah Johnson", department: "HR Department", floor: "Floor 3", ext: "204", available: true },
  { name: "David Wilson", department: "Procurement", floor: "Floor 2", ext: "118", available: true },
  { name: "Emily Carter", department: "Consulting Relations", floor: "Floor 4", ext: "231", available: false },
  { name: "James Okafor", department: "Operations", floor: "Floor 1", ext: "102", available: true },
  { name: "Michael Adams", department: "Platform Engineering", floor: "Floor 5", ext: "310", available: true },
];

const idTypes = ["National ID", "Driver's License", "International Passport", "Company ID", "Voter's Card"];

const steps = [
  { key: "visitor", label: "Visitor" },
  { key: "visit", label: "Visit Details" },
  { key: "host", label: "Host" },
  { key: "security", label: "Security" },
  { key: "complete", label: "Complete" },
];

interface UploadedFile {
  id: string;
  name: string;
  size: string;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function VisitorRegistrationPage() {
  // Section 1 - Visitor Information
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [companyFocused, setCompanyFocused] = useState(false);
  const [visitorType, setVisitorType] = useState("");
  const [email, setEmail] = useState("");
  const [nationality, setNationality] = useState("");

  // Section 2 - Visit Details
  const [visitDate, setVisitDate] = useState("");
  const [visitTime, setVisitTime] = useState("");
  const [duration, setDuration] = useState("1 hour");
  const [purpose, setPurpose] = useState("");

  // Section 3 - Host & Destination
  const [hostName, setHostName] = useState("");
  const [meetingLocation, setMeetingLocation] = useState("");

  // Section 4 - Access & Security
  const [idType, setIdType] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [itemsCarried, setItemsCarried] = useState("");
  const [vehicleBrought, setVehicleBrought] = useState(false);
  const [vehicleType, setVehicleType] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [parkingSlot, setParkingSlot] = useState("");

  // Section 5 - Notes & Attachments
  const [internalNotes, setInternalNotes] = useState("");
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [toast, setToast] = useState<string | null>(null);
  const [registered, setRegistered] = useState<{ id: string } | null>(null);

  const visitorSectionRef = useRef<HTMLDivElement>(null);
  const visitSectionRef = useRef<HTMLDivElement>(null);
  const hostSectionRef = useRef<HTMLDivElement>(null);
  const securitySectionRef = useRef<HTMLDivElement>(null);
  const notesSectionRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  const selectedHost = employees.find(e => e.name === hostName);
  const nationalityFlag = nationalities.find(n => n.name === nationality)?.flag;

  const companySuggestions = useMemo(() => {
    if (!company || !companyFocused) return [];
    return knownCompanies.filter(c => c.toLowerCase().includes(company.toLowerCase()) && c.toLowerCase() !== company.toLowerCase());
  }, [company, companyFocused]);

  const initials = fullName.trim() ? fullName.trim().split(/\s+/).map(n => n[0]).join("").slice(0, 2).toUpperCase() : "";

  // completion tracking
  const requiredFields = [fullName, phone, company, visitorType, visitDate, visitTime, hostName];
  const completedRequired = requiredFields.filter(f => f && f.trim().length > 0).length;
  const optionalFields = [email, nationality, meetingLocation, idType, idNumber, purpose];
  const completedOptional = optionalFields.filter(f => f && f.trim().length > 0).length;
  const completionPct = Math.round(((completedRequired / requiredFields.length) * 0.8 + (completedOptional / optionalFields.length) * 0.2) * 100);

  const currentStepKey = useMemo(() => {
    if (registered) return "complete";
    if (idType || idNumber || itemsCarried || vehicleBrought) return "security";
    if (hostName || meetingLocation) return "host";
    if (visitDate || visitTime || purpose) return "visit";
    return "visitor";
  }, [registered, idType, idNumber, itemsCarried, vehicleBrought, hostName, meetingLocation, visitDate, visitTime, purpose]);

  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const stepScrollMap: Record<string, React.RefObject<HTMLDivElement | null>> = {
    visitor: visitorSectionRef, visit: visitSectionRef, host: hostSectionRef, security: securitySectionRef, complete: notesSectionRef,
  };

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const newFiles: UploadedFile[] = Array.from(fileList).map(f => ({ id: `${f.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: f.name, size: formatBytes(f.size) }));
    setAttachments(prev => [...prev, ...newFiles]);
  };
  const removeAttachment = (id: string) => setAttachments(prev => prev.filter(f => f.id !== id));

  const canRegister = completedRequired === requiredFields.length;

  const handleRegister = () => {
    if (!canRegister) { showToast("Please complete all required fields before registering."); return; }
    const id = `VIS-${Math.floor(10000 + Math.random() * 89999)}`;
    setRegistered({ id });
    showToast(`Visitor registered — ${id}`);
  };

  const handleSaveDraft = () => showToast("Draft saved");
  const handleCancel = () => showToast("Registration cancelled");

  const FieldCheck = ({ filled }: { filled: boolean }) => filled ? <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" /> : null;

  return (
    <div className="space-y-6 relative pb-10">
      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-[60] bg-slate-900 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 max-w-sm">
          <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" /> {toast}
        </div>
      )}

      {/* Success overlay */}
      {registered && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={32} />
            </div>
            <h3 className="text-xl font-semibold text-slate-900">Visitor Registered</h3>
            <p className="text-sm text-slate-500 mt-1">{fullName || "Visitor"} has been successfully registered.</p>
            <div className="mt-4 bg-slate-50 border border-slate-100 rounded-xl p-3">
              <div className="text-xs text-slate-400">Visitor ID</div>
              <div className="text-lg font-mono font-bold text-slate-900">{registered.id}</div>
            </div>
            <div className="flex items-center gap-2 mt-5">
              <button onClick={() => setRegistered(null)} className="flex-1 px-4 py-2 border border-slate-200 rounded-xl text-sm hover:bg-slate-50">Close</button>
              <button onClick={() => showToast(`Badge printed for ${fullName || "visitor"}`)} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm hover:bg-indigo-700 flex items-center justify-center gap-1.5"><Printer size={14} /> Print Badge</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl px-6 py-4 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Register Visitor</h1>
          <p className="mt-1 text-sm text-slate-500">Create a visitor registration before arrival or register a walk-in visitor.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={handleCancel} className="px-4 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={handleSaveDraft} className="px-4 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-1.5"><Save size={15} /> Save Draft</button>
          <button onClick={handleRegister} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Register Visitor</button>
        </div>
      </div>

      {/* Progress Stepper */}
      <div className="bg-white border border-slate-200 rounded-2xl px-6 py-4 shadow-sm">
        <div className="flex items-center">
          {steps.map((s, idx) => {
            const isActive = s.key === currentStepKey;
            const isPast = steps.findIndex(x => x.key === currentStepKey) > idx;
            return (
              <React.Fragment key={s.key}>
                <button onClick={() => scrollTo(stepScrollMap[s.key])} className="flex items-center gap-2 flex-shrink-0">
                  <span className={`w-2.5 h-2.5 rounded-full ${isActive ? "bg-blue-600" : isPast ? "bg-emerald-500" : "bg-slate-300"}`} />
                  <span className={`text-xs font-medium whitespace-nowrap ${isActive ? "text-blue-700" : isPast ? "text-emerald-600" : "text-slate-400"}`}>{s.label}</span>
                </button>
                {idx < steps.length - 1 && <div className={`flex-1 h-px mx-3 ${isPast ? "bg-emerald-300" : "bg-slate-200"}`} />}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Section 1 - Visitor Information */}
          <div ref={visitorSectionRef} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2"><User size={17} className="text-blue-600" /> Visitor Information</h2>
            <div className="flex items-start gap-4 mb-4">
              <button className="w-16 h-16 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-lg font-bold flex-shrink-0 border-2 border-dashed border-blue-200 hover:bg-blue-100 relative group">
                {initials || <Camera size={20} />}
                <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 group-hover:text-blue-600"><Camera size={11} /></span>
              </button>
              <div className="flex-1 grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-slate-600 mb-1 flex items-center gap-1">Visitor Full Name <span className="text-red-500">*</span> <FieldCheck filled={!!fullName.trim()} /></label>
                  <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="e.g., John Smith" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-300" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 flex items-center gap-1">Phone Number <span className="text-red-500">*</span> <FieldCheck filled={!!phone.trim()} /></label>
                  <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+234 800 000 0000" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-300" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 flex items-center gap-1">Visitor Type <span className="text-red-500">*</span> <FieldCheck filled={!!visitorType} /></label>
                  <select value={visitorType} onChange={e => setVisitorType(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm">
                    <option value="">Select type</option>
                    {visitorTypes.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 relative">
              <div className="relative">
                <label className="text-xs font-medium text-slate-600 mb-1 flex items-center gap-1">Company / Organization <span className="text-red-500">*</span> <FieldCheck filled={!!company.trim()} /></label>
                <input
                  value={company}
                  onChange={e => setCompany(e.target.value)}
                  onFocus={() => setCompanyFocused(true)}
                  onBlur={() => setTimeout(() => setCompanyFocused(false), 150)}
                  placeholder="e.g., ABC Technologies"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-300"
                />
                {companySuggestions.length > 0 && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                    {companySuggestions.map(c => (
                      <button key={c} type="button" onClick={() => setCompany(c)} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2"><Briefcase size={12} className="text-slate-400" /> {c}</button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 flex items-center gap-1">Email <span className="text-slate-400">(Optional)</span> <FieldCheck filled={!!email.trim()} /></label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="visitor@company.com" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-300" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-slate-600 mb-1 flex items-center gap-1">Nationality <span className="text-slate-400">(Optional)</span> <FieldCheck filled={!!nationality} /></label>
                <select value={nationality} onChange={e => setNationality(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm">
                  <option value="">Select nationality</option>
                  {nationalities.map(n => <option key={n.name}>{n.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Section 2 - Visit Details */}
          <div ref={visitSectionRef} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2"><Calendar size={17} className="text-indigo-600" /> Visit Details</h2>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 flex items-center gap-1">Visit Date <span className="text-red-500">*</span> <FieldCheck filled={!!visitDate} /></label>
                <input type="date" value={visitDate} onChange={e => setVisitDate(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 flex items-center gap-1">Visit Time <span className="text-red-500">*</span> <FieldCheck filled={!!visitTime} /></label>
                <input type="time" value={visitTime} onChange={e => setVisitTime(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="mb-4">
              <label className="text-xs font-medium text-slate-600 mb-1.5 block">Expected Duration</label>
              <div className="flex flex-wrap gap-2">
                {durationChips.map(d => (
                  <button key={d} type="button" onClick={() => setDuration(d)} className={`text-xs px-3 py-1.5 rounded-full border ${duration === d ? "bg-indigo-600 border-indigo-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{d}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1">Purpose of Visit <span className="text-slate-400">(Optional)</span> <FieldCheck filled={!!purpose.trim()} /></span>
                <span className="text-[11px] text-slate-400">{purpose.length}/200</span>
              </label>
              <textarea value={purpose} onChange={e => setPurpose(e.target.value.slice(0, 200))} rows={3} placeholder="e.g., Quarterly vendor review meeting with the Finance team" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-300 resize-none" />
            </div>
          </div>

          {/* Section 3 - Host & Destination */}
          <div ref={hostSectionRef} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2"><Building2 size={17} className="text-blue-600" /> Host & Destination</h2>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 flex items-center gap-1">Person to Visit <span className="text-red-500">*</span> <FieldCheck filled={!!hostName} /></label>
                <select value={hostName} onChange={e => setHostName(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm">
                  <option value="">Select host</option>
                  {employees.map(e => <option key={e.name}>{e.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1">Meeting Location / Area</label>
                <input value={meetingLocation} onChange={e => setMeetingLocation(e.target.value)} placeholder="e.g., Meeting Room B" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-300" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1">Host Department</label>
                <input readOnly value={selectedHost?.department || ""} placeholder="Auto-filled" className="w-full border border-slate-100 bg-slate-50 rounded-xl px-3 py-2 text-sm text-slate-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1">Host Phone / Extension</label>
                <input readOnly value={selectedHost ? `Ext. ${selectedHost.ext}` : ""} placeholder="Auto-filled" className="w-full border border-slate-100 bg-slate-50 rounded-xl px-3 py-2 text-sm text-slate-500" />
              </div>
            </div>
            {selectedHost && (
              <div className="border border-blue-100 bg-blue-50/40 rounded-xl p-3 flex items-center gap-3">
                <span className="w-11 h-11 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold flex-shrink-0">{selectedHost.name.split(" ").map(n => n[0]).join("")}</span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900">{selectedHost.name}</div>
                  <div className="text-xs text-slate-500">{selectedHost.department} · {selectedHost.floor} · Ext. {selectedHost.ext}</div>
                </div>
                <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 ${selectedHost.available ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{selectedHost.available ? "Available Today" : "Busy Today"}</span>
              </div>
            )}
          </div>

          {/* Section 4 - Access & Security */}
          <div ref={securitySectionRef} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2"><IdCard size={17} className="text-slate-600" /> Access & Security</h2>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 flex items-center gap-1">ID Type <span className="text-slate-400">(Optional)</span> <FieldCheck filled={!!idType} /></label>
                <select value={idType} onChange={e => setIdType(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm">
                  <option value="">Select ID type</option>
                  {idTypes.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 flex items-center gap-1">ID Number <span className="text-slate-400">(Optional)</span> <FieldCheck filled={!!idNumber.trim()} /></label>
                <input value={idNumber} onChange={e => setIdNumber(e.target.value)} placeholder="ID number" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-300" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-slate-600 mb-1 flex items-center gap-1"><Package size={12} className="text-slate-400" /> Items Carried</label>
                <input value={itemsCarried} onChange={e => setItemsCarried(e.target.value)} placeholder="e.g., Laptop, documents folder" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-300" />
              </div>
            </div>
            <div className="flex items-center justify-between border border-slate-100 rounded-xl p-3">
              <span className="text-sm font-medium text-slate-700 flex items-center gap-2"><Car size={16} className="text-slate-400" /> Vehicle Brought?</span>
              <button
                onClick={() => setVehicleBrought(v => !v)}
                className={`w-11 h-6 rounded-full relative transition-colors ${vehicleBrought ? "bg-blue-600" : "bg-slate-300"}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${vehicleBrought ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </div>
            {vehicleBrought && (
              <div className="grid grid-cols-3 gap-3 mt-3 border border-slate-100 rounded-xl p-3 bg-slate-50/50">
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1">Vehicle Type</label>
                  <input value={vehicleType} onChange={e => setVehicleType(e.target.value)} placeholder="e.g., Sedan" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1">Plate Number</label>
                  <input value={plateNumber} onChange={e => setPlateNumber(e.target.value)} placeholder="e.g., LND-234-XY" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1">Parking Slot <span className="text-slate-400">(Optional)</span></label>
                  <input value={parkingSlot} onChange={e => setParkingSlot(e.target.value)} placeholder="e.g., P-12" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white" />
                </div>
              </div>
            )}
          </div>

          {/* Section 5 - Notes & Attachments */}
          <div ref={notesSectionRef} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2"><FileText size={17} className="text-slate-600" /> Additional Information</h2>
            <div className="mb-4">
              <label className="text-xs font-medium text-slate-600 mb-1">Internal Notes</label>
              <textarea value={internalNotes} onChange={e => setInternalNotes(e.target.value)} rows={3} placeholder="Notes visible only to reception and security staff..." className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-300 resize-none" />
            </div>
            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
              className={`border-2 border-dashed rounded-xl py-6 text-center transition ${isDragging ? "border-blue-400 bg-blue-50/50" : "border-slate-200"}`}
            >
              <UploadCloud size={22} className="mx-auto text-slate-400 mb-2" />
              <p className="text-sm text-slate-600">Drag &amp; drop files here or{" "}
                <button type="button" onClick={() => fileInputRef.current?.click()} className="text-blue-600 font-medium hover:underline">browse files</button>
              </p>
              <p className="text-xs text-slate-400 mt-1">PNG, JPG, PDF</p>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
            </div>
            {attachments.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                {attachments.map(f => (
                  <div key={f.id} className="flex items-center justify-between border border-slate-200 rounded-xl px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm text-slate-700 truncate">{f.name}</div>
                      <div className="text-xs text-slate-400">{f.size}</div>
                    </div>
                    <button onClick={() => removeAttachment(f.id)} className="p-1 text-slate-400 hover:text-red-500 flex-shrink-0"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: sticky summary sidebar */}
        <div className="lg:col-span-1">
          <div className="sticky top-4 space-y-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Visitor Summary</h3>
              <div className="flex items-center gap-3 mb-3">
                <span className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-sm font-bold flex-shrink-0">{initials || <User size={18} />}</span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate">{fullName || "Awaiting name"}</div>
                  <div className="text-xs text-slate-400 truncate">{company || "No company yet"}</div>
                </div>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-slate-400">Visit</span><span className="font-medium text-slate-700">{purpose ? purpose.slice(0, 24) + (purpose.length > 24 ? "…" : "") : visitorType || "—"}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Host</span><span className="font-medium text-slate-700">{hostName || "—"}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Date</span><span className="font-medium text-slate-700">{visitDate || "—"}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Time</span><span className="font-medium text-slate-700">{visitTime || "—"}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Duration</span><span className="font-medium text-slate-700">{duration}</span></div>
                {nationalityFlag && <div className="flex justify-between"><span className="text-slate-400">Nationality</span><span className="font-medium text-slate-700">{nationalityFlag} {nationality}</span></div>}
                {vehicleBrought && <div className="flex justify-between"><span className="text-slate-400">Vehicle</span><span className="font-medium text-slate-700">{vehicleType || "Yes"}{plateNumber ? ` · ${plateNumber}` : ""}</span></div>}
                <div className="flex justify-between pt-1 border-t border-slate-100">
                  <span className="text-slate-400">Status</span>
                  <span className={`font-medium ${canRegister ? "text-emerald-600" : "text-amber-600"}`}>{canRegister ? "Ready to Register" : "Incomplete"}</span>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                <span>Registration Complete</span>
                <span className="font-semibold text-slate-700">{completionPct}%</span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full">
                <div className={`h-2.5 rounded-full ${completionPct === 100 ? "bg-emerald-500" : "bg-indigo-500"}`} style={{ width: `${completionPct}%` }} />
              </div>
              {!canRegister && (
                <p className="text-[11px] text-amber-600 mt-2 flex items-center gap-1"><Sparkles size={11} /> Complete all required fields to enable registration.</p>
              )}
            </div>

            {selectedHost && (
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Host Preview</h3>
                <div className="flex items-center gap-3">
                  <span className="w-11 h-11 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold flex-shrink-0">{selectedHost.name.split(" ").map(n => n[0]).join("")}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">{selectedHost.name}</div>
                    <div className="text-xs text-slate-500">{selectedHost.department}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                  <div className="flex items-center gap-1 text-slate-500"><MapPin size={12} /> {selectedHost.floor}</div>
                  <div className="flex items-center gap-1 text-slate-500"><Phone size={12} /> Ext. {selectedHost.ext}</div>
                </div>
                <span className={`inline-block mt-2 text-[10px] px-2 py-0.5 rounded-full ${selectedHost.available ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{selectedHost.available ? "Available Today" : "Busy Today"}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer Actions (mobile-visible duplicate for convenience) */}
      <div className="flex items-center justify-between bg-white border border-slate-200 rounded-2xl px-6 py-4 shadow-sm lg:hidden">
        <button onClick={handleCancel} className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-600">Cancel</button>
        <button onClick={handleSaveDraft} className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 flex items-center gap-1.5"><Save size={14} /> Save Draft</button>
        <button onClick={handleRegister} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium">Register Visitor</button>
      </div>
    </div>
  );
}