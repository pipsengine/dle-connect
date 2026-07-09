import { NextRequest, NextResponse } from 'next/server';
import { leaveAuthorizePageUrl } from '@/lib/leave-email-action-token';
import { resolvePublicAppOriginFromRequest } from '@/lib/public-app-url';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') || '';
  if (!token) {
    return new NextResponse('Approval token is missing.', { status: 400 });
  }
  const target = leaveAuthorizePageUrl(token, resolvePublicAppOriginFromRequest(request));
  return NextResponse.redirect(target, 307);
}
