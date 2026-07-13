import { HardwareSectionClient } from '../../sections/HardwareSectionClient';

const titles: Record<string, string> = {
  laptops: 'Laptops',
  computers: 'Computers',
  servers: 'Servers',
  routers: 'Routers',
  switches: 'Switches',
  firewalls: 'Firewalls',
  storage: 'Storage',
  printers: 'Printers',
  'mobile-devices': 'Mobile Devices',
  'other-devices': 'Other Devices',
};

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  return { title: `${titles[category] || 'Hardware'} | Asset Management` };
}

export default async function HardwareCategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  return <HardwareSectionClient title={titles[category] || 'Hardware'} categorySlug={category} />;
}
