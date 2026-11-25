/** DL/Prop/F-03 Rev.02 BID / NO BID assessment indicators (capture scorecard). */

export type BidNoBidFieldType = 'text' | 'textarea' | 'date' | 'select' | 'number' | 'currency' | 'percent';

export type BidNoBidField = {
  id: string;
  label: string;
  type: BidNoBidFieldType;
  required?: boolean;
  options?: string[];
  hint?: string;
  /** Prefill from New Opportunity; locked on Step 2 when sourced from capture. */
  fromOpportunity?: boolean;
  restricted?: boolean;
};

export type BidNoBidIndicator = {
  number: number;
  title: string;
  section: number;
  fields: BidNoBidField[];
};

export const BID_NO_BID_SECTIONS = [
  'Opportunity Details',
  'Strategic Assessment',
  'Resources & Capacity',
  'Commercial & Contractual Risk',
] as const;

export const BID_NO_BID_INDICATORS: BidNoBidIndicator[] = [
  {
    number: 1,
    title: 'Proposal Title',
    section: 0,
    fields: [{ id: 'proposalTitle', label: 'Proposal / Project Title', type: 'text', required: true, fromOpportunity: true }],
  },
  {
    number: 2,
    title: 'Work Scope & Contract Value',
    section: 0,
    fields: [
      { id: 'workScope', label: 'Work Scope and Description', type: 'textarea', required: true, fromOpportunity: true },
      { id: 'contractValue', label: 'Expected Contract Value (Restricted)', type: 'currency', hint: 'Preserved for authorized reviewers; not shown on dashboards.', restricted: true },
      { id: 'tenderStage', label: 'Tender Stage', type: 'select', required: true, options: ['Prequalification', 'Technical', 'Commercial'] },
    ],
  },
  {
    number: 3,
    title: 'Client',
    section: 0,
    fields: [{ id: 'client', label: 'Client / Issuing Organisation', type: 'text', required: true, fromOpportunity: true }],
  },
  {
    number: 4,
    title: 'Submission Deadline',
    section: 0,
    fields: [
      { id: 'externalDeadline', label: 'External Submission Deadline', type: 'date', required: true, fromOpportunity: true },
      { id: 'internalDeadline', label: 'Internal Submission Deadline', type: 'date', required: true, hint: 'Defaults to 24 hours before the external deadline.', fromOpportunity: true },
    ],
  },
  {
    number: 5,
    title: 'Opportunity Classification',
    section: 0,
    fields: [
      { id: 'opportunityType', label: 'Opportunity Type', type: 'select', required: true, options: ['ITT', 'RFQ', 'EOI'], fromOpportunity: true },
      { id: 'clientReference', label: 'Client Reference', type: 'text', fromOpportunity: true },
      { id: 'sector', label: 'Sector', type: 'text', fromOpportunity: true },
    ],
  },
  {
    number: 6,
    title: 'Background, Experience & Reputation Risk',
    section: 1,
    fields: [
      { id: 'experience', label: 'Relevant Experience and Past Performance', type: 'textarea', required: true, hint: 'Cite similar work and related locations.' },
      { id: 'reputationRisk', label: 'Corporate Image / Performance Risk', type: 'textarea', required: true },
      { id: 'reputationLevel', label: 'Reputation Risk Level', type: 'select', options: ['Low', 'Medium', 'High', 'Critical'] },
    ],
  },
  {
    number: 7,
    title: 'Competitors & Win Probability',
    section: 1,
    fields: [
      { id: 'competitors', label: 'Competitors, Size and Prior Competition', type: 'textarea', required: true },
      { id: 'winProbability', label: 'Estimated Win Probability (%)', type: 'percent', required: true, hint: 'Assessment estimate, not a guaranteed probability.' },
    ],
  },
  {
    number: 8,
    title: 'Strategic Opportunity',
    section: 1,
    fields: [
      { id: 'strategic', label: 'Is this Opportunity Strategic?', type: 'select', required: true, options: ['Yes — directly strategic', 'Yes — leads to strategic opportunity', 'No', 'Uncertain'] },
      { id: 'strategicReason', label: 'Strategic Justification', type: 'textarea', required: true },
    ],
  },
  {
    number: 9,
    title: 'Capital Availability',
    section: 2,
    fields: [
      { id: 'capitalAvailability', label: 'Available Capital and Impact on Existing Commitments', type: 'textarea', required: true },
      { id: 'capitalRisk', label: 'Capital Commitment Risk', type: 'select', options: ['Low', 'Medium', 'High', 'Critical'] },
    ],
  },
  {
    number: 10,
    title: 'Current Workload & Resources',
    section: 2,
    fields: [{ id: 'workload', label: 'Current Workload and Labour / Space / Equipment Availability', type: 'textarea', required: true }],
  },
  {
    number: 11,
    title: 'New Equipment Investment',
    section: 2,
    fields: [
      { id: 'equipment', label: 'New Equipment or Facilities Required', type: 'textarea', required: true },
      { id: 'equipmentNeed', label: 'Additional Investment Required?', type: 'select', options: ['Yes', 'No', 'To be confirmed'] },
    ],
  },
  {
    number: 12,
    title: 'Labour & Community Conditions',
    section: 2,
    fields: [{ id: 'labour', label: 'Labour and Host Community Behaviour / Conditions', type: 'textarea', required: true }],
  },
  {
    number: 13,
    title: 'Proposal Department Workload',
    section: 2,
    fields: [{ id: 'proposalWorkload', label: 'Proposal Team Capacity Versus Preparation Time', type: 'textarea', required: true }],
  },
  {
    number: 14,
    title: 'Own Work vs Subcontractors',
    section: 3,
    fields: [{ id: 'ownVsSubcontract', label: 'Extent of DLE Work Versus Nominated Subcontractors and Suppliers', type: 'textarea', required: true }],
  },
  {
    number: 15,
    title: 'Subcontractor Assessment',
    section: 3,
    fields: [{ id: 'subcontractorAssessment', label: 'Technical, HSE, Quality, Cost and Delivery Assessment', type: 'textarea', required: true }],
  },
  {
    number: 16,
    title: 'Contract Terms & Conditions',
    section: 3,
    fields: [
      { id: 'contractTerms', label: 'Contract Period, Liquidated Damages, Retention, Defects, Bonds and Pricing Basis', type: 'textarea', required: true },
      { id: 'contractRisk', label: 'Contractual Risk Level', type: 'select', options: ['Low', 'Medium', 'High', 'Critical'] },
    ],
  },
  {
    number: 17,
    title: 'Market Conditions',
    section: 3,
    fields: [{ id: 'market', label: 'Market Conditions and Price Fluctuation Exposure', type: 'textarea', required: true }],
  },
  {
    number: 18,
    title: 'Cost to Reach Contract Award',
    section: 3,
    fields: [
      { id: 'awardCost', label: 'Expected Cost from Assessment to Contract Award (Restricted)', type: 'currency', hint: 'Restricted to authorized reviewers.', restricted: true },
      { id: 'awardCostBasis', label: 'Basis / Assumptions for Award Pursuit Costs', type: 'textarea' },
    ],
  },
];

export type BidNoBidAssessment = {
  values: Record<string, string>;
  completedAt?: string;
  completedBy?: string;
};

export const emptyBidNoBidValues = (): Record<string, string> => {
  const values: Record<string, string> = {};
  for (const indicator of BID_NO_BID_INDICATORS) {
    for (const field of indicator.fields) values[field.id] = '';
  }
  return values;
};

export const parseBidNoBidAssessment = (raw: unknown): BidNoBidAssessment | null => {
  if (!raw) return null;
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return null;
    try {
      parsed = JSON.parse(text);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const row = parsed as { values?: unknown; completedAt?: unknown; completedBy?: unknown };
  const values = row.values && typeof row.values === 'object' ? { ...emptyBidNoBidValues(), ...(row.values as Record<string, string>) } : null;
  if (!values) return null;
  return {
    values: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value ?? '')])),
    completedAt: row.completedAt ? String(row.completedAt) : undefined,
    completedBy: row.completedBy ? String(row.completedBy) : undefined,
  };
};

export const serializeBidNoBidAssessment = (assessment: BidNoBidAssessment | null | undefined) => {
  if (!assessment?.values) return null;
  return JSON.stringify({
    values: assessment.values,
    completedAt: assessment.completedAt || undefined,
    completedBy: assessment.completedBy || undefined,
  });
};

export type BidNoBidPrefillSource = {
  title?: string;
  description?: string;
  clientName?: string;
  submissionDeadline?: string;
  closingDate?: string;
  commercialKind?: string;
  opportunityType?: string;
  enquiryRef?: string;
  category?: string;
  estimatedValue?: number;
};

export const prefillBidNoBidValues = (
  source: BidNoBidPrefillSource,
  existing?: Record<string, string> | null,
  internalDefault?: string,
): Record<string, string> => {
  const values = { ...emptyBidNoBidValues(), ...(existing || {}) };
  const kind = String(source.commercialKind || source.opportunityType || '').toUpperCase();
  values.proposalTitle = String(source.title || values.proposalTitle || '').trim();
  values.workScope = String(source.description || values.workScope || '').trim();
  values.client = String(source.clientName || values.client || '').trim();
  values.externalDeadline = String(source.submissionDeadline || values.externalDeadline || '').slice(0, 10);
  values.internalDeadline = String(source.closingDate || values.internalDeadline || internalDefault || '').slice(0, 10);
  if (kind === 'ITT' || kind === 'RFQ' || kind === 'EOI') values.opportunityType = kind;
  values.clientReference = String(source.enquiryRef || values.clientReference || '').trim();
  values.sector = String(source.category || values.sector || '').trim();
  if (!values.contractValue && Number(source.estimatedValue) > 0) {
    values.contractValue = String(source.estimatedValue);
  }
  return values;
};

export const validateBidNoBidAssessment = (values: Record<string, string>, mode: 'draft' | 'submit' = 'submit') => {
  const errors: Record<string, string> = {};
  if (mode === 'draft') return errors;
  for (const indicator of BID_NO_BID_INDICATORS) {
    for (const field of indicator.fields) {
      if (field.required && !String(values[field.id] || '').trim()) {
        errors[field.id] = 'Required';
      }
    }
  }
  const probability = Number(values.winProbability);
  if (values.winProbability && (!Number.isFinite(probability) || probability < 0 || probability > 100)) {
    errors.winProbability = 'Must be 0–100';
  }
  if (values.internalDeadline && values.externalDeadline && values.internalDeadline >= values.externalDeadline) {
    errors.internalDeadline = 'Must precede the external deadline';
  }
  return errors;
};

export const bidNoBidAssessmentComplete = (assessment: BidNoBidAssessment | null | undefined) => {
  if (!assessment?.values) return false;
  return Object.keys(validateBidNoBidAssessment(assessment.values, 'submit')).length === 0;
};
