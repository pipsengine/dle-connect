import { ServiceRequestsWorkspace } from '../../_components/ServiceRequestsWorkspace';
export const metadata = { title: 'Fulfilled Requests' };
export default function Page() {
  return <ServiceRequestsWorkspace mode="fulfilled" title="Fulfilled Requests" />;
}
