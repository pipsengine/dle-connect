import { redirect } from 'next/navigation';

export default async function AuditTrailSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  redirect(`/administration/audit-trail/${section}`);
}
