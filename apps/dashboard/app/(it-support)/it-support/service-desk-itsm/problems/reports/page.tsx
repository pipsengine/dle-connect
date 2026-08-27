import { ReportsWorkspace } from '../../_components/ReportsWorkspace';
export const metadata = { title: 'Problem Reports' };
export default function Page() {
  return <ReportsWorkspace mode="incident" title="Problem / Incident Reports" />;
}
