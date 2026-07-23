import { SoftwareSectionClient } from '../../sections/SoftwareSectionClient';

const sectionMap: Record<string, { title: string; section: 'licenses' | 'software' | 'software-catalog' | 'installed-software' | 'license-compliance' | 'software-requests' }> = {
  licenses: { title: 'Software Licenses', section: 'licenses' },
  'software-catalog': { title: 'Software Catalog', section: 'software-catalog' },
  'installed-software': { title: 'Installed Software', section: 'installed-software' },
  'license-compliance': { title: 'License Compliance', section: 'license-compliance' },
  'software-requests': { title: 'Software Requests', section: 'software-requests' },
};

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  return { title: `${sectionMap[section]?.title || 'Software'} | Asset Management` };
}

export default async function SoftwareSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const config = sectionMap[section] || { title: 'Software Licenses', section: 'software' as const };
  return <SoftwareSectionClient title={config.title} section={config.section} />;
}
