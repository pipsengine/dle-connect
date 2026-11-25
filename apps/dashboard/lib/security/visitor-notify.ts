import { buildDleEmail, formatEmailDate, resolveEmailLogoUrl } from '@/lib/email-templates';
import { sendTransactionalEmail } from '@/lib/mail-service';
import { resolveWorkflowLinkOrigin } from '@/lib/public-app-url';
import type { VisitorStatus, VisitorVisit } from '@/lib/security/visitor-types';

const stageCopy = (status: VisitorStatus, visitorName: string) => {
  if (status === 'Pending Security Check-in') {
    return {
      subject: `Visitor registered — ${visitorName}`,
      headline: 'Visitor registration received',
      intro: `${visitorName} has been registered. Security will check the visitor in on arrival before reception completes site entry.`,
      badge: 'Awaiting security check-in',
      tone: 'info' as const,
      next: 'Next step: security check-in.',
    };
  }
  if (status === 'Pending Reception Check-in') {
    return {
      subject: `Security check-in completed — ${visitorName}`,
      headline: 'Security check-in completed',
      intro: `Security has checked ${visitorName} in. Reception will now complete the site check-in.`,
      badge: 'Awaiting reception check-in',
      tone: 'info' as const,
      next: 'Next step: reception check-in.',
    };
  }
  if (status === 'Checked In') {
    return {
      subject: `Visitor checked in — ${visitorName}`,
      headline: 'Visitor is on site',
      intro: `Reception has checked ${visitorName} in. The visitor is now on site.`,
      badge: 'Checked in',
      tone: 'success' as const,
      next: 'Next step: reception check-out when the visit ends.',
    };
  }
  if (status === 'Pending Security Check-out') {
    return {
      subject: `Reception check-out completed — ${visitorName}`,
      headline: 'Reception check-out completed',
      intro: `Reception has checked ${visitorName} out of the meeting. Security will complete the exit check.`,
      badge: 'Awaiting security check-out',
      tone: 'warning' as const,
      next: 'Next step: security check-out.',
    };
  }
  if (status === 'Checked Out') {
    return {
      subject: `Visit closed — ${visitorName}`,
      headline: 'Visit closed',
      intro: `Security has checked ${visitorName} out. This visit is now closed.`,
      badge: 'Checked out',
      tone: 'success' as const,
      next: 'No further action is required.',
    };
  }
  return null;
};

export const notifyVisitorRequester = async (visit: VisitorVisit, requesterEmail: string, requesterName: string) => {
  const copy = stageCopy(visit.status, visit.visitorName);
  const email = requesterEmail.trim();
  if (!copy || !email) return;
  const origin = resolveWorkflowLinkOrigin();
  const branded = buildDleEmail({
    recipientName: requesterName || 'Colleague',
    subject: copy.subject,
    module: 'Security',
    headline: copy.headline,
    intro: copy.intro,
    tone: copy.tone,
    logoUrl: resolveEmailLogoUrl(origin),
    statusBadge: copy.badge,
    details: [
      { label: 'Visitor', value: visit.visitorName || '—' },
      { label: 'Company', value: visit.company || '—' },
      { label: 'Host', value: visit.hostName || '—' },
      { label: 'Department', value: visit.department || '—' },
      { label: 'Purpose', value: visit.purpose || '—' },
      { label: 'Location', value: visit.location || visit.meetingRoom || '—' },
      { label: 'Visit date', value: formatEmailDate(visit.visitDate) },
      { label: 'Visit time', value: visit.visitTime || '—' },
      { label: 'Reference', value: visit.id },
    ],
    note: copy.next,
    actions: [{ href: `${origin}/security/visitor-management/dashboard`, label: 'Open visitor dashboard', tone: 'primary' }],
    footerNote: 'You are receiving this because you registered this visitor in DLE Connect.',
    preheader: copy.intro,
  });
  const sent = await sendTransactionalEmail({
    to: email,
    subject: branded.subject,
    text: branded.text,
    html: branded.html,
  });
  if (!sent.sent) {
    console.warn('[visitor] requester email was not sent.', { visitId: visit.id, reason: sent.reason });
  }
};
