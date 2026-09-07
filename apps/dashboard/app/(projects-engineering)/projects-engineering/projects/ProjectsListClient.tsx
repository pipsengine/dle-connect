'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeading, Button, Card, Status, Progress, DataTable } from '@/components/projects-engineering/UI';
import { ProjectFormModal } from '@/components/projects-engineering/ProjectFormModal';
import { money, dmy } from '@/lib/projects-engineering/format';
import type { Project } from '@/lib/projects-engineering/types';

type AccessIdentity = {
  canCreateProjects: boolean;
  canEditProjects: boolean;
  canDeleteProjects: boolean;
  canViewEnterprisePortfolio: boolean;
  department: string | null;
};

const POLL_MS = 30000;

export default function ProjectsListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [identity, setIdentity] = useState<AccessIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selected, setSelected] = useState<Project | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Project | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const [projectsRes, accessRes] = await Promise.all([
        fetch('/api/projects-engineering/projects', { cache: 'no-store', credentials: 'same-origin' }),
        fetch('/api/projects-engineering/access', { cache: 'no-store', credentials: 'same-origin' }),
      ]);
      const projectsJson = await projectsRes.json();
      const accessJson = await accessRes.json();
      if (!projectsRes.ok || projectsJson.status !== 'success') {
        throw new Error(projectsJson.error || 'Unable to load projects');
      }
      setProjects(Array.isArray(projectsJson.data?.projects) ? projectsJson.data.projects : []);
      if (accessRes.ok && accessJson.status === 'success') {
        setIdentity(accessJson.data?.identity || null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load projects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (searchParams.get('action') === 'create' && identity?.canCreateProjects) {
      setModalMode('create');
      setSelected(null);
      setModalOpen(true);
    }
  }, [searchParams, identity?.canCreateProjects]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((project) =>
      [project.code, project.name, project.client, project.manager, project.status, project.location]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [projects, query]);

  const openCreate = () => {
    if (!identity?.canCreateProjects) return;
    setModalMode('create');
    setSelected(null);
    setModalOpen(true);
  };

  const openEdit = (project: Project) => {
    if (!identity?.canEditProjects) return;
    setModalMode('edit');
    setSelected(project);
    setModalOpen(true);
  };

  const onDelete = async (project: Project) => {
    if (!identity?.canDeleteProjects) return;
    const confirmed = window.confirm(
      `Delete (archive) project ${project.code} — ${project.name}?\n\nOnly Global Super Administrator can perform this action. Timesheet history is retained.`,
    );
    if (!confirmed) return;
    setDeletingId(project.id);
    setError('');
    try {
      const res = await fetch(`/api/projects-engineering/projects/${encodeURIComponent(project.id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Delete failed');
      if (detail?.id === project.id) setDetail(null);
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete project');
    } finally {
      setDeletingId(null);
    }
  };

  const rows = filtered.map((project) => [
    <button type="button" className="project-cell project-cell-btn" key={project.id} onClick={() => setDetail(project)}>
      <span className="project-avatar">{project.code.slice(0, 2)}</span>
      <div>
        <b>{project.name}</b>
        <small>
          {project.code} · {project.phase}
        </small>
      </div>
    </button>,
    project.client,
    project.manager,
    <Status key={`${project.id}-st`}>{project.status}</Status>,
    <Status key={`${project.id}-h`}>{project.health}</Status>,
    <Progress key={`${project.id}-p`} value={Number(project.actual || 0)} />,
    money(project.contractValue, project.currency),
    <div className="row-actions" key={`${project.id}-a`}>
      <Link className="btn ghost" href={`/projects-engineering/projects/${project.id}/overview`}>
        Open
      </Link>
      {identity?.canEditProjects ? (
        <Button variant="secondary" onClick={() => openEdit(project)}>
          Edit
        </Button>
      ) : null}
      {identity?.canDeleteProjects ? (
        <Button variant="danger" onClick={() => onDelete(project)} disabled={deletingId === project.id}>
          {deletingId === project.id ? '…' : 'Delete'}
        </Button>
      ) : null}
    </div>,
  ]);

  return (
    <>
      <PageHeading
        title="Projects"
        description="Enterprise project register from DLE_Enterprise. Create and edit via modal forms. Delete is restricted to the Global Super Administrator."
        actions={
          <>
            <Button variant="secondary" href="/projects-engineering">
              Dashboard
            </Button>
            {identity?.canCreateProjects ? <Button onClick={openCreate}>＋ Create Project</Button> : null}
          </>
        }
      />

      {error ? <div className="audit-strip">⚠ {error}</div> : null}
      {loading ? <div className="audit-strip">Loading live projects…</div> : null}

      <Card
        title="Project Register"
        subtitle={`${filtered.length} of ${projects.length} projects · auto-refreshes every ${POLL_MS / 1000}s`}
        action={
          <div className="toolbar">
            <div className="search-box">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search code, name, client, manager…"
              />
            </div>
          </div>
        }
      >
        {!loading && !filtered.length ? (
          <p style={{ margin: 0, color: '#6f7f95', fontSize: 12 }}>
            No projects found. {identity?.canCreateProjects ? 'Use Create Project to add the first record.' : 'Ask IT to create projects.'}
          </p>
        ) : (
          <DataTable
            headers={['Project', 'Client', 'Manager', 'Status', 'Health', 'Progress', 'Value', 'Actions']}
            rows={rows}
          />
        )}
      </Card>

      {detail ? (
        <div className="pm-modal-root" role="dialog" aria-modal="true" aria-label="Project details">
          <button type="button" className="pm-modal-backdrop" aria-label="Close" onClick={() => setDetail(null)} />
          <div className="pm-modal-panel">
            <header className="pm-modal-head">
              <div>
                <div className="eyebrow">{detail.code}</div>
                <h2>{detail.name}</h2>
                <p>
                  {detail.client} · {detail.location}
                </p>
              </div>
              <Button variant="ghost" onClick={() => setDetail(null)}>
                Close
              </Button>
            </header>
            <div className="pm-modal-body">
              <div className="detail-grid">
                <div>
                  <small>Status</small>
                  <Status>{detail.status}</Status>
                </div>
                <div>
                  <small>Health</small>
                  <Status>{detail.health}</Status>
                </div>
                <div>
                  <small>Project Manager</small>
                  <strong>{detail.manager}</strong>
                </div>
                <div>
                  <small>Contract Value</small>
                  <strong>{money(detail.contractValue, detail.currency)}</strong>
                </div>
                <div>
                  <small>Dates</small>
                  <strong>
                    {dmy(detail.start)} – {dmy(detail.finish)}
                  </strong>
                </div>
                <div>
                  <small>Progress</small>
                  <Progress value={Number(detail.actual || 0)} />
                </div>
                <div>
                  <small>SPI / CPI</small>
                  <strong>
                    {Number(detail.schedulePerformance || 0).toFixed(2)} / {Number(detail.costPerformance || 0).toFixed(2)}
                  </strong>
                </div>
                <div>
                  <small>Phase / Type</small>
                  <strong>
                    {detail.phase} · {detail.projectType || '—'}
                  </strong>
                </div>
              </div>
              <p className="detail-description">{detail.description}</p>
              <div className="pm-modal-foot">
                <Button variant="secondary" href={`/projects-engineering/projects/${detail.id}/overview`}>
                  Open Workspace
                </Button>
                {identity?.canEditProjects ? (
                  <Button
                    onClick={() => {
                      setDetail(null);
                      openEdit(detail);
                    }}
                  >
                    Edit Project
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ProjectFormModal
        open={modalOpen}
        mode={modalMode}
        project={selected}
        onClose={() => {
          setModalOpen(false);
          if (searchParams.get('action') === 'create') {
            router.replace('/projects-engineering/projects');
          }
        }}
        onSaved={async () => {
          await load(true);
        }}
      />
    </>
  );
}
