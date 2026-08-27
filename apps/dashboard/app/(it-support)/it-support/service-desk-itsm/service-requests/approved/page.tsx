import { ServiceRequestsWorkspace } from '../../_components/ServiceRequestsWorkspace';
export const metadata = { title: 'Approved Requests' };
export default function Page() {
  return <ServiceRequestsWorkspace mode="approved" title="Approved Requests" />;
}
