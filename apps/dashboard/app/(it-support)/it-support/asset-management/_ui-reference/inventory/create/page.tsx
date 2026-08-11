'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Info,
  Tag,
  Hash,
  Shield,
  FileText,
  Network,
  Cpu,
  DollarSign,
  Save,
  Calendar as CalendarIcon,
  HardDrive,
  Monitor,
  Smartphone,
  Printer,
  Server,
  Package,
  Building2,
  MapPin,
  User,
  Loader2,
  ArrowLeft,
} from 'lucide-react';

// ---------- Types ----------

interface AssetFormValues {
  assetTag: string;
  assignedTo: string;
  department: string;
  location: string;
  assetType: string;
  manufacturer: string;
  modelName: string;
  serialNumber: string;
  assetStatus: string;
  assetCondition: string;
  purchaseDate: string;
  purchasePrice: string;
  warrantyExpiry: string;
  ipAddress: string;
  macAddress: string;
  operatingSystem: string;
  notes: string;
}

const initialValues: AssetFormValues = {
  assetTag: '',
  assignedTo: '',
  department: '',
  location: '',
  assetType: '',
  manufacturer: '',
  modelName: '',
  serialNumber: '',
  assetStatus: 'IN_USE',
  assetCondition: 'GOOD',
  purchaseDate: '',
  purchasePrice: '',
  warrantyExpiry: '',
  ipAddress: '',
  macAddress: '',
  operatingSystem: '',
  notes: '',
};

// ---------- Static option lists ----------

const ASSET_TYPES = ['LAPTOP', 'DESKTOP', 'PHONE', 'TABLET', 'PRINTER', 'SERVER', 'MONITOR', 'NETWORK_DEVICE', 'OTHER'];
const MANUFACTURERS = ['Dell', 'HP', 'Lenovo', 'Apple', 'Cisco', 'APC', 'Microsoft', 'Other'];
const DEPARTMENTS = ['IT', 'Finance', 'HR', 'Sales', 'Marketing', 'Operations', 'Engineering'];
const LOCATIONS = ['New York Office', 'London Office', 'Mumbai Office', 'Singapore Office', 'San Francisco Office'];
const STATUSES = ['IN_USE', 'UNDER_MAINTENANCE', 'UNASSIGNED', 'RETIRED'];
const CONDITIONS = ['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'];

const STATUS_STYLES: Record<string, string> = {
  IN_USE: 'bg-emerald-50 text-emerald-600',
  UNDER_MAINTENANCE: 'bg-amber-50 text-amber-600',
  UNASSIGNED: 'bg-violet-50 text-violet-600',
  RETIRED: 'bg-red-50 text-red-600',
};

function assetTypeIcon(type: string) {
  switch (type) {
    case 'LAPTOP':
      return <HardDrive className="h-5 w-5" />;
    case 'DESKTOP':
    case 'MONITOR':
      return <Monitor className="h-5 w-5" />;
    case 'PHONE':
    case 'TABLET':
      return <Smartphone className="h-5 w-5" />;
    case 'PRINTER':
      return <Printer className="h-5 w-5" />;
    case 'SERVER':
    case 'NETWORK_DEVICE':
      return <Server className="h-5 w-5" />;
    default:
      return <Package className="h-5 w-5" />;
  }
}

// ---------- Reusable field pieces ----------

function Label({ icon: Icon, required, children }: { icon?: React.ComponentType<{ className?: string }>; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
      {Icon ? <Icon className="h-4 w-4 text-slate-400" /> : null}
      {children}
      {required ? <span className="text-blue-600">*</span> : null}
    </label>
  );
}

function TextInput({
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { error?: string }) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:ring-2 ${
        error
          ? 'border-red-400 focus:border-red-400 focus:ring-red-100'
          : 'border-slate-200 focus:border-blue-400 focus:ring-blue-100'
      }`}
    />
  );
}

function SelectInput({
  error,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { error?: string }) {
  return (
    <select
      {...props}
      className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 ${
        error
          ? 'border-red-400 focus:border-red-400 focus:ring-red-100'
          : 'border-slate-200 focus:border-blue-400 focus:ring-blue-100'
      }`}
    >
      {children}
    </select>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm text-red-500">{message}</p>;
}

function SectionCard({
  icon: Icon,
  color,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-1 flex items-center gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-4.5 w-4.5" />
        </span>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      </div>
      <p className="mb-5 pl-12 text-sm text-slate-500">{description}</p>
      <div className="space-y-6">{children}</div>
    </div>
  );
}

// ---------- Main form ----------

export default function CreateAssetForm() {
  const router = useRouter();
  const [formData, setFormData] = useState<AssetFormValues>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.assetTag.trim()) newErrors.assetTag = 'Asset tag is required';
    if (!formData.department.trim()) newErrors.department = 'Department is required';
    if (!formData.location.trim()) newErrors.location = 'Location is required';
    if (!formData.assetType.trim()) newErrors.assetType = 'Asset type is required';
    if (!formData.manufacturer.trim()) newErrors.manufacturer = 'Manufacturer is required';
    if (!formData.modelName.trim()) newErrors.modelName = 'Model name is required';
    if (!formData.serialNumber.trim()) newErrors.serialNumber = 'Serial number is required';
    if (!formData.assetStatus.trim()) newErrors.assetStatus = 'Status is required';

    if (formData.assignedTo && !/\S+@\S+\.\S+/.test(formData.assignedTo)) {
      newErrors.assignedTo = 'Invalid email address';
    }
    if (formData.purchasePrice && !/^\d*\.?\d*$/.test(formData.purchasePrice)) {
      newErrors.purchasePrice = 'Invalid price format';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    // Wire this up to your own submit handler / API call.
    console.log('Submitting asset:', formData);
    setTimeout(() => setIsSubmitting(false), 800);
  };

  return (
    <div className="space-y-6">
      <div>
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <p className="mb-1 text-sm text-slate-500">
          Asset Management <span className="mx-1 text-slate-300">›</span>
          Hardware Inventory <span className="mx-1 text-slate-300">›</span>
          <span className="text-slate-700">Add New Asset</span>
        </p>
        <h1 className="text-2xl font-semibold text-slate-900">Add New Asset</h1>
        <p className="mt-1 text-sm text-slate-500">Register a new asset to the inventory system.</p>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column - form fields */}
        <div className="space-y-6 lg:col-span-2">
          <SectionCard
            icon={Info}
            color="bg-blue-50 text-blue-600"
            title="Basic Information"
            description="Essential details about the asset"
          >
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label icon={Tag} required>Asset Tag</Label>
                <TextInput
                  name="assetTag"
                  placeholder="e.g., DL-LT-001"
                  value={formData.assetTag}
                  onChange={handleChange}
                  error={errors.assetTag}
                />
                <FieldError message={errors.assetTag} />
                <p className="text-sm text-slate-500">Unique identifier for physical asset</p>
              </div>

              <div className="space-y-2">
                <Label icon={Hash} required>Serial Number</Label>
                <TextInput
                  name="serialNumber"
                  placeholder="Manufacturer serial number"
                  value={formData.serialNumber}
                  onChange={handleChange}
                  error={errors.serialNumber}
                />
                <FieldError message={errors.serialNumber} />
                <p className="text-sm text-slate-500">Manufacturer's serial number</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label required>Model Name</Label>
              <TextInput
                name="modelName"
                placeholder="e.g., Dell Latitude 5430"
                value={formData.modelName}
                onChange={handleChange}
                error={errors.modelName}
              />
              <FieldError message={errors.modelName} />
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label required>Asset Type</Label>
                <SelectInput name="assetType" value={formData.assetType} onChange={handleChange} error={errors.assetType}>
                  <option value="">Select asset type</option>
                  {ASSET_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type.replace('_', ' ')}
                    </option>
                  ))}
                </SelectInput>
                <FieldError message={errors.assetType} />
              </div>

              <div className="space-y-2">
                <Label required>Manufacturer</Label>
                <SelectInput name="manufacturer" value={formData.manufacturer} onChange={handleChange} error={errors.manufacturer}>
                  <option value="">Select manufacturer</option>
                  {MANUFACTURERS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </SelectInput>
                <FieldError message={errors.manufacturer} />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            icon={Shield}
            color="bg-violet-50 text-violet-600"
            title="Assignment & Location"
            description="Where and to whom the asset is assigned"
          >
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label required>Department</Label>
                <SelectInput name="department" value={formData.department} onChange={handleChange} error={errors.department}>
                  <option value="">Select department</option>
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </SelectInput>
                <FieldError message={errors.department} />
              </div>

              <div className="space-y-2">
                <Label required>Location</Label>
                <SelectInput name="location" value={formData.location} onChange={handleChange} error={errors.location}>
                  <option value="">Select location</option>
                  {LOCATIONS.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </SelectInput>
                <FieldError message={errors.location} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Assigned User Email</Label>
              <TextInput
                name="assignedTo"
                type="email"
                placeholder="user@company.com"
                value={formData.assignedTo}
                onChange={handleChange}
                error={errors.assignedTo}
              />
              <FieldError message={errors.assignedTo} />
              <p className="text-sm text-slate-500">Leave blank if asset is unassigned</p>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label required>Status</Label>
                <SelectInput name="assetStatus" value={formData.assetStatus} onChange={handleChange} error={errors.assetStatus}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace('_', ' ')}
                    </option>
                  ))}
                </SelectInput>
                <FieldError message={errors.assetStatus} />
              </div>

              <div className="space-y-2">
                <Label>Asset Condition</Label>
                <SelectInput name="assetCondition" value={formData.assetCondition} onChange={handleChange}>
                  {CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {c.replace('_', ' ')}
                    </option>
                  ))}
                </SelectInput>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            icon={FileText}
            color="bg-teal-50 text-teal-600"
            title="Additional Information"
            description="Network details, purchase information, and notes"
          >
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label icon={Network}>IP Address</Label>
                <TextInput
                  name="ipAddress"
                  placeholder="192.168.1.100"
                  value={formData.ipAddress}
                  onChange={handleChange}
                />
              </div>

              <div className="space-y-2">
                <Label icon={Cpu}>MAC Address</Label>
                <TextInput
                  name="macAddress"
                  placeholder="00:1A:2B:3C:4D:5E"
                  value={formData.macAddress}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Operating System</Label>
              <TextInput
                name="operatingSystem"
                placeholder="e.g., Windows 11 Pro, Ubuntu 22.04"
                value={formData.operatingSystem}
                onChange={handleChange}
              />
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label icon={DollarSign}>Purchase Price</Label>
                <TextInput
                  name="purchasePrice"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.purchasePrice}
                  onChange={handleChange}
                  error={errors.purchasePrice}
                />
                <FieldError message={errors.purchasePrice} />
              </div>

              <div className="space-y-2">
                <Label icon={CalendarIcon}>Purchase Date</Label>
                <TextInput
                  name="purchaseDate"
                  type="date"
                  value={formData.purchaseDate}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label icon={CalendarIcon}>Warranty Expiry</Label>
              <TextInput
                name="warrantyExpiry"
                type="date"
                value={formData.warrantyExpiry}
                onChange={handleChange}
              />
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <textarea
                name="notes"
                placeholder="Any additional notes..."
                value={formData.notes}
                onChange={handleChange}
                rows={4}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </SectionCard>
        </div>

        {/* Right column - preview + actions */}
        <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="mb-4 text-base font-semibold text-slate-900">Asset Preview</h3>

            <div className="mb-4 flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                {assetTypeIcon(formData.assetType)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{formData.modelName || 'New Asset'}</p>
                <p className="truncate text-xs text-slate-500">{formData.assetTag || 'No asset tag yet'}</p>
              </div>
            </div>

            <div className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-slate-500">
                  <Building2 className="h-3.5 w-3.5" /> Department
                </span>
                <span className="font-medium text-slate-700">{formData.department || '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-slate-500">
                  <MapPin className="h-3.5 w-3.5" /> Location
                </span>
                <span className="font-medium text-slate-700">{formData.location || '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-slate-500">
                  <User className="h-3.5 w-3.5" /> Assigned To
                </span>
                <span className="font-medium text-slate-700">{formData.assignedTo || 'Unassigned'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Status</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[formData.assetStatus] || 'bg-slate-100 text-slate-600'}`}>
                  {formData.assetStatus.replace('_', ' ')}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="mb-4 text-base font-semibold text-slate-900">Actions</h3>
            <div className="space-y-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating Asset...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Create Asset
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => router.back()}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                disabled={isSubmitting}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}