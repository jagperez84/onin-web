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

const SINGLE_PROVINCE_SPANISH_COMMUNITIES: Record<string, string> = {
  'principado de asturias': 'Asturias',
  'asturias': 'Asturias',
  'cantabria': 'Cantabria',
  'comunidad de madrid': 'Madrid',
  'comunidad foral de navarra': 'Navarra',
  'navarra': 'Navarra',
  'la rioja': 'La Rioja',
  'región de murcia': 'Murcia',
  'region de murcia': 'Murcia',
  'murcia': 'Murcia',
  'illes balears': 'Illes Balears',
  'islas baleares': 'Illes Balears',
  'baleares': 'Illes Balears',
};

function normalizeProvince(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.replace(/^provincia de\s+/i, '').trim();
}

export function getProvince(address: {
  province?: string;
  state_district?: string;
  county?: string;
  state?: string;
  country_code?: string;
}): string {
  const country = (address.country_code ?? '').trim().toUpperCase();
  const province = normalizeProvince(address.province ?? '');
  const district = normalizeProvince(address.state_district ?? '');
  const county = normalizeProvince(address.county ?? '');
  const state = normalizeProvince(address.state ?? '');

  if (province) return province;
  if (district) return district;
  if (country === 'ES') {
    if (county) return county;
    const mapped = SINGLE_PROVINCE_SPANISH_COMMUNITIES[state.toLowerCase()];
    if (mapped) return mapped;
  }
  return '';
}
