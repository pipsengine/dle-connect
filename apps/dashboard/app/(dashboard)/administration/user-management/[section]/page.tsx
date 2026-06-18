import UserManagementClient from '@/app/(hris)/hris/administration/user-management/UserManagementClient';

export default async function UserManagementSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  return <UserManagementClient section={section} />;
}
