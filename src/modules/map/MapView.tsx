import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Link } from "react-router-dom";
import {
  MapPin,
  Plus,
  Edit3,
  Trash2,
  Ruler,
  Hammer,
  Search,
  X,
} from "lucide-react";
import {
  listMapPoints,
  saveMapPointLocation,
  saveMapPointZone,
  type MapPoint,
} from "../../services/geo/mapService";
import {
  listZones,
  createZone,
  updateZone,
  deleteZone,
  type Zone,
} from "../../services/geo/zoneService";
import {
  searchAddress,
  type AddressLookupResult,
} from "../../services/address/openStreetMap";
import { CoreRepositoryError } from "../../services/core/coreRepository";
import { confirmDialog } from "../../components/ui/ConfirmDialog";
import "./map-view.css";

const ZONE_COLOR_PRESETS = [
  "#5c7a74",
  "#3f6f8f",
  "#8a6d3b",
  "#a34a4a",
  "#6b5b95",
  "#4a8f5c",
  "#c07a2c",
  "#4a6fa5",
];
const SPAIN_CENTER: [number, number] = [40.2, -3.6];

function pointKey(p: Pick<MapPoint, "kind" | "id">) {
  return `${p.kind}:${p.id}`;
}

function statusLabel(p: MapPoint): string {
  if (p.kind === "medicion") {
    const labels: Record<string, string> = {
      PLANNED: "Planificada",
      ASSIGNED: "Asignada",
      IN_PROGRESS: "En curso",
      COMPLETED: "Completada",
      QUOTED: "Presupuestada",
      CLOSED: "Cerrada",
    };
    return labels[p.status] || p.status;
  }
  const labels: Record<string, string> = {
    SCHEDULED: "Programado",
    COMPLETED: "Completado",
  };
  return labels[p.status] || p.status;
}

function fullAddress(p: MapPoint): string {
  return [p.street, p.city].filter(Boolean).join(", ");
}

// ---------------------------------------------------------------------------
// Mapa (Leaflet vanilla — sin react-leaflet para evitar el gotcha de assets
// de los iconos por defecto: los marcadores son divIcon con color por zona).
// ---------------------------------------------------------------------------
function MapCanvas({
  points,
  zones,
  focusKey,
}: {
  points: MapPoint[];
  zones: Zone[];
  focusKey: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: SPAIN_CENTER,
      zoom: 6,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const layer = layerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.clearLayers();
    markersRef.current.clear();
    const bounds: [number, number][] = [];
    for (const p of points) {
      if (p.latitude == null || p.longitude == null) continue;
      const zone = zones.find((z) => z.id === p.zoneId);
      const color = zone?.color || (p.kind === "medicion" ? "#5c7a74" : "#8a6d3b");
      const icon = L.divIcon({
        className: "map-marker",
        html: `<span class="map-marker-dot ${p.kind}" style="background:${color}"></span>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        popupAnchor: [0, -8],
      });
      const marker = L.marker([p.latitude, p.longitude], { icon });
      const address = fullAddress(p) || "Sin dirección";
      marker.bindPopup(
        `<div class="map-popup"><strong>${p.code}</strong><span>${p.customerName || "—"}</span><span>${address}</span><span class="map-popup-status">${statusLabel(p)}</span></div>`
      );
      marker.addTo(layer);
      markersRef.current.set(pointKey(p), marker);
      bounds.push([p.latitude, p.longitude]);
    }
    if (bounds.length) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    } else {
      map.setView(SPAIN_CENTER, 6);
    }
  }, [points, zones]);

  useEffect(() => {
    if (!focusKey) return;
    const map = mapRef.current;
    const marker = markersRef.current.get(focusKey);
    if (!map || !marker) return;
    map.flyTo(marker.getLatLng(), 15, { duration: 0.6 });
    marker.openPopup();
  }, [focusKey]);

  return <div ref={containerRef} className="map-canvas" />;
}

// ---------------------------------------------------------------------------
// Gestión de zonas
// ---------------------------------------------------------------------------
function ZoneFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: Zone | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [color, setColor] = useState(initial?.color || ZONE_COLOR_PRESETS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!name.trim()) {
      setError("Indica un nombre para la zona.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (initial) {
        await updateZone(initial.id, { name, color });
      } else {
        await createZone({ name, color, boundary: null });
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(
        e instanceof CoreRepositoryError ? e.message : "No se pudo guardar la zona."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-wrap">
            <span className="modal-icon-badge primary">
              <MapPin size={18} />
            </span>
            <div>
              <h3>{initial ? "Editar zona" : "Nueva zona"}</h3>
              <p>Agrupa mediciones y montajes por área geográfica.</p>
            </div>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          {error && <div className="inline-error">{error}</div>}
          <div className="form-group">
            <label>Nombre</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Zona norte…" autoFocus />
          </div>
          <div className="form-group">
            <label>Color</label>
            <div className="zone-color-picker">
              {ZONE_COLOR_PRESETS.map((c) => (
                <button
                  type="button"
                  key={c}
                  className={`zone-color-swatch ${color === c ? "selected" : ""}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  aria-label={c}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="zone-color-custom"
                title="Color personalizado"
              />
            </div>
          </div>
        </div>
        <div className="modal-actions-footer">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="primary-button" disabled={saving} onClick={save}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ZonePanel({
  zones,
  points,
  activeZoneIds,
  onToggleZone,
  onZonesChanged,
}: {
  zones: Zone[];
  points: MapPoint[];
  activeZoneIds: Set<number | null>;
  onToggleZone: (zoneId: number | null) => void;
  onZonesChanged: () => void;
}) {
  const [formZone, setFormZone] = useState<Zone | null | undefined>(undefined);
  const countByZone = useMemo(() => {
    const counts = new Map<number | null, number>();
    for (const p of points) {
      const key = p.zoneId;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }, [points]);

  async function remove(zone: Zone) {
    const ok = await confirmDialog({
      title: "Eliminar zona",
      message: `Se eliminará la zona "${zone.name}". Las mediciones y montajes asignados quedarán sin zona.`,
      danger: true,
      confirmLabel: "Eliminar",
    });
    if (!ok) return;
    await deleteZone(zone.id);
    onZonesChanged();
  }

  return (
    <div className="map-panel">
      <div className="map-panel-head">
        <h3>Zonas</h3>
        <button type="button" className="icon-link" title="Nueva zona" onClick={() => setFormZone(null)}>
          <Plus size={16} />
        </button>
      </div>
      <ul className="zone-list">
        <li
          key="sin-zona"
          className={`zone-list-item ${activeZoneIds.has(null) ? "active" : ""}`}
        >
          <button type="button" className="zone-list-toggle" onClick={() => onToggleZone(null)}>
            <span className="zone-dot" style={{ background: "var(--muted-2)" }} />
            <span>Sin zona</span>
            <span className="zone-count">{countByZone.get(null) || 0}</span>
          </button>
        </li>
        {zones.map((z) => (
          <li key={z.id} className={`zone-list-item ${activeZoneIds.has(z.id) ? "active" : ""}`}>
            <button type="button" className="zone-list-toggle" onClick={() => onToggleZone(z.id)}>
              <span className="zone-dot" style={{ background: z.color }} />
              <span>{z.name}</span>
              <span className="zone-count">{countByZone.get(z.id) || 0}</span>
            </button>
            <span className="zone-list-actions">
              <button type="button" className="icon-link" title="Editar zona" onClick={() => setFormZone(z)}>
                <Edit3 size={14} />
              </button>
              <button type="button" className="icon-link" title="Eliminar zona" onClick={() => remove(z)}>
                <Trash2 size={14} />
              </button>
            </span>
          </li>
        ))}
        {zones.length === 0 && (
          <li className="zone-list-empty">Todavía no hay zonas creadas.</li>
        )}
      </ul>
      {formZone !== undefined && (
        <ZoneFormModal
          initial={formZone}
          onClose={() => setFormZone(undefined)}
          onSaved={onZonesChanged}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Geocodificación de una dirección puntual (busca en OpenStreetMap / Nominatim)
// ---------------------------------------------------------------------------
function GeocodeRow({
  point,
  onLocated,
}: {
  point: MapPoint;
  onLocated: (lat: number, lon: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(fullAddress(point));
  const [results, setResults] = useState<AddressLookupResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function search() {
    setSearching(true);
    setError("");
    try {
      setResults(await searchAddress(query));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo buscar la dirección.");
    } finally {
      setSearching(false);
    }
  }

  async function apply(r: AddressLookupResult) {
    setSaving(true);
    setError("");
    try {
      const lat = Number(r.lat);
      const lon = Number(r.lon);
      await saveMapPointLocation(point, lat, lon);
      onLocated(lat, lon);
      setOpen(false);
    } catch (e) {
      setError(e instanceof CoreRepositoryError ? e.message : "No se pudo guardar la ubicación.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="map-locate-trigger" onClick={() => setOpen(true)}>
        <Search size={12} /> Localizar dirección
      </button>
    );
  }

  return (
    <div className="map-locate-form">
      <div className="map-locate-search">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
          placeholder="Calle, número, localidad…"
        />
        <button type="button" className="secondary-button" onClick={search} disabled={searching}>
          {searching ? "Buscando…" : "Buscar"}
        </button>
      </div>
      {error && <div className="inline-error">{error}</div>}
      {results.length > 0 && (
        <ul className="map-locate-results">
          {results.map((r, i) => (
            <li key={`${r.lat}-${r.lon}-${i}`}>
              <button type="button" disabled={saving} onClick={() => apply(r)}>
                {r.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="map-locate-actions">
        <button type="button" className="secondary-button" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Listado lateral (mediciones + montajes)
// ---------------------------------------------------------------------------
function PointRow({
  point,
  zones,
  selected,
  onSelect,
  onUpdated,
}: {
  point: MapPoint;
  zones: Zone[];
  selected: boolean;
  onSelect: () => void;
  onUpdated: (patch: Partial<MapPoint>) => void;
}) {
  const [zoneSaving, setZoneSaving] = useState(false);

  async function changeZone(zoneId: number | null) {
    setZoneSaving(true);
    try {
      await saveMapPointZone(point, zoneId);
      onUpdated({ zoneId });
    } finally {
      setZoneSaving(false);
    }
  }

  const geocoded = point.latitude != null && point.longitude != null;

  return (
    <li className={`map-point-row ${selected ? "selected" : ""}`}>
      <button type="button" className="map-point-main" onClick={onSelect} disabled={!geocoded}>
        {point.kind === "medicion" ? <Ruler size={14} /> : <Hammer size={14} />}
        <span className="map-point-info">
          <strong>{point.code}</strong>
          <small>{point.customerName || "—"}{point.city ? ` · ${point.city}` : ""}</small>
        </span>
        <span className={`status-pill neutral map-point-status`}>{statusLabel(point)}</span>
      </button>
      <div className="map-point-footer">
        <select
          value={point.zoneId ?? ""}
          disabled={zoneSaving}
          onChange={(e) => changeZone(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Sin zona</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>
        <Link to={point.linkTo} className="icon-link" title="Abrir ficha">
          <MapPin size={14} />
        </Link>
      </div>
      {!geocoded && (
        <GeocodeRow point={point} onLocated={(lat, lon) => onUpdated({ latitude: lat, longitude: lon })} />
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Pantalla principal
// ---------------------------------------------------------------------------
export function MapView() {
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showMediciones, setShowMediciones] = useState(true);
  const [showMontajes, setShowMontajes] = useState(true);
  const [onlyUngeocoded, setOnlyUngeocoded] = useState(false);
  const [activeZoneIds, setActiveZoneIds] = useState<Set<number | null>>(new Set());
  const [focusKey, setFocusKey] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError("");
      const [pts, zs] = await Promise.all([listMapPoints(), listZones()]);
      setPoints(pts);
      setZones(zs);
      setActiveZoneIds(new Set([null, ...zs.map((z) => z.id)]));
    } catch (e) {
      setError(e instanceof CoreRepositoryError ? e.message : "No se pudieron cargar los datos del mapa.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleZoneFilter(zoneId: number | null) {
    setActiveZoneIds((prev) => {
      const next = new Set(prev);
      if (next.has(zoneId)) next.delete(zoneId);
      else next.add(zoneId);
      return next;
    });
  }

  function updatePoint(key: string, patch: Partial<MapPoint>) {
    setPoints((prev) => prev.map((p) => (pointKey(p) === key ? { ...p, ...patch } : p)));
  }

  const visiblePoints = useMemo(
    () =>
      points.filter((p) => {
        if (p.kind === "medicion" && !showMediciones) return false;
        if (p.kind === "montaje" && !showMontajes) return false;
        if (onlyUngeocoded) return p.latitude == null || p.longitude == null;
        return activeZoneIds.has(p.zoneId);
      }),
    [points, showMediciones, showMontajes, onlyUngeocoded, activeZoneIds]
  );

  const mediicionesCount = points.filter((p) => p.kind === "medicion").length;
  const montajesCount = points.filter((p) => p.kind === "montaje").length;
  const ungeocodedCount = points.filter((p) => p.latitude == null || p.longitude == null).length;

  return (
    <div className="module-page map-view-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">GESTIÓN / MAPA</div>
          <h1>Mapa de mediciones y montajes</h1>
          <p>Ubica mediciones y montajes por zona geográfica. Datos © OpenStreetMap contributors.</p>
        </div>
      </div>

      {error && <div className="inline-error">{error}</div>}

      <div className="map-filters">
        <label className="map-filter-checkbox">
          <input type="checkbox" checked={showMediciones} onChange={(e) => setShowMediciones(e.target.checked)} />
          <Ruler size={13} /> Mediciones ({mediicionesCount})
        </label>
        <label className="map-filter-checkbox">
          <input type="checkbox" checked={showMontajes} onChange={(e) => setShowMontajes(e.target.checked)} />
          <Hammer size={13} /> Montajes ({montajesCount})
        </label>
        <label className="map-filter-checkbox">
          <input type="checkbox" checked={onlyUngeocoded} onChange={(e) => setOnlyUngeocoded(e.target.checked)} />
          Solo sin localizar ({ungeocodedCount})
        </label>
      </div>

      {loading ? (
        <div className="loading-block">Cargando mapa…</div>
      ) : (
        <div className="map-layout">
          <MapCanvas points={visiblePoints} zones={zones} focusKey={focusKey} />
          <div className="map-sidebar">
            <ZonePanel
              zones={zones}
              points={points}
              activeZoneIds={activeZoneIds}
              onToggleZone={toggleZoneFilter}
              onZonesChanged={load}
            />
            <div className="map-panel map-point-list-panel">
              <div className="map-panel-head">
                <h3>Puntos ({visiblePoints.length})</h3>
              </div>
              {visiblePoints.length === 0 ? (
                <div className="empty-state">
                  <MapPin size={22} />
                  <strong>Sin resultados</strong>
                  <span>Ajusta los filtros para ver mediciones o montajes.</span>
                </div>
              ) : (
                <ul className="map-point-list">
                  {visiblePoints.map((p) => {
                    const key = pointKey(p);
                    return (
                      <PointRow
                        key={key}
                        point={p}
                        zones={zones}
                        selected={focusKey === key}
                        onSelect={() => setFocusKey(key)}
                        onUpdated={(patch) => updatePoint(key, patch)}
                      />
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
