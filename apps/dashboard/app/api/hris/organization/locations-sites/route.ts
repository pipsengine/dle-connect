import { NextResponse } from 'next/server';
import { syncSageLocationsToOrganizationDb } from '@/lib/organization-locations-store';

export async function GET() {
  try {
    return NextResponse.json({ status: 'success', data: await syncSageLocationsToOrganizationDb() });
  } catch (error) {
    console.error('Location migration error:', error);
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Unable to load locations and sites' },
      { status: 500 },
    );
  }
}
