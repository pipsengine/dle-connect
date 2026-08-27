import { NextRequest, NextResponse } from 'next/server';
import { effectivePermissionsForUser } from '@/lib/auth/access-control-store';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import {
  canCreateServiceDesk,
  canEditServiceDesk,
  canViewServiceDesk,
} from '@/lib/access/it-service-desk-access';
import {
  addIncidentEvent,
  addTicketComment,
  applyAssignmentAutomation,
  buildReports,
  buildServiceDeskDashboard,
  bulkAssignTickets,
  createIncident,
  createServiceRequest,
  createTicket,
  deleteTemplate,
  getIncidentRca,
  getTicket,
  listAutomationRules,
  listChanges,
  listEscalations,
  listFeedback,
  listIncidentEvents,
  listIncidents,
  listKbArticles,
  listProblems,
  listServiceCatalog,
  listServiceRequests,
  listSettings,
  listSlaPolicies,
  listTemplates,
  listTicketActivity,
  listTicketComments,
  listTickets,
  saveIncidentRca,
  updateIncident,
  updateServiceRequest,
  updateTicket,
  upsertAutomationRule,
  upsertChange,
  upsertEscalation,
  upsertFeedback,
  upsertProblem,
  upsertSetting,
  upsertSlaPolicy,
  upsertTemplate,
} from '@/lib/it-service-desk-store';

const ok = (data: unknown) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const sessionFrom = async (request: NextRequest) => verifySessionToken(request.cookies.get(AUTH_COOKIE)?.value);

const permissionsFrom = async (session: NonNullable<Awaited<ReturnType<typeof sessionFrom>>>) => {
  if (session.isGlobalAdmin || session.sub === 'global-admin') return ['*'];
  return effectivePermissionsForUser(session.sub, session.roles);
};

const actorFrom = (session: NonNullable<Awaited<ReturnType<typeof sessionFrom>>>) =>
  session.fullName || session.username || 'IT User';

export async function GET(request: NextRequest) {
  const session = await sessionFrom(request);
  if (!session) return err(401, 'Unauthorized');
  const permissions = await permissionsFrom(session);
  if (!canViewServiceDesk(permissions, session.isGlobalAdmin)) return err(403, 'Forbidden');

  const { searchParams } = new URL(request.url);
  const resource = searchParams.get('resource') || 'dashboard';

  try {
    switch (resource) {
      case 'dashboard':
        return ok(await buildServiceDeskDashboard());
      case 'tickets':
        return ok(
          await listTickets({
            status: searchParams.get('status') || undefined,
            statuses: searchParams.get('statuses')?.split(',').filter(Boolean),
            assigneeName: searchParams.get('assigneeName') || undefined,
            assigneeId: searchParams.get('assigneeId') || undefined,
            mineFor: searchParams.get('mineFor') || undefined,
            priority: searchParams.get('priority') || undefined,
            category: searchParams.get('category') || undefined,
            queue: searchParams.get('queue') || undefined,
            search: searchParams.get('search') || undefined,
            overdueOnly: searchParams.get('overdueOnly') === '1',
            archived: searchParams.get('archived') === '1' ? true : searchParams.get('archived') === '0' ? false : undefined,
            reopened: searchParams.get('reopened') === '1',
          }),
        );
      case 'ticket': {
        const id = searchParams.get('id');
        if (!id) return err(400, 'id required');
        const ticket = await getTicket(id);
        if (!ticket) return err(404, 'Ticket not found');
        return ok(ticket);
      }
      case 'ticket-comments': {
        const id = searchParams.get('id');
        if (!id) return err(400, 'id required');
        return ok(await listTicketComments(id));
      }
      case 'ticket-activity':
        return ok(await listTicketActivity(searchParams.get('id') || undefined));
      case 'templates':
        return ok(await listTemplates());
      case 'incidents':
        return ok(
          await listIncidents({
            status: searchParams.get('status') || undefined,
            isMajor: searchParams.get('isMajor') === '1' ? true : searchParams.get('isMajor') === '0' ? false : undefined,
            search: searchParams.get('search') || undefined,
          }),
        );
      case 'incident-events':
        return ok(await listIncidentEvents(searchParams.get('id') || undefined));
      case 'incident-rca': {
        const id = searchParams.get('id');
        if (!id) return err(400, 'id required');
        return ok(await getIncidentRca(id));
      }
      case 'service-catalog':
        return ok(await listServiceCatalog());
      case 'service-requests':
        return ok(
          await listServiceRequests({
            stage: searchParams.get('stage') || undefined,
            search: searchParams.get('search') || undefined,
          }),
        );
      case 'problems':
        return ok(await listProblems(searchParams.get('kind') || undefined));
      case 'sla-policies':
        return ok(await listSlaPolicies());
      case 'escalations':
        return ok(await listEscalations());
      case 'changes':
        return ok(await listChanges(searchParams.get('changeType') || undefined));
      case 'automation':
        return ok(await listAutomationRules(searchParams.get('ruleType') || undefined));
      case 'settings':
        return ok(await listSettings(searchParams.get('settingType') || undefined));
      case 'kb':
        return ok(await listKbArticles());
      case 'feedback':
        return ok(await listFeedback(searchParams.get('feedbackType') || undefined));
      case 'reports':
        return ok(await buildReports());
      default:
        return err(400, `Unknown resource: ${resource}`);
    }
  } catch (error) {
    console.error('[service-desk-itsm GET]', error);
    return err(500, error instanceof Error ? error.message : 'Failed to load service desk data');
  }
}

export async function POST(request: NextRequest) {
  const session = await sessionFrom(request);
  if (!session) return err(401, 'Unauthorized');
  const permissions = await permissionsFrom(session);
  if (!canCreateServiceDesk(permissions, session.isGlobalAdmin) && !canEditServiceDesk(permissions, session.isGlobalAdmin)) {
    return err(403, 'Forbidden');
  }

  const actor = actorFrom(session);
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || '');

  try {
    switch (action) {
      case 'create-ticket': {
        let ticket = await createTicket(body.payload || body, actor);
        if (ticket) ticket = await applyAssignmentAutomation(ticket, actor);
        return ok(ticket);
      }
      case 'update-ticket': {
        if (!canEditServiceDesk(permissions, session.isGlobalAdmin)) return err(403, 'Forbidden');
        const id = String(body.id || body.ticketId || '');
        if (!id) return err(400, 'id required');
        return ok(await updateTicket(id, body.payload || body, actor));
      }
      case 'bulk-assign': {
        if (!canEditServiceDesk(permissions, session.isGlobalAdmin)) return err(403, 'Forbidden');
        const ids = Array.isArray(body.ticketIds) ? body.ticketIds.map(String) : [];
        const assigneeName = String(body.assigneeName || '');
        if (!ids.length || !assigneeName) return err(400, 'ticketIds and assigneeName required');
        return ok(await bulkAssignTickets(ids, assigneeName, actor));
      }
      case 'add-comment': {
        const id = String(body.id || body.ticketId || '');
        if (!id || !body.body) return err(400, 'id and body required');
        return ok(await addTicketComment(id, String(body.body), actor, session.sub));
      }
      case 'upsert-template':
        return ok(await upsertTemplate(body.payload || body, actor));
      case 'delete-template': {
        if (!canEditServiceDesk(permissions, session.isGlobalAdmin)) return err(403, 'Forbidden');
        return ok(await deleteTemplate(String(body.id || body.templateId || '')));
      }
      case 'create-incident':
        return ok(await createIncident(body.payload || body, actor));
      case 'update-incident': {
        if (!canEditServiceDesk(permissions, session.isGlobalAdmin)) return err(403, 'Forbidden');
        const id = String(body.id || body.incidentId || '');
        if (!id) return err(400, 'id required');
        return ok(await updateIncident(id, body.payload || body, actor));
      }
      case 'add-incident-event': {
        const id = String(body.id || body.incidentId || '');
        if (!id || !body.description) return err(400, 'id and description required');
        return ok(await addIncidentEvent(id, String(body.description), actor, body.eventAt ? String(body.eventAt) : undefined));
      }
      case 'save-incident-rca': {
        const id = String(body.id || body.incidentId || '');
        if (!id) return err(400, 'id required');
        const payloadJson = typeof body.payloadJson === 'string' ? body.payloadJson : JSON.stringify(body.payload || {});
        return ok(await saveIncidentRca(id, payloadJson, String(body.status || 'Draft'), actor));
      }
      case 'create-service-request':
        return ok(await createServiceRequest(body.payload || body, actor));
      case 'update-service-request': {
        if (!canEditServiceDesk(permissions, session.isGlobalAdmin)) return err(403, 'Forbidden');
        const id = String(body.id || body.requestId || '');
        if (!id) return err(400, 'id required');
        return ok(await updateServiceRequest(id, body.payload || body, actor));
      }
      case 'upsert-problem':
        return ok(await upsertProblem(body.payload || body, actor));
      case 'upsert-sla-policy':
        return ok(await upsertSlaPolicy(body.payload || body, actor));
      case 'upsert-escalation':
        return ok(await upsertEscalation(body.payload || body, actor));
      case 'upsert-change':
        return ok(await upsertChange(body.payload || body, actor));
      case 'upsert-automation':
        return ok(await upsertAutomationRule(body.payload || body, actor));
      case 'upsert-setting':
        return ok(await upsertSetting(body.payload || body, actor));
      case 'upsert-feedback':
        return ok(await upsertFeedback(body.payload || body, actor));
      default:
        return err(400, `Unknown action: ${action}`);
    }
  } catch (error) {
    console.error('[service-desk-itsm POST]', error);
    return err(500, error instanceof Error ? error.message : 'Failed to save service desk data');
  }
}
