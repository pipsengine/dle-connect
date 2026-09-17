import { DomainWorkspace } from '../_components/DomainWorkspace';
import { domainById } from '@/lib/procurement/catalog';

const domain = domainById('receiving')!;
export const metadata = { title: domain.title };
export default function Page() {
  return <DomainWorkspace domain={domain} />;
}
