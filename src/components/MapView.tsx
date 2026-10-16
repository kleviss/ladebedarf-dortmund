import { useEffect, useRef, useState } from 'react';
import {
  Map as MapLibreMap,
  LngLatBounds,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
  type MapLayerMouseEvent,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre 6 locates its worker relative to its own file, which breaks once
// Vite bundles it. Let Vite build the worker and hand MapLibre its URL.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(workerUrl);
import type { AppData } from '../lib/data';
import type { DistrictResult } from '../lib/isme';
import { cityBoundary } from '../lib/cityBoundary';

// Official German basemap (BKG), free to use with attribution, no API key.
const BASEMAP = 'https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_gry.json';

interface Props {
  data: AppData;
  results: Map<string, DistrictResult>;
  selected: string | null;
  showChargers: boolean;
  onSelect: (ubz: string | null) => void;
}

interface Hover {
  x: number;
  y: number;
  ubz: string;
}

export function MapView({ data, results, selected, showChargers, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Create the map once.
  useEffect(() => {
    if (!container.current) return;
    const map = new MapLibreMap({
      container: container.current,
      style: BASEMAP,
      center: [7.465, 51.512],
      zoom: 10.4,
      minZoom: 9,
      maxZoom: 17,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(container.current);
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.on('load', () => {
      // Put our layers below the basemap's labels so place names stay readable.
      const firstSymbol = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;

      map.addSource('ubz', { type: 'geojson', data: data.districts });
      map.addSource('chargers', { type: 'geojson', data: data.chargers });
      map.addSource('city-boundary', { type: 'geojson', data: cityBoundary(data.districts) });

      map.addLayer(
        {
          id: 'ubz-fill',
          type: 'fill',
          source: 'ubz',
          paint: {
            'fill-color': '#50647b',
            'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.12, 0],
          },
        },
        firstSymbol,
      );
      map.addLayer(
        {
          id: 'ubz-line',
          type: 'line',
          source: 'ubz',
          paint: { 'line-color': '#50647b', 'line-width': 1, 'line-opacity': 0.75 },
        },
        firstSymbol,
      );
      map.addLayer({
        id: 'city-boundary-halo',
        type: 'line',
        source: 'city-boundary',
        paint: { 'line-color': '#ffffff', 'line-width': 6 },
      });
      map.addLayer({
        id: 'city-boundary-line',
        type: 'line',
        source: 'city-boundary',
        paint: { 'line-color': '#256abf', 'line-width': 3 },
      });
      map.addLayer({
        id: 'ubz-selected',
        type: 'line',
        source: 'ubz',
        paint: {
          'line-color': '#0b0b0b',
          'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2.5, 0],
        },
      });
      map.addLayer({
        id: 'chargers',
        type: 'circle',
        source: 'chargers',
        paint: {
          'circle-color': '#eb6834',
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 15, 6],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1,
        },
      });

      let hoveredId: number | string | undefined;
      map.on('mousemove', 'ubz-fill', (e: MapLayerMouseEvent) => {
        const f = e.features?.[0];
        if (!f) return;
        if (hoveredId !== undefined && hoveredId !== f.id) {
          map.setFeatureState({ source: 'ubz', id: hoveredId }, { hover: false });
        }
        hoveredId = f.id;
        map.setFeatureState({ source: 'ubz', id: f.id! }, { hover: true });
        map.getCanvas().style.cursor = 'pointer';
        setHover({ x: e.point.x, y: e.point.y, ubz: String(f.properties.ubz) });
      });
      map.on('mouseleave', 'ubz-fill', () => {
        if (hoveredId !== undefined) map.setFeatureState({ source: 'ubz', id: hoveredId }, { hover: false });
        hoveredId = undefined;
        map.getCanvas().style.cursor = '';
        setHover(null);
      });
      map.on('click', 'ubz-fill', (e: MapLayerMouseEvent) => {
        const ubz = e.features?.[0]?.properties.ubz;
        if (ubz != null) onSelectRef.current(String(ubz));
      });

      setReady(true);
    });

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [data]);

  // Fit the selected district, or the whole city when the details are closed.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.resize();
    for (const layer of ['city-boundary-halo', 'city-boundary-line']) {
      map.setLayoutProperty(layer, 'visibility', selected === null ? 'visible' : 'none');
    }
    for (const f of data.districts.features) {
      if (f.id == null) continue;
      map.setFeatureState({ source: 'ubz', id: f.id }, { selected: f.properties.ubz === selected });
    }
    const district = data.districts.features.find((f) => f.properties.ubz === selected);
    const bounds = new LngLatBounds();
    for (const feature of district ? [district] : data.districts.features) {
      for (const polygon of feature.geometry.coordinates) {
        for (const ring of polygon) {
          for (const coordinate of ring) {
            bounds.extend([coordinate[0], coordinate[1]]);
          }
        }
      }
    }
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, {
        padding: 32,
        maxZoom: district ? 15 : 10.4,
        duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 700,
      });
    }
  }, [ready, selected, data]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setLayoutProperty('chargers', 'visibility', showChargers ? 'visible' : 'none');
  }, [ready, showChargers]);

  const hovered = hover ? results.get(hover.ubz) : undefined;

  return (
    <div className="map">
      <div ref={container} className="map-canvas" aria-label="Map of statistical subdistricts" role="region" />
      {hover && hovered && (
        <div className="map-tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }} role="status">
          <strong>{hovered.name}</strong>
          <span className="muted">{hovered.stadtbezirk}</span>
          <span>Subdistrict {hovered.ubz}</span>
        </div>
      )}
    </div>
  );
}
