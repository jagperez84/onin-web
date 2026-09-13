import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './map-view.css';

// Leaflet vanilla — sin react-leaflet para evitar el gotcha de assets de los
// iconos por defecto: los marcadores son divIcon con color/forma por punto.
// Componente puro de dibujo: no conoce mediciones/montajes/zonas, solo pinta
// lo que se le pasa — así lo reutilizan tanto el mapa general como el mapa
// del día de la Agenda, cada uno resolviendo color/click a su manera.

export type CanvasPoint = {
  key: string;
  lat: number;
  lon: number;
  color: string;
  /** Sin indicar: punto circular liso. Con número: badge numerado (orden de ruta). */
  label?: string;
  shape?: 'circle' | 'diamond';
  popupHtml?: string;
};

export type CanvasRoute = { color: string; keys: string[] };

const SPAIN_CENTER: [number, number] = [40.2, -3.6];

export function MapCanvas({
  points,
  routes,
  focusKey,
  onMarkerClick,
}: {
  points: CanvasPoint[];
  routes?: CanvasRoute[];
  focusKey?: string | null;
  onMarkerClick?: (key: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { center: SPAIN_CENTER, zoom: 6 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      routeLayerRef.current = null;
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
      const icon = L.divIcon({
        className: 'map-marker',
        html: p.label
          ? `<span class="map-marker-badge" style="background:${p.color}">${p.label}</span>`
          : `<span class="map-marker-dot ${p.shape === 'diamond' ? 'montaje' : 'medicion'}" style="background:${p.color}"></span>`,
        iconSize: p.label ? [22, 22] : [16, 16],
        iconAnchor: p.label ? [11, 11] : [8, 8],
        popupAnchor: [0, -8],
      });
      const marker = L.marker([p.lat, p.lon], { icon });
      if (p.popupHtml) marker.bindPopup(p.popupHtml);
      if (onMarkerClick) marker.on('click', () => onMarkerClick(p.key));
      marker.addTo(layer);
      markersRef.current.set(p.key, marker);
      bounds.push([p.lat, p.lon]);
    }
    if (bounds.length) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    } else {
      map.setView(SPAIN_CENTER, 6);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  useEffect(() => {
    const routeLayer = routeLayerRef.current;
    if (!routeLayer) return;
    routeLayer.clearLayers();
    const byKey = new Map(points.map((p) => [p.key, p]));
    for (const route of routes ?? []) {
      const coords = route.keys
        .map((k) => byKey.get(k))
        .filter((p): p is CanvasPoint => !!p)
        .map((p) => [p.lat, p.lon] as [number, number]);
      if (coords.length > 1) {
        L.polyline(coords, { color: route.color, weight: 3, opacity: 0.6, dashArray: '6 6' }).addTo(routeLayer);
      }
    }
  }, [points, routes]);

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
