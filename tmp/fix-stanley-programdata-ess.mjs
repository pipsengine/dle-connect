import fs from 'node:fs';
import path from 'node:path';

const requestId = 'ess-1793702723383-j23tqa';
const now = new Date().toISOString();
const targets = [
  'C:\\ProgramData\\DLE-Connect\\hris\\ess-requests.json',
  'f:\\Dorman-Long\\dle-connect\\data\\hris\\ess-requests.json',
];

for (const target of targets) {
  if (!fs.existsSync(target)) {
    console.log('MISSING', target);
    continue;
  }
  try {
    fs.chmodSync(target, 0o666);
  } catch {
    /* ignore */
  }
  const requests = JSON.parse(fs.readFileSync(target, 'utf8'));
  if (!Array.isArray(requests)) {
    console.log('NOT_ARRAY', target);
    continue;
  }
  let changed = 0;
  const next = requests.map((item) => {
    if (item?.id !== requestId && String(item?.employeeId || '').toUpperCase() !== 'C2138') return item;
    const isLeave = /leave/i.test(String(item.category || ''));
    const open = !['Rejected', 'Cancelled', 'Terminated', 'Closed', 'Withdrawn'].includes(String(item.status || ''));
    if (!(item?.id === requestId || (isLeave && open))) return item;
    changed += 1;
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
  fs.writeFileSync(target, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  const verify = JSON.parse(fs.readFileSync(target, 'utf8')).find((x) => x.id === requestId);
  console.log(JSON.stringify({
    target,
    changed,
    status: verify?.status,
    updatedAt: verify?.updatedAt,
    mtime: fs.statSync(target).mtime,
  }, null, 2));
}
