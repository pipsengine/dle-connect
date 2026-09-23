const compact = (value: unknown) => String(value ?? '').trim();

const PERSON_TITLE_TOKEN = /^(mr|mrs|miss|ms|dr|engr|eng|prof|chief|sir|madam)$/i;

/** Strip titles/punctuation so "Mr. PHILLIPS AYODEJI" matches "Mr AYODEJI PHILLIPS". */
export const directoryPersonNameTokens = (value?: string | null) =>
  compact(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token && !PERSON_TITLE_TOKEN.test(token));

/** Collapse repeated letters so HRIS PHILLIPS still matches payroll PHILIPS. */
const foldNameToken = (token: string) => token.replace(/(.)\1+/g, '$1');

const nameTokenPresent = (haystack: string[], needle: string) =>
  haystack.includes(needle) || haystack.some((token) => foldNameToken(token) === foldNameToken(needle));

export const directoryPersonNamesMatch = (left?: string | null, right?: string | null) => {
  const a = directoryPersonNameTokens(left);
  const b = directoryPersonNameTokens(right);
  if (a.length < 2 || b.length < 2) return false;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.every((token) => nameTokenPresent(longer, token));
};
