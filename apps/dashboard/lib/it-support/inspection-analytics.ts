import type { EWasteRecord, ImsAction, InspectionChecklistItem, InspectionRecord, ImsLocation } from '@/lib/it-support/inspection-types';

const today = () => new Date().toISOString().slice(0, 10);

export const isActionOverdue = (action: ImsAction) =>
  action.status !== 'Closed' && Boolean(action.dueDate && action.dueDate < today());

export const actionBucket = (action: ImsAction) => (isActionOverdue(action) ? 'Overdue' : action.status);

export const carAging = (actions: ImsAction[]) => {
  const buckets = { 'Not Due': 0, '0-7': 0, '8-14': 0, '15-30': 0, '30+': 0 };
  const now = Date.now();
  for (const action of actions) {
    if (action.status === 'Closed' || !action.dueDate) {
      buckets['Not Due'] += action.status === 'Closed' ? 0 : 1;
      continue;
    }
    const days = Math.floor((now - new Date(`${action.dueDate}T00:00:00Z`).getTime()) / 86400000);
    if (days < 0) buckets['Not Due'] += 1;
    else if (days <= 7) buckets['0-7'] += 1;
    else if (days <= 14) buckets['8-14'] += 1;
    else if (days <= 30) buckets['15-30'] += 1;
    else buckets['30+'] += 1;
  }
  return Object.entries(buckets).map(([name, value]) => ({ name, value }));
};

export const monthlyCompliance = (inspections: InspectionRecord[]) => {
  const points: Array<{ month: string; compliance: number }> = [];
  const cursor = new Date();
  cursor.setUTCDate(1);
  for (let index = 5; index >= 0; index -= 1) {
    const month = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - index, 1));
    const key = month.toISOString().slice(0, 7);
    const items = inspections
      .filter((row) => (row.completedDate || row.scheduledDate || '').startsWith(key))
      .flatMap((row) => row.checklist);
    const compliant = items.filter((item) => item.status === 'Compliant').length;
    points.push({
      month: month.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' }),
      compliance: items.length ? Math.round((compliant / items.length) * 100) : 0,
    });
  }
  return points;
};

export const highRisks = (inspections: InspectionRecord[]) =>
  inspections.flatMap((row) =>
    row.checklist
      .filter((item) => item.status === 'Non-Compliant' && (item.risk === 'High' || item.risk === 'Critical'))
      .map((item) => ({ inspection: row, item })),
  );

export const riskByLocation = (inspections: InspectionRecord[], locations: ImsLocation[]) =>
  locations.map((location) => ({
    name: location.name,
    value: inspections
      .filter((row) => row.locationId === location.locationId || row.location === location.name)
      .flatMap((row) => row.checklist)
      .filter((item: InspectionChecklistItem) => item.risk === 'High' || item.risk === 'Critical').length,
  }));

export const ewasteRate = (rows: EWasteRecord[]) => {
  if (!rows.length) return 0;
  return Math.round((rows.filter((row) => row.approvalStatus === 'Completed').length / rows.length) * 100);
};
