import { NextResponse } from 'next/server';
import { getReportingHierarchyData } from '@/lib/organization-data';

export async function GET() {
  return NextResponse.json({ status: 'success', data: getReportingHierarchyData() });
}
