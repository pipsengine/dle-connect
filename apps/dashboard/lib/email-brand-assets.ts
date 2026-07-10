import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const EMAIL_BRAND_LOGO_CID = 'dle-brand-logo';

const compact = (value: unknown) => String(value || '').trim();

const resolveLogoPath = () => {
  const cwd = process.cwd();
  const dashboardRoot = /[\\/]apps[\\/]dashboard$/i.test(cwd) ? cwd : path.join(cwd, 'apps', 'dashboard');
  return path.join(dashboardRoot, 'public', 'brand', 'dorman-long-logo.png');
};

let cachedLogoBase64: string | null | undefined;

export const readEmailBrandLogoBase64 = async () => {
  if (cachedLogoBase64 !== undefined) return cachedLogoBase64;
  try {
    const bytes = await readFile(resolveLogoPath());
    cachedLogoBase64 = bytes.toString('base64');
    return cachedLogoBase64;
  } catch {
    cachedLogoBase64 = null;
    return null;
  }
};

export const emailBrandLogoCidUrl = () => `cid:${EMAIL_BRAND_LOGO_CID}`;

export const shouldEmbedEmailBrandLogo = () =>
  String(process.env.DLE_EMAIL_LOGO_EMBED || 'true').toLowerCase() !== 'false';

export const buildEmailBrandLogoAttachment = async () => {
  const contentBytes = await readEmailBrandLogoBase64();
  if (!contentBytes) return null;
  return {
    filename: 'dorman-long-logo.png',
    content: Buffer.from(contentBytes, 'base64'),
    contentType: 'image/png',
    cid: EMAIL_BRAND_LOGO_CID,
    contentId: EMAIL_BRAND_LOGO_CID,
    contentBytes,
  };
};

export const resolveEmailLogoPublicUrl = (baseUrl?: string | null) => {
  const configured = compact(process.env.DLE_EMAIL_LOGO_URL);
  if (configured) return configured;
  const base = compact(baseUrl).replace(/\/$/, '');
  return base ? `${base}/brand/dorman-long-logo.png` : '';
};
