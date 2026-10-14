const today = Date.UTC(2026, 9, 14);
const daysUntil = (value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Math.round((Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()) - today) / 86400000);
};
const rows = [
  { ref: 'DLE-T-2026-001', status: 'Draft', prep: 'Not Started', internal: '2026-10-20', external: '2026-10-21', owner: '', client: 'Pending', award: 'Pending Decision' },
  { ref: 'DLE-T-2026-002', status: 'Open', prep: 'In Progress', internal: '2026-10-14', external: '2026-10-15', owner: '', client: 'Pending', award: 'Pending Decision' },
];
const tally = (list) => ({
  notStarted: list.filter((row) => row.prep === 'Not Started').length,
  inProgress: list.filter((row) => row.prep === 'In Progress').length,
  submitted: list.filter((row) => row.prep === 'Submitted').length,
});
const deadlineRows = rows.map((row) => {
  const internalDays = daysUntil(row.internal);
  const externalDays = daysUntil(row.external);
  const nearest = [internalDays, externalDays].sort((a, b) => a - b)[0];
  return { ...row, internalDays, externalDays, nearest };
});
const internalDue = deadlineRows.filter((item) => item.internalDays <= 3);
const externalDue = deadlineRows.filter((item) => item.externalDays <= 7);
console.log(JSON.stringify({
  enquiries: 0,
  tenderPrep: tally(rows),
  unassignedTenders: rows.filter((row) => !row.owner).length,
  internalDue: internalDue.length,
  internalSoon: internalDue.filter((item) => item.internalDays >= 0).length,
  internalOverdue: internalDue.filter((item) => item.internalDays < 0).length,
  externalDue: externalDue.length,
  externalSoon: externalDue.filter((item) => item.externalDays >= 0).length,
  externalOverdue: externalDue.filter((item) => item.externalDays < 0).length,
  upcoming: deadlineRows.filter((item) => item.nearest >= 0).map((item) => `${item.ref} ${item.nearest}`),
  past: deadlineRows.filter((item) => item.nearest < 0).map((item) => item.ref),
  submittedBids: 0,
  awarded: 0,
  pendingDecision: 0,
  clientPending: 2,
  winRate: '0 (0%)',
}, null, 2));
