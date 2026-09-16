import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SessionPayload } from '../lib/auth/session';
import { getInternshipReview, listInternshipReviews, resendInternshipInitiationNotice } from '../lib/internship-performance-review-store';
import { resolveMailProvider } from '../lib/mail-service';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFiles = [path.join(__dirname, '..', '.env.local'), path.join(__dirname, '..', '.env')];

for (const envPath of envFiles) {
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim().replace(/^"|"$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

const compact = (value: unknown) => String(value || '').trim();
const requested = compact(process.argv[2] || 'IPR-2026-0001');

const session: SessionPayload = {
  sub: 'internship-workflow',
  username: 'internship-workflow',
  fullName: 'Internship Performance Review',
  roles: ['System'],
  permissions: [],
  status: 'Active',
  firstLoginRequired: false,
  passwordResetRequired: false,
  isGlobalAdmin: true,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
};

const reviews = await listInternshipReviews();
const review = (await getInternshipReview(requested))
  || reviews.find((item) => item.id.toUpperCase() === requested.toUpperCase())
  || reviews.find((item) => item.employee.code.toUpperCase() === requested.toUpperCase())
  || reviews[0]
  || null;

if (!review) {
  console.error(JSON.stringify({
    sent: false,
    reason: `No internship review found for ${requested}.`,
    reviewCount: reviews.length,
    mailProvider: resolveMailProvider(),
  }));
  process.exit(1);
}

try {
  const result = await resendInternshipInitiationNotice(review.id, session, 'System');
  console.log(JSON.stringify({
    sent: result.delivery.sent,
    reviewId: result.review.id,
    intern: result.review.employee.name,
    internCode: result.review.employee.code,
    lineManager: result.review.supervisor || result.review.employee.lineManager,
    lineManagerCode: result.review.supervisorCode || result.review.employee.lineManagerCode || '',
    to: result.delivery.to || '',
    mailProvider: resolveMailProvider(),
  }));
} catch (error) {
  console.error(JSON.stringify({
    sent: false,
    reviewId: review.id,
    intern: review.employee.name,
    internCode: review.employee.code,
    lineManager: review.supervisor || review.employee.lineManager,
    lineManagerCode: review.supervisorCode || review.employee.lineManagerCode || '',
    mailProvider: resolveMailProvider(),
    reason: error instanceof Error ? error.message : 'Unable to email the line manager.',
  }));
  process.exit(1);
}
