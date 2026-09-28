import { NextResponse } from 'next/server';
import { resolveAccessContext } from '@/lib/hris-access';
import {
  advanceProbationCase,
  readProbationWorkspace,
  saveProbationSettings,
  submitProbationEvaluation,
  type ProbationSettings,
} from '@/lib/probation-management-store';

const ok = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

export async function GET() {
  try {
    return ok(await readProbationWorkspace());
  } catch (error) {
    console.error('[probation-setup] read', error);
    return err(500, error instanceof Error ? error.message : 'Unable to read probation records.');
  }
}

export async function POST(request: Request) {
  const access = resolveAccessContext(request);
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.action === 'save-settings') {
      await saveProbationSettings(body.settings as ProbationSettings, access.actor);
    } else if (body.action === 'submit-evaluation') {
      await submitProbationEvaluation({ caseId: String(body.caseId || ''), evaluation: body.evaluation, recommendation: String(body.recommendation || ''), actor: access.actor });
    } else if (body.action === 'advance') {
      const action = String(body.decision || '');
      if (!['approve', 'return', 'remind', 'confirm', 'extend', 'terminate'].includes(action)) return err(400, 'Unknown probation action.');
      await advanceProbationCase({ caseId: String(body.caseId || ''), action: action as 'approve', comment: String(body.comment || ''), actor: access.actor });
    } else {
      return err(400, 'Unknown probation action.');
    }
    return ok(await readProbationWorkspace());
  } catch (error) {
    console.error('[probation-setup] write', error);
    return err(400, error instanceof Error ? error.message : 'Unable to save probation data.');
  }
}
