import { useEffect, useRef, useState } from 'react';
import {
  Map as MapLibreMap,
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
import { RAMP, ZERO_COLOR, type Classes, type Metric } from '../lib/metrics';
import { SCORE_RAMP, scoreClass, type ScoredSite } from '../lib/sites';
import type { ParkingColour } from './SitePanel';

// Official German basemap (BKG), free to use with attribution, no API key.
const BASEMAP = 'https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_gry.json';

interface Props {
  data: AppData;
  results: Map<string, DistrictResult>;
  metric: Metric;
  classes: Classes;
  selected: string | null;
  showChargers: boolean;
  showPriority: boolean;
  showParking: boolean;
  sites: ScoredSite[];
  parkingColour: ParkingColour;
  onSelect: (ubz: string | null) => void;
}

interface Hover {
  x: number;
  y: number;
  ubz: string;
}

export function MapView({ data, results, metric, classes, selected, showChargers, showPriority, showParking, sites, parkingColour, onSelect }: Props) {
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
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.on('load', () => {
      // Put our layers below the basemap's labels so place names stay readable.
      const firstSymbol = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;

      map.addSource('ubz', { type: 'geojson', data: data.districts });
      map.addSource('chargers', { type: 'geojson', data: data.chargers });
      map.addSource('priority', { type: 'geojson', data: data.priority });
      map.addSource('parking', { type: 'geojson', data: data.parking });

      map.addLayer(
        {
          id: 'ubz-fill',
          type: 'fill',
          source: 'ubz',
          paint: {
            'fill-color': [
              'match',
              ['coalesce', ['feature-state', 'cls'], -1],
              0, RAMP[0],
              1, RAMP[1],
              2, RAMP[2],
              3, RAMP[3],
              4, RAMP[4],
              ZERO_COLOR,
            ],
            'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.92, 0.78],
          },
        },
        firstSymbol,
      );
      map.addLayer(
        {
          id: 'ubz-line',
          type: 'line',
          source: 'ubz',
          paint: { 'line-color': '#ffffff', 'line-width': 0.8 },
        },
        firstSymbol,
      );
      map.addLayer({
        id: 'priority-fill',
        type: 'fill',
        source: 'priority',
        layout: { visibility: 'none' },
        paint: {
          'fill-color': '#6250d6',
          'fill-opacity': ['interpolate', ['linear'], ['get', 'points'], 1, 0.25, 8, 0.65],
        },
      });
      map.addLayer({
        id: 'priority-line',
        type: 'line',
        source: 'priority',
        layout: { visibility: 'none' },
        paint: { 'line-color': '#6250d6', 'line-width': 1 },
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
        id: 'parking',
        type: 'circle',
        source: 'parking',
        layout: { visibility: 'none' },
        paint: {
          // distance mode: green = charger within 100 m, amber = within 225 m, red = none
          // score mode: teal ramp by site score (feature-state set below)
          'circle-color': [
            'case',
            ['==', ['feature-state', 'mode'], 'score'],
            ['match', ['coalesce', ['feature-state', 'scls'], 0], 0, SCORE_RAMP[0], 1, SCORE_RAMP[1], 2, SCORE_RAMP[2], 3, SCORE_RAMP[3], SCORE_RAMP[4]],
            ['match', ['get', 'cover'], 0, '#0ca30c', 1, '#fab219', '#d03b3b'],
          ],
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            10, ['match', ['get', 'kind'], 'garage', 3.5, 'park-ride', 3.5, 2],
            15, ['match', ['get', 'kind'], 'garage', 8, 'park-ride', 8, 5],
          ],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': ['match', ['get', 'kind'], 'garage', 1.5, 'park-ride', 1.5, 0.5],
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
      map.remove();
      mapRef.current = null;
    };
  }, [data]);

  // Recolor when the scenario or metric changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const f of data.districts.features) {
      const r = results.get(f.properties.ubz);
      if (!r || f.id == null) continue;
      map.setFeatureState({ source: 'ubz', id: f.id }, { cls: classes.classOf(metric.value(r)) });
    }
  }, [ready, results, metric, classes, data]);

  // Selection outline + fly to the district.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const f of data.districts.features) {
      if (f.id == null) continue;
      map.setFeatureState({ source: 'ubz', id: f.id }, { selected: f.properties.ubz === selected });
    }
  }, [ready, selected, data]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setLayoutProperty('chargers', 'visibility', showChargers ? 'visible' : 'none');
  }, [ready, showChargers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const id of ['priority-fill', 'priority-line']) map.setLayoutProperty(id, 'visibility', showPriority ? 'visible' : 'none');
  }, [ready, showPriority]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setLayoutProperty('parking', 'visibility', showParking ? 'visible' : 'none');
  }, [ready, showParking]);

  // Site score colours, recomputed when the weights change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const s of sites) map.setFeatureState({ source: 'parking', id: s.id }, { mode: parkingColour, scls: scoreClass(s.score) });
  }, [ready, sites, parkingColour]);

  const hovered = hover ? results.get(hover.ubz) : undefined;

  return (
    <div className="map">
      <div ref={container} className="map-canvas" aria-label="Karte der statistischen Unterbezirke" role="region" />
      {hover && hovered && (
        <div className="map-tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }} role="status">
          <strong>{hovered.name}</strong>
          <span className="muted">{hovered.stadtbezirk}</span>
          <span>
            {metric.short}: <b className="num">{metric.format(metric.value(hovered))}</b>
          </span>
        </div>
      )}
    </div>
  );
}
