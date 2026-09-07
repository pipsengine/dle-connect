# Security Controls

- SSO/authentication inherited from DLE Connect; no module-local password store.
- Deny-by-default API authorization and project-membership checks.
- Parameterized SQL only; no dynamic user-generated SQL.
- Secrets only in server environment / approved secret store.
- Project data classification shown in UI and preserved in reports/exports.
- Financial and commercial fields have independent permissions.
- File binaries remain in controlled EDMS/CDE; module stores immutable references and metadata.
- Audit every material state transition and external synchronization.
- AI retrieval is permission-filtered and evidence-linked.
- CSRF/session controls and security headers inherited from the parent DLE Connect application.
- Apply rate limiting to reports, imports, AI and bulk-export endpoints.
