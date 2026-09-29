const TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'engr', 'chief', 'alhaji', 'alhaja', 'pastor']);

/** Order-insensitive name key with courtesy titles removed. */
export const personNameKey = (value: string) => {
  const tokens = String(value || '')
    .toLowerCase()
    .replace(/\./g, ' ')
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !TITLES.has(token))
    .sort();
  return tokens.join('|');
};

/**
 * Match the same person when the stored name and the directory name
 * differ by title or token order (Mr. OHAMEZE CHINEDU FRANCIS vs Mr FRANCIS CHINEDU OHAMEZE).
 * Single-token names are rejected so a surname alone cannot pick the wrong employee.
 */
export const personNamesLooselyMatch = (left: string, right: string) => {
  const a = personNameKey(left);
  const b = personNameKey(right);
  return Boolean(a && a === b && a.split('|').length >= 2);
};
