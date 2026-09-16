# DLE Internship Performance Review — Full Integration Module v2

A production-oriented UI/workflow package for integration under **Human Resources → Performance Management** in DLE Connect.

## Implemented pages
1. `/performance/internship-reviews` — HR dashboard + review register + KPI cards + filters/export controls
2. `/performance/internship-reviews/new` — HR initiation, eligibility preview, hierarchy validation and assignment
3. `/performance/internship-reviews/my-tasks` — role-aware evaluation/approval task centre
4. `/performance/internship-reviews/[id]` — review record, approval journey, recommendation, audit trail
5. `/performance/internship-reviews/[id]/evaluate` — complete Line Manager form with all 11 original criteria, 5-point matrix, live score and narratives
6. `/performance/internship-reviews/[id]/approve` — HOD/HR Manager/MD approval workspace with approve/return actions
7. `/performance/internship-reviews/[id]/hr-action` — post-MD HR action/transition page
8. `/performance/internship-reviews/reports` — analytics, recommendation outcomes and turnaround metrics
9. `/performance/internship-reviews/settings` — HR configuration, eligibility, workflow, reminders and rating scale

## Workflow implemented in the UI model
HR initiates → Line Manager evaluates/submits → HOD/Functional Manager (when configured) → HR Manager → MD final approval → HR + Line Manager notification → HR records next action → close.

If no HOD/Functional Manager exists, that stage is explicitly marked **Skipped** and the workflow routes directly to HR Manager. A returned decision routes to the Line Manager for correction and preserves the approver comment.

## Integration points
Replace `lib/mock-data.ts` with DLE Connect API/repository calls. Bind employee and hierarchy fields to Employee Directory. Bind role checks to existing authentication/RBAC. Persist evaluation scores, narratives, approvals, audit events and HR action to SQL Server. Use the existing notification service for assignment, reminder, approval, return, final approval and HR-action notifications.

Recommended entities: `InternshipReview`, `InternshipReviewScore`, `InternshipReviewApproval`, `InternshipReviewAudit`, `InternshipReviewNotification`, `InternshipReviewHRAction`.

## Important controls
- HR only initiates eligible reviews.
- Line Manager can edit only while assigned/in evaluation or after a formal return.
- Submission validates all 11 ratings plus required recommendation narratives.
- Submitted evaluation is locked.
- Approvers cannot modify the Line Manager's original evaluation; they approve or return with comments.
- MD is the final approver.
- Final approval triggers HR and Line Manager notifications.
- HR action is separately recorded after approval.
- Every transition should create an immutable audit event.
- Never infer HOD: resolve from organization hierarchy; skip only when truly absent.

## Run standalone for visual validation
`npm install` then `npm run dev`.
