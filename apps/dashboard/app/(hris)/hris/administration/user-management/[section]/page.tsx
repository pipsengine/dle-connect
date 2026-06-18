import { redirect } from 'next/navigation';

export default async function UserManagementSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  redirect(`/administration/user-management/${section}`);
}
