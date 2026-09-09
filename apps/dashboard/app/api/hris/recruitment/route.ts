import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { assertRecruitmentAccess } from '@/lib/access/recruitment-access';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { readRecruitmentLookups, searchRecruitmentEmployees } from '@/lib/recruitment-lookups';
import { applyRecruitmentAction, readRecruitmentPayload } from '@/lib/recruitment-store';

export const dynamic = 'force-dynamic';

const resolveSession = async () => {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE)?.value;
  return token ? await verifySessionToken(token) : null;
};

export async function GET(request: Request) {
  try {
    const session = await resolveSession();
    assertRecruitmentAccess(session);
    const { searchParams } = new URL(request.url);
    const section = searchParams.get('section');
    const q = searchParams.get('q');

    if (section === 'lookups') {
      const lookups = await readRecruitmentLookups();
      return NextResponse.json({ status: 'success', data: lookups });
    }
    if (section === 'employees' || q) {
      const employees = await searchRecruitmentEmployees(q || '', Number(searchParams.get('limit') || 15));
      return NextResponse.json({ status: 'success', data: { employees } });
    }

    const payload = await readRecruitmentPayload();
    return NextResponse.json({ status: 'success', data: payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load Recruitment Management.';
    const status = /access/i.test(message) ? 403 : 500;
    return NextResponse.json({ status: 'error', error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const session = await resolveSession();
    assertRecruitmentAccess(session);
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || '');
    const actor = session!.fullName || session!.username || session!.sub || 'User';
    const result = await applyRecruitmentAction(action, body, actor);
    return NextResponse.json({ status: 'success', data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to process Recruitment action.';
    const status = /access/i.test(message) ? 403 : /required|not found|Unsupported/i.test(message) ? 400 : 500;
    return NextResponse.json({ status: 'error', error: message }, { status });
  }
}
