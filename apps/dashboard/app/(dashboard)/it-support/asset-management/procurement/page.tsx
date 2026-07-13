import { RecordsSectionClient } from '../sections/RecordsSectionClient';

export const metadata = { title: 'Procurement | Asset Management' };

export default function ProcurementPage() {
  return <RecordsSectionClient title="Procurement" section="procurement" />;
}
