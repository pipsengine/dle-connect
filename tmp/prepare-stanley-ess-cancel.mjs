import fs from 'node:fs';

const src = 'C:\\ProgramData\\DLE-Connect\\hris\\ess-requests.json';
const dest = 'C:\\ProgramData\\DLE-Connect\\hris\\ess-requests.json.tmp-stanley-cancel';
const requestId = 'ess-1793702723383-j23tqa';
const now = new Date().toISOString();

const requests = JSON.parse(fs.readFileSync(src, 'utf8'));
const next = requests.map((item) => {
  if (item?.id !== requestId) return item;
  return {
    ...item,
    status: 'Rejected',
    updatedAt: now,
    comments: [
      ...(Array.isArray(item.comments) ? item.comments : []),
      {
        at: now,
        actor: 'Leave Admin Cleanup',
        comment: 'Forced close of stale ESS leave copy so Stanley C2138 can re-apply.',
      },
    ],
  };
});
fs.writeFileSync(dest, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
const row = next.find((item) => item.id === requestId);
console.log(JSON.stringify({
  dest,
  count: next.length,
  status: row?.status,
  updatedAt: row?.updatedAt,
  employeeId: row?.employeeId,
}, null, 2));
