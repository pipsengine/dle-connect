import { ItsmEntityCrud } from '../../_components/ItsmEntityCrud';
export const metadata = { title: 'Notification Rules' };
export default function Page() {
  return (
    <ItsmEntityCrud
      title="Notification Rules"
      resource="automation"
      action="upsert-automation"
      idKey="ruleId"
      query={{ ruleType: 'notification' }}
      createDefaults={{ ruleType: 'notification', isEnabled: true, configJson: '{}' }}
      fields={[
        { key: 'name', label: 'Rule name', required: true },
        { key: 'ruleType', label: 'Type', type: 'select', options: ['workflow', 'assignment', 'escalation', 'notification', 'scheduled'] },
        { key: 'configJson', label: 'Config JSON', type: 'textarea' },
        { key: 'isEnabled', label: 'Enabled', type: 'checkbox' },
      ]}
      columns={[
        { key: 'ruleId', label: 'ID' },
        { key: 'name', label: 'Name' },
        { key: 'ruleType', label: 'Type' },
        { key: 'isEnabled', label: 'Enabled' },
        { key: 'updatedAt', label: 'Updated' },
      ]}
    />
  );
}
