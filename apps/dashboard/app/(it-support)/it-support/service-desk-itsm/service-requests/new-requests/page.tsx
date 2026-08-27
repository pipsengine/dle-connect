import { ServiceRequestsWorkspace } from '../../_components/ServiceRequestsWorkspace';
export const metadata = { title: 'New Service Requests' };
export default function Page() {
  return <ServiceRequestsWorkspace mode="new" title="New Service Requests" />;
}
