import { ServiceRequestsWorkspace } from '../../_components/ServiceRequestsWorkspace';
export const metadata = { title: 'Rejected Requests' };
export default function Page() {
  return <ServiceRequestsWorkspace mode="rejected" title="Rejected Requests" />;
}
