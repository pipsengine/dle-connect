# Telephone Allowance / Call Credit — Implementation Report

## Pages (4)
1. `/it-support/telephone-allowance` — Dashboard  
2. `/it-support/telephone-allowance/manage` — Current Cycle | Entitlements | Previous Cycles  
3. `/it-support/telephone-allowance/approvals` — Pending / In Progress / Completed  
4. `/it-support/telephone-allowance/payment-reporting` — Payment | Reports | Exceptions | Audit  

Sidebar: **Telephone Allowance** with the four sub-items above (`apps/dashboard/lib/it-support/nav.ts`).

## Database
Schema `hris` tables (idempotent DDL in `telephone-allowance-sql-schema.ts`):
- TelephoneAllowanceEntitlement  
- TelephoneAllowanceCycle (+ PayloadJson for employees/versions/changes/approvals)  
- TelephoneAllowancePayment  
- TelephoneAllowanceException  
- TelephoneAllowanceAudit  

JSON fallback: `apps/dashboard/data/hris/telephone-allowance-store.json` when DB pool is unavailable.

## APIs / services
- `GET/POST /api/it-support/telephone-allowance`  
- Store: `telephone-allowance-store.ts`  
- Calc: `telephone-allowance-cycle.ts`  
- Access: `telephone-allowance-access.ts`  

## Calculation
- Monthly entitlement resolved by effective dating per calendar month  
- `bimonthlyTotal = month1Amount + month2Amount` (never blind monthly × 2)  
- Smoke: `_smoke-telephone-allowance.mts` → **SMOKE OK** (A/B/C/D §63 scenarios + illegal transition)

## Workflow
DRAFT → PENDING_HR_REVIEW → RETURNED_TO_IT → IT_VALIDATION → PENDING_HR_APPROVAL → PENDING_MD_APPROVAL → PENDING_CFO_AUTHORIZATION → AUTHORIZED_FOR_PAYMENT → PAYMENT_* → COMPLETED  
(+ RETURNED_FOR_CORRECTION). Server-side `assertTransition`, rowVersion concurrency, version snapshots, SoD on formal approval.

## Roles / permissions
- **Prepare / create cycle / initiate approval / import / entitlement master:** Global Super Administrator only (`canPrepare` / `canImport` never granted via IT role baselines).
- **Stage-only:** HR review, HR approve, MD approve, CFO authorize, Treasury pay/export.
- IT Administrator / IT Support Officer do **not** receive telephone-allowance prepare rights.
- Route and nav keys no longer use `it.*` to open this module for all IT users.

## Treasury
Module-owned payment schedule (CALL CARDS-style Excel export), mask bank unless Treasury/Finance, record payment / partial / exceptions.

## Notifications
Best-effort `createEnterpriseNotification` on handoffs.

## Test results
- Calc/transition smoke: PASS  
- End-to-end UI/API against live Jul–Aug Excel import: requires authenticated session + DB/JSON store; use Manage → entitlements/import → create cycle → HR → approvals → payment.

## Remaining limitations
- Historical Excel import is API-driven (POST `import-historical`); UI file picker can be added later.  
- Email templates reuse enterprise notifications; dedicated branded mail builders can be extended.  
- Reports tab is summary KPIs; richer register exports can reuse `excel-export` patterns already used for payment files.  
- Publish ACL baselines in Access Control Centre if published grants override role defaults.
