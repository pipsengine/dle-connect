export const RELEASE_FORM = {
  docNo: 'DLPC/SMD/F-01',
  revision: '03',
  issueDate: '01/03/2024',
} as const;

export const JOB_TYPES = {
  galvanizing: 'Galvanizing',
  painting: 'Painting',
  duplex: 'Galvanizing & painting',
  others: 'Others',
} as const;

export const ADDITIONAL_WORK = {
  blasting: 'Blasting',
  'spatter-removal': 'Spatter removal',
  'mechanical-cleaning': 'Mechanical cleaning',
  'tpi-inspection': 'TPI inspection',
  'other-cleaning': 'Other cleaning',
} as const;

export const PACKAGING = {
  loose: 'Loose',
  bundled: 'Bundled',
  palletized: 'Palletized',
  container: 'Container',
} as const;

export const SIGN_OFFS = [
  { role: 'issued', label: 'Issued By', designations: ['Sales Officer', 'Marketing Officer'], purpose: 'Issues the job release order to the plant.' },
  { role: 'received', label: 'Received By', designations: ['Production Supervisor', 'Galvanizing Supervisor'], purpose: 'Confirms the plant has received the release.' },
  { role: 'reviewed', label: 'Reviewed By', designations: ['Quality Manager', 'Production Manager'], purpose: 'Reviews the release before it is approved.' },
  { role: 'approved', label: 'Approved By', designations: ['General Manager'], purpose: 'Approves the job release order.' },
] as const;

export type JobType = keyof typeof JOB_TYPES;
export type AdditionalWork = keyof typeof ADDITIONAL_WORK;
export type Packaging = keyof typeof PACKAGING;
export type ReleaseSignRole = (typeof SIGN_OFFS)[number]['role'];
export type ReleaseStage = 'draft' | 'issued' | 'received' | 'reviewed' | 'approved';

export type ReleaseSignOff = { name: string; designation: string; date: string };

export type GalvanizingRelease = {
  id: number;
  releaseOrderNo: string;
  formNo: string;
  dated: string;
  batch: string;
  jobType: string;
  jobTypeOther: string;
  clientName: string;
  clientPoNo: string;
  scheduledDelivery: string;
  pfiNo: string;
  pfiDate: string;
  materialReceiptDate: string;
  blackWeight: number | null;
  weighbridgeTicketNo: string;
  additionalWork: string[];
  additionalWorkOther: string;
  itemsList: string;
  packaging: string[];
  packagingOther: string;
  remarks: string;
  variationReason: string;
  jobNo: string;
  jobDate: string;
  qcReportNo: string;
  qcReportDate: string;
  hdgRate: string;
  otherCharges: string;
  dispatchDate: string;
  ticketNo: string;
  galvanizedWeight: number | null;
  waybillNo: string;
  waybillDate: string;
  paymentReceiptNo: string;
  paymentReceiptDate: string;
  jobId: number;
  receiptId: number;
  materialRegisterId: number;
  signOffs: Record<ReleaseSignRole, ReleaseSignOff | null>;
  createdAt: string;
  updatedAt: string;
};

export const RELEASE_STAGE: Record<ReleaseStage, { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'bg-slate-100 text-slate-700' },
  issued: { label: 'Issued', tone: 'bg-blue-50 text-blue-700' },
  received: { label: 'Received', tone: 'bg-amber-50 text-amber-800' },
  reviewed: { label: 'Reviewed', tone: 'bg-violet-50 text-violet-700' },
  approved: { label: 'Approved', tone: 'bg-emerald-50 text-emerald-700' },
};

const signed = (value: ReleaseSignOff | null | undefined) => Boolean(value?.name);

export const releaseStage = (release: { signOffs: GalvanizingRelease['signOffs'] }): ReleaseStage => {
  if (signed(release.signOffs.approved)) return 'approved';
  if (signed(release.signOffs.reviewed)) return 'reviewed';
  if (signed(release.signOffs.received)) return 'received';
  if (signed(release.signOffs.issued)) return 'issued';
  return 'draft';
};

export const nextSignOff = (release: { signOffs: GalvanizingRelease['signOffs'] }) =>
  SIGN_OFFS.find((item) => !signed(release.signOffs[item.role])) || null;

export const fmtDate = (value: string) => {
  if (!value) return '—';
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const formDate = (value: string) => {
  if (!value) return '';
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-GB');
};

export const kgText = (value: number | null) => (
  value == null ? '—' : `${value.toLocaleString('en-NG', { maximumFractionDigits: 1 })} kg`
);
