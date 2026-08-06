const compact = (value: unknown) => String(value ?? '').trim();

/** Document / PDF action history shows submission, resubmission and approvals. */
export const isDocumentVisiblePaymentAction = (action: { actionType?: string | null }) => {
  const type = compact(action.actionType).toLowerCase();
  return type === 'submitted' || type === 'resubmitted' || type === 'approve' || type === 'approved';
};

export const filterDocumentPaymentActions = <T extends { actionType?: string | null }>(actions: T[]) =>
  actions.filter(isDocumentVisiblePaymentAction);
