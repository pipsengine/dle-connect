import fs from 'node:fs';
import path from 'node:path';

import { assignEmployeesToSupervisor } from '../apps/dashboard/lib/supervisor-assignment-store';

const loadWorkspaceEnv = () => {
  for (const file of [path.resolve('.env'), path.join(process.cwd(), 'apps', 'dashboard', '.env')]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[match[1]]) process.env[match[1]] = value;
    }
  }
};

loadWorkspaceEnv();

const DRIVER_SUPERVISOR = 'L2770';
const SECURITY_SUPERVISOR = 'P0272';

const DRIVER_CODES = [
  'L0297', 'L1090', 'L1369', 'L1618', 'L1963', 'L2125', 'L2142', 'L2191',
  'L2214', 'L2216', 'L2254', 'L2331', 'L2336', 'L2374', 'L2775', 'L2777',
  'L2779', 'P0309',
];

const SECURITY_CODES = ['L0263', 'L0862', 'L1714', 'L1986'];

const main = async () => {
  const drivers = await assignEmployeesToSupervisor({
    supervisorEmployeeCode: DRIVER_SUPERVISOR,
    employeeCodes: DRIVER_CODES,
    assignmentGroup: 'ADMINSTRATION Drivers',
    reason: 'Administration drivers reporting line — supervisor L2770 per HR direction.',
    performedBy: 'scripts/apply-administration-reporting-lines.mts',
    sourceRows: DRIVER_CODES.map((employeeCode) => ({
      employeeCode,
      matchConfidence: 'AdministrationDriverRule',
      matchNote: 'Driver/transport staff under ADMINSTRATION assigned to L2770.',
    })),
  });

  const security = await assignEmployeesToSupervisor({
    supervisorEmployeeCode: SECURITY_SUPERVISOR,
    employeeCodes: SECURITY_CODES,
    assignmentGroup: 'ADMINSTRATION Security',
    reason: 'Administration security reporting line — supervisor P0272 per HR direction.',
    performedBy: 'scripts/apply-administration-reporting-lines.mts',
    sourceRows: SECURITY_CODES.map((employeeCode) => ({
      employeeCode,
      matchConfidence: 'AdministrationSecurityRule',
      matchNote: 'Security staff under ADMINSTRATION assigned to P0272.',
    })),
  });

  console.log(JSON.stringify({
    drivers: {
      batch: drivers.assignmentBatch,
      supervisor: DRIVER_SUPERVISOR,
      employees: DRIVER_CODES.length,
    },
    security: {
      batch: security.assignmentBatch,
      supervisor: SECURITY_SUPERVISOR,
      employees: SECURITY_CODES.length,
    },
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
