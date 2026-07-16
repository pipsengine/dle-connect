import { readPerformanceManagementPayload, applyPerformanceAction, buildPerformanceActorContext } from '../apps/dashboard/lib/performance-domain-store';

const actorContext = buildPerformanceActorContext({
  sub: 'smoke-hr',
  username: 'smoke-hr',
  fullName: 'Smoke HR',
  employeeCode: 'SMOKE',
  roles: ['HR Officer'],
  permissions: ['performance.admin', 'hris.view', 'page.hris.management.view'],
  status: 'Active',
  firstLoginRequired: false,
  passwordResetRequired: false,
  iat: 0,
  exp: 0,
});

const payload = await readPerformanceManagementPayload('dashboard', actorContext);
console.log(
  JSON.stringify({
    cycles: payload.domain.cycles.length,
    goals: payload.domain.goals.length,
    analyticsBands: payload.domain.analytics?.ratingDistribution?.length ?? 0,
    activeCycle: payload.activeCycle?.name || null,
    scope: payload.actor.scope,
  }),
);

const result = await applyPerformanceAction({
  action: 'analytics.refresh',
  actor: 'QA',
  actorRole: 'HR Officer',
}, actorContext);
console.log(JSON.stringify({ ok: result.ok, message: result.message }));
