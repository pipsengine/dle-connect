import { IncidentsWorkspace } from '../../_components/IncidentsWorkspace';
export const metadata = { title: 'Major Incidents' };
export default function Page() {
  return <IncidentsWorkspace mode="major" title="Major Incidents" />;
}
