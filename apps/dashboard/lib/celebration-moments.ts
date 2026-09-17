export type CelebrationKind = 'birthday' | 'anniversary';

export type CelebrationDirectoryPerson = {
  employeeId?: string;
  employeeCode?: string;
  fullName?: string;
  firstName?: string;
  preferredName?: string;
  department?: string;
  status?: string;
  dateOfBirth?: string;
  dateJoined?: string;
  contractStartDate?: string;
  yearsOfService?: number;
  hasPhoto?: boolean;
};

export type CelebrationMoment = {
  id: string;
  kind: CelebrationKind;
  fullName: string;
  firstName: string;
  department: string;
  date: string;
  years?: number;
  employeeId: string;
  employeeCode: string;
  hasPhoto: boolean;
};

const compact = (value: unknown) => String(value || '').trim();

export const todayIsoLocal = (now = new Date()) => {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const isoDate = (value?: string | Date | null) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return compact(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
};

export const isInactiveWorkforceStatus = (status: unknown) =>
  /inactive|terminated|resigned|retired|deceased|exit/i.test(compact(status));

export const celebrationEmployeeKey = (person: Pick<CelebrationMoment, 'employeeCode' | 'employeeId' | 'kind'>) =>
  `${person.kind}:${compact(person.employeeCode || person.employeeId).toUpperCase()}`;

export const normalizeEmployeeCode = (value: unknown) => compact(value).toUpperCase();

export const codesMatch = (left?: string | null, right?: string | null) => {
  const a = normalizeEmployeeCode(left);
  const b = normalizeEmployeeCode(right);
  return Boolean(a && b && a === b);
};

export const displayFirstName = (person: Pick<CelebrationDirectoryPerson, 'firstName' | 'preferredName' | 'fullName'>) => {
  const preferred = compact(person.preferredName);
  if (preferred) return preferred.split(/\s+/)[0];
  const first = compact(person.firstName);
  if (first) return first.split(/\s+/)[0];
  const parts = compact(person.fullName).split(/\s+/).filter(Boolean);
  return parts[0] || compact(person.fullName) || 'Colleague';
};

export const initialsForName = (name: string) =>
  compact(name)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'DL';

export const yearsOfService = (employee: CelebrationDirectoryPerson, today = todayIsoLocal()) => {
  const joined = isoDate(employee.dateJoined || employee.contractStartDate);
  if (!joined) return Math.max(0, Math.round((Number(employee.yearsOfService || 0)) * 10) / 10);
  const start = new Date(`${joined}T00:00:00.000Z`);
  const now = new Date(`${today}T00:00:00.000Z`);
  const years = (now.getTime() - start.getTime()) / (365.25 * 24 * 3600 * 1000);
  return Math.max(0, Math.round(years * 10) / 10);
};

const monthDay = (value?: string | Date | null) => {
  const base = isoDate(value);
  if (!base) return '';
  const [, month, day] = base.split('-');
  return month && day ? `${month}-${day}` : '';
};

export const isSameEmployee = (
  person: Pick<CelebrationDirectoryPerson, 'employeeId' | 'employeeCode' | 'fullName'>,
  viewer?: Pick<CelebrationDirectoryPerson, 'employeeId' | 'employeeCode' | 'fullName'> | null,
) => {
  if (!viewer) return false;
  const viewerCode = normalizeEmployeeCode(viewer.employeeCode || viewer.employeeId);
  const personCode = normalizeEmployeeCode(person.employeeCode || person.employeeId);
  if (viewerCode && personCode && viewerCode === personCode) return true;
  const viewerName = compact(viewer.fullName).toLowerCase();
  const personName = compact(person.fullName).toLowerCase();
  return Boolean(viewerName && personName && viewerName === personName);
};

const toMoment = (
  person: CelebrationDirectoryPerson,
  kind: CelebrationKind,
  today: string,
  years?: number,
): CelebrationMoment | null => {
  const fullName = compact(person.fullName);
  const employeeId = compact(person.employeeId);
  const employeeCode = compact(person.employeeCode || person.employeeId);
  if (!fullName || !employeeCode) return null;
  return {
    id: `${kind === 'birthday' ? 'dateOfBirth' : 'dateJoined'}-${employeeId || employeeCode}-${today}`,
    kind,
    fullName,
    firstName: displayFirstName(person),
    department: compact(person.department) || 'Dorman Long',
    date: today,
    years,
    employeeId: employeeId || employeeCode,
    employeeCode,
    hasPhoto: person.hasPhoto === true,
  };
};

export const listActiveWorkforce = <T extends CelebrationDirectoryPerson>(employees: T[]) =>
  employees.filter((person) => !isInactiveWorkforceStatus(person.status));

export const listTodaysCelebrationMoments = (
  employees: CelebrationDirectoryPerson[],
  today = todayIsoLocal(),
): CelebrationMoment[] => {
  const todayMd = monthDay(today);
  if (!todayMd) return [];
  const results: CelebrationMoment[] = [];
  for (const person of listActiveWorkforce(employees)) {
    if (monthDay(person.dateOfBirth) === todayMd) {
      const moment = toMoment(person, 'birthday', today);
      if (moment) results.push(moment);
    }
    const joined = person.dateJoined || person.contractStartDate;
    if (monthDay(joined) === todayMd) {
      const years = yearsOfService(person, today);
      if (years >= 1) {
        const moment = toMoment(person, 'anniversary', today, Math.max(1, Math.round(years)));
        if (moment) results.push(moment);
      }
    }
  }
  return results.sort((a, b) => a.kind.localeCompare(b.kind) || a.fullName.localeCompare(b.fullName));
};

export const findCelebrationMoment = (
  moments: CelebrationMoment[],
  honoreeCode?: string | null,
  kind?: string | null,
) => {
  const code = normalizeEmployeeCode(honoreeCode);
  if (!code) return moments[0] || null;
  const kindValue = compact(kind).toLowerCase();
  const byKind = kindValue === 'birthday' || kindValue === 'anniversary'
    ? moments.filter((item) => item.kind === kindValue)
    : moments;
  return byKind.find((item) => codesMatch(item.employeeCode, code) || codesMatch(item.employeeId, code))
    || moments.find((item) => codesMatch(item.employeeCode, code) || codesMatch(item.employeeId, code))
    || null;
};

export const celebrationPhotoCid = (employeeCode: string) =>
  `celeb-photo-${normalizeEmployeeCode(employeeCode).replace(/[^A-Z0-9._-]/g, '-').slice(0, 48) || 'employee'}`;

export const celebrationWishPortalPath = (input: {
  employeeCode: string;
  kind: CelebrationKind;
  date: string;
}) => {
  const params = new URLSearchParams({
    tab: 'communication',
    celebrate: compact(input.employeeCode),
    kind: input.kind,
    celebrateDate: compact(input.date).slice(0, 10),
  });
  return `/workforce-portal?${params.toString()}`;
};

export const celebrationWishPortalUrl = (baseUrl: string, input: {
  employeeCode: string;
  kind: CelebrationKind;
  date: string;
}) => `${compact(baseUrl).replace(/\/$/, '')}${celebrationWishPortalPath(input)}`;

const joinNames = (names: string[]) => {
  if (!names.length) return 'our colleagues';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

export const celebrationEmailSubject = (
  moments: CelebrationMoment[],
  recipient?: Pick<CelebrationDirectoryPerson, 'employeeId' | 'employeeCode' | 'fullName' | 'firstName' | 'preferredName'> | null,
) => {
  const own = moments.filter((item) => isSameEmployee(item, recipient));
  if (own.length === 1 && own[0].kind === 'birthday') {
    return `Happy Birthday, ${own[0].firstName}`;
  }
  if (own.length === 1 && own[0].kind === 'anniversary') {
    const years = own[0].years || 1;
    return `Happy Work Anniversary, ${own[0].firstName} — ${years} year${years === 1 ? '' : 's'} with Dorman Long`;
  }
  if (own.length > 1) {
    return `Celebrating you today, ${displayFirstName(recipient || own[0])}`;
  }
  const birthdays = moments.filter((item) => item.kind === 'birthday');
  const anniversaries = moments.filter((item) => item.kind === 'anniversary');
  if (moments.length === 1 && birthdays.length === 1) {
    return `Happy Birthday to ${birthdays[0].fullName}`;
  }
  if (moments.length === 1 && anniversaries.length === 1) {
    const years = anniversaries[0].years || 1;
    return `Happy Work Anniversary to ${anniversaries[0].fullName} — ${years} year${years === 1 ? '' : 's'}`;
  }
  if (birthdays.length && !anniversaries.length) {
    return moments.length <= 3
      ? `Happy Birthday to ${joinNames(birthdays.map((item) => item.firstName))}`
      : `Birthday celebrations at Dorman Long today`;
  }
  if (anniversaries.length && !birthdays.length) {
    return moments.length <= 3
      ? `Work anniversary: ${joinNames(anniversaries.map((item) => item.firstName))}`
      : `Work anniversary celebrations at Dorman Long today`;
  }
  return 'Birthdays and work anniversaries at Dorman Long today';
};

export const celebrationEmailIntro = (
  moments: CelebrationMoment[],
  recipient?: Pick<CelebrationDirectoryPerson, 'employeeId' | 'employeeCode' | 'fullName' | 'firstName' | 'preferredName'> | null,
) => {
  const own = moments.filter((item) => isSameEmployee(item, recipient));
  if (own.length === 1 && own[0].kind === 'birthday') {
    return 'Wishing you a wonderful day filled with joy. The Dorman Long family is celebrating you today.';
  }
  if (own.length === 1 && own[0].kind === 'anniversary') {
    const years = own[0].years || 1;
    return `Thank you for ${years} year${years === 1 ? '' : 's'} of dedication. We are proud to celebrate your journey with Dorman Long.`;
  }
  if (own.length > 1) {
    return 'The Dorman Long family is celebrating you today. Colleagues can send their wishes from the button below.';
  }
  const names = joinNames(moments.map((item) => item.firstName));
  if (moments.length === 1 && moments[0].kind === 'birthday') {
    return `Join us in wishing ${moments[0].fullName} a fantastic birthday today.`;
  }
  if (moments.length === 1 && moments[0].kind === 'anniversary') {
    const years = moments[0].years || 1;
    return `Celebrate ${moments[0].fullName} for ${years} year${years === 1 ? '' : 's'} of service with Dorman Long.`;
  }
  return `Today we celebrate ${names}. Open the workforce portal to send a wish.`;
};
