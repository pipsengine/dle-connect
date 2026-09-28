# DLE Connect — Timesheet Management Portal

Standalone enterprise portal designed to sit at the same navigation level as Human Resources, Finance, Procurement and Projects & Engineering. It does not require placement under HRIS.

## Implemented workspaces
Dashboard; Timesheet Entry; Timesheet Review; Timesheet Periods; Crew & Assignments; Attendance Reconciliation; OVT & Night Work; Offshore & Mobilization; Approvals; Corrections & Adjustments; Reports; Configuration.

## Core controls
Effective-dated identity/assignment, immutable raw biometric evidence, multi-project booking, period open/close lifecycle, cross-midnight night work, OVT authorization, offshore mobilization, staged approvals, payroll snapshot and controlled adjustment model.

## Run
`npm install` then `npm run dev`. Domain smoke tests: `npm test`.

## Integration
The `database` folder contains a SQL Server schema baseline. `docs/openapi.json` describes the intended integration API. Existing DLE Connect Employee Directory, Projects and Payroll remain external masters/consumers.

## Offshore & Mobilization redesign (2026-09-28)
The Offshore & Mobilization workspace now includes a dedicated Figma-quality New Crew Mobilization workflow with multi-employee selection, searchable employee/project/site/supervisor controls, effective-dated mobilization and expected-return dates, project-linked offshore eligibility, authorization/reference, reason, movement method, operational notes, validation, selected-crew chips, bulk selection, status KPIs, searchable/filterable records and audit-safe behavior. Mobilization does not create attendance, worked hours, overtime or payable days; those remain Timesheet Entry transactions.

## Crew & Assignments redesign (2026-09-28)
The Crew Assignment workspace now follows the approved dual-list Figma reference: searchable effective-date/location/work-centre/supervisor filters, available-vs-assigned crew, multi-select, select-all, bulk assignment/removal controls, effective-dated assignment intent, operational-status badges, independent table scrolling and responsive layout. Normal crew assignment does not assign projects; daily project allocation remains in Timesheet Entry.

## Offshore multi-employee mobilization
Offshore & Mobilization supports one mobilization transaction containing multiple selected employees, with searchable employee selection, select-all-visible, selected chips, project/site/offshore-supervisor context, effective dates and employee-level mobilization records. Mobilization never auto-creates attendance, regular hours or OVT.
