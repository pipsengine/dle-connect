import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { canAccessHrisPerformanceManagement } from '@/lib/access/route-access';
import {
  decideInternshipApproval,
  getInternshipReview,
  getInternshipReviewSettings,
  initiateInternshipReview,
  internshipReviewAnalytics,
  internshipReviewKpis,
  internshipTasksForActor,
  listEligibleInternshipInterns,
  listInternshipReviews,
  recordInternshipHrAction,
  saveInternshipEvaluation,
  saveInternshipReviewSettings,
  submitInternshipEvaluation,
} from '@/lib/internship-performance-review-store';
import type { InternshipRecommendation, InternshipScore } from '@/lib/internship-performance-review-types';

const jsonOk = (data: unknown) => NextResponse.json({ status: 'success', data });
const jsonErr = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const readSession = async (request: NextRequest) => {
  const headerToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const cookieStore = await cookies();
  return verifySessionToken(headerToken || cookieStore.get(AUTH_COOKIE)?.value);
};

const workspace = async (session: NonNullable<Awaited<ReturnType<typeof readSession>>>, id?: string | null) => {
  const reviews = await listInternshipReviews();
  const settings = await getInternshipReviewSettings();
  const eligibleInterns = await listEligibleInternshipInterns();
  const actorName = session.fullName || session.username;
  return {
    reviews,
    settings,
    eligibleInterns,
    kpis: internshipReviewKpis(reviews),
    analytics: internshipReviewAnalytics(reviews),
    tasks: internshipTasksForActor(reviews, actorName, session.roles.join(' ')),
    review: id ? (await getInternshipReview(id)) : null,
    actor: { fullName: actorName, role: session.roles[0] || 'HR Officer' },
  };
};

export async function GET(request: NextRequest) {
  try {
    const session = await readSession(request);
    if (!session) return jsonErr(401, 'Unauthenticated.');
    if (!canAccessHrisPerformanceManagement(session)) return jsonErr(403, 'Forbidden.');
    const id = request.nextUrl.searchParams.get('id');
    return jsonOk(await workspace(session, id));
  } catch (error) {
    return jsonErr(500, error instanceof Error ? error.message : 'Unable to load internship reviews.');
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await readSession(request);
    if (!session) return jsonErr(401, 'Unauthenticated.');
    if (!canAccessHrisPerformanceManagement(session)) return jsonErr(403, 'Forbidden.');
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || '');
    const actor = session.fullName || session.username;
    const id = String(body.id || body.payload?.id || '');

    if (action === 'initiate') {
      const review = await initiateInternshipReview(body.payload || body, actor, session);
      return jsonOk({ review, workspace: await workspace(session, review.id) });
    }
    if (action === 'save-evaluation') {
      const review = await saveInternshipEvaluation(id, body.payload || body, actor);
      return jsonOk({ review, workspace: await workspace(session, review.id) });
    }
    if (action === 'submit-evaluation') {
      const review = await submitInternshipEvaluation(
        id,
        {
          scores: (body.payload?.scores || body.scores) as InternshipScore[],
          strength: String(body.payload?.strength || body.strength || ''),
          improvement: String(body.payload?.improvement || body.improvement || ''),
          impression: String(body.payload?.impression || body.impression || ''),
          recommendation: (body.payload?.recommendation || body.recommendation || '') as InternshipRecommendation,
        },
        actor,
        session,
      );
      return jsonOk({ review, workspace: await workspace(session, review.id) });
    }
    if (action === 'approve' || action === 'return') {
      const review = await decideInternshipApproval(id, action, String(body.payload?.comment || body.comment || ''), actor, session);
      return jsonOk({ review, workspace: await workspace(session, review.id) });
    }
    if (action === 'hr-action') {
      const review = await recordInternshipHrAction(id, body.payload || body, actor, session);
      return jsonOk({ review, workspace: await workspace(session, review.id) });
    }
    if (action === 'save-settings') {
      const settings = await saveInternshipReviewSettings(body.payload || body);
      return jsonOk({ settings, workspace: await workspace(session) });
    }
    return jsonErr(400, 'Unknown internship review action.');
  } catch (error) {
    return jsonErr(400, error instanceof Error ? error.message : 'Unable to update internship review.');
  }
}
