import locationData from './data/nigeria-locations.json';

export const NIGERIA_REGIONS = locationData.regions as readonly string[];

export type NigeriaRegion = (typeof NIGERIA_REGIONS)[number];

type NigeriaStateRecord = {
  name: string;
  region: string;
  lgas: string[];
};

const STATE_RECORDS = locationData.states as NigeriaStateRecord[];

const ALL_STATE_NAMES = STATE_RECORDS.map((state) => state.name);

const REGION_BY_STATE = new Map<string, string>(
  STATE_RECORDS.map((state) => [state.name, state.region]),
);

const LGAS_BY_STATE = new Map<string, string[]>(
  STATE_RECORDS.map((state) => [state.name, state.lgas]),
);

const STATE_NAME_BY_LOWER = new Map<string, string>(
  ALL_STATE_NAMES.map((name) => [name.toLowerCase(), name]),
);

const STATE_ALIASES: Record<string, string> = {
  abuja: 'Federal Capital Territory',
  fct: 'Federal Capital Territory',
  'fct abuja': 'Federal Capital Territory',
  'abuja fct': 'Federal Capital Territory',
  'federal capital territory (fct)': 'Federal Capital Territory',
};

const compactText = (value: unknown) => String(value || '').trim();

const findStateByName = (value: string) => {
  const text = compactText(value);
  if (!text) return '';
  const lower = text.toLowerCase();
  const alias = STATE_ALIASES[lower];
  if (alias) return alias;
  const exact = STATE_NAME_BY_LOWER.get(lower);
  if (exact) return exact;
  const withoutState = lower.replace(/\s+state$/i, '').trim();
  const withoutStateMatch = STATE_NAME_BY_LOWER.get(withoutState);
  if (withoutStateMatch) return withoutStateMatch;
  const partial = ALL_STATE_NAMES.find(
    (name) => name.toLowerCase().startsWith(lower) || lower.startsWith(name.toLowerCase()),
  );
  return partial || text;
};

const findLgaByName = (stateName: string, value: string) => {
  const text = compactText(value);
  if (!text) return '';
  const lgas = getNigeriaLgas(stateName);
  if (!lgas.length) return text;
  const lower = text.toLowerCase();
  const exact = lgas.find((name) => name.toLowerCase() === lower);
  if (exact) return exact;
  const partial = lgas.find(
    (name) => name.toLowerCase().includes(lower) || lower.includes(name.toLowerCase()),
  );
  return partial || text;
};

export function normalizeNigeriaStateName(value: unknown): string {
  return findStateByName(compactText(value));
}

export function normalizeNigeriaLgaName(stateName: unknown, lgaValue: unknown): string {
  const state = normalizeNigeriaStateName(stateName);
  if (!state) return compactText(lgaValue);
  return findLgaByName(state, compactText(lgaValue));
}

export function resolveNigeriaLgaFromCity(stateName: unknown, city: unknown): string {
  const state = normalizeNigeriaStateName(stateName);
  const cityText = compactText(city);
  if (!state || !cityText) return '';
  return findLgaByName(state, cityText);
}

export type ResolvedNigeriaPersonalLocation = {
  region: NigeriaRegion | '';
  stateOfOrigin: string;
  localGovernmentArea: string;
  contactState: string;
};

export function resolveNigeriaPersonalLocation(input: {
  nationality?: string | null;
  country?: string | null;
  stateOfOrigin?: string | null;
  localGovernmentArea?: string | null;
  contactState?: string | null;
  city?: string | null;
}): ResolvedNigeriaPersonalLocation {
  const nigerian = isNigeriaCountry(input.nationality) || isNigeriaCountry(input.country);
  const contactState = normalizeNigeriaStateName(input.contactState);
  const explicitOrigin = normalizeNigeriaStateName(input.stateOfOrigin);
  const stateOfOrigin = explicitOrigin || (nigerian ? contactState : '');
  const explicitLga = normalizeNigeriaLgaName(stateOfOrigin, input.localGovernmentArea);
  const localGovernmentArea =
    explicitLga || (nigerian ? resolveNigeriaLgaFromCity(stateOfOrigin, input.city) : '');
  const region = stateOfOrigin ? getRegionForState(stateOfOrigin) : '';
  return { region, stateOfOrigin, localGovernmentArea, contactState };
}

export function getNigeriaStates(region?: string): string[] {
  if (!region) return [...ALL_STATE_NAMES];
  return STATE_RECORDS.filter((state) => state.region === region).map((state) => state.name);
}

export function getNigeriaLgas(stateName: string): string[] {
  if (!stateName) return [];
  return [...(LGAS_BY_STATE.get(stateName) || [])];
}

export function getRegionForState(stateName: string): NigeriaRegion | '' {
  if (!stateName) return '';
  const region = REGION_BY_STATE.get(stateName) || '';
  return NIGERIA_REGIONS.includes(region) ? (region as NigeriaRegion) : '';
}

export function isNigeriaCountry(country: string | null | undefined) {
  const normalized = String(country || '').trim().toLowerCase();
  if (!normalized) return true;
  return normalized.includes('nigeria') || normalized === 'ng';
}
