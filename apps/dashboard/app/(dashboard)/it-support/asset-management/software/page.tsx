import { SoftwareSectionClient } from '../sections/SoftwareSectionClient';

export const metadata = { title: 'Software | Asset Management' };

export default function SoftwarePage() {
  return <SoftwareSectionClient title="Software Licenses" section="software" />;
}
