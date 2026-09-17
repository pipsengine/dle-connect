export const PROCUREMENT_CURRENCIES = ['NGN', 'USD', 'EUR', 'GBP'] as const;
export const PROCUREMENT_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const;
export const PROCUREMENT_REQUEST_TYPES = ['Goods', 'Services', 'Works', 'CAPEX'] as const;
export const PROCUREMENT_SITES = [
  { code: 'DLE', name: 'Dorman Long Engineering Limited' },
  { code: 'DLPC', name: 'Dorman Long Protective Coatings' },
] as const;
export const PROCUREMENT_UOMS = ['EA', 'PCS', 'SET', 'MT', 'KG', 'M', 'BOX', 'ROLL', 'LOT'] as const;
export const PROCUREMENT_METHODS = ['Competitive', 'Restricted', 'Single Source', 'Framework Call-off'] as const;
export const PROCUREMENT_RFX_TYPES = ['RFI', 'RFQ', 'RFP', 'Tender'] as const;
export const PROCUREMENT_EVALUATION_METHODS = [
  'Lowest Price',
  'Best Value (Weighted)',
  'Pass / Fail Technical then Lowest Price',
] as const;
export const PROCUREMENT_WORKFLOW_STATES = [
  'Draft',
  'Submitted',
  'Under Approval',
  'Returned',
  'Approved',
  'Rejected',
  'Processing',
  'Closed',
  'Cancelled',
] as const;

export type ProcFieldType = 'text' | 'textarea' | 'number' | 'select' | 'date' | 'datetime' | 'checkbox';

export type ProcFieldDef = {
  key: string;
  label: string;
  type?: ProcFieldType;
  options?: readonly string[];
  span?: 1 | 2;
  required?: boolean;
  column?: 'title' | 'status' | 'project' | 'costCentre' | 'ownerName' | 'currency' | 'amount' | 'dueDate' | 'priority' | 'reference';
};

export type ProcDomainDef = {
  id: string;
  title: string;
  description: string;
  prefix: string;
  resource: string;
  href: string;
  tabs: string[];
  kpis: string[];
  fields: ProcFieldDef[];
  hasLines?: boolean;
  statuses?: readonly string[];
};

const yesNo = ['Yes', 'No'] as const;

export const PROCUREMENT_DOMAINS: ProcDomainDef[] = [
  {
    id: 'plans',
    title: 'Procurement Planning',
    description: 'Annual, project and category plans that drive requisitions and sourcing.',
    prefix: 'PLN',
    resource: 'domain-plans',
    href: '/procurement/plans',
    tabs: ['All Plans', 'Draft', 'Submitted', 'Approved', 'In Execution', 'Closed'],
    kpis: ['All Plans', 'Draft', 'Submitted', 'Approved', 'In Execution', 'Closed'],
    fields: [
      { key: 'planType', label: 'Plan Type', type: 'select', options: ['Annual Plan', 'Project Plan', 'Category Plan', 'Emergency Plan'], required: true },
      { key: 'title', label: 'Plan Title', required: true, span: 2, column: 'title' },
      { key: 'financialYear', label: 'Financial Year', type: 'number' },
      { key: 'project', label: 'Project / Business Unit', column: 'project' },
      { key: 'category', label: 'Category' },
      { key: 'amount', label: 'Planned Value', type: 'number', column: 'amount' },
      { key: 'currency', label: 'Currency', type: 'select', options: PROCUREMENT_CURRENCIES, column: 'currency' },
      { key: 'requiredQuarter', label: 'Required Quarter', type: 'select', options: ['Q1', 'Q2', 'Q3', 'Q4'] },
      { key: 'procurementMethod', label: 'Procurement Method', type: 'select', options: PROCUREMENT_METHODS },
      { key: 'planningAssumptions', label: 'Planning Assumptions', type: 'textarea', span: 2 },
    ],
  },
  {
    id: 'tenders',
    title: 'E-Tendering',
    description: 'Controlled tender publication, bid security, opening and confidentiality.',
    prefix: 'TND',
    resource: 'domain-tenders',
    href: '/procurement/tenders',
    tabs: ['All Tenders', 'Draft', 'Published', 'Clarifications', 'Closed', 'Awarded'],
    kpis: ['All Tenders', 'Draft', 'Published', 'Clarifications', 'Closed', 'Awarded'],
    statuses: ['Draft', 'Published', 'Clarifications', 'Closed', 'Awarded', 'Cancelled'],
    fields: [
      { key: 'title', label: 'Tender Title', required: true, span: 2, column: 'title' },
      { key: 'tenderNumber', label: 'Tender Number' },
      { key: 'dueDate', label: 'Closing Date', type: 'datetime', column: 'dueDate' },
      { key: 'bidSecurity', label: 'Bid Security' },
      { key: 'openingCommittee', label: 'Opening Committee' },
      { key: 'confidentialityClassification', label: 'Confidentiality Classification', type: 'select', options: ['Public', 'Internal', 'Confidential', 'Restricted'] },
      { key: 'submissionRules', label: 'Submission Rules', type: 'textarea', span: 2 },
    ],
  },
  {
    id: 'expediting',
    title: 'Expediting & Logistics',
    description: 'Track supplier milestones, shipment risk and delivery forecasts against POs.',
    prefix: 'EXP',
    resource: 'domain-expediting',
    href: '/procurement/expediting',
    tabs: ['All Milestones', 'On Track', 'At Risk', 'Delayed', 'Shipped', 'Closed'],
    kpis: ['All Milestones', 'On Track', 'At Risk', 'Delayed', 'Shipped', 'Closed'],
    statuses: ['On Track', 'At Risk', 'Delayed', 'Shipped', 'Closed', 'Cancelled'],
    fields: [
      { key: 'title', label: 'Milestone Title', required: true, span: 2, column: 'title' },
      { key: 'poReference', label: 'PO Reference' },
      { key: 'supplierName', label: 'Supplier' },
      { key: 'milestone', label: 'Milestone' },
      { key: 'dueDate', label: 'Planned Date', type: 'date', column: 'dueDate' },
      { key: 'forecastDate', label: 'Forecast Date', type: 'date' },
      { key: 'progressPct', label: 'Progress %', type: 'number' },
      { key: 'priority', label: 'Risk Level', type: 'select', options: PROCUREMENT_PRIORITIES, column: 'priority' },
      { key: 'shipmentReference', label: 'Shipment Reference' },
      { key: 'expeditorNotes', label: 'Expeditor Notes', type: 'textarea', span: 2 },
    ],
  },
  {
    id: 'receiving',
    title: 'Receiving & Inspection',
    description: 'Goods receipt, inspection, rejection and NCR against purchase orders.',
    prefix: 'GRN',
    resource: 'domain-receiving',
    href: '/procurement/receiving',
    tabs: ['All Receipts', 'Pending Inspection', 'Passed', 'Failed', 'Partial', 'Closed'],
    kpis: ['All Receipts', 'Pending Inspection', 'Passed', 'Failed', 'Partial', 'Closed'],
    statuses: ['Draft', 'Pending Inspection', 'Passed', 'Failed', 'Partial', 'Closed'],
    fields: [
      { key: 'title', label: 'Receipt Title', required: true, span: 2, column: 'title' },
      { key: 'poReference', label: 'PO Reference' },
      { key: 'supplierName', label: 'Supplier' },
      { key: 'receiptType', label: 'Receipt Type', type: 'select', options: ['Full', 'Partial', 'Over-receipt'] },
      { key: 'warehouseSite', label: 'Warehouse / Site' },
      { key: 'inspectionRequired', label: 'Inspection Required', type: 'select', options: yesNo },
      { key: 'inspectionResult', label: 'Inspection Result', type: 'select', options: ['Pending', 'Passed', 'Failed', 'Conditional'] },
      { key: 'receivedQuantity', label: 'Received Quantity', type: 'number' },
      { key: 'rejectedQuantity', label: 'Rejected Quantity', type: 'number' },
      { key: 'ncrReference', label: 'NCR Reference' },
      { key: 'receiverComments', label: 'Receiver Comments', type: 'textarea', span: 2 },
    ],
  },
  {
    id: 'commercial',
    title: 'Commercial / Advanced Procurement',
    description: 'Customer RFQ to supplier cost, landed cost and expected margin.',
    prefix: 'COM',
    resource: 'domain-commercial',
    href: '/procurement/commercial',
    tabs: ['All Deals', 'Quoted', 'Won', 'In Fulfilment', 'Closed', 'Lost'],
    kpis: ['All Deals', 'Quoted', 'Won', 'In Fulfilment', 'Closed', 'Lost'],
    statuses: ['Draft', 'Quoted', 'Won', 'In Fulfilment', 'Closed', 'Lost'],
    hasLines: true,
    fields: [
      { key: 'title', label: 'Deal Title', required: true, span: 2, column: 'title' },
      { key: 'customer', label: 'Customer' },
      { key: 'customerRfq', label: 'Customer RFQ' },
      { key: 'quotationReference', label: 'Quotation Reference' },
      { key: 'clientPo', label: 'Client PO' },
      { key: 'amount', label: 'Sales Value', type: 'number', column: 'amount' },
      { key: 'supplierCost', label: 'Supplier Cost', type: 'number' },
      { key: 'freight', label: 'Freight & Logistics', type: 'number' },
      { key: 'customs', label: 'Customs & Clearing', type: 'number' },
      { key: 'inspection', label: 'Inspection / Certification', type: 'number' },
      { key: 'insurance', label: 'Insurance', type: 'number' },
      { key: 'bankCharges', label: 'Bank / LC Charges', type: 'number' },
      { key: 'fxImpact', label: 'FX Impact', type: 'number' },
      { key: 'otherDirectCost', label: 'Other Direct Cost', type: 'number' },
      { key: 'targetMarginPct', label: 'Target Margin %', type: 'number' },
      { key: 'currency', label: 'Currency', type: 'select', options: PROCUREMENT_CURRENCIES, column: 'currency' },
      { key: 'fulfilmentStrategy', label: 'Fulfilment Strategy', type: 'select', options: ['Direct Delivery', 'Stock', 'Drop-ship', 'Project Site'] },
    ],
  },
  {
    id: 'customer-orders',
    title: 'Customer Orders & Client POs',
    description: 'Client purchase orders that drive commercial fulfilment and back-to-back buying.',
    prefix: 'CPO',
    resource: 'domain-customer-orders',
    href: '/procurement/customer-orders',
    tabs: ['All Orders', 'Draft', 'Acknowledged', 'In Fulfilment', 'Delivered', 'Closed'],
    kpis: ['All Orders', 'Draft', 'Acknowledged', 'In Fulfilment', 'Delivered', 'Closed'],
    statuses: ['Draft', 'Acknowledged', 'In Fulfilment', 'Delivered', 'Closed', 'Cancelled'],
    hasLines: true,
    fields: [
      { key: 'title', label: 'Order Title', required: true, span: 2, column: 'title' },
      { key: 'customer', label: 'Customer' },
      { key: 'clientPoNumber', label: 'Client PO Number' },
      { key: 'clientPoDate', label: 'Client PO Date', type: 'date' },
      { key: 'amount', label: 'PO Value', type: 'number', column: 'amount' },
      { key: 'currency', label: 'Currency', type: 'select', options: PROCUREMENT_CURRENCIES, column: 'currency' },
      { key: 'paymentTerms', label: 'Payment Terms' },
      { key: 'deliveryTerms', label: 'Delivery Terms' },
      { key: 'dueDate', label: 'Required Delivery Date', type: 'date', column: 'dueDate' },
      { key: 'ownerName', label: 'Commercial Owner', column: 'ownerName' },
      { key: 'termsDeviations', label: 'Terms Deviations', type: 'textarea', span: 2 },
    ],
  },
  {
    id: 'delivery',
    title: 'Delivery & Fulfilment',
    description: 'Outbound delivery, tracking, POD and customer acceptance.',
    prefix: 'DLV',
    resource: 'domain-delivery',
    href: '/procurement/delivery',
    tabs: ['All Deliveries', 'Planned', 'In Transit', 'Delivered', 'Accepted', 'Exception'],
    kpis: ['All Deliveries', 'Planned', 'In Transit', 'Delivered', 'Accepted', 'Exception'],
    statuses: ['Planned', 'In Transit', 'Delivered', 'Accepted', 'Exception', 'Cancelled'],
    fields: [
      { key: 'title', label: 'Delivery Title', required: true, span: 2, column: 'title' },
      { key: 'customerOrder', label: 'Customer Order' },
      { key: 'customer', label: 'Customer' },
      { key: 'deliveryMode', label: 'Delivery Mode', type: 'select', options: ['Road', 'Sea', 'Air', 'Courier', 'Collection'] },
      { key: 'origin', label: 'Origin' },
      { key: 'project', label: 'Destination', column: 'project' },
      { key: 'carrier', label: 'Carrier' },
      { key: 'dueDate', label: 'Dispatch Date', type: 'date', column: 'dueDate' },
      { key: 'eta', label: 'ETA', type: 'date' },
      { key: 'trackingReference', label: 'Tracking Reference' },
      { key: 'podRequired', label: 'POD Required', type: 'select', options: yesNo },
      { key: 'acceptanceRequired', label: 'Acceptance Required', type: 'select', options: yesNo },
    ],
  },
  {
    id: 'costing',
    title: 'Procurement Finance & Costing',
    description: 'Landed cost, FX and margin reconstruction for commercial and PO transactions.',
    prefix: 'CST',
    resource: 'domain-costing',
    href: '/procurement/costing',
    tabs: ['All Costings', 'Draft', 'Reviewed', 'Posted', 'Variance', 'Closed'],
    kpis: ['All Costings', 'Draft', 'Reviewed', 'Posted', 'Variance', 'Closed'],
    statuses: ['Draft', 'Reviewed', 'Posted', 'Variance', 'Closed'],
    fields: [
      { key: 'title', label: 'Costing Title', required: true, span: 2, column: 'title' },
      { key: 'transactionReference', label: 'Transaction Reference' },
      { key: 'amount', label: 'Customer Value', type: 'number', column: 'amount' },
      { key: 'supplierCost', label: 'Supplier Cost', type: 'number' },
      { key: 'freight', label: 'Freight', type: 'number' },
      { key: 'customs', label: 'Customs', type: 'number' },
      { key: 'inspection', label: 'Inspection', type: 'number' },
      { key: 'insurance', label: 'Insurance', type: 'number' },
      { key: 'bankCharges', label: 'Bank Charges', type: 'number' },
      { key: 'fxImpact', label: 'FX Impact', type: 'number' },
      { key: 'otherDirectCost', label: 'Other Direct Cost', type: 'number' },
      { key: 'currency', label: 'Currency', type: 'select', options: PROCUREMENT_CURRENCIES, column: 'currency' },
      { key: 'budgetFxRate', label: 'Budget FX Rate', type: 'number' },
      { key: 'actualFxRate', label: 'Actual FX Rate', type: 'number' },
    ],
  },
  {
    id: 'approvals',
    title: 'Approvals & Work Queue',
    description: 'Cross-module approval actions, delegation and SLA escalation.',
    prefix: 'APQ',
    resource: 'domain-approvals',
    href: '/procurement/approvals',
    tabs: ['My Queue', 'PR', 'Sourcing', 'Award', 'PO / Contract', 'Waivers', 'Escalations'],
    kpis: ['My Queue', 'PR', 'Sourcing', 'Award', 'PO / Contract', 'Waivers'],
    statuses: ['Pending', 'Approved', 'Rejected', 'Returned', 'Delegated', 'Escalated'],
    fields: [
      { key: 'title', label: 'Queue Title', required: true, span: 2, column: 'title' },
      { key: 'transactionType', label: 'Transaction Type', type: 'select', options: ['PR', 'Sourcing', 'CBE', 'PO', 'Contract', 'Commercial', 'Waiver'] },
      { key: 'transactionReference', label: 'Transaction Reference' },
      { key: 'approvalLevel', label: 'Approval Level', type: 'number' },
      { key: 'ownerName', label: 'Approver Role', column: 'ownerName' },
      { key: 'status', label: 'Decision', type: 'select', options: ['Pending', 'Approved', 'Rejected', 'Returned', 'Delegated'], column: 'status' },
      { key: 'delegateTo', label: 'Delegate To' },
      { key: 'dueDate', label: 'Escalation Date', type: 'date', column: 'dueDate' },
      { key: 'comment', label: 'Comment', type: 'textarea', span: 2 },
    ],
  },
  {
    id: 'compliance',
    title: 'Compliance & Audit',
    description: 'Policy exceptions, findings, root cause and corrective actions.',
    prefix: 'CMP',
    resource: 'domain-compliance',
    href: '/procurement/compliance',
    tabs: ['All Exceptions', 'Open', 'In Progress', 'Overdue', 'Closed', 'Waived'],
    kpis: ['All Exceptions', 'Open', 'In Progress', 'Overdue', 'Closed', 'Waived'],
    statuses: ['Open', 'In Progress', 'Overdue', 'Closed', 'Waived'],
    fields: [
      { key: 'title', label: 'Finding Title', required: true, span: 2, column: 'title' },
      { key: 'exceptionType', label: 'Exception Type', type: 'select', options: ['Policy Breach', 'Missing Document', 'Single Source', 'Threshold Override', 'Conflict of Interest', 'Other'] },
      { key: 'transactionReference', label: 'Transaction Reference' },
      { key: 'priority', label: 'Severity', type: 'select', options: PROCUREMENT_PRIORITIES, column: 'priority' },
      { key: 'policyControl', label: 'Policy / Control' },
      { key: 'ownerName', label: 'Owner', column: 'ownerName' },
      { key: 'dueDate', label: 'Due Date', type: 'date', column: 'dueDate' },
      { key: 'finding', label: 'Finding', type: 'textarea', span: 2 },
      { key: 'rootCause', label: 'Root Cause', type: 'textarea', span: 2 },
      { key: 'correctiveAction', label: 'Corrective Action', type: 'textarea', span: 2 },
    ],
  },
  {
    id: 'documents',
    title: 'Documents & Correspondence',
    description: 'Controlled attachments, revisions and correspondence across the procurement file.',
    prefix: 'DOC',
    resource: 'domain-documents',
    href: '/procurement/documents',
    tabs: ['All Documents', 'Specifications', 'Quotations', 'Approvals', 'Contracts', 'Correspondence'],
    kpis: ['All Documents', 'Specifications', 'Quotations', 'Approvals', 'Contracts', 'Correspondence'],
    statuses: ['Draft', 'Current', 'Superseded', 'Expired'],
    fields: [
      { key: 'title', label: 'Document Title', required: true, span: 2, column: 'title' },
      { key: 'documentType', label: 'Document Type', type: 'select', options: ['Specification', 'Quotation', 'Approval', 'Correspondence', 'Certificate', 'Contract', 'Other'] },
      { key: 'transactionReference', label: 'Transaction Reference' },
      { key: 'classification', label: 'Classification', type: 'select', options: ['Public', 'Internal', 'Confidential', 'Restricted'] },
      { key: 'revision', label: 'Revision' },
      { key: 'dueDate', label: 'Effective Date', type: 'date', column: 'dueDate' },
      { key: 'expiryDate', label: 'Expiry Date', type: 'date' },
      { key: 'fileName', label: 'File name' },
      { key: 'description', label: 'Description', type: 'textarea', span: 2 },
    ],
  },
];

export const domainById = (id: string) => PROCUREMENT_DOMAINS.find((d) => d.id === id);

export const domainStatuses = (domain: ProcDomainDef) => domain.statuses || PROCUREMENT_WORKFLOW_STATES;

export type ProcLineItem = {
  id?: string;
  lineId?: string;
  itemCode?: string;
  description: string;
  specification?: string;
  quantity?: number;
  qty?: number;
  uom: string;
  unitPrice?: number;
  unitEstimate?: number;
  taxRate?: number;
  requiredDate?: string;
  deliveryLocation?: string;
};

export const lineAmount = (line: ProcLineItem) => {
  const qty = Number(line.quantity ?? line.qty ?? 0);
  const unit = Number(line.unitPrice ?? line.unitEstimate ?? 0);
  const tax = Number(line.taxRate ?? 0);
  return qty * unit * (1 + tax / 100);
};

export const linesTotal = (lines: ProcLineItem[]) => lines.reduce((sum, line) => sum + lineAmount(line), 0);
