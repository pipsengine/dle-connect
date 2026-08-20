export type PayrollRunComment = {
  commentId: string;
  period: string;
  actorCode: string;
  actorName: string;
  body: string;
  createdAt: string;
};

export const normalizePayrollCommentPeriod = (value: unknown) => {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})/);
  if (!match) return '';
  return `${match[1]}-${match[2]}`;
};
