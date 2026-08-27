import { ItsmEntityCrud } from '../../_components/ItsmEntityCrud';
export const metadata = { title: 'Surveys' };
export default function Page() {
  return (
    <ItsmEntityCrud
      title="Surveys"
      resource="feedback"
      action="upsert-feedback"
      idKey="feedbackId"
      query={{ feedbackType: 'survey' }}
      createDefaults={{ feedbackType: 'survey', rating: 5 }}
      fields={[
        { key: 'title', label: 'Title', required: true },
        { key: 'body', label: 'Details', type: 'textarea' },
        { key: 'rating', label: 'Rating (1-5)', type: 'number' },
        { key: 'ticketId', label: 'Related ticket' },
        { key: 'authorName', label: 'Author' },
      ]}
      columns={[
        { key: 'feedbackId', label: 'ID' },
        { key: 'title', label: 'Title' },
        { key: 'rating', label: 'Rating' },
        { key: 'ticketId', label: 'Ticket' },
        { key: 'authorName', label: 'Author' },
        { key: 'createdAt', label: 'Created' },
      ]}
    />
  );
}
