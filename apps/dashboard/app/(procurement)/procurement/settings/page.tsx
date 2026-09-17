import { ProcEntityCrud } from '../_components/ProcEntityCrud';

export const metadata = { title: 'Procurement Configuration' };

export default function Page() {
  return (
    <ProcEntityCrud
      title="Procurement Configuration"
      description="Categories, evaluation methods, approval matrices, thresholds and controlled lists."
      resource="settings"
      action="upsert-setting"
      idKey="settingId"
      createDefaults={{ settingType: 'category', isActive: true, sortOrder: 0 }}
      fields={[
        { key: 'settingType', label: 'Configuration type', type: 'select', options: ['category', 'evaluation-method', 'approval-matrix', 'threshold', 'incoterm', 'uom'] },
        { key: 'name', label: 'Name', required: true },
        { key: 'value', label: 'Value / threshold' },
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
