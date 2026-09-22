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

const isPrefixOf = (left: string[], right: string[]) => {
  if (!left.length || left.length > right.length) return false;
  return left.every((token, index) => tokenKey(token) === tokenKey(right[index] || ''));
};

const isSubsetOf = (left: string[], right: string[]) => {
  if (!left.length || !right.length) return false;
  const haystack = new Set(right.map(tokenKey));
  return left.every((token) => haystack.has(tokenKey(token)));
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

export const resolvePersonNameParts = (parts: PersonNameParts) => {
  const title = formatPersonTitle(parts.title);
  let first = uniqueTokens(withoutTitles(tokensOf(parts.firstName)));
  let middle = uniqueTokens(withoutTitles(tokensOf(parts.middleName)));
  let last = uniqueTokens(withoutTitles(tokensOf(parts.lastName)));

  // Sage/HR dumps sometimes put the surname into first_name, and given names into middle_name.
  if (first.length && last.length && (isPrefixOf(first, last) || isSubsetOf(first, last))) {
    const givenFromMiddle = notIn(middle, last);
    first = givenFromMiddle.length ? givenFromMiddle : notIn(first, last);
    middle = notIn(notIn(middle, first), last);
  }

  // Sage FirstNames often contains first + other names in one field.
  if (first.length >= 2 && !middle.length) {
    middle = first.slice(1);
    first = [first[0]!];
  }

  // Last name field sometimes contains other-name + surname together.
  if (!middle.length && last.length >= 2) {
    middle = [last[0]!];
    last = last.slice(1);
  }

  const preferred = uniqueTokens(withoutTitles(tokensOf(parts.preferredName)));
  // Known-as / other name is often saved in first_name; the real first name is then in middle_name.
  if (
    first.length === 1
    && middle.length >= 1
    && preferred.length
    && tokenKey(first[0] || '') === tokenKey(preferred[0] || '')
    && tokenKey(middle[0] || '') !== tokenKey(first[0] || '')
  ) {
    const actualFirst = [middle[0]!];
    middle = uniqueTokens([...first, ...middle.slice(1)]);
    first = actualFirst;
  }

  middle = notIn(middle, first);
  last = notIn(last, [...first, ...middle]);

  return {
    title,
    firstName: first.join(' '),
    middleName: middle.join(' '),
    lastName: last.join(' '),
  };
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

/**
 * Canonical on-screen name: [Title] [First Name] [Middle/Other Name] [Surname].
 * Example: Mr. CHRISTIAN ONUWABHAGBE OGBAISI
 */
export const composePersonDisplayName = (parts: PersonNameParts) => {
  const resolved = resolvePersonNameParts(parts);
  const composed = [resolved.title, resolved.firstName, resolved.middleName, resolved.lastName]
    .filter(Boolean)
    .join(' ');
  if (composed) return composed;
  return sanitizePersonDisplayName(parts.fullName || parts.fallback);
};

/**
 * Repair already-concatenated names (session cookies, Sage displayName, etc.)
 * into Title + First + Middle + Last, without a leading surname echo.
 */
export const sanitizePersonDisplayName = (value: unknown) => {
  const tokens = tokensOf(value);
  if (!tokens.length) return '';
  const titleToken = tokens.find((token) => isPersonTitleToken(token));
  const title = formatPersonTitle(titleToken);
  const given = uniqueTokens(dropLeadingSurnameEcho(withoutTitles(tokens)));
  return [title, ...given].filter(Boolean).join(' ');
};

const isNicknameOf = (preferred: string, first: string) => {
  const nick = tokenKey(preferred);
  const given = tokenKey(first);
  if (!nick || !given) return false;
  if (nick === given) return true;
  if (given.startsWith(nick) && nick.length >= 3) return true;
  if (nick.startsWith(given) && given.length >= 3) return true;
  return false;
};

/** Welcome / greeting: first name only. Preferred name is used only when it is a nickname of the first name. */
export const personGreetingName = (parts: PersonNameParts) => {
  const resolved = resolvePersonNameParts(parts);
  const first = (resolved.firstName.split(' ')[0] || '').trim();
  const middleKeys = new Set(withoutTitles(tokensOf(resolved.middleName)).map(tokenKey));
  const lastKeys = new Set(withoutTitles(tokensOf(resolved.lastName)).map(tokenKey));
  const preferred = withoutTitles(tokensOf(parts.preferredName))[0] || '';

  const preferredIsOtherName = Boolean(
    preferred
    && (middleKeys.has(tokenKey(preferred)) || lastKeys.has(tokenKey(preferred))),
  );
  if (preferred && first && !preferredIsOtherName && isNicknameOf(preferred, first)) {
    return prettyGivenName(preferred);
  }
  if (first && !middleKeys.has(tokenKey(first)) && !lastKeys.has(tokenKey(first))) {
    return prettyGivenName(first);
  }
  const middleGiven = withoutTitles(tokensOf(resolved.middleName))[0];
  if (middleGiven && !lastKeys.has(tokenKey(middleGiven))) {
    return prettyGivenName(middleGiven);
  }
  const sanitized = sanitizePersonDisplayName(
    composePersonDisplayName({ ...parts, preferredName: undefined }) || parts.fullName || parts.fallback,
  );
  const given = withoutTitles(tokensOf(sanitized)).find((token) => !lastKeys.has(tokenKey(token)))
    || withoutTitles(tokensOf(sanitized))[0];
  return prettyGivenName(given);
};
