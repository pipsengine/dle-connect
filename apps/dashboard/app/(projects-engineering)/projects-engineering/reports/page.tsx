import { PageHeading, Card, Button } from '@/components/projects-engineering/UI';

const reports = [
  ['Executive Project Report', 'One-page project health, progress, cost, risk and decisions', 'Weekly', 'MD/CEO · CFO · GMs'],
  ['Monthly Progress Report', 'Client-facing engineering, procurement, construction and HSE pack', 'Monthly', 'Client · Project Team'],
  ['Engineering Status Report', 'MDR progress, overdue deliverables, review cycles and TQs', 'Weekly', 'Engineering'],
  ['Cost & Forecast Report', 'Budget, commitments, actuals, EAC, cash flow and variances', 'Monthly', 'CFO · Project Manager'],
  ['Procurement Status Report', 'PR/RFQ/CBE/PO/expediting/logistics status', 'Weekly', 'Procurement · Project'],
  ['HSE & Quality Report', 'Leading/lagging HSE and QA/QC performance', 'Monthly', 'Management · Client'],
  ['Connector Sync Report', 'P6 / EDMS / ERP import exceptions and reconciliation', 'Daily', 'Project Controls · IT'],
];

export default function PortfolioReportsPage() {
  return (
    <>
      <PageHeading
        title="Portfolio Reporting Centre"
        description="Generate governed project and portfolio reports for management, client and control-team audiences."
      />
      <div className="report-grid">
        {reports.map((r) => (
          <Card key={r[0]}>
            <div className="report-card">
              <div className="report-icon">▥</div>
              <h3>{r[0]}</h3>
              <p>{r[1]}</p>
              <div>
                <span>{r[2]}</span>
                <small>{r[3]}</small>
              </div>
              <Button variant="secondary">Generate Report</Button>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
