import { PeModulePage } from '@/components/projects-engineering/PeModulePage';
import { getPeModule } from '@/lib/projects-engineering/module-catalog';
import { notFound } from 'next/navigation';

export default function Page() {
  const module = getPeModule('ai');
  if (!module) notFound();
  return <PeModulePage module={module} />;
}
