import { ServiceRequestsWorkspace } from '../../_components/ServiceRequestsWorkspace';
export const metadata = { title: 'Cancelled Requests' };
export default function Page() {
  return <ServiceRequestsWorkspace mode="cancelled" title="Cancelled Requests" />;
}
