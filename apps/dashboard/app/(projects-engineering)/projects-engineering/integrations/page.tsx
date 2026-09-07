'use client';

import { useMemo, useState } from 'react';
import { PageHeading, Card, Button, Status, DataTable, Toolbar } from '@/components/projects-engineering/UI';
import { PM_CONNECTORS, type ConnectorCategory, type PmConnector } from '@/lib/projects-engineering/connectors';

const categoryLabel: Record<ConnectorCategory, string> = {
  schedule: 'Schedule / Planning',
  documents: 'Documents / CDE',
  erp: 'ERP / Finance',
  hr: 'HR / Resources',
  collaboration: 'Collaboration',
  field: 'Field Execution',
  'pm-suite': 'PM Suites',
};

const formatSync = (value: string | null) => {
  if (!value) return 'Never';
  try {
    return new Date(value).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
};

export default function IntegrationsPage() {
  const [connectors, setConnectors] = useState<PmConnector[]>(PM_CONNECTORS);
  const [filter, setFilter] = useState<'all' | ConnectorCategory>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const visible = useMemo(
    () => (filter === 'all' ? connectors : connectors.filter((item) => item.category === filter)),
    [connectors, filter],
  );

  const syncConnector = async (id: string) => {
    setBusyId(id);
    setMessage('');
    try {
      const res = await fetch(`/api/projects-engineering/connectors/${encodeURIComponent(id)}/sync`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'manual-sync' }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Sync failed');
      setConnectors((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                status: json.data?.status || 'Healthy',
                lastSync: json.data?.lastSync || new Date().toISOString(),
              }
            : item,
        ),
      );
      setMessage(json.data?.message || `Sync queued for ${id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sync failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PageHeading
        title="Integrations & Connectors"
        description="Connect Primavera P6, EDMS/CDE and other project-management tools. Connectors are queueable, audited and permission-filtered — AI and UI never bypass source systems of record."
        actions={
          <>
            <Button variant="secondary" href="/projects-engineering/settings">
              Configuration
            </Button>
            <Button
              onClick={() => {
                void Promise.all(visible.map((item) => syncConnector(item.id)));
              }}
            >
              Sync Visible
            </Button>
          </>
        }
      />

      {message ? <div className="audit-strip">ⓘ {message}</div> : null}

      <div className="kpi-grid four">
        <Card>
          <div className="chart-value">
            <span>Configured connectors</span>
            <strong>{connectors.filter((c) => c.status !== 'Not configured').length}</strong>
            <small>of {connectors.length} available</small>
          </div>
        </Card>
        <Card>
          <div className="chart-value">
            <span>Healthy</span>
            <strong>{connectors.filter((c) => c.status === 'Healthy').length}</strong>
            <small>P6 / EDMS / Sage included</small>
          </div>
        </Card>
        <Card>
          <div className="chart-value">
            <span>Watch / Offline</span>
            <strong>{connectors.filter((c) => c.status === 'Watch' || c.status === 'Offline').length}</strong>
            <small>Require IT attention</small>
          </div>
        </Card>
        <Card>
          <div className="chart-value">
            <span>Not configured</span>
            <strong>{connectors.filter((c) => c.status === 'Not configured').length}</strong>
            <small>Optional PM tool connectors</small>
          </div>
        </Card>
      </div>

      <Card
        title="Connector Catalogue"
        subtitle="Schedule, documents, ERP, field and PM-suite systems"
        action={
          <div className="toolbar">
            <select className="select" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
              <option value="all">All categories</option>
              {Object.entries(categoryLabel).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <Toolbar placeholder="Search connectors..." />
          </div>
        }
      >
        <DataTable
          headers={['Connector', 'Category', 'Mode', 'Last Sync', 'Owner', 'Status', 'Actions']}
          rows={visible.map((item) => [
            <div key={`${item.id}-name`}>
              <b>{item.name}</b>
              <small>
                {item.vendor} · {item.purpose}
              </small>
            </div>,
            categoryLabel[item.category],
            item.mode,
            formatSync(item.lastSync),
            item.owner,
            <Status key={`${item.id}-status`}>{item.status}</Status>,
            <button
              key={`${item.id}-sync`}
              type="button"
              className="btn secondary"
              disabled={busyId === item.id}
              onClick={() => void syncConnector(item.id)}
            >
              {busyId === item.id ? 'Syncing…' : 'Sync now'}
            </button>,
          ])}
        />
      </Card>

      <div className="grid two">
        <Card title="Priority connectors" subtitle="Core DLE project-control stack">
          <div className="attention-list">
            {connectors
              .filter((item) => ['primavera-p6', 'edms-cde', 'sage-x3', 'sage-people'].includes(item.id))
              .map((item, index) => (
                <div className={`attention ${item.status === 'Healthy' ? 'info' : 'warning'}`} key={item.id}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <b>{item.name}</b>
                    <small>
                      Env: {item.endpointEnv} · Supports: {item.supports.join(', ')}
                    </small>
                  </div>
                  <Status>{item.status}</Status>
                </div>
              ))}
          </div>
        </Card>
        <Card title="Integration rules" subtitle="From IMPLEMENTATION / SECURITY guides">
          <div className="control-check">
            <label>✓ Finance (Sage X3) remains financial system of record</label>
            <label>✓ P6 remains schedule-authoring source where adopted</label>
            <label>✓ EDMS/CDE keeps document binaries; DLE stores metadata refs</label>
            <label>✓ Sync jobs are queueable / retriable (no long blocking UI calls)</label>
            <label>✓ Every sync writes pm.AuditLog with actor + correlation ID</label>
            <label>✓ Connector credentials only via server environment / secret store</label>
          </div>
        </Card>
      </div>
    </>
  );
}
