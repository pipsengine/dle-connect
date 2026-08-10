# Payment request attachments (durable)

Uploaded payment-request files are stored here:

```text
data/finance/payment-attachments/<PREQ-...>/<att-...-original-name.ext>
```

On the live server:

```text
F:\Dorman-Long\dle-connect\data\finance\payment-attachments
```

## Why this folder

IIS republish replaces `deployment/iis/site`. Attachments must live under the **repo-root**
`data/finance` tree so they survive deploy.

## Runtime

- Env: `DLE_FINANCE_DATA_DIR=F:\Dorman-Long\dle-connect\data\finance`
- Uploads write here first, then mirror into the IIS package when possible
- Downloads search the durable root plus legacy site/nested paths

Do not delete request subfolders while the payment request is open.
