import { RecordsSectionClient } from '../sections/RecordsSectionClient';

export const metadata = { title: 'Vendors | Asset Management' };

export default function VendorsPage() {
  return <RecordsSectionClient title="Vendors" section="vendors" />;
}
