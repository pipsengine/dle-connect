const NAME_TITLES = new Set([
  'mr',
  'mrs',
  'miss',
  'ms',
  'dr',
  'engr',
  'eng',
  'prof',
  'professor',
  'chief',
  'alhaji',
  'alh',
  'pastor',
  'pst',
  'rev',
  'reverend',
  'sir',
  'madam',
  'lady',
  'hon',
  'honourable',
  'arc',
  'architect',
  'barr',
  'barrister',
]);

const TITLES_WITH_PERIOD = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'rev', 'hon']);

const compact = (value: unknown) => String(value || '').replace(/\s+/g, ' ').trim();

const tokenKey = (token: string) => token.toLowerCase().replace(/\.+$/, '');

export const isPersonTitleToken = (token: string) => NAME_TITLES.has(tokenKey(token));

const tokensOf = (value: unknown) => compact(value).split(' ').filter(Boolean);

const withoutTitles = (tokens: string[]) => tokens.filter((token) => !isPersonTitleToken(token));

const uniqueTokens = (tokens: string[]) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of tokens) {
    const key = tokenKey(token);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(token.replace(/\.+$/, '') || token);
  }
  return out;
};

const notIn = (tokens: string[], excluded: string[]) => {
  const skip = new Set(excluded.map(tokenKey));
  return tokens.filter((token) => !skip.has(tokenKey(token)));
};

const collapseConsecutive = (tokens: string[]) => {
  const out: string[] = [];
  for (const token of tokens) {
    if (out.length && tokenKey(out[out.length - 1] || '') === tokenKey(token)) continue;
    out.push(token);
  }
  return out;
};

const dropLeadingSurnameEcho = (given: string[]) => {
  const tokens = collapseConsecutive(given);
  if (tokens.length < 2) return tokens;
  const lead = tokenKey(tokens[0] || '');
  if (!lead) return tokens;
  const echoed = tokens.slice(1).some((token) => tokenKey(token) === lead);
  return echoed ? tokens.slice(1) : tokens;
};

const prettyGivenName = (value: unknown) => {
  const raw = compact(value);
  if (!raw) return '';
  const letters = raw.replace(/[^A-Za-z]/g, '');
  const upperRatio = letters
    ? [...letters].filter((char) => char === char.toUpperCase() && char !== char.toLowerCase()).length / letters.length
    : 0;
  if (upperRatio < 0.72) return raw;
  return raw
    .toLowerCase()
    .replace(/(^|[\s'-])([a-z])/g, (_, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`);
};

/** Display honorific: Mr. Mrs. Dr. — keep Miss/Chief/Engr without a forced period. */
export const formatPersonTitle = (value: unknown) => {
  const raw = compact(value).replace(/\.+$/, '');
  if (!raw || !isPersonTitleToken(raw)) return '';
  const key = tokenKey(raw);
  const label = raw.length <= 4 ? `${raw.charAt(0).toUpperCase()}${raw.slice(1).toLowerCase()}` : raw;
  return TITLES_WITH_PERIOD.has(key) ? `${label}.` : label;
};

export type PersonNameParts = {
  title?: unknown;
  firstName?: unknown;
  middleName?: unknown;
  lastName?: unknown;
  preferredName?: unknown;
  fallback?: unknown;
  fullName?: unknown;
};

/**
 * Repair already-concatenated names (session cookies, Sage displayName, last_name dumps)
 * into Title + First + Middle + Last, without a leading surname/other-name echo.
 */
export const sanitizePersonDisplayName = (value: unknown) => {
  const tokens = tokensOf(value);
  if (!tokens.length) return '';
  const titleToken = tokens.find((token) => isPersonTitleToken(token));
  const title = formatPersonTitle(titleToken);
  const given = uniqueTokens(dropLeadingSurnameEcho(withoutTitles(tokens)));
  return [title, ...given].filter(Boolean).join(' ');
};

export const resolvePersonNameParts = (parts: PersonNameParts) => {
  const blob = [
    parts.title,
    parts.firstName,
    parts.middleName,
    parts.lastName,
    parts.fullName,
    parts.fallback,
  ].map(compact).filter(Boolean).join(' ');
  const sanitized = sanitizePersonDisplayName(blob);
  const title = formatPersonTitle(parts.title)
    || formatPersonTitle(tokensOf(sanitized)[0]);
  const given = uniqueTokens(withoutTitles(tokensOf(sanitized)));
  if (!given.length) {
    return { title, firstName: '', middleName: '', lastName: '' };
  }

  const last = [given[given.length - 1]!];
  const head = given.slice(0, -1);
  const middleField = uniqueTokens(withoutTitles(tokensOf(parts.middleName)));
  const middleFromField = middleField.length === 1
    && head.some((token) => tokenKey(token) === tokenKey(middleField[0] || ''))
    ? [middleField[0]!]
    : [];

  let first: string[];
  let middle: string[];
  if (middleFromField.length) {
    middle = middleFromField;
    first = notIn(head, middle);
  } else if (head.length >= 2) {
    first = [head[0]!];
    middle = head.slice(1);
  } else {
    first = head;
    middle = [];
  }

  return {
    title,
    firstName: first.join(' '),
    middleName: middle.join(' '),
    lastName: last.join(' '),
  };
};

/**
 * Canonical on-screen name: [Title] [First Name] [Middle/Other Name] [Surname].
 * Example: Mr. CHRISTIAN ONUWABHAGBE OGBAISI
 */
export const composePersonDisplayName = (parts: PersonNameParts) => {
  const resolved = resolvePersonNameParts(parts);
  const composed = [resolved.title, resolved.firstName, resolved.middleName, resolved.lastName]
    .filter(Boolean)
    .join(' ');
  return composed || sanitizePersonDisplayName(parts.fullName || parts.fallback);
};

/** Welcome / greeting: official first name only — never middle/other/surname. */
export const personGreetingName = (parts: PersonNameParts) => {
  const resolved = resolvePersonNameParts(parts);
  const first = (resolved.firstName.split(' ')[0] || '').trim();
  if (first) return prettyGivenName(first);
  const sanitized = sanitizePersonDisplayName(parts.fullName || parts.fallback);
  const given = withoutTitles(tokensOf(sanitized))[0];
  return prettyGivenName(given);
};
