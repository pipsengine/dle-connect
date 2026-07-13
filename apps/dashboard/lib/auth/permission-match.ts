const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

/** Roles allowed to see the global Administration centre in navigation. */
export const ADMINISTRATION_CENTRE_ROLES = new Set([
  'Super Administrator',
  'Admin',
  'System Administrator',
  'Application Administrator',
]);

export const canAccessAdministrationCentre = (input: {
  roles?: string[];
  isGlobalAdmin?: boolean;
}) => {
  if (input.isGlobalAdmin) return true;
  return (input.roles || []).some((role) => ADMINISTRATION_CENTRE_ROLES.has(role));
};

/** Map legacy/module permissions to page grants saved in Access Control Centre. */
const PERMISSION_ALIASES: Record<string, string[]> = {
  'operations.timesheets.submit': [
    'page.hris.time-and-logs.timesheet-entry.view',
    'timesheet.entry.view',
    'timesheet.submit',
    'timesheet.create',
    'timesheet.edit',
  ],
  'operations.timesheets.approve': [
    'page.hris.time-and-logs.timesheet-approval.view',
    'timesheet.approve',
  ],
  'operations.timesheets.view': [
    'page.hris.time-and-logs.timesheet-reports.view',
    'timesheet.view',
    'timesheet.export',
  ],
  'timesheet.period.manage': [
    'page.hris.time-and-logs.timesheet-period.view',
    'timesheet.period.view',
    'timesheet.period.configure',
  ],
  'admin.roles.view': ['page.admin.access-control.view'],
  'admin.users.view': ['page.admin.user-management.view'],
  'payroll.view': ['page.payroll.management.view', 'page.hris.payroll.salary-management.view'],
  'view_it_support': [
    'it.view',
    'it.*',
    'it.assets.view',
    'it.assets.*',
    'view_it_assets',
    'page.it-support.asset-management.view',
    'service-desk.view',
    'application-support.view',
    'infrastructure.view',
  ],
  'view_it_assets': [
    'page.it-support.asset-management.view',
    'it.assets.view',
    'it.assets.*',
    'it.view',
    'it.*',
  ],
  'view_itsm': ['it.view', 'it.create', 'it.submit', 'it.review', 'it.*', 'service-desk.view'],
  'it.view': ['page.it-support.asset-management.view', 'it.assets.view', 'view_it_assets', 'view_it_support'],
  'it.create': ['it.assets.create'],
  'it.edit': ['it.assets.edit'],
  'it.assets.view': ['page.it-support.asset-management.view', 'view_it_assets'],
  'application-support.view': ['view_it_support', 'it.view'],
  'service-desk.view': ['view_itsm', 'it.view'],
};

const reverseAliases = () => {
  const map = new Map<string, string[]>();
  for (const [canonical, aliases] of Object.entries(PERMISSION_ALIASES)) {
    for (const alias of aliases) {
      const existing = map.get(alias) || [];
      map.set(alias, unique([...existing, canonical]));
    }
  }
  return map;
};

const REVERSE_ALIASES = reverseAliases();

export const hasPermission = (permissions: string[], required: string) => {
  if (!required) return true;
  if (permissions.includes('*')) return true;
  if (permissions.includes(required)) return true;

  const [module] = required.split('.');
  if (module && permissions.includes(`${module}.*`)) return true;

  const aliases = PERMISSION_ALIASES[required] || [];
  if (aliases.some((alias) => permissions.includes(alias))) return true;

  for (const canonical of REVERSE_ALIASES.get(required) || []) {
    if (hasPermission(permissions, canonical)) return true;
  }

  if (required.startsWith('page.')) {
    const parts = required.split('.');
    parts.pop();
    const pagePrefix = parts.join('.');
    if (permissions.some((permission) => permission.startsWith(`${pagePrefix}.`) || permission === pagePrefix)) {
      return true;
    }
  }

  if (required === 'payroll.view') {
    return permissions.some((permission) =>
      permission === 'page.payroll.management.view'
      || permission === 'page.payroll.management.bank-finance.view'
      || permission.startsWith('page.payroll.management.')
      || permission.startsWith('page.hris.payroll.'),
    );
  }

  return false;
};

export const hasAnyPermission = (permissions: string[], required: string[]) =>
  required.some((permission) => hasPermission(permissions, permission));

const IT_PERMISSION_PREFIXES = ['it', 'it.assets', 'service-desk', 'application-support', 'infrastructure', 'page.it-support'];

/** Add navigation/page keys when publishing module permissions so menus and routes work immediately. */
export const expandPublishedPermissions = (permissions: string[]) => {
  const out = new Set(permissions.filter(Boolean));
  const list = Array.from(out);

  if (list.some((permission) => IT_PERMISSION_PREFIXES.some((prefix) => permission === prefix || permission.startsWith(`${prefix}.`)))) {
    out.add('view_it_support');
    out.add('view_it_assets');
    out.add('page.it-support.asset-management.view');
  }
  if (list.some((permission) => permission.startsWith('admin.roles'))) out.add('page.admin.access-control.view');
  if (list.some((permission) => permission.startsWith('admin.users'))) out.add('page.admin.user-management.view');
  if (list.some((permission) => permission.startsWith('hris.') || permission.startsWith('employees.'))) out.add('hris.view');
  if (list.some((permission) => permission.startsWith('payroll.') || permission.startsWith('page.payroll.'))) out.add('payroll.view');

  return Array.from(out);
};
