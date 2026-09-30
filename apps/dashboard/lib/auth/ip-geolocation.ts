export type IpPlace = {
  country: string;
  region: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  source: 'IP Geolocation' | 'Corporate Network' | 'Unavailable';
  note: string;
};

export type BrowserPlace = {
  latitude: number;
  longitude: number;
  accuracyM: number;
  source: 'Browser GPS';
  state: string;
  city: string;
  lga: string;
  street: string;
};

const cache = new Map<string, { at: number; place: IpPlace }>();
const addressCache = new Map<string, { at: number; address: Pick<BrowserPlace, 'state' | 'city' | 'lga' | 'street'> }>();
const DAY_MS = 24 * 60 * 60 * 1000;

const cleanIp = (value: string) => {
  const text = String(value || '').trim();
  if (text.startsWith('[')) return text.slice(1, text.indexOf(']'));
  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(text)) return text.split(':')[0];
  return text;
};

const isPrivateAddress = (ip: string) => {
  const value = cleanIp(ip).toLowerCase();
  if (!value || value === 'not recorded' || value === 'unknown' || value === 'local' || value === '::1' || value === '0.0.0.0') return true;
  if (value.startsWith('127.') || value.startsWith('10.') || value.startsWith('192.168.') || value.startsWith('169.254.') || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80')) return true;
  return /^172\.(1[6-9]|2\d|3[0-1])\./.test(value);
};

const corporatePlace = (): IpPlace => ({
  country: '',
  region: '',
  city: '',
  latitude: null,
  longitude: null,
  source: 'Corporate Network',
  note: 'Private network address. No public IP geolocation is available, and this is not a physical GPS location.',
});

const unavailablePlace = (): IpPlace => ({
  country: '',
  region: '',
  city: '',
  latitude: null,
  longitude: null,
  source: 'Unavailable',
  note: 'The source IP was recorded, but a public geolocation lookup did not return a place. Coordinates were not invented.',
});

const numberOrNull = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const lookupIpPlace = async (ipAddress: string): Promise<IpPlace> => {
  const ip = cleanIp(ipAddress);
  if (isPrivateAddress(ip)) return corporatePlace();
  const cached = cache.get(ip);
  if (cached && Date.now() - cached.at < DAY_MS) return cached.place;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, { signal: controller.signal, cache: 'no-store' });
    const body = await response.json().catch(() => null) as { success?: boolean; country?: string; region?: string; city?: string; latitude?: number; longitude?: number } | null;
    if (!response.ok || !body?.success) {
      const place = unavailablePlace();
      cache.set(ip, { at: Date.now(), place });
      return place;
    }
    const place: IpPlace = {
      country: String(body.country || ''),
      region: String(body.region || ''),
      city: String(body.city || ''),
      latitude: numberOrNull(body.latitude),
      longitude: numberOrNull(body.longitude),
      source: 'IP Geolocation',
      note: 'Approximate city-level place derived from the source IP. This is not an exact physical or GPS location.',
    };
    cache.set(ip, { at: Date.now(), place });
    return place;
  } catch {
    const place = unavailablePlace();
    cache.set(ip, { at: Date.now(), place });
    return place;
  } finally {
    clearTimeout(timer);
  }
};

export const readBrowserPlace = (value: unknown): BrowserPlace | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const latitude = numberOrNull(record.latitude);
  const longitude = numberOrNull(record.longitude);
  const accuracyM = numberOrNull(record.accuracyM);
  if (latitude == null || longitude == null || accuracyM == null) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || accuracyM <= 0 || accuracyM > 100000) return null;
  return {
    latitude,
    longitude,
    accuracyM: Math.round(accuracyM),
    source: 'Browser GPS',
    state: String(record.state || ''),
    city: String(record.city || ''),
    lga: String(record.lga || ''),
    street: String(record.street || ''),
  };
};

const text = (value: unknown) => String(value || '').trim();

const reverseGeocode = async (latitude: number, longitude: number) => {
  const key = `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
  const cached = addressCache.get(key);
  if (cached && Date.now() - cached.at < DAY_MS) return cached.address;
  const empty = { state: '', city: '', lga: '', street: '' };
  const load = async (url: string, headers?: HeadersInit) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(url, { signal: controller.signal, headers, cache: 'no-store' });
      if (!response.ok) return null;
      return await response.json().catch(() => null);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
  const nominatim = await load(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${encodeURIComponent(String(latitude))}&lon=${encodeURIComponent(String(longitude))}`,
    { Accept: 'application/json', 'User-Agent': 'DLE-Connect-Audit/1.0 (dleconnect.dormanlongeng.com)' },
  ) as { address?: Record<string, string> } | null;
  const address = nominatim?.address;
  if (address) {
    const street = [address.house_number, address.road || address.pedestrian || address.footway].filter(Boolean).join(' ');
    const city = text(address.city || address.town || address.village || address.hamlet);
    const lga = text(address.county || address.city_district || address.municipality || address.suburb);
    const state = text(address.state);
    const result = { state, city, lga, street };
    if (state || city || lga || street) {
      addressCache.set(key, { at: Date.now(), address: result });
      return result;
    }
  }
  const fallback = await load(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(String(latitude))}&longitude=${encodeURIComponent(String(longitude))}&localityLanguage=en`) as { principalSubdivision?: string; city?: string; locality?: string } | null;
  const result = {
    state: text(fallback?.principalSubdivision),
    city: text(fallback?.city || fallback?.locality),
    lga: text(fallback?.locality),
    street: '',
  };
  addressCache.set(key, { at: Date.now(), address: result });
  return result;
};

export const describeBrowserPlace = async (place: BrowserPlace): Promise<BrowserPlace> => {
  if (place.state || place.city || place.lga || place.street) return place;
  const address = await reverseGeocode(place.latitude, place.longitude);
  return { ...place, ...address };
};
