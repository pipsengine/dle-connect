# DLE Cost Control Unit — Project Management Integration

## Purpose
This extension makes Cost Control a first-class business function in DLE Connect. It separates delivery accountability (Project Manager), purchasing execution (Procurement), accounting/payment (Finance/Treasury), and independent project cost governance (Cost Control).

## Implemented UI
- Portfolio Cost Control Workbench
- Project Cost Overview
- Budget & Baseline Governance
- Cost Breakdown Structure (CBS) & Cost Codes
- Commitments / Budget Check
- Actual Cost Reconciliation
- Labour & Timesheet Cost Validation
- Bottom-up Forecast / ETC / EAC
- Earned Value Management
- Variation / Change Cost Assessment
- Project Cash Flow Forecast
- Monthly Cost Period Close
- Cost Reporting Centre

## Workflow ownership
### Timesheets
Supervisor Entry -> Project Manager Work Verification -> Cost Controller Cost Allocation Validation -> HR Validation -> Payroll -> Actual Labour Cost

### Project procurement / commitments
Requirement -> WBS/CBS/Cost Code -> Procurement -> Cost Controller Budget Check -> Approval Matrix -> PO/Subcontract -> Actuals/Commitments Reconciliation

### Monthly forecast
Period Open -> Control Account Owner ETC Update -> Cost Control Challenge & Consolidate -> Project Manager Review -> CFO Approval -> Period Lock

### Cost baseline
Draft Baseline / Budget Change -> Cost Controller Review -> Project Manager Review -> CFO / MD Approval according to DLE matrix -> Locked Version

## Segregation of duties
Cost Control may validate budget availability, mapping, forecast and cost performance, but must not execute supplier payments, change accounting postings, alter payroll, or approve its own originating transactions. Approved baselines are immutable and superseded by controlled new versions.

## Database
Run after the project-management base migrations:
1. `database/001_project_management_schema.sql`
2. `database/002_seed_reference.sql`
3. `database/003_cost_control_schema.sql`

## API endpoints
- `GET/PATCH /api/cost-control/commitments`
- `GET/PATCH /api/cost-control/timesheets`
- `POST /api/cost-control/forecast`

The APIs use transactions and write to `pm.AuditLog`. In DLE Connect integration, actor identity must come from the authenticated server session / enterprise identity context, not arbitrary browser-supplied user IDs. The payload actor fields are included here to make the standalone module testable; replace them with your central DLE Connect auth context during integration.

## RBAC recommendations
- `COST_CONTROL_VIEW`
- `COST_CONTROL_VALIDATE`
- `COST_CONTROL_FORECAST`
- `COST_CONTROL_BASELINE_ADMIN`
- `COST_CONTROL_PERIOD_CLOSE`
- `COST_CONTROL_REPORT`
- `PROJECT_MANAGER_COST_REVIEW`
- `CFO_COST_APPROVE`
- `AUDIT_COST_READ`

## Integration points
- Sage X3: read actual GL/AP/PO/GRN data and reconcile into `ActualCostTransactions` and commitments.
- HRIS/Timesheets: receive PM-approved lines and return Cost Control decision to workflow.
- Procurement: budget check before commercial commitment / PO release.
- Finance/Treasury: approved project coding and cost reports; no payment execution by Cost Control.
- Planning/P6: PV/EV and schedule data for EVM.
- Change Control: cost impact assessment feeds approved baseline changes and EAC.
