export const PREPARATION_STATUSES = ['Not Started', 'In Progress', 'Submitted'] as const;
export const CLIENT_STATUSES = ['Pending', 'Suspended', 'Cancelled', 'Re-Opened', 'Awarded'] as const;
export const AWARD_OUTCOMES = ['Pending Decision', 'Yes', 'No'] as const;

export type PreparationStatus = (typeof PREPARATION_STATUSES)[number];
export type ClientStatus = (typeof CLIENT_STATUSES)[number];
export type AwardOutcome = (typeof AWARD_OUTCOMES)[number];

export const PREPARATION_COLORS: Record<PreparationStatus, string> = {
  'Not Started': '#94a3b8',
  'In Progress': '#2563eb',
  Submitted: '#16a34a',
};

export const CLIENT_COLORS: Record<ClientStatus, string> = {
  Pending: '#94a3b8',
  Suspended: '#f59e0b',
  Cancelled: '#ef4444',
  'Re-Opened': '#a855f7',
  Awarded: '#16a34a',
};

const WAT = 'Africa/Lagos';

export const parseDeadline = (value: string) => {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const parsed = new Date(`${text}T00:00:00+01:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const calendarDateInWat = (instant: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: WAT, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);

/** SQL DATE values arrive as UTC-midnight Date objects. Keep the calendar day instead of Date.toString(), which drops the year. */
export const dateOnly = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const match = String(value ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
};

/** Internal deadline is exactly 24 elapsed hours before the external deadline. Weekends do not change the interval. */
export const internalDeadlineFromExternal = (external: string) => {
  const parsed = parseDeadline(external);
  if (!parsed) return '';
  return calendarDateInWat(new Date(parsed.getTime() - 24 * 60 * 60 * 1000));
};

export const hoursUntil = (external: string, now = new Date()) => {
  const parsed = parseDeadline(external);
  if (!parsed) return null;
  return (parsed.getTime() - now.getTime()) / (60 * 60 * 1000);
};

export const requiresUrgentAuthorization = (external: string, now = new Date()) => {
  const hours = hoursUntil(external, now);
  return hours != null && hours < 24;
};

export const REMINDER_HOURS = [72, 48, 24] as const;

export const dueReminderSlots = (deadline: string, now = new Date()) => {
  const parsed = parseDeadline(deadline);
  if (!parsed) return [] as number[];
  return REMINDER_HOURS.filter((hours) => {
    const slot = parsed.getTime() - hours * 60 * 60 * 1000;
    return now.getTime() >= slot && now.getTime() < parsed.getTime();
  });
};

export const reminderKey = (opportunityId: string, clock: 'internal' | 'external', hours: number) =>
  `${opportunityId}|${clock}|${hours}`;

type StatusSource = {
  status?: string;
  stage?: string;
  ownerName?: string;
  preparationStatus?: string;
  clientStatus?: string;
  awardedToDle?: string;
  opportunityType?: string;
  tenderType?: string;
};

const textOf = (row: StatusSource) => `${row.stage || ''} ${row.status || ''}`.toLowerCase();

/** Live register status wins. A stored "Not Started" stamp must not hide a tender that has left draft. */
export const preparationOf = (row: StatusSource): PreparationStatus => {
  const text = textOf(row);
  if (/submit/.test(text)) return 'Submitted';
  if (row.status === 'Draft') return 'Not Started';
  if (isEnquiryRecord(row) && !String(row.ownerName || '').trim()) return 'Not Started';
  if (String(row.status || '').trim()) return 'In Progress';
  const explicit = String(row.preparationStatus || '');
  if ((PREPARATION_STATUSES as readonly string[]).includes(explicit)) return explicit as PreparationStatus;
  if (!String(row.ownerName || '').trim() && /enquir|draft|open/.test(text)) return 'Not Started';
  return 'In Progress';
};

export const clientStatusOf = (row: StatusSource): ClientStatus => {
  const explicit = String(row.clientStatus || '');
  if ((CLIENT_STATUSES as readonly string[]).includes(explicit)) return explicit as ClientStatus;
  const text = textOf(row);
  if (/award/.test(text)) return 'Awarded';
  if (/suspend/.test(text)) return 'Suspended';
  if (/cancel/.test(text)) return 'Cancelled';
  if (/re-?open/.test(text)) return 'Re-Opened';
  return 'Pending';
};

export const awardedToDleOf = (row: StatusSource): AwardOutcome => {
  const explicit = String(row.awardedToDle || '');
  if (explicit === 'Yes' || explicit === 'No' || explicit === 'Pending Decision') return explicit;
  return 'Pending Decision';
};

export const isEnquiryRecord = (row: { opportunityType?: string; tenderType?: string; stage?: string }) =>
  row.opportunityType === 'Enquiry' || row.tenderType === 'Enquiry' || row.stage === 'Enquiry';

export const DEPARTMENT_REVIEW_STAGES = [
  'Engineering Review',
  'Commercial Review',
  'Finance Review',
  'Legal Review',
  'HSE Review',
  'Management Approval',
] as const;

export const COMMERCIAL_KINDS = ['ITT', 'RFQ', 'EOI'] as const;
export const COMMERCIAL_REVIEWS = ['Awaiting Review', 'Returned for Correction', 'Reviewed'] as const;
export const REGISTER_STATUSES = ['Not Started', 'In Progress', 'Submitted', 'Awaiting GM Review', 'Awaiting MD Decision', 'Closed', 'Historical'] as const;
export const PROPOSAL_REGISTER_SOURCE = 'Proposal Register 2026';

/** Past proposal-register rows kept for records and trends. They are not live approval work. */
export const isHistoricalRegister = (row: { source?: string; stage?: string; status?: string }) =>
  row.source === PROPOSAL_REGISTER_SOURCE || row.stage === 'Historical Register' || row.status === 'Historical';

export type CommercialKind = (typeof COMMERCIAL_KINDS)[number];
export type CommercialReview = (typeof COMMERCIAL_REVIEWS)[number];
export type RegisterStatus = (typeof REGISTER_STATUSES)[number];
export type MdDecision = 'Pending' | 'BID' | 'NO BID';

export type CommercialTab =
  | 'All Opportunities'
  | 'ITT'
  | 'RFQ'
  | 'EOI'
  | 'Awaiting GM Review'
  | 'Awaiting MD Decision'
  | 'Not Started'
  | 'In Progress'
  | 'Submitted'
  | 'Overdue'
  | 'Closed';

const asText = (value: unknown) => String(value || '');

export const commercialKindOf = (row: { commercialKind?: string; opportunityType?: string; tenderType?: string; contractType?: string; stage?: string; source?: string }): CommercialKind => {
  const explicit = asText(row.commercialKind).toUpperCase();
  if (explicit === 'ITT' || explicit === 'RFQ' || explicit === 'EOI') return explicit;
  const text = `${row.opportunityType || ''} ${row.tenderType || ''} ${row.contractType || ''} ${row.stage || ''} ${row.source || ''}`.toLowerCase();
  if (/request for quotation|\brfq\b|quotation/.test(text)) return 'RFQ';
  if (/expression of interest|\beoi\b/.test(text)) return 'EOI';
  if (/invitation to tender|\bitt\b|invit/.test(text)) return 'ITT';
  if (isEnquiryRecord(row)) return 'EOI';
  return 'ITT';
};

export const commercialReviewOf = (row: {
  commercialReview?: string;
  bidDecision?: string;
  status?: string;
  stage?: string;
  opportunityType?: string;
  tenderType?: string;
}): CommercialReview => {
  const explicit = asText(row.commercialReview);
  if ((COMMERCIAL_REVIEWS as readonly string[]).includes(explicit)) return explicit as CommercialReview;
  if (bidChoiceOf(row)) return 'Reviewed';
  const text = `${row.status || ''} ${row.stage || ''}`.toLowerCase();
  if (/bid preparation|submitted|awarded|no-?bid|negotiation/.test(text)) return 'Reviewed';
  if (!isEnquiryRecord(row) && asText(row.status) && row.status !== 'Draft') return 'Reviewed';
  return 'Awaiting Review';
};

export const mdDecisionOf = (row: { bidDecision?: string }): MdDecision => {
  const choice = bidChoiceOf(row);
  if (choice === 'Bid') return 'BID';
  if (choice === 'No Bid') return 'NO BID';
  return 'Pending';
};

/** The register shows the current operational state. The underlying review, decision and preparation fields stay separate. */
export const registerStatusOf = (row: StatusSource & {
  commercialReview?: string;
  bidDecision?: string;
  gmBidDecision?: string;
  commercialKind?: string;
  contractType?: string;
  source?: string;
  acknowledgedAt?: string;
}): RegisterStatus => {
  if (isHistoricalRegister(row)) return 'Historical';
  const decision = bidChoiceOf(row);
  const text = textOf(row);
  if (decision === 'No Bid' || row.status === 'Closed' || row.status === 'Lost' || row.status === 'Cancelled' || row.status === 'Withdrawn' || row.status === 'No-Bid' || clientStatusOf(row) === 'Cancelled') return 'Closed';
  if (preparationOf(row) === 'Submitted' || /submit/.test(text)) return 'Submitted';
  if (decision === 'Bid') {
    if (row.preparationStatus === 'Submitted') return 'Submitted';
    if (row.acknowledgedAt || row.preparationStatus === 'In Progress') return 'In Progress';
    return 'Not Started';
  }
  if (awaitsManagingDirector(row)) return 'Awaiting MD Decision';
  const review = commercialReviewOf(row);
  if (row.status === 'Draft' && review !== 'Returned for Correction') return 'Not Started';
  return 'Awaiting GM Review';
};

export const overdueOpportunity = (row: {
  submissionDeadline?: string;
  closingDate?: string;
  clarificationDeadline?: string;
  opportunityType?: string;
  tenderType?: string;
  stage?: string;
  status?: string;
  deadlineOverrideReason?: string;
  commercialReview?: string;
  bidDecision?: string;
  preparationStatus?: string;
  clientStatus?: string;
  acknowledgedAt?: string;
  ownerName?: string;
  source?: string;
}, now = new Date()) => {
  const status = registerStatusOf(row);
  if (status === 'Closed' || status === 'Submitted' || status === 'Historical') return false;
  const clocks = [internalDeadlineOf(row), externalDeadlineOf(row)];
  return clocks.some((value) => {
    const parsed = parseDeadline(value);
    return Boolean(parsed) && parsed!.getTime() < now.getTime();
  });
};

export const matchesCommercialTab = (row: Parameters<typeof overdueOpportunity>[0], tab: CommercialTab, now = new Date()) => {
  if (tab === 'All Opportunities') return true;
  if (tab === 'ITT' || tab === 'RFQ' || tab === 'EOI') return commercialKindOf(row) === tab;
  if (tab === 'Overdue') return overdueOpportunity(row, now);
  return registerStatusOf(row) === tab;
};

/** MD-approved work that is still being prepared. NO BID, GM review and MD decision queues are excluded. */
export const isActiveResponse = (row: Parameters<typeof registerStatusOf>[0]) => {
  if (bidChoiceOf(row) !== 'Bid') return false;
  const status = registerStatusOf(row);
  return status === 'Not Started' || status === 'In Progress';
};

/** Preparation statistics cover BID approvals only, including those already submitted. */
export const isPreparationRecord = (row: Parameters<typeof registerStatusOf>[0]) => {
  if (bidChoiceOf(row) !== 'Bid') return false;
  const status = registerStatusOf(row);
  return status === 'Not Started' || status === 'In Progress' || status === 'Submitted';
};

export const documentChecklistFor = (kind: CommercialKind) => {
  if (kind === 'EOI') return ['Company profile', 'Relevant project experience', 'Key personnel', 'Compliance declarations'];
  if (kind === 'RFQ') return ['Client quotation forms', 'Technical compliance statement', 'Delivery schedule', 'Supporting certificates'];
  return ['Invitation documents', 'Technical proposal', 'Commercial proposal', 'HSE documents', 'Legal documents', 'Form of tender'];
};

/** The MD gives final approval only after GM Commercial has approved a BID on an ITT or RFQ. */
export const mdDecisionPermitted = (row: {
  commercialReview?: string;
  bidDecision?: string;
  gmBidDecision?: string;
  commercialKind?: string;
  status?: string;
  stage?: string;
  opportunityType?: string;
  tenderType?: string;
  contractType?: string;
  source?: string;
}, _exceptionReason = '') => {
  if (awaitsManagingDirector(row)) return { ok: true, exception: false as const };
  return { ok: false, exception: false as const };
};

export type BidChoice = 'Bid' | 'No Bid';

export const bidChoiceOf = (row: { bidDecision?: string }): BidChoice | '' => {
  const text = String(row.bidDecision || '').trim().toLowerCase();
  if (text === 'bid' || text === 'go') return 'Bid';
  if (/no\s*-?\s*bid/.test(text)) return 'No Bid';
  return '';
};

export const gmBidChoiceOf = (row: { gmBidDecision?: string }): BidChoice | '' => {
  const text = String(row.gmBidDecision || '').trim().toLowerCase();
  if (text === 'bid' || text === 'go') return 'Bid';
  if (/no\s*-?\s*bid/.test(text)) return 'No Bid';
  return '';
};

/** ITT and RFQ marked BID by GM Commercial wait for the MD. EOI and NO BID stop with GM Commercial. */
export const awaitsManagingDirector = (row: {
  gmBidDecision?: string;
  bidDecision?: string;
  commercialKind?: string;
  opportunityType?: string;
  tenderType?: string;
  contractType?: string;
  stage?: string;
  source?: string;
}) => {
  if (bidChoiceOf(row)) return false;
  if (commercialKindOf(row) === 'EOI') return false;
  return gmBidChoiceOf(row) === 'Bid';
};

export type CommercialCopyPerson = {
  fullName?: string;
  jobTitle?: string;
  designation?: string;
  department?: string;
  officialEmail?: string;
  email?: string;
};

/** People copied on every completed commercial outcome: Proposal, Sales, MD, GM Operations, CFO, and the two named recipients. */
export const isCommercialOutcomeRecipient = (person: CommercialCopyPerson) => {
  const title = `${person.jobTitle || ''} ${person.designation || ''}`.toLowerCase();
  const department = `${person.department || ''}`.toLowerCase();
  const name = `${person.fullName || ''}`.toLowerCase();
  const email = `${person.officialEmail || ''} ${person.email || ''}`.toLowerCase();
  if (email.includes('tap@dormanlongeng.com')) return true;
  if (/oluwatamilayo/.test(name) && /austen/.test(name)) return true;
  if (/\btimi\b/.test(name) && /austen/.test(name)) return true;
  if (/\bproposal\b/.test(title) || /\bproposal\b/.test(department)) return true;
  if (/\bsales\b/.test(title) || /\bsales\b/.test(department)) return true;
  if (/managing director/.test(title) || /^(md|md\/ceo)$/.test(title.trim())) return true;
  if (/gm operations|general manager[, ]+operations/.test(title)) return true;
  if (/\bcfo\b|chief financial officer/.test(title)) return true;
  return false;
};

export type ApprovalBucket = 'pending' | 'review' | 'completed' | 'enquiry' | 'gm';

/** GM is waiting for assignment and the first approval. Pending is MD final approval. Review is a confirmed bid. */
export const tenderApprovalBucket = (row: {
  bidDecision?: string;
  gmBidDecision?: string;
  commercialKind?: string;
  commercialReview?: string;
  status?: string;
  stage?: string;
  preparationStatus?: string;
  opportunityType?: string;
  tenderType?: string;
  contractType?: string;
  source?: string;
}): ApprovalBucket => {
  if (isHistoricalRegister(row)) return 'enquiry';
  const choice = bidChoiceOf(row);
  const text = `${row.status || ''} ${row.stage || ''} ${row.preparationStatus || ''}`.toLowerCase();
  if (choice === 'No Bid') return 'completed';
  if (choice === 'Bid' && /submitted|awarded|closed/.test(text)) return 'completed';
  if (choice === 'Bid') return 'review';
  if (/closed|lost|cancelled|withdrawn|no-?bid/.test(String(row.status || ''))) return 'completed';
  if (awaitsManagingDirector(row)) return 'pending';
  const review = commercialReviewOf(row);
  if (!row.status || (row.status === 'Draft' && review !== 'Returned for Correction')) return 'enquiry';
  if (isEnquiryRecord(row) && review !== 'Reviewed' && review !== 'Returned for Correction' && review !== 'Awaiting Review') return 'enquiry';
  return 'gm';
};

export const departmentalReviewAllowed = (row: { bidDecision?: string; ownerName?: string }) =>
  bidChoiceOf(row) === 'Bid' && Boolean(String(row.ownerName || '').trim());

export const stageMatchesActor = (stage: string, department = '', roles: string[] = []) => {
  const text = `${department} ${roles.join(' ')}`.toLowerCase();
  const name = stage.toLowerCase();
  if (name.startsWith('engineering')) return /engineer/.test(text);
  if (name.startsWith('commercial')) return /commercial|proposal|sales/.test(text);
  if (name.startsWith('finance')) return /finance|\bcfo\b|account/.test(text);
  if (name.startsWith('legal')) return /legal/.test(text);
  if (name.startsWith('hse')) return /hse|health|safety/.test(text);
  if (name.startsWith('management')) return /managing director|\bmd\b|gm commercial|gm operations|super administrator/.test(text);
  return false;
};

export const externalDeadlineOf = (row: { submissionDeadline?: string; closingDate?: string; opportunityType?: string; tenderType?: string; stage?: string }) =>
  row.submissionDeadline || (isEnquiryRecord(row) ? row.closingDate || '' : '');

const dayDistance = (left: string, right: string) => {
  const from = Date.parse(`${left.slice(0, 10)}T00:00:00Z`);
  const to = Date.parse(`${right.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.abs(to - from) / 86400000;
};

/** A stored internal date more than two months from the external deadline, with no override reason, is not a real deadline. */
export const internalDeadlineOf = (row: {
  submissionDeadline?: string;
  closingDate?: string;
  clarificationDeadline?: string;
  opportunityType?: string;
  tenderType?: string;
  stage?: string;
  deadlineOverrideReason?: string;
}) => {
  if (isEnquiryRecord(row)) return row.clarificationDeadline || '';
  const external = row.submissionDeadline || '';
  if (!external) return '';
  const stored = (row.closingDate || '').slice(0, 10);
  const derived = internalDeadlineFromExternal(external);
  if (!stored) return derived;
  if (stored === derived || String(row.deadlineOverrideReason || '').trim()) return stored;
  const gap = dayDistance(stored, external);
  if (gap == null || gap > 60) return derived;
  return stored;
};

export type EnquiryConversion = {
  title: string;
  clientName: string;
  source: string;
  description?: string;
  category?: string;
  priority?: string;
  referenceNo?: string;
  enquiryRef?: string;
  submissionDeadline?: string;
  closingDate?: string;
  clarificationDeadline?: string;
  ownerName?: string;
  opportunityType?: string;
  tenderType?: string;
  stage?: string;
};

/** A converted tender waits for the MD. The enquiry officer is not copied across. */
export const tenderDraftFromEnquiry = (enquiry: EnquiryConversion, now = new Date()) => {
  const external = externalDeadlineOf(enquiry);
  const urgent = Boolean(external) && requiresUrgentAuthorization(external, now);
  return {
    title: enquiry.title,
    clientName: enquiry.clientName,
    source: enquiry.source || 'Client Direct',
    description: enquiry.description || '',
    category: enquiry.category || '',
    priority: enquiry.priority || 'Medium',
    enquiryRef: enquiry.enquiryRef || enquiry.referenceNo || '',
    opportunityType: 'Client Tender',
    tenderType: 'Client Bid',
    stage: 'Tender/Bid',
    status: 'Draft',
    ownerName: '',
    submissionDeadline: external,
    closingDate: external ? internalDeadlineFromExternal(external) : '',
    clarificationDeadline: '',
    preparationStatus: 'Not Started' as PreparationStatus,
    clientStatus: 'Pending' as ClientStatus,
    awardedToDle: 'Pending Decision' as AwardOutcome,
    urgent,
    saveMode: 'draft' as const,
  };
};

export const congratulationBody = (projectTitle: string, clientName: string) =>
  [
    'CONGRATULATIONS, TEAM DORMAN LONG ENGINEERING!',
    '',
    `We are delighted to announce that Dorman Long Engineering Limited has successfully secured the contract for ${projectTitle}, awarded by ${clientName}.`,
    '',
    'This achievement reflects the dedication, professionalism, teamwork and commitment of everyone involved.',
    '',
    'Congratulations to the Tender Team and the entire DLE family!',
  ].join('\n');
