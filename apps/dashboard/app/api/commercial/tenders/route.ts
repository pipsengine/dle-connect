import { readFile } from 'node:fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, verifySessionToken, type SessionPayload } from '@/lib/auth/session';
import { effectivePermissionsForUser } from '@/lib/auth/access-control-store';
import { isSuperActor } from '@/lib/auth/role-delegation';
import { canAccessCommercial, canEditCommercial, isGmCommercial } from '@/lib/access/commercial-access';
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
  updateItemStatus,
  upsertSetting,
} from '@/lib/commercial/tender-store';
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
  if (!canAccessCommercial(permissions, session.isGlobalAdmin)) return err(403, 'Forbidden');

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
  if (!canEditCommercial(permissions, session.isGlobalAdmin)) return err(403, 'Forbidden');
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
        return ok(await saveOpportunity(opportunity, actor));
      }
      case 'duplicate':
        return ok(await duplicateOpportunity(id, actor));
      case 'watchlist':
        return ok(await setWatchlisted(id, Boolean(body.watchlisted), actor));
      case 'line':
        return ok(await addLine(id, body.line || body, actor));
      case 'approval':
        return ok(await addApproval(id, body.approval || body, actor, { allowSelf: Boolean(session.isGlobalAdmin) }));
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
        const opportunity = await getOpportunity(id);
        if (!opportunity) return err(404, 'Opportunity was not found.');
        const saved = await saveOpportunity({
          ...opportunity,
          opportunityType: 'Client Tender',
          tenderType: 'Client Bid',
          stage: 'Bid Preparation',
          status: 'Open',
          saveMode: 'submit',
        }, actor);
        return ok(saved);
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
