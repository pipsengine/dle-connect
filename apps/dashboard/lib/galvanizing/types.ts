export type GalvanizingCapabilities = {
  view: boolean;
  intake: boolean;
  qc: boolean;
  release: boolean;
  production: boolean;
  dispatch: boolean;
  inventory: boolean;
  scrap: boolean;
};

export type GalvanizingJob = {
  id: number;
  number: string;
  ownership: string;
  customerProject: string;
  customerCode: string;
  projectCode: string;
  reference: string;
  status: string;
  dueDate: string;
  title: string;
  priority: string;
  estimatedTonnes: number;
  coatingStandard: string;
  createdAt: string;
};

export type GalvanizingReceipt = {
  id: number;
  number: string;
  jobId: number;
  jobNumber: string;
  customerProject: string;
  ownership: string;
  document: string;
  vehicle: string;
  driverName: string;
  sourceType: string;
  missingWaybill: string;
  exceptionMemo: string;
  exceptionReason: string;
  exceptionApprovedBy: string;
  exceptionApprovedAt: string;
  gateInAt: string;
  grossKg: number;
  tareKg: number;
  tareRecorded: string;
  netKg: number;
  articleCount: number;
  status: string;
  location: string;
  qcInspector: string;
  qcSupervisor: string;
  qcDisposition: string;
  qcSeverity: string;
};

export type GalvanizingArticle = {
  id: number;
  receiptId: number;
  jobId: number;
  tag: string;
  description: string;
  quantity: number;
  acceptedQty: number | null;
  rejectedQty: number | null;
  holeCount: number | null;
  doubleDip: string;
  doubleDipCount: number | null;
  steelThicknessMm: number | null;
  coatingThicknessUm: number | null;
  weightKg: number;
  ownership: string;
  status: string;
  location: string;
};

export type GalvanizingBatch = {
  id: number;
  number: string;
  jobId: number;
  jobNumber: string;
  customerProject: string;
  ownership: string;
  weightKg: number;
  stage: string;
  status: string;
  kettle: string;
  shift: string;
  supervisor: string;
  articleCount: number;
  progress: number;
};

export type GalvanizingInspection = {
  id: number;
  number: string;
  batchId: number;
  batchNumber: string;
  jobNumber: string;
  kind: string;
  outcome: string;
  thicknessUm: number | null;
  steelThicknessMm: number | null;
  standard: string;
  inspector: string;
  remarks: string;
  at: string;
};

export type GalvanizingNcr = {
  id: number;
  number: string;
  batchId: number;
  batchNumber: string;
  jobNumber: string;
  ownership: string;
  defect: string;
  severity: string;
  disposition: string;
  status: string;
  approver: string;
  createdAt: string;
};

export type GalvanizingStock = {
  material: string;
  category: string;
  unit: string;
  stock: number;
  reorder: number;
  location: string;
  status: string;
};

export type GalvanizingMovement = {
  id: number;
  material: string;
  kind: string;
  quantity: number;
  reference: string;
  unitCost: number;
  actor: string;
  at: string;
};

export type GalvanizingDispatch = {
  id: number;
  number: string;
  jobId: number;
  batchId: number;
  jobNumber: string;
  batchNumber: string;
  customerProject: string;
  weightKg: number;
  waybill: string;
  vehicle: string;
  destination: string;
  status: string;
  commercialCleared: string;
  gateVerified: string;
  weightOk: string;
  podRef: string;
  weighbridgeRef: string;
};

import type { GalvanizingRelease } from '@/lib/galvanizing/release-meta';

export type { GalvanizingRelease };

export type GalvanizingAudit = {
  id: number;
  entity: string;
  entityId: number;
  action: string;
  actor: string;
  detail: string;
  at: string;
};

export type NoWaybillMemo = {
  deliveryNote: string;
  date: string;
  ticketNumber: string;
  vehicle: string;
  deliveryNumber: string;
  clientName: string;
  orderNumber: string;
  tripNo: string;
  destination: string;
  product: string;
  driverName: string;
  clientSignatoryName: string;
};

export type GalvanizingMaterial = {
  id: number;
  dateReceived: string;
  clientName: string;
  items: string;
  jobNo: string;
  weighMethod: 'weighbridge' | 'direct';
  vehicleNo: string;
  grossWeight: number | null;
  emptyWeight: number | null;
  directNetWeight: number | null;
  noWaybill: boolean;
  noWaybillMemo: NoWaybillMemo | null;
  createdAt: string;
  updatedAt: string;
};

export type GalvanizingSnapshot = {
  jobs: GalvanizingJob[];
  receipts: GalvanizingReceipt[];
  articles: GalvanizingArticle[];
  batches: GalvanizingBatch[];
  inspections: GalvanizingInspection[];
  ncrs: GalvanizingNcr[];
  inventory: GalvanizingStock[];
  movements: GalvanizingMovement[];
  dispatches: GalvanizingDispatch[];
  releases: GalvanizingRelease[];
  materials: GalvanizingMaterial[];
  audit: GalvanizingAudit[];
  dashboard: {
    jobs: number;
    activeBatches: number;
    wipTonnes: number;
    completedTonnes: number;
    pendingRelease: number;
    openNcr: number;
    gateHolds: number;
    materialCost: number;
  };
  capabilities: GalvanizingCapabilities;
};
