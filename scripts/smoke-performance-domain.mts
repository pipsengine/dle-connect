import { readPerformanceManagementPayload, applyPerformanceAction } from '../apps/dashboard/lib/performance-domain-store';

const payload = await readPerformanceManagementPayload('dashboard', 'HR Officer');
console.log(
  JSON.stringify({
    cycles: payload.domain.cycles.length,
    goals: payload.domain.goals.length,
    analyticsBands: payload.domain.analytics?.ratingDistribution?.length ?? 0,
    activeCycle: payload.activeCycle?.name || null,
  }),
);

const result = await applyPerformanceAction({
  action: 'analytics.refresh',
  actor: 'QA',
  actorRole: 'HR Officer',
});
console.log(JSON.stringify({ ok: result.ok, message: result.message }));
