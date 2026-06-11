import { NextResponse } from 'next/server';
import { syncSageDepartmentsToOrganizationDb } from '@/lib/organization-departments-store';

export async function GET() {
  try {
    return NextResponse.json({ status: 'success', data: await syncSageDepartmentsToOrganizationDb() });
  } catch (error) {
    console.error('Department migration error:', error);
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Unable to load departments' },
      { status: 500 },
    );
  }
}
