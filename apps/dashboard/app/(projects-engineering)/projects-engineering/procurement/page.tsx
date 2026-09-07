import { PeModulePage } from '@/components/projects-engineering/PeModulePage';
import { getPeModule } from '@/lib/projects-engineering/module-catalog';
import { notFound } from 'next/navigation';

export default function Page() {
  const module = getPeModule('procurement');
  if (!module) notFound();
  return <PeModulePage module={module} />;
}
