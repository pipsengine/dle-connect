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
};

const textOf = (row: StatusSource) => `${row.stage || ''} ${row.status || ''}`.toLowerCase();

export const preparationOf = (row: StatusSource): PreparationStatus => {
  const explicit = String(row.preparationStatus || '');
  if ((PREPARATION_STATUSES as readonly string[]).includes(explicit)) return explicit as PreparationStatus;
  const text = textOf(row);
  if (/submit/.test(text)) return 'Submitted';
  if (row.status === 'Draft' || (!String(row.ownerName || '').trim() && /enquir|draft|open/.test(text))) return 'Not Started';
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

export type BidChoice = 'Bid' | 'No Bid';

export const bidChoiceOf = (row: { bidDecision?: string }): BidChoice | '' => {
  const text = String(row.bidDecision || '').trim().toLowerCase();
  if (text === 'bid' || text === 'go') return 'Bid';
  if (/no\s*-?\s*bid/.test(text)) return 'No Bid';
  return '';
};

export type ApprovalBucket = 'pending' | 'review' | 'completed' | 'enquiry';

/** Pending is waiting for the MD. Review is a confirmed bid. Completed is a no-bid or a finished bid. */
export const tenderApprovalBucket = (row: {
  bidDecision?: string;
  status?: string;
  stage?: string;
  preparationStatus?: string;
  opportunityType?: string;
  tenderType?: string;
}): ApprovalBucket => {
  if (isEnquiryRecord(row)) return 'enquiry';
  const choice = bidChoiceOf(row);
  const text = `${row.status || ''} ${row.stage || ''} ${row.preparationStatus || ''}`.toLowerCase();
  if (choice === 'No Bid') return 'completed';
  if (choice === 'Bid' && /submitted|awarded|closed/.test(text)) return 'completed';
  if (choice === 'Bid') return 'review';
  if (/closed/.test(String(row.status || ''))) return 'completed';
  return 'pending';
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

export const internalDeadlineOf = (row: { submissionDeadline?: string; closingDate?: string; clarificationDeadline?: string; opportunityType?: string; tenderType?: string; stage?: string }) =>
  isEnquiryRecord(row) ? (row.clarificationDeadline || '') : (row.submissionDeadline ? row.closingDate || '' : '');

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
