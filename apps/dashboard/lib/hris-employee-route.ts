const compact = (value: unknown) => String(value || '').trim();

export const HRIS_EMPLOYEE_ID_PLACEHOLDER = '_eid';

export const HRIS_EMPLOYEE_RESOURCE_ROOTS = new Set([
  'profile',
  'overview',
  'personal-info',
  'employment',
  'job',
  'contacts',
  'emergency-contacts',
  'next-of-kin',
  'documents',
  'timeline',
  'leave-summary',
  'attendance-summary',
  'payroll-summary',
  'performance-summary',
  'training',
  'assets',
  'history',
  'employment-history',
  'job-information',
  'job-history',
  'job-ai-insights',
  'department-unit-assignment',
  'assignment-history',
  'reporting-line',
  'reporting-history',
  'org-chart',
  'approval-chains',
  'contracts',
  'audit-trail',
  'ai-insights',
  'status-history',
  'status',
  'payroll',
  'profile-extensions',
  'job-change-request',
  'reporting-change-request',
  'status-change-request',
  'assignment-request',
  'photo',
  'medical',
  'medical-hse',
  'disciplinary',
]);

const decodeSegment = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const hrisEmployeeProfileHref = (employeeId: string, query?: Record<string, string | undefined>) => {
  const path = `/hris/employees/employee-profile/${compact(employeeId).split('/').filter(Boolean).map(encodeURIComponent).join('/')}`;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query || {})) {
    if (value) params.set(key, value);
  }
  const suffix = params.toString();
  return suffix ? `${path}?${suffix}` : path;
};

export const hrisEmployeeResourceUrl = (employeeId: string, resource: string) => {
  const params = new URLSearchParams({ employeeId: compact(employeeId) });
  return `/api/hris/employees/${HRIS_EMPLOYEE_ID_PLACEHOLDER}/${resource}?${params.toString()}`;
};

export const resolveHrisEmployeeRoute = (
  request: Request | { url?: string; headers?: Headers },
  pathId: string,
  resourceSegments: string[] = [],
) => {
  const url = compact(request.url);
  const queryId = url
    ? compact(new URL(url, 'http://localhost').searchParams.get('employeeId'))
    : '';
  const headerId = compact(
    typeof request.headers?.get === 'function'
      ? request.headers.get('x-hris-target-employee-id')
      : '',
  );
  const explicitId = queryId || headerId;
  if (explicitId) {
    return { employeeId: decodeSegment(explicitId), resource: resourceSegments };
  }

  const resourceIndex = resourceSegments.findIndex((segment) => HRIS_EMPLOYEE_RESOURCE_ROOTS.has(segment));
  if (resourceIndex > 0) {
    return {
      employeeId: [pathId, ...resourceSegments.slice(0, resourceIndex)].map(decodeSegment).join('/'),
      resource: resourceSegments.slice(resourceIndex),
    };
  }

  return {
    employeeId: decodeSegment(compact(pathId)),
    resource: resourceSegments,
  };
};

export const joinEmployeeIdParam = (employeeId: string | string[] | undefined) =>
  (Array.isArray(employeeId) ? employeeId : [employeeId || ''])
    .map((segment) => decodeSegment(compact(segment)))
    .filter(Boolean)
    .join('/');
