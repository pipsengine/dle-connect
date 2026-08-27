import { ItsmEntityCrud } from '../../_components/ItsmEntityCrud';
export const metadata = { title: 'Escalations' };
export default function Page() {
  return (
    <ItsmEntityCrud
      title="Escalations"
      resource="escalations"
      action="upsert-escalation"
      idKey="escalationId"
      createDefaults={{ triggerType: 'SLA Breach', status: 'Active' }}
      fields={[
        { key: 'name', label: 'Name', required: true },
        { key: 'triggerType', label: 'Trigger', type: 'select', options: ['SLA Breach', 'Priority', 'Manual', 'Age'] },
        { key: 'target', label: 'Escalate to' },
        { key: 'linkedTicketId', label: 'Ticket ID' },
        { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Cleared', 'Pending'] },
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ]}
      columns={[
        { key: 'escalationId', label: 'ID' },
        { key: 'name', label: 'Name' },
        { key: 'triggerType', label: 'Trigger' },
        { key: 'target', label: 'Target' },
        { key: 'linkedTicketId', label: 'Ticket' },
        { key: 'status', label: 'Status' },
        { key: 'createdAt', label: 'Created' },
      ]}
    />
  );
}
