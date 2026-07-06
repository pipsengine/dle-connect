const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const envPath = path.join(__dirname, '.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (!match) continue;
  process.env[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
}

const transport = nodemailer.createTransport({
  host: process.env.DLE_SMTP_HOST,
  port: Number(process.env.DLE_SMTP_PORT || 587),
  secure: false,
  requireTLS: true,
  auth: {
    user: process.env.DLE_SMTP_USER,
    pass: process.env.DLE_SMTP_PASSWORD,
  },
  tls: { minVersion: 'TLSv1.2' },
});

transport
  .verify()
  .then(() => {
    console.log('SMTP_VERIFY_OK');
    process.exit(0);
  })
  .catch((error) => {
    console.error('SMTP_VERIFY_FAIL:', error.message);
    process.exit(1);
  });
