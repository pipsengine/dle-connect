import {
  celebrationEmailIntro,
  celebrationEmailSubject,
  celebrationPhotoCid,
  celebrationWishPortalUrl,
  initialsForName,
  isSameEmployee,
  type CelebrationDirectoryPerson,
  type CelebrationMoment,
} from '@/lib/celebration-moments';
import { buildDleEmail, escapeHtml, formatEmailDate } from '@/lib/email-templates';

const compact = (value: unknown) => String(value || '').trim();

const kindLabel = (kind: CelebrationMoment['kind'], years?: number) => {
  if (kind === 'birthday') return 'Birthday';
  const count = years || 1;
  return `${count} year${count === 1 ? '' : 's'} with Dorman Long`;
};

const cardAccent = (kind: CelebrationMoment['kind']) =>
  kind === 'birthday'
    ? { from: '#DB2777', to: '#F97316', button: '#DB2777' }
    : { from: '#4338CA', to: '#2563EB', button: '#4338CA' };

const photoHtml = (moment: CelebrationMoment, photoCids: Set<string>) => {
  const cid = celebrationPhotoCid(moment.employeeCode);
  if (photoCids.has(cid)) {
    return `<img src="cid:${escapeHtml(cid)}" alt="${escapeHtml(moment.fullName)}" width="88" height="88" style="display:block;width:88px;height:88px;border-radius:44px;object-fit:cover;border:3px solid #ffffff" />`;
  }
  const bg = moment.kind === 'birthday' ? '#FDF2F8' : '#EEF2FF';
  const fg = moment.kind === 'birthday' ? '#BE185D' : '#3730A3';
  return `<div style="width:88px;height:88px;border-radius:44px;background:${bg};color:${fg};font-weight:800;font-size:26px;line-height:88px;text-align:center;border:3px solid #ffffff">${escapeHtml(initialsForName(moment.fullName))}</div>`;
};

const cardHtml = (moment: CelebrationMoment, wishUrl: string, photoCids: Set<string>, recipientIsHonoree: boolean) => {
  const accent = cardAccent(moment.kind);
  const cta = recipientIsHonoree ? 'See your wishes' : `Wish ${moment.firstName}`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 16px;border:1px solid #E2E8F0;border-radius:16px;overflow:hidden">
    <tr>
      <td style="padding:22px 20px;background:linear-gradient(135deg,${accent.from} 0%,${accent.to} 100%);text-align:center;color:#ffffff">
        <div style="display:inline-block;margin-bottom:12px;background:rgba(255,255,255,0.18);border-radius:999px;padding:5px 12px;font-size:11px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase">${escapeHtml(kindLabel(moment.kind, moment.years))}</div>
        <div style="display:inline-block;background:#ffffff;border-radius:48px;padding:4px">${photoHtml(moment, photoCids)}</div>
        <div style="margin-top:12px;font-size:20px;font-weight:800;line-height:1.3">${escapeHtml(moment.fullName)}</div>
        <div style="margin-top:4px;font-size:13px;font-weight:600;opacity:0.92">${escapeHtml(moment.department)}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:18px 20px 20px;text-align:center;background:#ffffff">
        <a href="${escapeHtml(wishUrl)}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:${accent.button};color:#ffffff;text-decoration:none;font-size:14px;font-weight:700">${escapeHtml(cta)}</a>
      </td>
    </tr>
  </table>`;
};

export const buildCelebrationEmail = (input: {
  moments: CelebrationMoment[];
  recipient: CelebrationDirectoryPerson;
  recipientName: string;
  baseUrl: string;
  photoCids?: string[];
}) => {
  const photoCids = new Set(input.photoCids || []);
  const subject = celebrationEmailSubject(input.moments, input.recipient);
  const intro = celebrationEmailIntro(input.moments, input.recipient);
  const cards = input.moments
    .map((moment) => cardHtml(
      moment,
      celebrationWishPortalUrl(input.baseUrl, {
        employeeCode: moment.employeeCode,
        kind: moment.kind,
        date: moment.date,
      }),
      photoCids,
      isSameEmployee(moment, input.recipient),
    ))
    .join('');
  const wallUrl = input.moments[0]
    ? celebrationWishPortalUrl(input.baseUrl, {
        employeeCode: input.moments[0].employeeCode,
        kind: input.moments[0].kind,
        date: input.moments[0].date,
      })
    : `${compact(input.baseUrl).replace(/\/$/, '')}/workforce-portal?tab=communication`;
  const ownDay = input.moments.some((item) => isSameEmployee(item, input.recipient));

  return buildDleEmail({
    recipientName: input.recipientName,
    subject,
    module: 'Employee Self-Service',
    headline: ownDay ? 'The Dorman Long family is celebrating you' : 'Celebrating our colleagues today',
    intro,
    tone: 'success',
    accentColor: input.moments.every((item) => item.kind === 'anniversary') ? '#4338CA' : '#DB2777',
    preheader: intro,
    bodyHtml: cards,
    actions: [{ href: wallUrl, label: ownDay ? 'Open your celebration wall' : 'Send a wish in DLE Connect', tone: 'primary' }],
    footerNote: `Celebration date: ${formatEmailDate(input.moments[0]?.date)}. Sign in to DLE Connect to leave a public wish. This message was sent only to colleagues with an email address on file.`,
  });
};
