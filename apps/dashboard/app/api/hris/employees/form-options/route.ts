import { NextResponse } from 'next/server';
import { loadEmployeeFormOptions } from '@/lib/employee-form-options';

export const dynamic = 'force-dynamic';

const jsonOptions = async (request: Request) => {
  const includeEmployees = new URL(request.url).searchParams.get('includeEmployees') === '1';
  const data = await loadEmployeeFormOptions(includeEmployees);
  return NextResponse.json({ status: 'success', data });
};

export async function GET(request: Request) {
  try {
    return await jsonOptions(request);
  } catch (error) {
    console.error('[employee-form-options]', error);
    return NextResponse.json({ status: 'error', error: 'Unable to load payroll form options' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
