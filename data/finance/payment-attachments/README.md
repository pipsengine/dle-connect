# Payment request attachments (durable)

Uploaded payment-request files are stored here:

```text
data/finance/payment-attachments/<PREQ-...>/<att-...-original-name.ext>
```

## Why this folder

IIS republish replaces `apps/dashboard/data`. Attachments must live under the site/repo
`data/finance` tree so they survive deploy.

## Runtime

- Env override: `DLE_FINANCE_DATA_DIR` (defaults to `{siteRoot}/data/finance` in IIS)
- The app dual-writes to this durable root and a nested mirror when possible
- Downloads search every known root so older paths still resolve

Do not delete request subfolders while the payment request is open.
