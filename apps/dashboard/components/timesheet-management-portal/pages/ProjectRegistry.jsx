'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import { Button, Field, Modal, SearchCombo, Table } from '../components/UI';
import { usePortalData } from '../portal-data';

const emptyForm = () => ({
  id: '',
  code: '',
  name: '',
  clientName: '',
  site: '',
  projectManager: '',
  projectManagerLabel: '',
});

export default function ProjectRegistry() {
  const { snapshot } = usePortalData();
  const canManageProjects = Boolean(snapshot?.viewer?.canManageProjects);
  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/timesheet-management/projects', { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.status === 'error') throw new Error(body.error || 'Unable to load project registry.');
      setProjects(body.data?.projects || []);
      setSites(body.data?.projectSites || []);
    } catch (loadError) {
      setError(loadError.message || 'Unable to load project registry.');
      setProjects([]);
      setSites([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canManageProjects) load();
    else setLoading(false);
  }, [canManageProjects, load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((project) =>
      [project.code, project.name, project.clientName, project.site, project.projectManager]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [projects, query]);

  const openCreate = () => {
    setForm(emptyForm());
    setFormError('');
    setModal('create');
  };

  const openEdit = (project) => {
    setForm({
      id: project.id || '',
      code: project.code || '',
      name: project.name || '',
      clientName: project.clientName || '',
      site: project.site || '',
      projectManager: project.projectManager || '',
      projectManagerLabel: project.projectManager || '',
    });
    setFormError('');
    setModal('edit');
  };

  const save = async () => {
    const code = String(form.code || '').trim().toUpperCase();
    const name = String(form.name || '').trim();
    const clientName = String(form.clientName || '').trim();
    const site = String(form.site || '').trim();
    const projectManager = String(form.projectManager || form.projectManagerLabel || '').trim();
    if (!code || !name || !clientName || !site || !projectManager) {
      setFormError('Project code, name, client, site, and project manager are required.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const response = await fetch('/api/timesheet-management/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: {
            id: form.id || undefined,
            code,
            name,
            clientName,
            site,
            projectManager,
            status: 'Active',
          },
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.status === 'error') throw new Error(body.error || 'Failed to save project.');
      setProjects(body.data?.projects || []);
      if (Array.isArray(body.data?.projectSites)) setSites(body.data.projectSites);
      setNotice(body.data?.message || (form.id ? 'Project updated.' : 'Project registered.'));
      setModal(null);
      setForm(emptyForm());
    } catch (saveError) {
      setFormError(saveError.message || 'Failed to save project.');
    } finally {
      setSaving(false);
    }
  };

  if (!canManageProjects) {
    return (
      <div className="panel" style={{ padding: 24 }}>
        <h1>Project Registry</h1>
        <p>Only IT Department employees or Global Super Administrator can register or update timesheet projects.</p>
      </div>
    );
  }

  return (
    <>
      <div className="pageTitle">
        <div>
          <span className="eyebrow">MASTER DATA</span>
          <h1>Project Registry</h1>
          <p>Register and maintain project codes used across timesheet capture. IT Department only.</p>
        </div>
        <div className="actions">
          <Button onClick={openCreate}>+ Register Project</Button>
        </div>
      </div>

      {(error || notice) && (
        <div className={error ? 'infoBox' : 'success'}>
          {error || notice}
          <button type="button" onClick={() => { setError(''); setNotice(''); }}>×</button>
        </div>
      )}

      <section className="panel">
        <div className="panelHead">
          <div>
            <h3>Company project codes</h3>
            <p>{loading ? 'Loading…' : `${filtered.length} project${filtered.length === 1 ? '' : 's'} in registry.`}</p>
          </div>
          <div className="actions">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search code, name, client, site, manager…"
              style={{ minWidth: 280 }}
            />
          </div>
        </div>
        <Table
          headers={['Code', 'Project', 'Client', 'Site', 'Project Manager', 'Status', '']}
          rows={filtered.map((project) => [
            project.code,
            project.name,
            project.clientName || '—',
            project.site || '—',
            project.projectManager || '—',
            project.status || 'Active',
            <button key={`${project.id}-edit`} type="button" className="link" title="Edit project" onClick={() => openEdit(project)}>
              <Pencil size={14} /> Edit
            </button>,
          ])}
          empty={loading ? 'Loading project registry…' : 'No projects match this search.'}
        />
      </section>

      {modal && (
        <Modal
          wide
          title={form.id ? 'Edit Project' : 'Register Project'}
          onClose={() => { if (!saving) setModal(null); }}
          footer={(
            <>
              <Button kind="secondary" disabled={saving} onClick={() => setModal(null)}>Cancel</Button>
              <Button disabled={saving} onClick={save}>{saving ? 'Saving…' : form.id ? 'Update Project' : 'Register Project'}</Button>
            </>
          )}
        >
          <p className="detailNote">{form.id ? 'Update project details in the company registry.' : 'Add a new project code to the company registry.'}</p>
          {formError && <div className="infoBox">{formError}</div>}
          <div className="formGrid">
            <Field label="Project Code" required>
              <input
                value={form.code}
                disabled={Boolean(form.id)}
                onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
                placeholder="e.g. DL2607"
              />
            </Field>
            <Field label="Site Location" required>
              <select
                value={form.site}
                onChange={(event) => setForm((current) => ({ ...current, site: event.target.value }))}
              >
                <option value="">Select Site…</option>
                {sites.map((site) => <option key={site} value={site}>{site}</option>)}
              </select>
            </Field>
            <Field label="Project Name" required>
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="e.g. MISC STEELWORK-LNT"
              />
            </Field>
            <Field label="Client Name" required>
              <input
                value={form.clientName}
                onChange={(event) => setForm((current) => ({ ...current, clientName: event.target.value }))}
                placeholder="e.g. JBN"
              />
            </Field>
          </div>
          <div style={{ marginTop: 12 }}>
            <SearchCombo
              required
              label="Project Manager"
              placeholder="Search employee code or name"
              value={form.projectManagerLabel}
              onSelect={(item) => setForm((current) => ({
                ...current,
                projectManager: item?.label || '',
                projectManagerLabel: item?.label || '',
              }))}
              search={(q) => fetch(`/api/timesheet-management/projects?mode=managers&q=${encodeURIComponent(q)}`, { cache: 'no-store' })
                .then((response) => response.json())
                .then((body) => body.data?.managers || [])}
              labelOf={(item) => item.label || `${item.code} - ${item.name}`}
              detailOf={(item) => [item.jobTitle, item.department].filter(Boolean).join(' · ')}
              clearable
            />
          </div>
        </Modal>
      )}
    </>
  );
}
