# DLE Process Payroll — Figma-Style Implementation

A production-oriented Next.js/React implementation of the approved Process Payroll redesign.

## Included
- Exact page hierarchy from the approved design
- Single sidebar entry for **Process Payroll**
- Schedule tabs for DLE Salaries, DLPC Salaries, DLE Day-rate, DLPC Day-rate
- KPI cards using matching blue/green/red/purple visual language
- Compact 11-stage payroll workflow
- Next-step approval card
- Tabbed content area to remove excessive page scrolling
- Payroll register table with search, filters, status badges and pagination
- Responsive breakpoints

## Route
`/hris/payroll-management/process-payroll/dle-salaries`

## Run
```bash
npm install
npm run dev
```

Open `http://localhost:3020/hris/payroll-management/process-payroll/dle-salaries`

## Integration notes
Replace the mock arrays in `src/components/ProcessPayrollPage.tsx` with data from the existing DLE Connect payroll APIs. Keep the schedule and content tabs; they are intentionally UI-state controls rather than duplicated sidebar routes.

For the closest visual match, use your existing DLE Connect logo asset and the same global font used by the current portal shell. The CSS tokens at the top of `ProcessPayrollPage.module.css` are the authoritative palette for this redesign.
