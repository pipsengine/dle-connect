import { readFile } from 'node:fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, verifySessionToken, type SessionPayload } from '@/lib/auth/session';
import { effectivePermissionsForUser } from '@/lib/auth/access-control-store';
import { isSuperActor } from '@/lib/auth/role-delegation';
import { canAccessTenderPortal, canActAsGmCommercial, canActAsManagingDirector, canActAsProposalReviewer, isGmCommercial, isManagingDirector } from '@/lib/access/commercial-access';
import { createEnterpriseNotification } from '@/lib/enterprise-notifications-store';
import {
  notifyCommercialAssigned,
  notifyCommercialCreated,
  notifyCommercialOutcome,
  notifyGmCommercialAfterProposal,
  notifyManagingDirectorFinal,
} from '@/lib/commercial/tender-approval-notify';
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
  listTenderClients,
  listTenderLookups,
  deleteDocument,
  saveDocument,
  saveOpportunity,
  setWatchlisted,
  assignTenderOfficer,
  decideBid,
  acknowledgeAssignment,
  convertEnquiryToTender,
  reviewCommercialOpportunity,
  recordGmCommercialDecision,
  recordProposalReview,
  setClientOutcome,
  assertSubmissionEvidence,
  updateItemStatus,
  upsertSetting,
} from '@/lib/commercial/tender-store';
import { announceVerifiedAward, runTenderDeadlineReminders } from '@/lib/commercial/tender-reminder-service';
import { loadEmployeeFormOptions } from '@/lib/employee-form-options';
import { departmentalReviewAllowed, internalDeadlineFromExternal, preparationOf } from '@/lib/commercial/tender-workflow';
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
      case 'clients':
        return ok(await listTenderClients(searchParams.get('q') || ''));
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
      case 'authority': {
        let jobTitle = '';
        try {
          const { readUsers } = await import('@/lib/auth/auth-store');
          const users = await readUsers();
          const live = users.find((user) =>
            user.id === session.sub
            || (session.employeeCode && [user.employeeCode, user.employeeId, user.username].map((value) => String(value || '').trim().toUpperCase()).includes(String(session.employeeCode).trim().toUpperCase())),
          );
          jobTitle = String(live?.jobTitle || '').trim();
          if (!jobTitle && session.employeeCode) {
            const options = await loadEmployeeFormOptions(true);
            const employee = (options.employees || []).find((row) => String(row.employeeId || '').trim().toUpperCase() === String(session.employeeCode).trim().toUpperCase());
            jobTitle = String(employee?.jobTitle || '').trim();
          }
        } catch (error) {
          console.warn('[commercial/tenders] authority job title lookup failed', error);
        }
        const actor = {
          roles: session.roles || [],
          employeeCode: session.employeeCode,
          username: session.username,
          isGlobalAdmin: Boolean(session.isGlobalAdmin),
          sub: session.sub,
          department: session.department,
          unit: session.unit,
          jobTitle,
        };
        return ok({
          proposal: canActAsProposalReviewer(actor),
          gm: canActAsGmCommercial(actor),
          md: canActAsManagingDirector(actor),
          jobTitle,
          roles: actor.roles,
          department: actor.department || '',
        });
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
    if (/multipart\/form-data/i.test(contentType)) {
      try {
        const form = await request.formData();
        const opportunityId = String(form.get('opportunityId') || '');
        const category = String(form.get('category') || 'General');
        const file = form.get('file');
        if (!(file instanceof File)) return err(400, 'Choose a document to upload.');
        const bytes = Buffer.from(await file.arrayBuffer());
        const documents = await saveDocument(opportunityId, { name: file.name, type: file.type, bytes }, category, actor);
        return ok(documents);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to read the uploaded file.';
        return err(400, /formdata|multipart|parse/i.test(message)
          ? 'The attachment could not be read. Try again, or use a smaller file.'
          : message);
      }
    }

    let body: Record<string, any>;
    try {
      body = await request.json();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid JSON body.';
      if (/unterminated string|unexpected end|json/i.test(message)) {
        return err(400, 'The attachment was too large for the server to read. Use a file under 12 MB, or try again with a smaller document.');
      }
      return err(400, message);
    }
    const action = String(body.action || 'save');
    const id = String(body.id || body.opportunityId || '');
    if (body.company && String(body.company).toUpperCase() !== 'DLE') return err(404, 'Opportunity was not found.');

    switch (action) {
      case 'upload-document': {
        const opportunityId = String(body.opportunityId || id || '');
        if (!opportunityId) return err(400, 'Opportunity id is required.');
        const fileName = String(body.fileName || body.name || 'document');
        const contentTypeName = String(body.contentType || body.type || 'application/octet-stream');
        const base64 = String(body.contentBase64 || body.bytesBase64 || '');
        if (!base64) return err(400, 'Choose a document to upload.');
        const bytes = Buffer.from(base64, 'base64');
        if (!bytes.length) return err(400, 'Choose a document to upload.');
        if (bytes.length > 12 * 1024 * 1024) return err(400, `${fileName} exceeds the 12 MB limit.`);
        const documents = await saveDocument(
          opportunityId,
          { name: fileName, type: contentTypeName, bytes },
          String(body.category || 'General'),
          actor,
        );
        return ok(documents);
      }
      case 'delete-document': {
        const documentId = String(body.documentId || id || '');
        if (!documentId) return err(400, 'Document id is required.');
        return ok(await deleteDocument(documentId, actor));
      }
      case 'save': {
        const opportunity = body.opportunity || body;
        const enquiry = opportunity.opportunityType === 'Enquiry' || opportunity.tenderType === 'Enquiry';
        if (enquiry && !isGmCommercial(session)) {
          const current = opportunity.id ? await getOpportunity(String(opportunity.id)) : null;
          const owner = String(opportunity.ownerName || '').trim();
          const internal = String(opportunity.clarificationDeadline || '').slice(0, 10);
          const ownerChanged = owner !== String(current?.ownerName || '').trim();
          const internalChanged = internal !== String(current?.clarificationDeadline || '').slice(0, 10);
          if (ownerChanged || internalChanged) {
            return err(403, 'Only GM Commercial can assign the responsible officer and internal response date.');
          }
        }
        if (!enquiry && !isManagingDirector(session)) {
          const current = opportunity.id ? await getOpportunity(String(opportunity.id)) : null;
          const owner = String(opportunity.ownerName || '').trim();
          const internal = String(opportunity.closingDate || '').slice(0, 10);
          const ownerChanged = owner !== String(current?.ownerName || '').trim();
          const creating = !current;
          const defaultInternal = internalDeadlineFromExternal(String(opportunity.submissionDeadline || ''));
          const internalChanged = internal !== String(current?.closingDate || '').slice(0, 10);
          const calculatedDefault = creating && !owner && (!internal || internal === defaultInternal);
          if (!calculatedDefault && (ownerChanged || internalChanged || (creating && Boolean(owner)))) {
            return err(403, 'Only the Managing Director can assign the responsible officer and internal submission date.');
          }
        }
        const nextStatus = `${opportunity.stage || ''} ${opportunity.status || ''}`;
        if (/submit/i.test(nextStatus) && opportunity.id) {
          const current = await getOpportunity(String(opportunity.id));
          if (current && preparationOf(current) !== 'Submitted') await assertSubmissionEvidence(String(opportunity.id));
        }
        const before = opportunity.id ? await getOpportunity(String(opportunity.id)) : null;
        const saved = await saveOpportunity(opportunity, actor);
        if (saved && saved.commercialReview === 'Awaiting Review' && opportunity.saveMode === 'submit' && before?.commercialReview !== 'Awaiting Review') {
          try {
            await notifyCommercialCreated(session, saved, actor);
          } catch (error) {
            console.error('[commercial-approval] create notification failed', error);
          }
        }
        return ok(saved);
      }
      case 'proposal-review': {
        if (!canActAsProposalReviewer(session)) return err(403, 'Only the Proposal reviewer can set the priority and approve this opportunity.');
        const saved = await recordProposalReview(id, {
          decision: String(body.decision || ''),
          comments: String(body.comments || ''),
          priority: String(body.priority || ''),
        }, actor);
        try {
          if (saved && /^(approve|forward)$/i.test(String(body.decision || ''))) {
            await notifyGmCommercialAfterProposal(session, saved, actor);
          }
        } catch (error) {
          console.error('[commercial-approval] proposal forward notification failed', error);
        }
        return ok(saved);
      }
      case 'gm-review': {
        if (!canActAsGmCommercial(session)) return err(403, 'Only GM Commercial can review a commercial opportunity.');
        const saved = await reviewCommercialOpportunity(id, {
          decision: String(body.decision || ''),
          comments: String(body.comments || ''),
        }, actor);
        return ok(saved);
      }
      case 'gm-decision': {
        if (!canActAsGmCommercial(session)) return err(403, 'Only GM Commercial can assign an employee and give the first approval.');
        const officers = Array.isArray(body.officers)
          ? body.officers.map((item: { fullName?: string; name?: string; employeeCode?: string; employeeId?: string }) => ({
            fullName: String(item?.fullName || item?.name || ''),
            employeeCode: String(item?.employeeCode || item?.employeeId || ''),
          }))
          : undefined;
        const result = await recordGmCommercialDecision(id, {
          decision: String(body.decision || ''),
          comments: String(body.comments || ''),
          officerName: String(body.officerName || ''),
          employeeCode: String(body.employeeCode || ''),
          officers,
          internalDeadline: String(body.internalDeadline || ''),
        }, actor);
        const saved = result.opportunity;
        try {
          if (saved) await notifyCommercialAssigned(session, saved, actor);
          if (saved && result.terminal) await notifyCommercialOutcome(session, saved, actor);
          else if (saved) await notifyManagingDirectorFinal(session, saved, actor);
        } catch (error) {
          console.error('[commercial-approval] outcome notification failed', error);
        }
        return ok(saved);
      }
      case 'assign': {
        const enquiry = String(body.recordType || '') === 'enquiry';
        if (enquiry && !isGmCommercial(session)) return err(403, 'Only GM Commercial can assign an enquiry.');
        if (!enquiry && !isManagingDirector(session)) return err(403, 'Only the Managing Director can assign a tender opportunity.');
        const officers = Array.isArray(body.officers)
          ? body.officers.map((item: { fullName?: string; name?: string; employeeCode?: string; employeeId?: string }) => ({
            fullName: String(item?.fullName || item?.name || ''),
            employeeCode: String(item?.employeeCode || item?.employeeId || ''),
          }))
          : undefined;
        const saved = await assignTenderOfficer(id, {
          officerName: String(body.officerName || ''),
          employeeCode: String(body.employeeCode || ''),
          officers,
          internalDeadline: String(body.internalDeadline || ''),
          reason: String(body.reason || ''),
        }, actor);
        try {
          if (saved) await notifyCommercialAssigned(session, saved, actor);
        } catch (error) {
          console.error('[commercial-approval] assignment notification failed', error);
        }
        return ok(saved);
      }
      case 'acknowledge':
        return ok(await acknowledgeAssignment(id, actor, String(session.employeeCode || '')));
      case 'client-outcome': {
        if (!isGmCommercial(session) && !isManagingDirector(session)) {
          return err(403, 'Only GM Commercial or the Managing Director can record a client decision.');
        }
        return ok(await setClientOutcome(id, {
          clientStatus: String(body.clientStatus || ''),
          awardedToDle: String(body.awardedToDle || ''),
          reason: String(body.reason || ''),
        }, actor));
      }
      case 'confirm-award': {
        if (!isManagingDirector(session) && !isGmCommercial(session)) {
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
        if (!canActAsManagingDirector(session)) {
          return err(403, 'Only the Managing Director can give final approval.');
        }
        const decision = String(body.decision || '');
        const saved = await decideBid(id, {
          decision,
          comments: String(body.comments || ''),
        }, actor);
        try {
          if (saved && /^(approve|bid)$/i.test(decision)) await notifyCommercialOutcome(session, saved, actor);
        } catch (error) {
          console.error('[commercial-approval] MD outcome notification failed', error);
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
        return ok(await addApproval(id, approval, actor, { allowSelf: canActAsManagingDirector(session) || canActAsGmCommercial(session) }));
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
        if (!isGmCommercial(session)) return err(403, 'Only GM Commercial can convert an enquiry into a tender opportunity.');
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
