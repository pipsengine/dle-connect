import { NextResponse } from 'next/server';
import { resolveAccessContext } from '@/lib/hris-access';
import { readIdCardWorkspace, recordIdCardIssue } from '@/lib/id-card-store';

const ok = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

export async function GET() {
  try {
    return ok(await readIdCardWorkspace());
  } catch (error) {
    console.error('[id-cards] read', error);
    return err(500, error instanceof Error ? error.message : 'Unable to read ID card records.');
  }
}

export async function POST(request: Request) {
  const access = resolveAccessContext(request);
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.action !== 'issue') return err(400, 'Unknown ID card action.');
    const codes = Array.isArray(body.employeeCodes) ? body.employeeCodes.map((code) => String(code || '')) : [];
    const workspace = await recordIdCardIssue({
      employeeCodes: codes,
      templateId: String(body.templateId || ''),
      format: String(body.format || ''),
      actor: access.actor,
    });
    return ok(workspace);
  } catch (error) {
    console.error('[id-cards] write', error);
    return err(400, error instanceof Error ? error.message : 'Unable to save ID card records.');
  }
}
