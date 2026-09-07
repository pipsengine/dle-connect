# DLE Integration & Production Implementation Guide

## 1. Architectural role
The Project entity is the master operational context. Existing DLE Connect functions must reference `ProjectId` rather than creating independent project lists. Finance remains the financial system of record, Sage X3 remains the ERP source where applicable, P6 remains schedule-authoring source where adopted, and EDMS/CDE remains the controlled-information source. DLE Connect provides orchestration, consolidated control, workflow, analytics and governed project intelligence.

## 2. Authentication and authorization
Use the existing DLE Connect authenticated user. Resolve employee identity, role and project membership server-side. UI permissions are convenience only; every API mutation must re-check authorization. Suggested permissions are in `src/lib/rbac.ts`. Project cost values require finance/cost permissions. AI responses must never bypass the caller's underlying data permissions.

## 3. Data ownership
- Project master: DLE Connect PM schema.
- Employee master: Sage 300 People / HRIS synchronized to DLE employee directory.
- Procurement / commitments / actuals: Sage X3 interfaces.
- Planning: DLE PM for native plans; P6 import for integrated schedules.
- Controlled documents: EDMS/CDE identifiers + metadata in PM; binaries stay in CDE.
- Approvals: central DLE Connect workflow engine.

## 4. Project creation workflow
Draft → Commercial Review → PM/GM Review → Management Approval → Active. Activation requires project manager, cost centre, approved dates, security classification and award/contract evidence. Approval matrix is determined from project classification and value.

## 5. Audit
All create/update/approve/reject/import/AI-decision events must write `pm.AuditLog`. Store actor, UTC timestamp, correlation ID, reason and before/after JSON. Never permit application users to edit audit rows.

## 6. Concurrency and reliability
Use SQL `rowversion` for optimistic concurrency on project master and critical registers. Use idempotency keys on external sync/import endpoints. Integrations must be queueable/retriable; the web request must not depend on long P6/X3/CDE operations finishing synchronously.

## 7. AI governance
Project AI is advisory. Each generated insight stores model identifier, evidence/source snapshot, confidence, generated-for user and later human decision. AI cannot approve a PO, change schedule baseline, close an NCR, alter cost forecast, or issue client correspondence without authorized human workflow.

## 8. Deployment on DLE Windows Server / IIS
Build with `npm run build`, deploy standalone Next.js artifact under the existing DLE Connect IIS reverse-proxy model, and inject secrets as server environment variables. Use the existing DLE backup strategy for the `DLE_Enterprise` database. Run migrations only through approved release change control.

## 9. Production QA acceptance
Validate RBAC matrix, project isolation, financial field restrictions, workflow transitions, audit immutability, data import idempotency, time-zone handling (store UTC/display WAT), browser responsiveness, empty/error/loading states, keyboard navigation, export authorization, and recovery from connector/API failure before production release.
