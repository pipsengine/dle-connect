import { NextResponse } from 'next/server';
import { createJobTitle, JobTitleInputError, readLiveJobTitles, updateJobTitle } from '@/lib/job-titles-store';

const fail = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  const status = error instanceof JobTitleInputError ? 400 : 500;
  if (status === 500) console.error(fallback, error);
  return NextResponse.json({ status: 'error', error: message }, { status });
};

export async function GET() {
  try {
    return NextResponse.json({ status: 'success', data: await readLiveJobTitles() });
  } catch (error) {
    return fail(error, 'Job titles load error:');
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    return NextResponse.json({ status: 'success', data: await createJobTitle(body || {}) }, { status: 201 });
  } catch (error) {
    return fail(error, 'Job title create error:');
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const id = typeof body?.id === 'string' ? body.id.trim() : '';
    if (!id) return NextResponse.json({ status: 'error', error: 'Job title id is required.' }, { status: 400 });
    return NextResponse.json({ status: 'success', data: await updateJobTitle(id, body || {}) });
  } catch (error) {
    return fail(error, 'Job title update error:');
  }
}
