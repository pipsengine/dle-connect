import { PageHeading, Card, DataTable, Status, Button } from '@/components/projects-engineering/UI';
import Link from 'next/link';

export default function ProjectSettingsPage() {
  return (
    <>
      <PageHeading
        title="Configuration"
        description="Govern DLE project codes, classifications, workflows, permissions, integrations and project-control standards."
        actions={
          <>
            <Button variant="secondary" href="/projects-engineering/integrations">
              Integrations
            </Button>
            <Button>Save Configuration</Button>
          </>
        }
      />
      <div className="settings-grid">
        <Card title="Project Numbering">
          <div className="form-grid">
            <label className="field">
              <span>Default pattern</span>
              <input defaultValue="{BU}-{YEAR}-{SEQ}" />
            </label>
            <label className="field">
              <span>Sequence length</span>
              <input defaultValue="3" />
            </label>
            <label className="field">
              <span>Allow manual override</span>
              <select>
                <option>No ΓÇô Admin only</option>
              </select>
            </label>
            <label className="field">
              <span>Project code uniqueness</span>
              <select>
                <option>Enterprise-wide</option>
              </select>
            </label>
          </div>
        </Card>
        <Card title="Health Thresholds">
          <div className="form-grid">
            <label className="field">
              <span>SPI Watch threshold</span>
              <input defaultValue="0.98" />
            </label>
            <label className="field">
              <span>SPI Critical threshold</span>
              <input defaultValue="0.90" />
            </label>
            <label className="field">
              <span>CPI Watch threshold</span>
              <input defaultValue="0.97" />
            </label>
            <label className="field">
              <span>Overdue action escalation</span>
              <input defaultValue="3 days" />
            </label>
          </div>
        </Card>
      </div>
      <Card
        title="Enterprise Integrations"
        subtitle="Connector health overview ΓÇö manage endpoints and sync from Integrations"
        action={
          <Link href="/projects-engineering/integrations" className="btn secondary">
            Manage connectors
          </Link>
        }
      >
        <DataTable
          headers={['Integration', 'Purpose', 'Mode', 'Last Sync', 'Owner', 'Status']}
          rows={[
            ['Sage X3', 'Project finance, procurement, supplier commitments', 'Bi-directional controlled', '07 Sep 06:30', 'Finance Systems', <Status key="x3">Healthy</Status>],
            ['Primavera P6', 'WBS, activities, baselines, progress', 'Scheduled import', '06 Sep 22:14', 'Project Controls', <Status key="p6">Healthy</Status>],
            ['EDMS / CDE', 'Controlled documents, transmittals, metadata', 'API', '07 Sep 06:48', 'Document Control', <Status key="edms">Healthy</Status>],
            ['Sage 300 People / HRIS', 'Employees, timesheets, resources', 'Scheduled import', '07 Sep 05:45', 'HR / IT', <Status key="hr">Healthy</Status>],
            ['Microsoft 365', 'Teams notifications, approvals, reports', 'Graph API', '07 Sep 07:02', 'IT', <Status key="m365">Watch</Status>],
            ['MS Project / Procore / Aconex', 'Optional schedule & field / CDE tools', 'API', 'ΓÇö', 'PMO / Construction', <Status key="opt">Not configured</Status>],
          ]}
        />
      </Card>
    </>
  );
}

