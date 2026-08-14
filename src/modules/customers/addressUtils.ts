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
  county?: string;
  state?: string;
}): string {
  const state = (address.state ?? '').trim().toLowerCase();
  const candidates = [address.city, address.town, address.village, address.municipality, address.county];
  return candidates.find(value => {
    const normalized = (value ?? '').trim();
    return normalized && normalized.toLowerCase() !== state;
  })?.trim() ?? '';
}
