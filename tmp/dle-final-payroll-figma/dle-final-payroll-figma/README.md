# DLE Connect — Final Payroll Processing Figma Implementation

Two production-oriented Next.js/React pages recreated from the approved designs:

- `/offboarding/final-payroll-processing` — Final Payroll Processing dashboard, KPI cards, status tabs, register, selected employee settlement workspace, clearance, calculation, workflow, comments and actions.
- `/offboarding/final-payroll-processing/new-settlement` — New Final Payroll Settlement wizard, employee/exit/payroll controls, approval path, earnings tabs and entitlement table.

## Run
```bash
npm install
npm run dev
```

## Design tokens
All colors, spacing, borders, shadows, typography, status chips and layout rules are centralized in `app/globals.css`. The implementation is responsive and uses Lucide icons.

## Integration
Replace the static arrays in each page with your existing DLE Connect API/service layer. Preserve server-side authorization, audit logging, payroll locking, FX/currency rules, approval matrix, and clearance integrations.

Reference images are included in `/public` for visual QA.
