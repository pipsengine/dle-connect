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
} from 'lucide-react';

type AccessAction = 'view' | 'create' | 'edit' | 'delete' | 'submit' | 'approve' | 'reject' | 'export' | 'import' | 'print' | 'upload' | 'download' | 'configure' | 'audit' | 'enable' | 'disable' | 'assign' | 'override';
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
type UserAccount = { id: string; username: string; fullName: string; roles: string[]; permissions: string[]; department: string; status: string };
type Assignment = { subjectType: 'role' | 'user'; subjectId: string; permissions: string[]; dataScope: string; approvalLevel: string; status: string; reason: string; updatedAt: string; updatedBy: string };
type Template = { id: string; name: string; description: string; permissions: string[]; dataScope: string; approvalLevel: string };
type AuditRecord = { id: string; modifiedBy: string; modifiedAt: string; roleOrUserAffected: string; permissionChanged: string; oldValue: string; newValue: string; reason: string; ipAddress: string; device: string };
type SubjectOption = { id: string; label: string; permissions: string[]; meta: string };

const dataScopes = ['Own', 'Team', 'Department', 'Location', 'Company', 'Global'];
const approvalLevels = ['L1 - User', 'L2 - Manager', 'L2 - HR Admin', 'L2 - Project Manager', 'L3 - Approver', 'L3 - Payroll Approver', 'L3 - Finance Approver', 'L3 - Super Admin'];
const riskyActions = new Set(['delete', 'disable', 'assign', 'override', 'approve']);

const permissionOf = (node: PermissionNode, action: string) => `${node.permissionPrefix}.${action}`;
const downloadText = (name: string, text: string, type: string) => {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
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
  const [subjectId, setSubjectId] = useState('Super Administrator');
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

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/access-control', { cache: 'no-store' });
      const json = await res.json();
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
    ? roles.map((role) => ({ id: role.name, label: role.name, permissions: role.permissions, meta: role.category }))
    : users.map((user) => ({ id: user.id, label: `${user.fullName} (${user.username})`, permissions: user.permissions, meta: `${user.department || 'No department'} - ${user.status}` }));

  const subject = subjects.find((item) => item.id === subjectId);
  const filteredSubjects = useMemo(() => {
    const q = subjectSearch.trim().toLowerCase();
    if (!q) return subjects;
    return subjects.filter((item) => [item.label, item.meta, item.id].some((value) => value.toLowerCase().includes(q)));
  }, [subjectSearch, subjects]);
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
    if (permissions.some((item) => item.endsWith('.delete') || item.endsWith('.disable'))) out.push('Destructive delete/disable permissions are selected.');
    if (permissions.some((item) => item.startsWith('admin.') || item.startsWith('security.') || item.startsWith('audit.'))) out.push('Security-sensitive permissions require Super Administrator control.');
    return out;
  }, [selected]);

  const togglePermission = (permission: string) => {
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
    setSelected(new Set(assignment?.permissions || nextSubject?.permissions || []));
    setDataScope(assignment?.dataScope || 'Company');
    setApprovalLevel(assignment?.approvalLevel || 'L1 - User');
    setReason(assignment?.reason || '');
  };

  const setModulePermissions = (nodes: PermissionNode[], checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      nodes.forEach((node) => actions.forEach((action) => {
        const permission = permissionOf(node, action);
        if (checked) next.add(permission);
        else next.delete(permission);
      }));
      return next;
    });
  };

  const save = async (publish: boolean) => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/admin/access-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectType, subjectId, permissions: Array.from(selected), dataScope, approvalLevel, reason, publish, requireApproval }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Unable to save permissions.');
      setNotice(publish ? 'Permissions published and will be enforced on the next authorized request or refreshed session.' : 'Draft saved.');
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
    setSelected(new Set(template.permissions));
    setDataScope(template.dataScope);
    setApprovalLevel(template.approvalLevel);
    setNotice(`Applied template: ${template.name}`);
  };

  const exportCsv = () => {
    const rows = [['Subject Type', 'Subject', 'Permission', 'Data Scope', 'Approval Level', 'Status']];
    [...published, ...drafts].forEach((assignment) => assignment.permissions.forEach((permission) => rows.push([assignment.subjectType, assignment.subjectId, permission, assignment.dataScope, assignment.approvalLevel, assignment.status])));
    downloadText('access-permission-matrix.csv', rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv;charset=utf-8');
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
          <button onClick={exportCsv} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4" />Excel</button>
          <button onClick={exportPdf} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"><FileDown className="h-4 w-4" />PDF</button>
          <button onClick={() => save(false)} disabled={saving || loading} className="inline-flex h-10 items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 text-sm font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50"><Save className="h-4 w-4" />Save Draft</button>
          <button onClick={() => save(true)} disabled={saving || loading} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"><Check className="h-4 w-4" />Publish</button>
        </div>
      </div>

      {error ? <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</div> : null}
      {notice ? <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{notice}</div> : null}

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
              <button onClick={() => setSelected(new Set(catalog.flatMap((node) => actions.map((action) => permissionOf(node, action)))))} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-black hover:bg-slate-50"><Filter className="h-4 w-4" />Bulk select all</button>
              <button onClick={() => setSelected(new Set())} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-black hover:bg-slate-50">Bulk remove all</button>
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
                                return (
                                  <td key={permission} className="px-2 py-3 text-center">
                                    <input title={permission} type="checkbox" checked={selected.has(permission)} onChange={() => togglePermission(permission)} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
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
