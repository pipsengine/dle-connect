import { ProcEntityCrud } from '../_components/ProcEntityCrud';
export const metadata = { title: 'Procurement Settings' };
export default function Page() {
  return (
    <ProcEntityCrud
      title="Procurement Settings"
      description="Categories, evaluation methods, and approval matrix rows."
      resource="settings"
      action="upsert-setting"
      idKey="settingId"
      createDefaults={{ settingType: 'category', isActive: true, sortOrder: 0 }}
      fields={[
        { key: 'settingType', label: 'Type', type: 'select', options: ['category', 'evaluation-method', 'approval-matrix'] },
        { key: 'name', label: 'Name', required: true },
        { key: 'value', label: 'Value' },
        { key: 'payloadJson', label: 'Payload JSON', type: 'textarea' },
        { key: 'sortOrder', label: 'Sort order', type: 'number' },
        { key: 'isActive', label: 'Active', type: 'checkbox' },
      ]}
      columns={[
        { key: 'settingId', label: 'ID' },
        { key: 'settingType', label: 'Type' },
        { key: 'name', label: 'Name' },
        { key: 'value', label: 'Value' },
        { key: 'isActive', label: 'Active' },
      ]}
    />
  );
}
