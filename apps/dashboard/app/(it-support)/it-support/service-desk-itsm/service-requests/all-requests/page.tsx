import { ServiceRequestsWorkspace } from '../../_components/ServiceRequestsWorkspace';
export const metadata = { title: 'All Service Requests' };
export default function Page() {
  return <ServiceRequestsWorkspace mode="all" title="All Service Requests" />;
}
