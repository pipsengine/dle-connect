import { ItsmEntityCrud } from '../../_components/ItsmEntityCrud';
export const metadata = { title: 'Categories' };
export default function Page() {
  return (
    <ItsmEntityCrud
      title="Categories"
      resource="settings"
      action="upsert-setting"
      idKey="settingId"
      query={{ settingType: 'category' }}
      createDefaults={{ settingType: 'category', isActive: true, sortOrder: 0 }}
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
