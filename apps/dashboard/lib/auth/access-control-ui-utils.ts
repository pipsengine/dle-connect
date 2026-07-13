type PermissionNodeLike = {
  module: string;
  permissionPrefix: string;
};

export const MODULE_OPERATION_ACTIONS = ['view', 'create', 'edit', 'submit', 'review'] as const;

type AssignmentLike = {
  subjectType: 'role' | 'user';
  subjectId: string;
  permissions: string[];
  status?: string;
};

export const resolveDisplayedPermissions = (input: {
  subjectType: 'role' | 'user';
  subjectId: string;
  roleBaseline?: string[];
  userPermissions?: string[];
  drafts: AssignmentLike[];
  published: AssignmentLike[];
}) => {
  const key = `${input.subjectType}:${input.subjectId}`;
  const draft = input.drafts.find((item) => `${item.subjectType}:${item.subjectId}` === key);
  const published = input.published.find((item) => `${item.subjectType}:${item.subjectId}` === key);
  const extra = draft?.permissions?.length ? draft.permissions : (published?.permissions || []);
  const baseline = input.subjectType === 'role' ? (input.roleBaseline || []) : (input.userPermissions || []);
  return Array.from(new Set([...baseline, ...extra]));
};

export const moduleOperationPermissions = (
  catalog: PermissionNodeLike[],
  actions: readonly string[],
  moduleName: string,
) => {
  const nodes = catalog.filter((node) => node.module === moduleName);
  const picked = new Set<string>();
  nodes.forEach((node) => {
    MODULE_OPERATION_ACTIONS.forEach((action) => {
      if (actions.includes(action)) picked.add(`${node.permissionPrefix}.${action}`);
    });
  });
  return Array.from(picked);
};

export const isProtectedAccessSubject = (subjectType: 'role' | 'user', subjectId: string) =>
  (subjectType === 'role' && subjectId === 'Super Administrator')
  || (subjectType === 'user' && ['global-admin', 'Admin'].includes(subjectId));
