import { useState } from 'react';
import { searchAddress, type AddressLookupResult } from '../../services/address/openStreetMap';
import type { AddressForm } from './types';

export function AddressLookup({ value, onChange }: { value: AddressForm; onChange: (v: AddressForm) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AddressLookupResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  async function lookup() {
    if (query.trim().length < 4) {
      setResults([]);
      setError('Introduce al menos 4 caracteres para buscar una dirección.');
      return;
    }
    setSearching(true); setError('');
    try { setResults(await searchAddress(query)); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo buscar la dirección.'); }
    finally { setSearching(false); }
  }

  function apply(r: AddressLookupResult) {
    const a = r.address ?? {};
    const fallbackCity = a.town ?? a.village ?? a.municipality ?? a.city ?? a.county ?? '';
    const city = a.city && a.state && a.city.trim().toLowerCase() === a.state.trim().toLowerCase()
      ? (a.town ?? a.village ?? a.municipality ?? a.county ?? '')
      : fallbackCity;
    onChange({
      ...value,
      street: [a.road, a.house_number].filter(Boolean).join(' '),
      postal_code: a.postcode ?? '',
      city,
      region: a.state ?? '',
      country_code: (a.country_code ?? value.country_code ?? 'ES').toUpperCase(),
    });
    setResults([]);
    setQuery(r.display_name);
  }

  return <div className="wide address-lookup">
    <label>Buscar dirección con OpenStreetMap</label>
    <div className="input-with-action">
      <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); lookup(); } }} placeholder="Calle, número, CP, localidad…" />
      <button type="button" className="secondary-button" onClick={lookup} disabled={searching}>{searching ? 'Buscando…' : 'Buscar'}</button>
    </div>
    {error && <div className="inline-error">{error}</div>}
    {results.length > 0 && <div className="lookup-results" role="listbox" aria-label="Resultados de dirección">
      {results.map((r, i) => <button type="button" key={`${r.lat}-${r.lon}-${i}`} onClick={() => apply(r)}>{r.display_name}</button>)}
      <small>Datos © OpenStreetMap contributors</small>
    </div>}
  </div>;
}
