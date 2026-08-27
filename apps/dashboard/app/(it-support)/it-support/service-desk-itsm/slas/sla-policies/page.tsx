import { ItsmEntityCrud } from '../../_components/ItsmEntityCrud';
export const metadata = { title: 'SLA Policies' };
export default function Page() {
  return (
    <ItsmEntityCrud
      title="SLA Policies"
      resource="sla-policies"
      action="upsert-sla-policy"
      idKey="policyId"
      createDefaults={{ priority: 'Medium', responseMinutes: 120, resolveMinutes: 480, isActive: true }}
      fields={[
        { key: 'name', label: 'Policy name', required: true },
        { key: 'priority', label: 'Priority', type: 'select', options: ['Critical', 'High', 'Medium', 'Low'] },
        { key: 'responseMinutes', label: 'Response minutes', type: 'number', required: true },
        { key: 'resolveMinutes', label: 'Resolve minutes', type: 'number', required: true },
        { key: 'isActive', label: 'Active', type: 'checkbox' },
      ]}
      columns={[
        { key: 'policyId', label: 'ID' },
        { key: 'name', label: 'Name' },
        { key: 'priority', label: 'Priority' },
        { key: 'responseMinutes', label: 'Response' },
        { key: 'resolveMinutes', label: 'Resolve' },
        { key: 'updatedAt', label: 'Updated' },
      ]}
    />
  );
}
