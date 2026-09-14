// Previsión meteorológica para avisar de instalaciones a la intemperie con mal tiempo.
//
// A diferencia de la geocodificación (Nominatim, servida vía la función edge
// "address-lookup" por su política de uso restrictiva), Open-Meteo es una API
// gratuita pensada para llamarse directamente desde el navegador: sin API key,
// con CORS abierto y un límite generoso para este volumen de uso. No hace falta
// una función edge intermedia aquí.

export type DayForecast = {
  date: string;
  precipitationProbabilityMax: number | null;
  windSpeedMaxKmh: number | null;
  weatherCode: number | null;
};

export const WEATHER_RISK_PRECIP_PCT = 50;
export const WEATHER_RISK_WIND_KMH = 40;

export function isWeatherRisk(f: DayForecast | null | undefined): boolean {
  if (!f) return false;
  return (f.precipitationProbabilityMax ?? 0) >= WEATHER_RISK_PRECIP_PCT || (f.windSpeedMaxKmh ?? 0) >= WEATHER_RISK_WIND_KMH;
}

function roundCoord(v: number): number {
  // ~1 km de precisión — de sobra para previsión meteorológica y agrupa
  // ubicaciones casi idénticas en una sola consulta.
  return Math.round(v * 100) / 100;
}

export function locationKey(lat: number, lon: number): string {
  return `${roundCoord(lat)},${roundCoord(lon)}`;
}

/**
 * Previsión diaria para un conjunto de ubicaciones y un rango de fechas, en una sola
 * llamada (Open-Meteo acepta listas de latitud/longitud separadas por comas). Devuelve
 * un mapa "claveUbicación|fecha" → previsión. Si Open-Meteo no tiene datos para alguna
 * fecha (fuera de su ventana de previsión, ~16 días vista) esa entrada simplemente no
 * aparece — nunca se trata como un error que deba interrumpir la Agenda.
 */
export async function fetchDailyForecast(points: { lat: number; lon: number }[], from: string, to: string): Promise<Map<string, DayForecast>> {
  const result = new Map<string, DayForecast>();
  const uniqueByKey = new Map<string, { lat: number; lon: number }>();
  for (const p of points) {
    if (p.lat == null || p.lon == null || Number.isNaN(p.lat) || Number.isNaN(p.lon)) continue;
    uniqueByKey.set(locationKey(p.lat, p.lon), { lat: roundCoord(p.lat), lon: roundCoord(p.lon) });
  }
  if (uniqueByKey.size === 0) return result;

  const entries = Array.from(uniqueByKey.entries());
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', entries.map(([, p]) => p.lat).join(','));
  url.searchParams.set('longitude', entries.map(([, p]) => p.lon).join(','));
  url.searchParams.set('daily', 'precipitation_probability_max,windspeed_10m_max,weathercode');
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('start_date', from);
  url.searchParams.set('end_date', to);

  let response: Response;
  try {
    response = await fetch(url.toString());
  } catch {
    return result; // sin conexión o bloqueado: la Agenda sigue funcionando, solo sin avisos
  }
  if (!response.ok) return result;
  const data = await response.json().catch(() => null);
  if (!data) return result;

  const items = Array.isArray(data) ? data : [data];
  items.forEach((item, idx) => {
    const key = entries[idx]?.[0];
    const times: string[] | undefined = item?.daily?.time;
    if (!key || !Array.isArray(times)) return;
    times.forEach((date, i) => {
      result.set(`${key}|${date}`, {
        date,
        precipitationProbabilityMax: item.daily.precipitation_probability_max?.[i] ?? null,
        windSpeedMaxKmh: item.daily.windspeed_10m_max?.[i] ?? null,
        weatherCode: item.daily.weathercode?.[i] ?? null,
      });
    });
  });
  return result;
}
