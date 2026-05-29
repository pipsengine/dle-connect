import { NextResponse } from 'next/server';
import { getOrganogramData } from '@/lib/organization-data';

export async function GET() {
  return NextResponse.json({ status: 'success', data: getOrganogramData() });
}
