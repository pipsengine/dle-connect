/**
 * Round-trip verify durable payment attachment storage.
 *   cd apps/dashboard && npx tsx ../../scripts/verify-payment-attachment-storage.ts
 */
import path from 'node:path';
import { rm } from 'node:fs/promises';
import {
  describePaymentAttachmentStorage,
  readPaymentAttachmentFile,
  savePaymentAttachmentFile,
} from '../apps/dashboard/lib/finance-intelligence/payment-attachment-storage';

async function main() {
  const repoRoot = path.resolve(process.cwd().includes(`${path.sep}apps${path.sep}dashboard`)
    ? path.join(process.cwd(), '..', '..')
    : process.cwd());
  const siteRoot = path.join(repoRoot, 'deployment', 'iis', 'site');
  const dashboardCwd = path.join(siteRoot, 'apps', 'dashboard');

  process.chdir(dashboardCwd);
  process.env.DLE_FINANCE_DATA_DIR = path.join(siteRoot, 'data', 'finance');

  const requestId = `PREQ-VERIFY-${Date.now()}`;
  const fileName = 'att-verify-test-document.pdf';
  const payload = Buffer.from(`%PDF-1.4 durable-attachment-verify ${requestId}`);

  const saved = await savePaymentAttachmentFile(requestId, fileName, payload);
  const read = await readPaymentAttachmentFile(requestId, fileName);
  const desc = describePaymentAttachmentStorage();
  const ok = read.bytes.equals(payload);

  console.log(JSON.stringify({
    ok,
    saved,
    readBytes: read.bytes.length,
    readPath: read.path,
    storage: desc,
  }, null, 2));

  for (const root of desc.roots) {
    await rm(path.join(root, requestId), { recursive: true, force: true }).catch(() => undefined);
  }

  if (!ok) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
