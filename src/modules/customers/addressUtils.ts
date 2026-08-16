export const COUNTRY_OPTIONS = [
  ['ES', 'España'],
  ['PT', 'Portugal'],
  ['FR', 'Francia'],
  ['DE', 'Alemania'],
  ['IT', 'Italia'],
  ['BE', 'Bélgica'],
  ['NL', 'Países Bajos'],
  ['GB', 'Reino Unido'],
  ['IE', 'Irlanda'],
  ['CH', 'Suiza'],
  ['AT', 'Austria'],
  ['AD', 'Andorra'],
  ['US', 'Estados Unidos'],
  ['CA', 'Canadá'],
  ['MA', 'Marruecos'],
] as const;

export function getCountryName(code: string): string {
  const normalized = code.trim().toUpperCase();
  const known = COUNTRY_OPTIONS.find(([value]) => value === normalized);
  if (known) return known[1];
  try {
    return new Intl.DisplayNames(['es'], { type: 'region' }).of(normalized) ?? normalized;
  } catch {
    return normalized;
  }
}

export function getLocality(address: {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  city_district?: string;
  county?: string;
  state_district?: string;
  state?: string;
}): string {
  const state = (address.state ?? '').trim().toLowerCase();
  const candidates = [address.city, address.town, address.village, address.municipality, address.city_district, address.county, address.state_district];
  return candidates.find(value => {
    const normalized = (value ?? '').trim();
    return normalized && normalized.toLowerCase() !== state;
  })?.trim() ?? '';
}

export function getProvince(address: {
  province?: string;
  state_district?: string;
  state?: string;
  country_code?: string;
}): string {
  const country = (address.country_code ?? '').trim().toUpperCase();
  const province = (address.province ?? '').trim();
  const district = (address.state_district ?? '').trim();
  const state = (address.state ?? '').trim();

  if (province) return province;
  if (district) return district;

  // Nominatim may return the autonomous community as `state` without a
  // separate province. Avoid exposing the autonomous community as the
  // province where we can map the common Spanish exception directly.
  if (country === 'ES' && state.toLowerCase() === 'comunidad de madrid') return 'Madrid';
  return '';
}
