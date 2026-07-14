'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileDown,
  Filter,
  GitCompare,
  History,
  Layers,
  Save,
  Search,
  ShieldCheck,
  UserCog,
} from 'lucide-react';
import { downloadExcelFile } from '@/lib/excel-export';
import {
  isProtectedAccessSubject,
  moduleOperationPermissions,
  resolveDisplayedPermissions,
} from '@/lib/auth/access-control-ui-utils';
import { expandPublishedPermissions } from '@/lib/auth/permission-match';
import { PLATFORM_ROLES_WITHOUT_HRIS, PLATFORM_WITHOUT_HRIS_PERMISSIONS, stripHrisPermissions } from '@/lib/auth/platform-access';
import {
  canActorGrantPermission,
  canActorModifyRole,
  filterAssignableRoles,
  isSuperActor,
} from '@/lib/auth/role-delegation';

type AccessAction =
  | 'view'
  | 'create'
  | 'edit'
  | 'delete'
  | 'submit'
  | 'review'
  | 'approve'
  | 'reject'
  | 'return'
  | 'process'
  | 'post'
  | 'release'
  | 'publish'
  | 'lock'
  | 'unlock'
  | 'reopen'
  | 'export'
  | 'import'
  | 'print'
  | 'upload'
  | 'download'
  | 'configure'
  | 'audit'
  | 'enable'
  | 'disable'
  | 'assign'
  | 'delegate'
  | 'escalate'
  | 'override'
  | 'mask'
  | 'unmask'
  | 'sync'
  | 'schedule'
  | 'notify'
  | 'impersonate';
type PermissionNode = {
  module: string;
  subModule: string;
  feature: string;
  functionName: string;
  category: string;
  approvalLevel: string;
  dataScope: string;
  permissionPrefix: string;
  protected?: boolean;
};
type RoleDef = { name: string; category: string; permissions: string[]; description: string };
type UserAccount = {
  id: string;
  username: string;
  employeeCode?: string;
  fullName: string;
  roles: string[];
  permissions: string[];
  department: string;
  jobTitle?: string;
  status: string;
};
type Assignment = { subjectType: 'role' | 'user'; subjectId: string; permissions: string[]; dataScope: string; approvalLevel: string; status: string; reason: string; updatedAt: string; updatedBy: string };
type Template = { id: string; name: string; description: string; permissions: string[]; dataScope: string; approvalLevel: string };
type AuditRecord = { id: string; modifiedBy: string; modifiedAt: string; roleOrUserAffected: string; permissionChanged: string; oldValue: string; newValue: string; reason: string; ipAddress: string; device: string };
type SubjectOption = { id: string; label: string; permissions: string[]; meta: string };

const dataScopes = ['Own', 'Team', 'Department', 'Location', 'Company', 'Global'];
const approvalLevels = ['L1 - User', 'L2 - Manager', 'L2 - HR Admin', 'L2 - Project Manager', 'L3 - Approver', 'L3 - Payroll Approver', 'L3 - Finance Approver', 'L3 - Super Admin'];
const riskyActions = new Set(['delete', 'disable', 'assign', 'override', 'approve', 'post', 'release', 'lock', 'unlock', 'reopen', 'unmask', 'sync', 'delegate', 'escalate', 'impersonate']);

const permissionOf = (node: PermissionNode, action: string) => `${node.permissionPrefix}.${action}`;

const parseJsonResponse = async (res: Response, label: string) => {
  const text = await res.text();
  if (!text.trim()) throw new Error(`${label} returned an empty response (${res.status}). Check enterprise database connectivity and server logs.`);
  try {
    return JSON.parse(text) as Record<string, any>;
  } catch {
    throw new Error(`${label} returned invalid JSON (${res.status}).`);
  }
};

export default function RolesPermissionsClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [catalog, setCatalog] = useState<PermissionNode[]>([]);
  const [actions, setActions] = useState<AccessAction[]>([]);
  const [roles, setRoles] = useState<RoleDef[]>([]);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [published, setPublished] = useState<Assignment[]>([]);
  const [drafts, setDrafts] = useState<Assignment[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [audit, setAudit] = useState<AuditRecord[]>([]);
  const [subjectType, setSubjectType] = useState<'role' | 'user'>('role');
  const [subjectId, setSubjectId] = useState('Admin');
  const [query, setQuery] = useState('');
  const [subjectSearch, setSubjectSearch] = useState('');
  const [subjectPickerOpen, setSubjectPickerOpen] = useState(false);
  const subjectPickerRef = useRef<HTMLDivElement | null>(null);
  const [moduleFilter, setModuleFilter] = useState('All');
  const [permissionFilter, setPermissionFilter] = useState('All');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dataScope, setDataScope] = useState('Company');
  const [approvalLevel, setApprovalLevel] = useState('L1 - User');
  const [reason, setReason] = useState('');
  const [requireApproval, setRequireApproval] = useState(false);
  const [cloneSource, setCloneSource] = useState('');
  const [compareLeft, setCompareLeft] = useState('');
  const [compareRight, setCompareRight] = useState('');
  const [comparison, setComparison] = useState<{ leftOnly: string[]; rightOnly: string[]; shared: string[] } | null>(null);
  const [selectedUserRoles, setSelectedUserRoles] = useState<string[]>([]);
  const [roleQuery, setRoleQuery] = useState('');
  const [savingRoles, setSavingRoles] = useState(false);
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);
  const [actorRoles, setActorRoles] = useState<string[]>([]);
  const [actorPermissions, setActorPermissions] = useState<string[]>([]);
  const [actorCanWrite, setActorCanWrite] = useState(false);
  const [actorSub, setActorSub] = useState('');
  const hydratedSubjectKey = useRef('');

  const superActor = isSuperActor({
    sub: actorSub,
    roles: actorRoles,
    permissions: actorPermissions,
    isGlobalAdmin,
  });
  const canWrite = superActor || actorCanWrite;
  const subjectIsProtected = isProtectedAccessSubject(subjectType, subjectId);

  const displayedPermissionsFor = (type: 'role' | 'user', id: string) => {
    const role = roles.find((item) => item.name === id);
    const user = users.find((item) => item.id === id);
    return resolveDisplayedPermissions({
      subjectType: type,
      subjectId: id,
      roleBaseline: role?.permissions,
      userPermissions: user?.permissions,
      drafts,
      published,
    });
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [res, currentUserRes] = await Promise.all([
        fetch('/api/admin/access-control', { cache: 'no-store' }),
        fetch('/api/current-user?context=enterprise', { cache: 'no-store' }),
      ]);
      const json = await parseJsonResponse(res, 'Access Control API');
      const currentUserJson = currentUserRes.ok ? await parseJsonResponse(currentUserRes, 'Current user API').catch(() => null) : null;
      if (!res.ok) throw new Error(json.error || 'Unable to load access control data.');
      setCatalog(json.data.catalog || []);
      setActions(json.data.actions || []);
      setRoles(json.data.roles || []);
      setUsers(json.data.users || []);
      setPublished(json.data.published || []);
      setDrafts(json.data.drafts || []);
      setTemplates(json.data.templates || []);
      setAudit(json.data.audit || []);
      setCloneSource(json.data.roles?.[0]?.name || '');
      setCompareLeft(json.data.roles?.[0]?.name || '');
      setCompareRight(json.data.roles?.[1]?.name || '');
      setIsGlobalAdmin(
        Boolean(json.data.actor?.isGlobalAdmin)
        || currentUserJson?.data?.source === 'application-level-global-admin'
        || currentUserJson?.data?.employeeCode === 'Admin',
      );
      setActorSub(json.data.actor?.sub || '');
      setActorRoles(json.data.actor?.roles || currentUserJson?.data?.roles || []);
      setActorPermissions(json.data.actor?.permissions || []);
      setActorCanWrite(Boolean(json.data.actor?.canWrite));
      hydratedSubjectKey.current = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load access control data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  const subjects: SubjectOption[] = subjectType === 'role'
    ? roles
      .filter((role) => superActor || canActorModifyRole(actorRoles, role.name, isGlobalAdmin))
      .map((role) => ({ id: role.name, label: role.name, permissions: role.permissions, meta: role.category }))
    : users.map((user) => ({
      id: user.id,
      label: `${user.fullName} (${user.employeeCode || user.username})`,
      permissions: user.permissions,
      meta: `${user.department || 'No department'} - ${user.jobTitle || user.status}`,
    }));

  const activeUser = users.find((user) => user.id === subjectId);
  const assignableRoles = useMemo(
    () => filterAssignableRoles(roles, actorRoles, superActor || isGlobalAdmin),
    [roles, actorRoles, superActor, isGlobalAdmin],
  );
  const canGrantPermission = (permission: string) =>
    superActor || actorPermissions.includes('*') || canActorGrantPermission(actorPermissions, permission);
  const filteredAssignableRoles = useMemo(() => {
    const q = roleQuery.trim().toLowerCase();
    if (!q) return assignableRoles;
    return assignableRoles.filter((role) => [role.name, role.category, role.description].some((value) => value.toLowerCase().includes(q)));
  }, [assignableRoles, roleQuery]);

  const subject = subjects.find((item) => item.id === subjectId);
  const filteredSubjects = useMemo(() => {
    const q = subjectSearch.trim().toLowerCase();
    if (!q) return subjects;
    return subjects.filter((item) => [item.label, item.meta, item.id].some((value) => value.toLowerCase().includes(q)));
  }, [subjectSearch, subjects]);

  useEffect(() => {
    if (loading) return;
    const key = `${subjectType}:${subjectId}`;
    if (!subjectId || hydratedSubjectKey.current === key) return;
    hydratedSubjectKey.current = key;
    const assignment = [...drafts, ...published].find((item) => item.subjectType === subjectType && item.subjectId === subjectId);
    setSelected(new Set(displayedPermissionsFor(subjectType, subjectId)));
    setDataScope(assignment?.dataScope || 'Company');
    setApprovalLevel(assignment?.approvalLevel || 'L1 - User');
    setReason(assignment?.reason || '');
    if (subjectType === 'user') {
      const user = users.find((item) => item.id === subjectId);
      setSelectedUserRoles(user?.roles || []);
    } else {
      setSelectedUserRoles([]);
    }
  }, [loading, subjectType, subjectId, roles, users, drafts, published]);

  const activeAssignment = [...drafts, ...published].find((item) => item.subjectType === subjectType && item.subjectId === subjectId);
  const baselinePermissions = subject?.permissions || [];

  useEffect(() => {
    if (!subjectPickerOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (subjectPickerRef.current?.contains(event.target as Node)) return;
      setSubjectPickerOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [subjectPickerOpen]);

  const modules = useMemo(() => ['All', ...Array.from(new Set(catalog.map((item) => item.module))).sort()], [catalog]);
  const filteredCatalog = useMemo(() => {
    const q = query.toLowerCase().trim();
    return catalog.filter((node) => {
      const matchesQuery = !q || [node.module, node.subModule, node.feature, node.functionName, node.permissionPrefix, node.category].some((value) => value.toLowerCase().includes(q));
      const matchesModule = moduleFilter === 'All' || node.module === moduleFilter;
      const matchesPermission = permissionFilter === 'All' || selected.has(permissionOf(node, permissionFilter));
      return matchesQuery && matchesModule && matchesPermission;
    });
  }, [catalog, moduleFilter, permissionFilter, query, selected]);

  const grouped = useMemo(() => {
    return filteredCatalog.reduce<Record<string, PermissionNode[]>>((acc, node) => {
      acc[node.module] = [...(acc[node.module] || []), node];
      return acc;
    }, {});
  }, [filteredCatalog]);

  const warnings = useMemo(() => {
    const permissions = Array.from(selected);
    const out: string[] = [];
    if (permissions.some((item) => item.endsWith('.approve')) && permissions.some((item) => item.endsWith('.create') || item.endsWith('.edit'))) out.push('Segregation of Duties: create/edit and approve are assigned together.');
    if (permissions.some((item) => item.endsWith('.override'))) out.push('Override permission is selected and can bypass workflow controls.');
    if (permissions.some((item) => item.endsWith('.post') || item.endsWith('.release') || item.endsWith('.lock') || item.endsWith('.reopen'))) out.push('Payroll/finance posting, release, lock, or reopening authority is selected.');
    if (permissions.some((item) => item.endsWith('.unmask') || item.endsWith('.impersonate'))) out.push('Sensitive data unmasking or impersonation access is selected.');
    if (permissions.some((item) => item.endsWith('.delete') || item.endsWith('.disable'))) out.push('Destructive delete/disable permissions are selected.');
    if (permissions.some((item) => item.startsWith('admin.') || item.startsWith('security.') || item.startsWith('audit.'))) out.push('Security-sensitive permissions require Super Administrator control.');
    return out;
  }, [selected]);

  const togglePermission = (permission: string) => {
    if (!canGrantPermission(permission)) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(permission)) next.delete(permission);
      else next.add(permission);
      return next;
    });
  };

  const hydrateSubject = (nextType: 'role' | 'user', nextId: string) => {
    const nextSubjects = nextType === 'role'
      ? roles.map((role) => ({ id: role.name, permissions: role.permissions }))
      : users.map((user) => ({ id: user.id, permissions: user.permissions }));
    const fallback = nextSubjects[0]?.id || '';
    const resolvedId = nextId || fallback;
    const assignment = [...drafts, ...published].find((item) => item.subjectType === nextType && item.subjectId === resolvedId);
    const nextSubject = nextSubjects.find((item) => item.id === resolvedId);
    setSubjectType(nextType);
    setSubjectId(resolvedId);
    setSubjectSearch('');
    setSubjectPickerOpen(false);
    setSelected(new Set(displayedPermissionsFor(nextType, resolvedId)));
    setDataScope(assignment?.dataScope || 'Company');
    setApprovalLevel(assignment?.approvalLevel || 'L1 - User');
    setReason(assignment?.reason || '');
    if (nextType === 'user') {
      const user = users.find((item) => item.id === resolvedId);
      setSelectedUserRoles(user?.roles || []);
    } else {
      setSelectedUserRoles([]);
      setRoleQuery('');
    }
    hydratedSubjectKey.current = `${nextType}:${resolvedId}`;
  };

  const saveUserRoles = async () => {
    if (subjectType !== 'user' || !subjectId) return;
    setSavingRoles(true);
    setError('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: subjectId, action: 'assign-roles', roles: selectedUserRoles }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Unable to save user roles.');
      setNotice('Role membership saved. The user may need to sign out and back in for role labels to refresh everywhere.');
      hydratedSubjectKey.current = '';
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save user roles.');
    } finally {
      setSavingRoles(false);
    }
  };

  const setModulePermissions = (nodes: PermissionNode[], checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      nodes.forEach((node) => actions.forEach((action) => {
        const permission = permissionOf(node, action);
        if (!canGrantPermission(permission)) return;
        if (checked) next.add(permission);
        else next.delete(permission);
      }));
      return next;
    });
  };

  const enableModuleOperations = (moduleName: string) => {
    const modulePermissions = moduleOperationPermissions(catalog, actions, moduleName);
    setSelected((current) => new Set([...current, ...modulePermissions.filter((permission) => canGrantPermission(permission))]));
    setModuleFilter(moduleName);
    setNotice(`Enabled standard operations for ${moduleName}. Click Publish to apply.`);
  };

  const applyPlatformNoHrisPack = () => {
    const next = stripHrisPermissions([
      ...Array.from(selected),
      ...PLATFORM_WITHOUT_HRIS_PERMISSIONS,
    ]);
    setSelected(new Set(next.filter((permission) => canGrantPermission(permission))));
    setNotice('Applied Platform Admin pack (all modules except HRIS). Click Publish to apply.');
  };

  const publishRoleBaseline = async () => {
    if (subjectType !== 'role' || !subjectId || subjectIsProtected) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/admin/access-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'publish-role-baseline',
          targetRole: subjectId,
          includePlatformPack: PLATFORM_ROLES_WITHOUT_HRIS.has(subjectId),
          reason: reason || `One-click baseline publish for ${subjectId}`,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Unable to publish role baseline.');
      setNotice(`Published baseline permissions for ${subjectId}${PLATFORM_ROLES_WITHOUT_HRIS.has(subjectId) ? ' (HRIS excluded)' : ''}. Users should sign out and back in once.`);
      hydratedSubjectKey.current = '';
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to publish role baseline.');
    } finally {
      setSaving(false);
    }
  };

  const save = async (publish: boolean) => {
    if (subjectIsProtected) {
      setError('This protected account or role cannot be changed here.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const permissions = expandPublishedPermissions(
        subjectType === 'role' && PLATFORM_ROLES_WITHOUT_HRIS.has(subjectId)
          ? stripHrisPermissions(Array.from(selected))
          : Array.from(selected),
      );
      const res = await fetch('/api/admin/access-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectType, subjectId, permissions, dataScope, approvalLevel, reason, publish, requireApproval }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Unable to save permissions.');
      setSelected(new Set(permissions));
      setNotice(
        publish
          ? `Published ${permissions.length} permissions for ${subjectType === 'role' ? subjectId : 'selected user'}. Users with this role should sign out and back in once.`
          : 'Draft saved.',
      );
      hydratedSubjectKey.current = '';
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save permissions.');
    } finally {
      setSaving(false);
    }
  };

  const cloneRole = async () => {
    if (!cloneSource || subjectType !== 'role') return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/access-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clone-role', sourceRole: cloneSource, targetRole: subjectId, reason: reason || `Cloned from ${cloneSource}` }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Unable to clone role permissions.');
      setNotice(`Cloned ${cloneSource} permissions into ${subjectId} as a draft.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to clone role permissions.');
    } finally {
      setSaving(false);
    }
  };

  const compareRoles = async () => {
    const res = await fetch(`/api/admin/access-control?compare=${encodeURIComponent(`${compareLeft}:${compareRight}`)}`, { cache: 'no-store' });
    const json = await res.json();
    if (res.ok) setComparison(json.data);
  };

  const applyTemplate = (template: Template) => {
    const allowed = superActor ? template.permissions : template.permissions.filter((permission) => canGrantPermission(permission));
    setSelected(new Set(expandPublishedPermissions(allowed)));
    setDataScope(template.dataScope);
    setApprovalLevel(template.approvalLevel);
    setNotice(allowed.length === template.permissions.length
      ? `Applied template: ${template.name}`
      : `Applied template: ${template.name} (${template.permissions.length - allowed.length} permissions above your access were skipped)`);
  };

  const exportExcel = () => {
    const rows = [['Subject Type', 'Subject', 'Permission', 'Data Scope', 'Approval Level', 'Status']];
    [...published, ...drafts].forEach((assignment) => assignment.permissions.forEach((permission) => rows.push([assignment.subjectType, assignment.subjectId, permission, assignment.dataScope, assignment.approvalLevel, assignment.status])));
    downloadExcelFile({
      title: 'Access Permission Matrix',
      subtitle: `${rows.length - 1} permission assignments`,
      sheetName: 'Permissions',
      fileName: `access-permission-matrix-${new Date().toISOString().slice(0, 10)}.xls`,
      columns: rows[0],
      rows: rows.slice(1),
    });
  };

  const exportPdf = () => {
    window.print();
  };

  const selectedCount = selected.size;
  const riskyCount = Array.from(selected).filter((permission) => riskyActions.has(permission.split('.').pop() || '')).length;

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-600 text-white"><ShieldCheck className="h-6 w-6" /></span>
          <div>
            <h1 className="text-2xl font-black">Access Control Centre</h1>
            <p className="mt-1 text-sm font-semibold text-slate-600">Centralized control for roles, users, modules, features, actions, workflows, reports, APIs, dashboards, and data scope.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={exportExcel} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4" />Excel</button>
          <button onClick={exportPdf} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"><FileDown className="h-4 w-4" />PDF</button>
          <button onClick={() => save(false)} disabled={saving || loading || !canWrite || subjectIsProtected} className="inline-flex h-10 items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 text-sm font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50"><Save className="h-4 w-4" />Save Draft</button>
          <button onClick={() => save(true)} disabled={saving || loading || !canWrite || subjectIsProtected} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"><Check className="h-4 w-4" />Publish</button>
          {superActor && subjectType === 'role' && !subjectIsProtected ? (
            <button
              type="button"
              onClick={() => void publishRoleBaseline()}
              disabled={saving || loading}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <ShieldCheck className="h-4 w-4" />
              Publish role baseline
            </button>
          ) : null}
        </div>
      </div>

      {error ? <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</div> : null}
      {notice ? <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{notice}</div> : null}
      {superActor ? (
        <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-900">
          Global Super Administrator mode: you can assign any role — including Super Administrator — and publish permissions. Admin and System Administrator cannot self-elevate or promote anyone to Super Administrator.
        </div>
      ) : null}
      {!canWrite ? (
        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
          View-only mode: you can review permissions, but changes require rights within your own access level.
        </div>
      ) : null}
      {subjectIsProtected ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          {subjectId} is protected. Select another role or user to edit permissions.
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Subject</h2>
            <div className="mt-3 grid grid-cols-2 rounded-lg border border-slate-200 p-1">
              {(['role', 'user'] as const).map((type) => (
                <button key={type} onClick={() => hydrateSubject(type, '')} className={`h-9 rounded-md text-sm font-black capitalize ${subjectType === type ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{type}</button>
              ))}
            </div>
            <div ref={subjectPickerRef} className="relative mt-3">
              <button
                type="button"
                onClick={() => {
                  setSubjectSearch('');
                  setSubjectPickerOpen((open) => !open);
                }}
                className="flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm font-bold outline-none ring-blue-100 hover:border-blue-300 focus:border-blue-500 focus:ring-4"
              >
                <span className="min-w-0 truncate">{subject?.label || `Select ${subjectType}`}</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
              </button>
              {subjectPickerOpen ? (
                <div className="absolute left-0 right-0 z-40 mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
                  <div className="relative border-b border-slate-100 p-2">
                    <Search className="absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={subjectSearch}
                      onChange={(event) => setSubjectSearch(event.target.value)}
                      autoFocus
                      placeholder={`Search ${subjectType}s...`}
                      className="h-10 w-full rounded-md border border-slate-200 pl-9 pr-3 text-sm font-semibold outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="max-h-72 overflow-y-auto py-1">
                    {filteredSubjects.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => hydrateSubject(subjectType, item.id)}
                        className={`block w-full px-3 py-2 text-left text-sm hover:bg-blue-50 ${item.id === subjectId ? 'bg-blue-600 text-white hover:bg-blue-600' : 'text-slate-800'}`}
                      >
                        <span className="block truncate font-black">{item.label}</span>
                        <span className={`block truncate text-xs font-semibold ${item.id === subjectId ? 'text-blue-100' : 'text-slate-500'}`}>{item.meta}</span>
                      </button>
                    ))}
                    {filteredSubjects.length === 0 ? (
                      <div className="px-3 py-6 text-center text-sm font-bold text-slate-400">No matching {subjectType}s found.</div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
            <p className="mt-2 text-xs font-semibold text-slate-500">{subject?.meta}</p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg bg-slate-50 p-3"><p className="text-lg font-black">{selectedCount}</p><p className="text-[11px] font-bold text-slate-500">Effective permissions</p></div>
              <div className="rounded-lg bg-amber-50 p-3"><p className="text-lg font-black text-amber-700">{riskyCount}</p><p className="text-[11px] font-bold text-amber-700">Risky permissions</p></div>
            </div>
          </section>

          {subjectType === 'user' && subjectId ? (
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-500">
                <UserCog className="h-4 w-4" />
                Role Membership
              </h2>
              <p className="mt-2 text-xs font-semibold text-slate-500">
                Assign enterprise roles for {activeUser?.fullName || 'the selected user'}. Role changes apply immediately to permissions on the next page load.
              </p>
              <div className="relative mt-3">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={roleQuery}
                  onChange={(event) => setRoleQuery(event.target.value)}
                  placeholder="Search roles..."
                  className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm font-semibold outline-none focus:border-blue-500"
                />
              </div>
              <div className="mt-3 max-h-52 overflow-auto rounded-lg border border-slate-200 p-3">
                {filteredAssignableRoles.map((role) => (
                  <label key={role.name} className="flex items-start gap-2 py-1.5 text-xs font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={selectedUserRoles.includes(role.name)}
                      onChange={(event) => setSelectedUserRoles((current) => (
                        event.target.checked
                          ? [...current, role.name]
                          : current.filter((item) => item !== role.name)
                      ))}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300"
                    />
                    <span>
                      {role.name}
                      <span className="block text-[11px] font-semibold text-slate-400">{role.category}</span>
                    </span>
                  </label>
                ))}
                {!filteredAssignableRoles.length ? (
                  <p className="py-4 text-center text-xs font-bold text-slate-400">No matching roles.</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => void saveUserRoles()}
                disabled={savingRoles || loading}
                className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg bg-slate-950 px-3 text-xs font-black text-white disabled:opacity-50"
              >
                <ShieldCheck className="h-4 w-4" />
                {savingRoles ? 'Saving roles...' : 'Save Roles'}
              </button>
            </section>
          ) : null}

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Scope & Approval</h2>
            <label className="mt-3 block text-xs font-bold text-slate-500">Data scope</label>
            <select value={dataScope} onChange={(event) => setDataScope(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold">
              {dataScopes.map((scope) => <option key={scope}>{scope}</option>)}
            </select>
            <label className="mt-3 block text-xs font-bold text-slate-500">Approval level</label>
            <select value={approvalLevel} onChange={(event) => setApprovalLevel(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold">
              {approvalLevels.map((level) => <option key={level}>{level}</option>)}
            </select>
            <label className="mt-3 flex items-center gap-2 text-sm font-bold text-slate-700">
              <input type="checkbox" checked={requireApproval} onChange={(event) => setRequireApproval(event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              Require approval before publish
            </label>
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason/comment for audit trail" className="mt-3 min-h-20 w-full rounded-lg border border-slate-200 p-3 text-sm font-semibold outline-none focus:border-blue-500" />
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-500"><Layers className="h-4 w-4" />Templates</h2>
            <div className="mt-3 space-y-2">
              {templates.map((template) => (
                <button key={template.id} onClick={() => applyTemplate(template)} className="w-full rounded-lg border border-slate-200 p-3 text-left hover:border-blue-300 hover:bg-blue-50">
                  <p className="text-sm font-black text-slate-900">{template.name}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{template.description}</p>
                </button>
              ))}
            </div>
          </section>
        </aside>

        <main className="min-w-0 space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_220px_180px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search role, user, module, feature, function, permission..." className="h-11 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm font-semibold outline-none focus:border-blue-500" />
              </div>
              <select value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)} className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-bold">
                {modules.map((module) => <option key={module}>{module}</option>)}
              </select>
              <select value={permissionFilter} onChange={(event) => setPermissionFilter(event.target.value)} className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-bold">
                <option>All</option>
                {actions.map((action) => <option key={action}>{action}</option>)}
              </select>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => setSelected(new Set(catalog.flatMap((node) => actions.map((action) => permissionOf(node, action))).filter((permission) => canGrantPermission(permission))))}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-black hover:bg-slate-50"
              ><Filter className="h-4 w-4" />{superActor ? 'Select all permissions' : 'Bulk select allowed'}</button>
              <button onClick={() => setSelected(new Set())} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-black hover:bg-slate-50">Bulk remove all</button>
              {['IT & Support', 'HRIS', 'Payroll', 'Administration'].map((moduleName) => (
                <button
                  key={moduleName}
                  type="button"
                  onClick={() => enableModuleOperations(moduleName)}
                  disabled={!canWrite || subjectIsProtected || (Boolean(subjectType === 'role' && PLATFORM_ROLES_WITHOUT_HRIS.has(subjectId) && (moduleName === 'HRIS' || moduleName === 'Payroll')))}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-black text-blue-800 hover:bg-blue-100 disabled:opacity-50"
                >
                  Enable {moduleName}
                </button>
              ))}
              {superActor || (subjectType === 'role' && PLATFORM_ROLES_WITHOUT_HRIS.has(subjectId)) ? (
                <button
                  type="button"
                  onClick={applyPlatformNoHrisPack}
                  disabled={!canWrite || subjectIsProtected}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-black text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                >
                  Grant platform access (exclude HRIS)
                </button>
              ) : null}
              <button onClick={() => setExpanded(Object.fromEntries(modules.filter((module) => module !== 'All').map((module) => [module, true])))} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-black hover:bg-slate-50">Expand tree</button>
              <button onClick={() => setExpanded({})} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-black hover:bg-slate-50">Collapse tree</button>
            </div>
          </section>

          {warnings.length ? (
            <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <h2 className="flex items-center gap-2 text-sm font-black text-amber-900"><AlertTriangle className="h-4 w-4" />Conflict & Segregation of Duties Warnings</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {warnings.map((warning) => <span key={warning} className="rounded-md bg-white px-2.5 py-1 text-xs font-bold text-amber-800 ring-1 ring-amber-200">{warning}</span>)}
              </div>
            </section>
          ) : null}

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            {loading ? <div className="p-6 text-sm font-bold text-slate-500">Loading access matrix...</div> : null}
            {Object.entries(grouped).map(([module, nodes]) => {
              const isOpen = expanded[module] ?? true;
              const modulePermissions = nodes.flatMap((node) => actions.map((action) => permissionOf(node, action)));
              const allChecked = modulePermissions.every((permission) => selected.has(permission));
              return (
                <div key={module} className="border-b border-slate-200 last:border-b-0">
                  <div className="flex flex-col gap-3 bg-slate-50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                    <button onClick={() => setExpanded((current) => ({ ...current, [module]: !isOpen }))} className="flex min-w-0 items-center gap-2 text-left">
                      {isOpen ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
                      <span className="truncate text-sm font-black text-slate-900">{module}</span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200">{nodes.length} features</span>
                    </button>
                    <label className="flex items-center gap-2 text-xs font-black text-slate-600">
                      <input type="checkbox" checked={allChecked} onChange={(event) => setModulePermissions(nodes, event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                      Module bulk select
                    </label>
                  </div>
                  {isOpen ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-[1180px] w-full border-t border-slate-200 text-left text-sm">
                        <thead className="bg-white text-[11px] uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="w-[330px] px-4 py-3">Feature / Function</th>
                            <th className="px-3 py-3">Type</th>
                            <th className="px-3 py-3">Scope</th>
                            {actions.map((action) => <th key={action} className="px-2 py-3 text-center">{action}</th>)}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {nodes.map((node) => (
                            <tr key={node.permissionPrefix} className={node.protected ? 'bg-red-50/40' : 'bg-white'}>
                              <td className="px-4 py-3">
                                <p className="font-black text-slate-900">{node.feature}</p>
                                <p className="mt-1 text-xs font-semibold text-slate-500">{node.subModule} - {node.functionName}</p>
                              </td>
                              <td className="px-3 py-3 text-xs font-bold text-slate-600">{node.category}</td>
                              <td className="px-3 py-3 text-xs font-bold text-slate-600">{node.approvalLevel}<br />{node.dataScope}</td>
                              {actions.map((action) => {
                                const permission = permissionOf(node, action);
                                const grantable = canGrantPermission(permission);
                                return (
                                  <td key={permission} className="px-2 py-3 text-center">
                                    <input
                                      title={grantable ? permission : `${permission} (above your access level)`}
                                      type="checkbox"
                                      checked={selected.has(permission)}
                                      disabled={!grantable || !canWrite || subjectIsProtected}
                                      onChange={() => togglePermission(permission)}
                                      className="h-4 w-4 rounded border-slate-300 text-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
                                    />
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </section>
        </main>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-500"><Copy className="h-4 w-4" />Clone Role Permissions</h2>
          <select value={cloneSource} onChange={(event) => setCloneSource(event.target.value)} className="mt-3 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold">
            {roles.map((role) => <option key={role.name}>{role.name}</option>)}
          </select>
          <button onClick={cloneRole} disabled={subjectType !== 'role' || saving} className="mt-3 h-10 w-full rounded-lg bg-slate-900 text-sm font-black text-white disabled:opacity-50">Clone into selected role as draft</button>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-500"><GitCompare className="h-4 w-4" />Compare Permissions</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <select value={compareLeft} onChange={(event) => setCompareLeft(event.target.value)} className="h-10 rounded-lg border border-slate-200 px-2 text-sm font-bold">{roles.map((role) => <option key={role.name}>{role.name}</option>)}</select>
            <select value={compareRight} onChange={(event) => setCompareRight(event.target.value)} className="h-10 rounded-lg border border-slate-200 px-2 text-sm font-bold">{roles.map((role) => <option key={role.name}>{role.name}</option>)}</select>
          </div>
          <button onClick={compareRoles} className="mt-3 h-10 w-full rounded-lg border border-slate-200 text-sm font-black hover:bg-slate-50">Compare</button>
          {comparison ? <p className="mt-3 text-xs font-bold text-slate-600">{compareLeft}: {comparison.leftOnly.length} unique. {compareRight}: {comparison.rightOnly.length} unique. Shared: {comparison.shared.length}.</p> : null}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Effective Permission Preview</h2>
          <div className="mt-3 max-h-36 overflow-auto rounded-lg bg-slate-50 p-3">
            {Array.from(selected).slice(0, 80).map((permission) => <span key={permission} className="mb-1 mr-1 inline-flex rounded-md bg-white px-2 py-1 text-[11px] font-bold text-slate-700 ring-1 ring-slate-200">{permission}</span>)}
            {selected.size > 80 ? <span className="text-xs font-black text-blue-700">+{selected.size - 80} more</span> : null}
          </div>
          {activeAssignment ? <p className="mt-2 text-xs font-bold text-slate-500">Current state: {activeAssignment.status} by {activeAssignment.updatedBy}</p> : null}
        </section>
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-500"><History className="h-4 w-4" />Access Change Audit Trail</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
              <tr><th className="py-2 pr-3">Modified</th><th className="py-2 pr-3">Affected</th><th className="py-2 pr-3">Changed</th><th className="py-2 pr-3">Reason</th><th className="py-2 pr-3">IP / Device</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {audit.slice(0, 12).map((item) => (
                <tr key={item.id}>
                  <td className="py-3 pr-3 text-xs font-bold text-slate-600">{item.modifiedBy}<br />{new Date(item.modifiedAt).toLocaleString()}</td>
                  <td className="py-3 pr-3 text-xs font-black text-slate-800">{item.roleOrUserAffected}</td>
                  <td className="max-w-md py-3 pr-3 text-xs font-semibold text-slate-600 truncate">{item.permissionChanged}</td>
                  <td className="py-3 pr-3 text-xs font-semibold text-slate-600">{item.reason}</td>
                  <td className="py-3 pr-3 text-xs font-semibold text-slate-600">{item.ipAddress}<br />{item.device.slice(0, 80)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
