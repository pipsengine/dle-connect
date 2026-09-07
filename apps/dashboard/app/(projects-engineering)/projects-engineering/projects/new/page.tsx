import { PageHeading, Button, Card } from '@/components/projects-engineering/UI';

const Field = ({
  label,
  placeholder,
  required = false,
  type = 'text',
}: {
  label: string;
  placeholder?: string;
  required?: boolean;
  type?: string;
}) => (
  <label className="field">
    <span>
      {label}
      {required ? <b>*</b> : null}
    </span>
    <input type={type} placeholder={placeholder} />
  </label>
);

export default function NewProjectPage() {
  return (
    <>
      <PageHeading
        eyebrow="Projects / New Project"
        title="Create Project"
        description="Register a controlled DLE project and establish the master project context used across engineering, procurement, cost, quality, HSE and reporting."
        actions={
          <>
            <Button variant="secondary" href="/projects-engineering">
              Cancel
            </Button>
            <Button>Save Draft</Button>
          </>
        }
      />
      <div className="stepper">
        <span className="active">
          1 <b>Project Identity</b>
        </span>
        <span>
          2 <b>Commercial</b>
        </span>
        <span>
          3 <b>Schedule</b>
        </span>
        <span>
          4 <b>Governance</b>
        </span>
        <span>
          5 <b>Review</b>
        </span>
      </div>
      <div className="form-layout">
        <div>
          <Card title="Project Identity" subtitle="Core master-data record">
            <div className="form-grid">
              <Field label="Project Code" placeholder="e.g. HDJK-001" required />
              <Field label="Project Name" placeholder="Enter official project name" required />
              <label className="field">
                <span>Project Type*</span>
                <select>
                  <option>EPC</option>
                  <option>Engineering Services</option>
                  <option>Fabrication</option>
                  <option>Construction</option>
                  <option>Maintenance</option>
                </select>
              </label>
              <label className="field">
                <span>Business Unit*</span>
                <select>
                  <option>Projects & Engineering</option>
                  <option>Operations</option>
                </select>
              </label>
              <Field label="Client" placeholder="Select or enter client" required />
              <Field label="Project Location" placeholder="City / site / region" />
              <label className="field full">
                <span>Project Description*</span>
                <textarea rows={4} placeholder="Scope summary, contract context and principal deliverables..." />
              </label>
            </div>
          </Card>
          <Card title="Commercial & Contract" subtitle="High-level contract controls">
            <div className="form-grid">
              <Field label="Contract Number" placeholder="Client contract reference" />
              <Field label="Contract Value" placeholder="0.00" type="number" />
              <label className="field">
                <span>Currency</span>
                <select>
                  <option>NGN</option>
                  <option>USD</option>
                  <option>EUR</option>
                  <option>GBP</option>
                </select>
              </label>
              <label className="field">
                <span>Commercial Model</span>
                <select>
                  <option>Lump Sum</option>
                  <option>Reimbursable</option>
                  <option>Unit Rate</option>
                  <option>Hybrid</option>
                </select>
              </label>
              <Field label="Client PO / Award Ref." placeholder="PO or award reference" />
              <Field label="Cost Centre" placeholder="Project cost centre" />
            </div>
          </Card>
          <Card title="Schedule & Governance">
            <div className="form-grid">
              <Field label="Planned Start" type="date" />
              <Field label="Planned Finish" type="date" />
              <label className="field">
                <span>Project Manager*</span>
                <select>
                  <option>Engr. A. Adeyemi</option>
                  <option>Engr. M. Okafor</option>
                </select>
              </label>
              <label className="field">
                <span>Executive Sponsor*</span>
                <select>
                  <option>GM Operations</option>
                  <option>MD/CEO</option>
                </select>
              </label>
              <label className="field">
                <span>Project Classification</span>
                <select>
                  <option>Strategic</option>
                  <option>Major</option>
                  <option>Standard</option>
                </select>
              </label>
              <label className="field">
                <span>Risk Classification</span>
                <select>
                  <option>Medium</option>
                  <option>High</option>
                  <option>Critical</option>
                </select>
              </label>
            </div>
          </Card>
        </div>
        <aside>
          <Card title="Creation Controls">
            <div className="control-check">
              <b>Required before activation</b>
              <label>
                <input type="checkbox" /> Approved contract / award evidence
              </label>
              <label>
                <input type="checkbox" /> Project manager assigned
              </label>
              <label>
                <input type="checkbox" /> Cost centre validated
              </label>
              <label>
                <input type="checkbox" /> Baseline dates approved
              </label>
              <label>
                <input type="checkbox" /> Project security classification
              </label>
            </div>
          </Card>
          <Card title="Workflow">
            <div className="workflow-mini">
              <span className="done">1</span>
              <div>
                <b>Project Creation</b>
                <small>Project Management</small>
              </div>
              <span>2</span>
              <div>
                <b>Commercial Review</b>
                <small>Commercial / Finance</small>
              </div>
              <span>3</span>
              <div>
                <b>Management Approval</b>
                <small>Approval matrix</small>
              </div>
              <span>4</span>
              <div>
                <b>Activation</b>
                <small>System generated</small>
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}
