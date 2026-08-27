import { ItsmEntityCrud } from '../../_components/ItsmEntityCrud';
export const metadata = { title: 'Business Hours' };
export default function Page() {
  return (
    <ItsmEntityCrud
      title="Business Hours"
      resource="settings"
      action="upsert-setting"
      idKey="settingId"
      query={{ settingType: 'business-hours' }}
      createDefaults={{ settingType: 'business-hours', isActive: true, sortOrder: 0 }}
      fields={[
        { key: 'name', label: 'Name', required: true },
        { key: 'value', label: 'Value' },
        { key: 'payloadJson', label: 'Payload JSON', type: 'textarea' },
        { key: 'sortOrder', label: 'Sort order', type: 'number' },
        { key: 'isActive', label: 'Active', type: 'checkbox' },
      ]}
      columns={[
        { key: 'settingId', label: 'ID' },
        { key: 'name', label: 'Name' },
        { key: 'value', label: 'Value' },
        { key: 'sortOrder', label: 'Sort' },
        { key: 'isActive', label: 'Active' },
        { key: 'updatedAt', label: 'Updated' },
      ]}
    />
  );
}
