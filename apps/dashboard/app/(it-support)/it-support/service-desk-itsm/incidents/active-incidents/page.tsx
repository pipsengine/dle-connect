import { IncidentsWorkspace } from '../../_components/IncidentsWorkspace';
export const metadata = { title: 'Active Incidents' };
export default function Page() {
  return <IncidentsWorkspace mode="active" title="Active Incidents" />;
}
