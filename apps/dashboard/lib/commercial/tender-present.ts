import type { TenderOpportunity } from '@/lib/commercial/tender-types';

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const NIGERIA = ['Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT', 'Abuja', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara'];

export const closedOut = (row: TenderOpportunity) => ['Lost', 'Cancelled', 'No-Bid', 'Withdrawn'].includes(row.status);

export const stageRank = (row: TenderOpportunity) => {
  const text = `${row.stage} ${row.status}`.toLowerCase();
  const enquiry = text.includes('enquiry') && !/bid|submit|award|negot|prequal/.test(text);
  if (text.includes('handover')) return 7;
  if (text.includes('award')) return 6;
  if (text.includes('negot')) return 5;
  if (text.includes('submit')) return 4;
  if (text.includes('review') && !enquiry) return 3;
  if (text.includes('bid') || (row.status === 'Open' && !enquiry)) return 2;
  if (text.includes('prequal') || text.includes('qualif') || text.includes('invit') || text.includes('short')) return 1;
  return 0;
};

export type EnquiryPill = 'New' | 'Under Review' | 'Qualified' | 'Under Qualification' | 'Converted to Tender' | 'Not Pursuing' | 'Archived';

export const enquiryPill = (row: TenderOpportunity): EnquiryPill => {
  if (row.status === 'Closed') return 'Archived';
  if (closedOut(row) || row.status === 'Lost') return 'Not Pursuing';
  const text = `${row.stage} ${row.status}`.toLowerCase();
  if (row.status === 'Awarded' || /award|submit|negot|bid/.test(text)) return 'Converted to Tender';
  if (text.includes('prequal')) return 'Under Qualification';
  if (text.includes('qualif') || text.includes('invit') || text.includes('short')) return 'Qualified';
  if (text.includes('review')) return 'Under Review';
  if (row.status === 'Open' && !text.includes('enquiry')) return 'Converted to Tender';
  return 'New';
};

export const enquiryTabMatch = (row: TenderOpportunity, tab: string) => {
  const pill = enquiryPill(row);
  if (tab === 'Archived') return pill === 'Archived';
  if (pill === 'Archived') return false;
  if (tab === 'All Enquiries') return true;
  if (tab === 'New Enquiries') return pill === 'New';
  if (tab === 'Under Qualification') return pill === 'Under Qualification' || pill === 'Qualified';
  if (tab === 'Converted to Tender') return pill === 'Converted to Tender';
  if (tab === 'Not Pursuing') return pill === 'Not Pursuing';
  return true;
};

export type OpportunityStage =
  | 'Enquiry'
  | 'Qualified'
  | 'Prequalification'
  | 'Tender/Bid'
  | 'Submission'
  | 'Negotiation'
  | 'Shortlisted'
  | 'Awarded'
  | 'Bid/No-Bid';

export const opportunityStage = (row: TenderOpportunity): OpportunityStage => {
  const text = `${row.stage} ${row.status} ${row.bidDecision}`.toLowerCase();
  if (text.includes('award')) return 'Awarded';
  if (text.includes('negot')) return 'Negotiation';
  if (text.includes('short')) return 'Shortlisted';
  if (text.includes('prequal')) return 'Prequalification';
  if (text.includes('submit')) return 'Submission';
  if (/no-?bid|decline/.test(text)) return 'Bid/No-Bid';
  if (text.includes('bid') || text.includes('tender') || row.status === 'Open') return 'Tender/Bid';
  if (text.includes('qualif') || text.includes('invit')) return 'Qualified';
  return 'Enquiry';
};

const PROBABILITY: Record<OpportunityStage, number> = {
  Enquiry: 40,
  Qualified: 50,
  Prequalification: 30,
  'Tender/Bid': 70,
  Submission: 60,
  Negotiation: 55,
  Shortlisted: 55,
  Awarded: 100,
  'Bid/No-Bid': 35,
};

export const winProbability = (row: TenderOpportunity) => PROBABILITY[opportunityStage(row)];

export const expectedValue = (row: TenderOpportunity) => Math.round((row.estimatedValue * winProbability(row)) / 100);

export const opportunityTabMatch = (row: TenderOpportunity, tab: string) => {
  const stage = opportunityStage(row);
  if (tab === 'Archived') return row.status === 'Closed';
  if (row.status === 'Closed') return false;
  if (tab === 'All Opportunities') return true;
  if (tab === 'Invitations to Tender') return /invit/i.test(`${row.stage} ${row.source} ${row.opportunityType}`);
  if (tab === 'Prequalification') return stage === 'Prequalification';
  if (tab === 'Bid/No-Bid Decision') return stage === 'Bid/No-Bid' || stage === 'Tender/Bid' || Boolean(row.bidDecision);
  if (tab === 'Shortlisted') return stage === 'Shortlisted' || stage === 'Qualified';
  if (tab === 'Lost / Withdrawn') return closedOut(row);
  return true;
};

export const SOURCE_BUCKETS = ['Email', 'Tender Portal', 'Client Meeting', 'Website', 'Referral', 'Others'] as const;

export const sourceBucket = (source: string) => {
  const text = source.toLowerCase();
  if (text.includes('email')) return 'Email';
  if (text.includes('portal') || text.includes('public') || text.includes('invit')) return 'Tender Portal';
  if (text.includes('meeting') || text.includes('direct') || text.includes('client')) return 'Client Meeting';
  if (text.includes('web')) return 'Website';
  if (text.includes('refer')) return 'Referral';
  return 'Others';
};

export const SECTORS = ['Oil & Gas', 'Infrastructure', 'Fabrication', 'Energy', 'Maintenance', 'IT Services'] as const;

export const sectorOf = (row: TenderOpportunity) => {
  const text = `${row.category} ${row.subCategory} ${row.tenderType} ${row.title}`.toLowerCase();
  if (/oil|gas|lng|petroleum|upstream/.test(text)) return 'Oil & Gas';
  if (/fabricat/.test(text)) return 'Fabrication';
  if (/energy|power/.test(text)) return 'Energy';
  if (/maintain/.test(text)) return 'Maintenance';
  if (/it |software|digital/.test(text)) return 'IT Services';
  if (/infra|civil|road|construct|bridge/.test(text)) return 'Infrastructure';
  return SECTORS.find((label) => text.includes(label.toLowerCase())) || 'Infrastructure';
};

export const countryOf = (row: TenderOpportunity) => {
  const text = `${row.location} ${row.site} ${row.projectLocation} ${row.clientAddress}`;
  if (/nigeria/i.test(text) || NIGERIA.some((state) => new RegExp(`\\b${state}\\b`, 'i').test(text))) return 'Nigeria';
  const place = row.projectLocation || row.location;
  return place || 'Unspecified';
};

export const receivedOn = (row: TenderOpportunity) => row.invitationDate || row.createdAt;

export const nextActionOn = (row: TenderOpportunity) => row.clarificationDeadline || row.siteVisitDate || row.submissionDeadline || row.closingDate;

export const closingOn = (row: TenderOpportunity) => row.submissionDeadline || row.closingDate;

export const dayStamp = (value: string) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
};

export const daysUntil = (value: string) => {
  const stamp = dayStamp(value);
  if (stamp == null) return null;
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((stamp - today) / 86400000);
};

export const inMonth = (value: string, year: number, month: number) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month;
};

export const monthDelta = (current: number, previous: number) => {
  if (!previous && !current) return 0;
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
};

export const countCreated = (rows: TenderOpportunity[], from: Date, to: Date, pick: (row: TenderOpportunity) => boolean) =>
  rows.filter((row) => {
    const parsed = new Date(row.createdAt);
    return !Number.isNaN(parsed.getTime()) && parsed >= from && parsed < to && pick(row);
  }).length;

export const plainNaira = (value: number) => Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });

export const compactNaira = (value: number) => {
  const amount = Number(value || 0);
  const abs = Math.abs(amount);
  if (abs >= 1_000_000_000) return `₦${trimNumber(amount / 1_000_000_000)}B`;
  if (abs >= 1_000_000) return `₦${trimNumber(amount / 1_000_000)}M`;
  return `₦${plainNaira(amount)}`;
};

const trimNumber = (value: number) => value.toFixed(2).replace(/\.?0+$/, '');

export const downloadCsv = (filename: string, headers: string[], rows: string[][]) => {
  const escape = (value: string) => `"${String(value || '').replace(/"/g, '""')}"`;
  const body = [headers, ...rows].map((line) => line.map(escape).join(',')).join('\n');
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export const workspaceStepIndex = (row: TenderOpportunity) => stageRank(row);

export const WORKSPACE_STAGES = ['Enquiry', 'Qualification', 'Bid Preparation', 'Internal Review', 'Submission', 'Negotiation', 'Award', 'Handover'] as const;

export const fileSize = (bytes: number) => {
  const size = Number(bytes || 0);
  if (!size) return '—';
  if (size >= 1_048_576) return `${(size / 1_048_576).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
};

export const stageSave = (label: string) => {
  if (label === 'Qualification') return { status: 'Prequalification', stage: 'Prequalification' };
  if (label === 'Bid Preparation') return { status: 'Open', stage: 'Bid Preparation' };
  if (label === 'Internal Review') return { status: 'Under Review', stage: 'Under Review' };
  if (label === 'Submission') return { status: 'Submitted', stage: 'Submitted' };
  if (label === 'Negotiation') return { status: 'Negotiation', stage: 'Negotiation' };
  if (label === 'Award') return { status: 'Awarded', stage: 'Awarded' };
  if (label === 'Handover') return { status: 'Awarded', stage: 'Handover' };
  return { status: 'Under Review', stage: 'Enquiry' };
};
