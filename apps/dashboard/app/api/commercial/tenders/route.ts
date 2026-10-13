import { readFile } from 'node:fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, verifySessionToken, type SessionPayload } from '@/lib/auth/session';
import { effectivePermissionsForUser } from '@/lib/auth/access-control-store';
import { isSuperActor } from '@/lib/auth/role-delegation';
import { canAccessTenderPortal, isGmCommercial, isManagingDirector } from '@/lib/access/commercial-access';
import { createEnterpriseNotification } from '@/lib/enterprise-notifications-store';
import {
  addApproval,
  addAward,
  addItem,
  addLine,
  addSubmission,
  buildTenderDashboard,
  duplicateOpportunity,
  getDocumentFile,
  getOpportunity,
  listApprovals,
  listAudit,
  listAwards,
  listDocuments,
  listItems,
  listLines,
  listOpportunities,
  listSettings,
  listSubmissions,
  listTenderLookups,
  saveDocument,
  saveOpportunity,
  setWatchlisted,
  assignTenderOfficer,
  decideBid,
  acknowledgeAssignment,
  convertEnquiryToTender,
  setClientOutcome,
  assertSubmissionEvidence,
  updateItemStatus,
  upsertSetting,
} from '@/lib/commercial/tender-store';
import { announceVerifiedAward, runTenderDeadlineReminders } from '@/lib/commercial/tender-reminder-service';
import { loadEmployeeFormOptions } from '@/lib/employee-form-options';
import { departmentalReviewAllowed, preparationOf } from '@/lib/commercial/tender-workflow';
import { getTenderBlueprint, saveBlueprintRecord } from '@/lib/commercial/tender-blueprint-store';
import type { BlueprintViewer } from '@/lib/commercial/tender-types';

const ok = (data: unknown) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const sessionFrom = async (request: NextRequest) => verifySessionToken(request.cookies.get(AUTH_COOKIE)?.value);

const permissionsFrom = async (session: SessionPayload) => {
  if (isSuperActor(session)) return ['*'];
  return effectivePermissionsForUser(session.sub, session.roles);
};

const actorFrom = (session: SessionPayload) => {
  const name = session.fullName || session.username || 'Commercial User';
  const code = session.employeeCode?.trim();
  return (code ? `${name} (${code})` : name).slice(0, 120);
};
const viewerFrom = (session: SessionPayload, permissions: string[]): BlueprintViewer => ({
  roles: session.roles || [],
  permissions,
  isGlobalAdmin: session.isGlobalAdmin,
});

export async function GET(request: NextRequest) {
  const session = await sessionFrom(request);
  if (!session) return err(401, 'Unauthorized');
  const permissions = await permissionsFrom(session);
  if (!canAccessTenderPortal(session)) return err(403, 'Forbidden');

  const { searchParams } = new URL(request.url);
  const resource = searchParams.get('resource') || 'opportunities';
  const id = searchParams.get('id') || '';
  if (searchParams.get('company') && searchParams.get('company')?.toUpperCase() !== 'DLE') return err(404, 'Opportunity was not found.');

  try {
    if (resource === 'document') {
      const file = await getDocumentFile(searchParams.get('documentId') || '');
      if (!file) return err(404, 'Document was not found.');
      const bytes = await readFile(file.absolutePath);
      return new NextResponse(new Uint8Array(bytes), {
        headers: {
          'Content-Type': file.contentType,
          'Content-Disposition': `attachment; filename="${file.fileName.replace(/"/g, '')}"`,
          'Cache-Control': 'private, no-store',
        },
      });
    }
    switch (resource) {
      case 'dashboard':
        return ok(await buildTenderDashboard());
      case 'opportunities':
        return ok(await listOpportunities());
      case 'opportunity': {
        const row = await getOpportunity(id);
        if (!row) return err(404, 'Opportunity was not found.');
        const [documents, lines, approvals, submissions, awards, items, audit] = await Promise.all([
          listDocuments(id),
          listLines(id),
          listApprovals(id),
          listSubmissions(id),
          listAwards(id),
          listItems(id),
          listAudit(id),
        ]);
        return ok({ opportunity: row, documents, lines, approvals, submissions, awards, items, audit });
      }
      case 'lookups':
        return ok(await listTenderLookups());
      case 'approvals':
        return ok(await listApprovals(id || undefined));
      case 'submissions':
        return ok(await listSubmissions(id || undefined));
      case 'awards':
        return ok(await listAwards(id || undefined));
      case 'items':
        return ok(await listItems(id || undefined, searchParams.get('kind') || undefined));
      case 'audit':
        return ok(await listAudit(id || undefined));
      case 'blueprint':
        return ok(await getTenderBlueprint(id, viewerFrom(session, permissions)));
      case 'settings':
        return ok(await listSettings());
      case 'directory': {
        const options = await loadEmployeeFormOptions(true);
        return ok((options.employees || []).map((employee) => ({
          employeeId: employee.employeeId,
          fullName: employee.fullName,
          department: employee.department,
          jobTitle: employee.jobTitle,
        })));
      }
      default:
        return err(400, 'Unknown resource.');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tender request failed.';
    return err(500, message);
  }
}

export async function POST(request: NextRequest) {
  const session = await sessionFrom(request);
  if (!session) return err(401, 'Unauthorized');
  const permissions = await permissionsFrom(session);
  if (!canAccessTenderPortal(session)) return err(403, 'Forbidden');
  const actor = actorFrom(session);

  try {
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const opportunityId = String(form.get('opportunityId') || '');
      const category = String(form.get('category') || 'General');
      const file = form.get('file');
      if (!(file instanceof File)) return err(400, 'Choose a document to upload.');
      const bytes = Buffer.from(await file.arrayBuffer());
      const documents = await saveDocument(opportunityId, { name: file.name, type: file.type, bytes }, category, actor);
      return ok(documents);
    }

    const body = await request.json();
    const action = String(body.action || 'save');
    const id = String(body.id || body.opportunityId || '');
    if (body.company && String(body.company).toUpperCase() !== 'DLE') return err(404, 'Opportunity was not found.');

    switch (action) {
      case 'save': {
        const opportunity = body.opportunity || body;
        const enquiry = opportunity.opportunityType === 'Enquiry' || opportunity.tenderType === 'Enquiry';
        if (enquiry && !isGmCommercial(session.roles, session.isGlobalAdmin)) {
          const current = opportunity.id ? await getOpportunity(String(opportunity.id)) : null;
          const owner = String(opportunity.ownerName || '').trim();
          const internal = String(opportunity.clarificationDeadline || '').slice(0, 10);
          const ownerChanged = owner !== String(current?.ownerName || '').trim();
          const internalChanged = internal !== String(current?.clarificationDeadline || '').slice(0, 10);
          if (ownerChanged || internalChanged) {
            return err(403, 'Only GM Commercial can assign the responsible officer and internal response date.');
          }
        }
        if (!enquiry && !isManagingDirector(session.roles, session.isGlobalAdmin)) {
          const current = opportunity.id ? await getOpportunity(String(opportunity.id)) : null;
          const owner = String(opportunity.ownerName || '').trim();
          const internal = String(opportunity.closingDate || '').slice(0, 10);
          const ownerChanged = owner !== String(current?.ownerName || '').trim();
          const internalChanged = internal !== String(current?.closingDate || '').slice(0, 10);
          if (ownerChanged || internalChanged) {
            return err(403, 'Only the Managing Director can assign the responsible officer and internal submission date.');
          }
        }
        const nextStatus = `${opportunity.stage || ''} ${opportunity.status || ''}`;
        if (/submit/i.test(nextStatus) && opportunity.id) {
          const current = await getOpportunity(String(opportunity.id));
          if (current && preparationOf(current) !== 'Submitted') await assertSubmissionEvidence(String(opportunity.id));
        }
        return ok(await saveOpportunity(opportunity, actor));
      }
      case 'assign': {
        const enquiry = String(body.recordType || '') === 'enquiry';
        if (enquiry && !isGmCommercial(session.roles, session.isGlobalAdmin)) return err(403, 'Only GM Commercial can assign an enquiry.');
        if (!enquiry && !isManagingDirector(session.roles, session.isGlobalAdmin)) return err(403, 'Only the Managing Director can assign a tender opportunity.');
        const saved = await assignTenderOfficer(id, {
          officerName: String(body.officerName || ''),
          employeeCode: String(body.employeeCode || ''),
          internalDeadline: String(body.internalDeadline || ''),
          reason: String(body.reason || ''),
        }, actor);
        if (saved) {
          await createEnterpriseNotification(session, {
            title: `Assignment · ${saved.referenceNo}`,
            body: `${saved.title} is assigned to ${saved.ownerName}. Please acknowledge it.`,
            module: 'Commercial',
            kind: 'Workflow',
            severity: 'info',
            href: `/commercial/tenders/workspace?id=${saved.id}`,
            actor,
            recipientEmployeeCode: saved.ownerEmployeeCode || undefined,
            channels: ['In-App', 'Email'],
          });
        }
        return ok(saved);
      }
      case 'acknowledge':
        return ok(await acknowledgeAssignment(id, actor, String(session.employeeCode || '')));
      case 'client-outcome': {
        if (!isGmCommercial(session.roles, session.isGlobalAdmin) && !isManagingDirector(session.roles, session.isGlobalAdmin)) {
          return err(403, 'Only GM Commercial or the Managing Director can record a client decision.');
        }
        return ok(await setClientOutcome(id, {
          clientStatus: String(body.clientStatus || ''),
          awardedToDle: String(body.awardedToDle || ''),
          reason: String(body.reason || ''),
        }, actor));
      }
      case 'confirm-award': {
        if (!isManagingDirector(session.roles, session.isGlobalAdmin) && !isGmCommercial(session.roles, session.isGlobalAdmin)) {
          return err(403, 'Only an authorized management officer can verify an award.');
        }
        const awardedToDle = String(body.awardedToDle || '');
        const saved = await setClientOutcome(id, {
          clientStatus: awardedToDle === 'No' ? 'Awarded' : 'Awarded',
          awardedToDle,
          reason: String(body.reason || 'Award verification'),
        }, actor);
        if (awardedToDle === 'Yes' && saved && body.announce === true) {
          const supplied = Array.isArray(body.recipients) ? body.recipients.map((code: unknown) => String(code)) : [];
          const announcement = await announceVerifiedAward(session, {
            opportunityId: saved.id,
            referenceNo: saved.referenceNo,
            title: saved.title,
            clientName: saved.clientName,
            recipients: supplied,
          });
          return ok({ opportunity: saved, announcement });
        }
        return ok({ opportunity: saved, announcement: { sent: false, recipients: 0 } });
      }
      case 'reminders':
        return ok(await runTenderDeadlineReminders(session));
      case 'duplicate':
        return ok(await duplicateOpportunity(id, actor));
      case 'watchlist':
        return ok(await setWatchlisted(id, Boolean(body.watchlisted), actor));
      case 'line':
        return ok(await addLine(id, body.line || body, actor));
      case 'bid-decision': {
        if (!isManagingDirector(session.roles, session.isGlobalAdmin)) {
          return err(403, 'Only the Managing Director can record a bid or no-bid decision.');
        }
        const decision = String(body.decision || '');
        const saved = await decideBid(id, {
          decision,
          comments: String(body.comments || ''),
          officerName: String(body.officerName || ''),
          employeeCode: String(body.employeeCode || ''),
          internalDeadline: String(body.internalDeadline || ''),
        }, actor);
        if (saved && decision.toLowerCase() === 'bid' && saved.ownerEmployeeCode) {
          await createEnterpriseNotification(session, {
            title: `Bid approved · ${saved.referenceNo}`,
            body: `${saved.title} is approved for bid preparation and assigned to ${saved.ownerName}. Please acknowledge it.`,
            module: 'Commercial',
            kind: 'Workflow',
            severity: 'info',
            href: `/commercial/tenders/bid-preparation?id=${saved.id}`,
            actor,
            recipientEmployeeCode: saved.ownerEmployeeCode,
            channels: ['In-App', 'Email'],
          });
        }
        return ok(saved);
      }
      case 'approval': {
        const approval = body.approval || body;
        const decision = String(approval.decision || '').toUpperCase();
        const current = await getOpportunity(id);
        if (!current) return err(404, 'Opportunity was not found.');
        if (decision !== 'COMMENT' && !departmentalReviewAllowed(current)) {
          return err(403, 'Departmental review starts only after the Managing Director approves a bid and assigns a responsible officer.');
        }
        if ((decision === 'REJECT' || decision === 'RETURN') && !String(approval.comments || '').trim()) {
          return err(400, 'A comment is required to reject or return this bid.');
        }
        if (decision === 'APPROVE' && !(await listDocuments(id)).length) {
          return err(400, 'Upload the bid document package before approval.');
        }
        return ok(await addApproval(id, approval, actor, { allowSelf: Boolean(session.isGlobalAdmin) }));
      }
      case 'blueprint':
        return ok(await saveBlueprintRecord(String(body.kind || ''), id, body, actor, viewerFrom(session, permissions)));
      case 'submission':
        return ok(await addSubmission(id, body.submission || body, actor));
      case 'award':
        return ok(await addAward(id, body.award || body, actor));
      case 'item':
        return ok(await addItem(id, body.item || body, actor));
      case 'item-status':
        await updateItemStatus(String(body.itemId || ''), String(body.status || 'DONE'), actor);
        return ok({ updated: true });
      case 'setting':
        return ok(await upsertSetting(String(body.key || ''), String(body.value || ''), actor));
      case 'notify': {
        const opportunity = await getOpportunity(id);
        if (!opportunity) return err(404, 'Opportunity was not found.');
        const notification = await createEnterpriseNotification(session, {
          title: `Tender update · ${opportunity.referenceNo}`,
          body: String(body.message || `${opportunity.title} requires attention.`),
          module: 'Commercial',
          kind: 'Workflow',
          severity: 'info',
          href: `/commercial/tenders/workspace?id=${opportunity.id}`,
          actor,
        });
        return ok(notification);
      }
      case 'convert': {
        if (!isGmCommercial(session.roles, session.isGlobalAdmin)) return err(403, 'Only GM Commercial can convert an enquiry into a tender opportunity.');
        return ok(await convertEnquiryToTender(id, actor));
      }
      default:
        return err(400, 'Unknown action.');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tender request failed.';
    const status = /required|not found|Choose|blocked|cannot|exceeds|requires|inactive|workshare|justification/i.test(message) ? 400 : 500;
    return err(status, message);
  }
}
