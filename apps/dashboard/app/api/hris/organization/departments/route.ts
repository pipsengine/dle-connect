import { NextResponse } from 'next/server';
import {
  createDepartmentInOrganizationDb,
  deleteDepartmentFromOrganizationDb,
  readSystemDepartmentsFromOrganizationDb,
  refreshDepartmentsFromSystemEmployees,
  searchDepartmentHeadEmployees,
  updateDepartmentInOrganizationDb,
} from '@/lib/organization-departments-store';

const jsonOk = async (data: Promise<unknown>) => NextResponse.json({ status: 'success', data: await data });
const jsonErr = (error: unknown) =>
  NextResponse.json(
    { status: 'error', error: error instanceof Error ? error.message : 'Unable to process departments request' },
    { status: 500 },
  );

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get('employees') === '1') {
      const q = url.searchParams.get('q')?.trim() || '';
      const limit = Number(url.searchParams.get('limit') || 20);
      return NextResponse.json({
        status: 'success',
        data: { employees: await searchDepartmentHeadEmployees(q, Number.isFinite(limit) ? limit : 20) },
      });
    }
    return NextResponse.json({ status: 'success', data: await readSystemDepartmentsFromOrganizationDb() });
  } catch (error) {
    console.error('Department load error:', error);
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Unable to load departments' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (body?.action === 'refresh-from-system') return jsonOk(refreshDepartmentsFromSystemEmployees());
    return jsonOk(createDepartmentInOrganizationDb(body || {}));
  } catch (error) {
    return jsonErr(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const id = typeof body?.id === 'string' ? body.id.trim() : '';
    if (!id) throw new Error('Department id is required.');
    return jsonOk(updateDepartmentInOrganizationDb(id, body || {}));
  } catch (error) {
    return jsonErr(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id')?.trim() || '';
    if (!id) throw new Error('Department id is required.');
    return jsonOk(deleteDepartmentFromOrganizationDb(id));
  } catch (error) {
    return jsonErr(error);
  }
}
