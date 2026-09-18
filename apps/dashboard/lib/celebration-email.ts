import {
  celebrationEmailSubject,
  celebrationPhotoCid,
  celebrationWishPortalUrl,
  initialsForName,
  isSameEmployee,
  prettyPersonName,
  type CelebrationDirectoryPerson,
  type CelebrationMoment,
} from '@/lib/celebration-moments';
import { copyForMoment, type CelebrationFlyerCopy } from '@/lib/celebration-copy';
import { escapeHtml, formatEmailDate, resolveEmailLogoUrl } from '@/lib/email-templates';

const compact = (value: unknown) => String(value || '').trim();

const kindLabel = (kind: CelebrationMoment['kind'], years?: number) => {
  if (kind === 'birthday') return 'Birthday Celebration';
  const count = years || 1;
  return `${count} Year${count === 1 ? '' : 's'} of Service`;
};

const palette = (kind: CelebrationMoment['kind']) =>
  kind === 'birthday'
    ? {
        from: '#9D174D',
        mid: '#DB2777',
        to: '#EA580C',
        button: '#BE185D',
        wash: '#FFF1F2',
        ink: '#9F1239',
      }
    : {
        from: '#1E1B4B',
        mid: '#4338CA',
        to: '#1D4ED8',
        button: '#3730A3',
        wash: '#EEF2FF',
        ink: '#312E81',
      };

const photoHtml = (moment: CelebrationMoment, photoCids: Set<string>) => {
  const cid = celebrationPhotoCid(moment.employeeCode);
  if (photoCids.has(cid)) {
    return `<img src="cid:${escapeHtml(cid)}" alt="${escapeHtml(moment.fullName)}" width="112" height="112" style="display:block;width:112px;height:112px;border-radius:56px;object-fit:cover;border:4px solid #ffffff" />`;
  }
  const colors = palette(moment.kind);
  return `<div style="width:112px;height:112px;border-radius:56px;background:${colors.wash};color:${colors.ink};font-weight:800;font-size:32px;line-height:112px;text-align:center;border:4px solid #ffffff">${escapeHtml(initialsForName(moment.fullName))}</div>`;
};

const flyerCardHtml = (
  moment: CelebrationMoment,
  wishUrl: string,
  photoCids: Set<string>,
  recipientIsHonoree: boolean,
  copy: CelebrationFlyerCopy | undefined,
) => {
  const colors = palette(moment.kind);
  const message = copyForMoment(copy, moment);
  const body = recipientIsHonoree ? message.honoreeMessage : message.colleagueMessage;
  const cta = recipientIsHonoree ? message.ctaHonoree : message.ctaColleague;
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;border-collapse:separate;border:1px solid #E2E8F0;border-radius:18px;overflow:hidden">
    <tr>
      <td style="padding:28px 24px 22px;background:${colors.from};background-image:linear-gradient(160deg,${colors.from} 0%,${colors.mid} 52%,${colors.to} 100%);text-align:center;color:#ffffff">
        <div style="display:inline-block;margin-bottom:16px;background:rgba(255,255,255,0.16);border:1px solid rgba(255,255,255,0.28);border-radius:999px;padding:6px 14px;font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase">${escapeHtml(kindLabel(moment.kind, moment.years))}</div>
        <div style="font-size:26px;font-weight:800;line-height:1.25;letter-spacing:-0.02em">${escapeHtml(message.headline)}</div>
        <div style="display:inline-block;margin:18px 0 8px;background:#ffffff;border-radius:999px;padding:5px;box-shadow:0 10px 24px rgba(15,23,42,0.22)">${photoHtml(moment, photoCids)}</div>
        <div style="margin-top:10px;font-size:20px;font-weight:800;line-height:1.3">${escapeHtml(moment.fullName)}</div>
        <div style="margin-top:4px;font-size:13px;font-weight:600;opacity:0.92">${escapeHtml(moment.department)}${moment.kind === 'anniversary' && moment.years ? ` · ${moment.years} year${moment.years === 1 ? '' : 's'}` : ''}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:22px 24px 24px;background:#ffffff;text-align:center">
        <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#334155">${escapeHtml(body)}</p>
        <a href="${escapeHtml(wishUrl)}" style="display:inline-block;padding:13px 22px;border-radius:999px;background:${colors.button};color:#ffffff;text-decoration:none;font-size:14px;font-weight:700">${escapeHtml(cta)}</a>
      </td>
    </tr>
  </table>`;
};

const flyerHero = (moments: CelebrationMoment[], ownDay: boolean) => {
  const birthdays = moments.filter((item) => item.kind === 'birthday');
  const anniversaries = moments.filter((item) => item.kind === 'anniversary');
  if (ownDay && moments.length === 1 && moments[0].kind === 'birthday') {
    return { kicker: 'A message from Dorman Long Engineering', title: 'Happy Birthday' };
  }
  if (ownDay && moments.length === 1 && moments[0].kind === 'anniversary') {
    return { kicker: 'A message from Dorman Long Engineering', title: 'Happy Work Anniversary' };
  }
  if (birthdays.length && !anniversaries.length) {
    return { kicker: 'People of Dorman Long', title: birthdays.length === 1 ? 'Birthday Celebration' : 'Birthday Celebrations Today' };
  }
  if (anniversaries.length && !birthdays.length) {
    return { kicker: 'People of Dorman Long', title: anniversaries.length === 1 ? 'Work Anniversary' : 'Work Anniversaries Today' };
  }
  return { kicker: 'People of Dorman Long', title: 'Celebrating Our Colleagues Today' };
};

export const buildCelebrationEmail = (input: {
  moments: CelebrationMoment[];
  recipient: CelebrationDirectoryPerson;
  recipientName: string;
  baseUrl: string;
  photoCids?: string[];
  copy?: CelebrationFlyerCopy;
}) => {
  const photoCids = new Set(input.photoCids || []);
  const subject = celebrationEmailSubject(input.moments, input.recipient);
  const recipientName = prettyPersonName(input.recipientName) || 'Colleague';
  const ownDay = input.moments.some((item) => isSameEmployee(item, input.recipient));
  const hero = flyerHero(input.moments, ownDay);
  const logoUrl = resolveEmailLogoUrl(input.baseUrl);
  const dateLabel = formatEmailDate(input.moments[0]?.date);
  const cards = input.moments
    .map((moment) => flyerCardHtml(
      moment,
      celebrationWishPortalUrl(input.baseUrl, {
        employeeCode: moment.employeeCode,
        kind: moment.kind,
        date: moment.date,
      }),
      photoCids,
      isSameEmployee(moment, input.recipient),
      input.copy,
    ))
    .join('');
  const textCards = input.moments.map((moment) => {
    const message = copyForMoment(input.copy, moment);
    const self = isSameEmployee(moment, input.recipient);
    const url = celebrationWishPortalUrl(input.baseUrl, {
      employeeCode: moment.employeeCode,
      kind: moment.kind,
      date: moment.date,
    });
    return [
      message.headline,
      moment.fullName,
      moment.department,
      self ? message.honoreeMessage : message.colleagueMessage,
      `${self ? message.ctaHonoree : message.ctaColleague}: ${url}`,
    ].join('\n');
  }).join('\n\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#0F172A;font-family:Georgia,'Times New Roman',Times,serif;color:#0F172A">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(hero.title)} — ${escapeHtml(dateLabel)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#0F172A;padding:28px 12px">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:620px;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 18px 50px rgba(2,6,23,0.28)">
          <tr>
            <td style="padding:22px 28px 18px;background:#ffffff;border-bottom:1px solid #E2E8F0;text-align:center;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif">
              ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="Dorman Long Engineering" width="180" height="36" style="display:inline-block;height:36px;max-width:180px;width:180px;border:0;outline:none;text-decoration:none" />` : ''}
              <div style="margin-top:10px;font-size:11px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:#64748B">DLE Connect · Employee Celebrations</div>
            </td>
          </tr>
          <tr>
            <td style="padding:26px 28px 8px;text-align:center;background:#F8FAFC">
              <div style="font-size:12px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:#0369A1;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif">${escapeHtml(hero.kicker)}</div>
              <div style="margin-top:8px;font-size:28px;font-weight:800;line-height:1.25;color:#0F172A">${escapeHtml(hero.title)}</div>
              <p style="margin:12px 0 18px;font-size:16px;line-height:1.6;color:#475569">Hello ${escapeHtml(recipientName)},</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px 8px;background:#F8FAFC">
              ${cards}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 24px;background:#F8FAFC;text-align:center;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif">
              <p style="margin:0;font-size:12px;line-height:1.7;color:#64748B">Celebration date: ${escapeHtml(dateLabel)}. Sign in to DLE Connect to leave a public wish. This message was sent only to colleagues with an email address on file.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 22px;background:#0F172A;text-align:center;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif">
              <p style="margin:0;font-size:12px;line-height:1.6;color:#94A3B8">Dorman Long Engineering · Automated celebration flyer from DLE Connect</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    'Dorman Long Engineering',
    hero.title,
    '',
    `Hello ${recipientName},`,
    '',
    textCards,
    '',
    `Celebration date: ${dateLabel}`,
    'Sign in to DLE Connect to leave a public wish.',
  ].join('\n');

  return { subject, html, text };
};
