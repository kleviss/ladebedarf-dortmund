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
import type { AppData, Station } from '../lib/data';
import type { DistrictResult } from '../lib/isme';
import { cityBoundary } from '../lib/cityBoundary';
import { RAMP, ZERO_COLOR, type Classes } from '../lib/metrics';

// Official German basemap (BKG), free to use with attribution, no API key.
const BASEMAP = 'https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_gry.json';

interface Props {
  data: AppData;
  results: Map<string, DistrictResult>;
  /** Colour classes of the missing charging points */
  classes: Classes;
  selected: string | null;
  showChargers: boolean;
  onSelect: (ubz: string | null) => void;
}

interface Hover {
  x: number;
  y: number;
  ubz: string;
}

interface StationHover {
  x: number;
  y: number;
  station: Station;
}

const STATION_KIND = (s: Station) =>
  s.type === 'DC' ? 'Fast charger (DC)' : s.streetAc ? 'Public AC' : s.access === 'customers' ? 'Customers only' : 'Car park / private site';

export function MapView({ data, results, classes, selected, showChargers, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);
  const [stationHover, setStationHover] = useState<StationHover | null>(null);
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
      // register stations with charging points per station; fall back to the city's locations
      map.addSource('chargers', { type: 'geojson', data: data.stations.features.length ? data.stations : data.chargers });
      map.addSource('city-boundary', { type: 'geojson', data: cityBoundary(data.districts) });

      map.addLayer(
        {
          id: 'ubz-fill',
          type: 'fill',
          source: 'ubz',
          paint: {
            // colour class per district from feature state 'cls' (-1 = no missing points)
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
            'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.85, 0.6],
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
          // orange = public AC, dark = fast charger, light = car park or customer parking
          'circle-color': [
            'case',
            ['==', ['get', 'type'], 'DC'],
            '#9a3412',
            ['==', ['get', 'streetAc'], false],
            '#f5b48f',
            '#eb6834',
          ],
          // grows with the number of charging points at the station
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10,
            ['+', 1.5, ['*', 0.7, ['coalesce', ['get', 'points'], 1]]],
            13.5,
            ['+', 3, ['*', 1.2, ['coalesce', ['get', 'points'], 1]]],
            15,
            ['+', 6, ['*', 1.5, ['coalesce', ['get', 'points'], 1]]],
          ],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1,
        },
      });
      map.addLayer({
        id: 'charger-count',
        type: 'symbol',
        source: 'chargers',
        minzoom: 13.5,
        filter: ['has', 'points'],
        layout: {
          'text-field': ['to-string', ['get', 'points']],
          'text-font': ['Noto Sans Bold'],
          'text-size': 10,
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: { 'text-color': '#ffffff' },
      });
      map.on('mousemove', 'chargers', (e: MapLayerMouseEvent) => {
        const p = e.features?.[0]?.properties as Record<string, unknown> | undefined;
        if (!p || p.points == null) return;
        setStationHover({
          x: e.point.x,
          y: e.point.y,
          station: {
            ubz: (p.ubz as string) ?? null,
            points: Number(p.points),
            kw: p.kw == null ? null : Number(p.kw),
            type: p.type === 'DC' ? 'DC' : 'AC',
            streetAc: p.streetAc === true || p.streetAc === 'true',
            access: p.access === 'customers' ? 'customers' : 'public',
            operator: String(p.operator ?? ''),
            name: (p.name as string) || null,
            address: String(p.address ?? ''),
            since: (p.since as string) || null,
          },
        });
      });
      map.on('mouseleave', 'chargers', () => setStationHover(null));

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

  // Shade every district by its missing charging points.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const f of data.districts.features) {
      if (f.id == null) continue;
      const r = results.get(f.properties.ubz);
      map.setFeatureState({ source: 'ubz', id: f.id }, { cls: r ? classes.classOf(r.gap) : -1 });
    }
  }, [ready, results, classes, data]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const layer of ['chargers', 'charger-count']) {
      map.setLayoutProperty(layer, 'visibility', showChargers ? 'visible' : 'none');
    }
  }, [ready, showChargers]);

  const hovered = hover ? results.get(hover.ubz) : undefined;

  return (
    <div className="map">
      <div ref={container} className="map-canvas" aria-label="Map of statistical subdistricts" role="region" />
      <div className="map-legend" aria-label="Map legend">
        <div className="map-legend-block">
          <span className="map-legend-title">Missing charging points</span>
          <div className="map-legend-bar">
            {[
              ...(classes.hasZero ? [{ colour: ZERO_COLOR, label: '0' }] : []),
              ...classes.breaks.map((b, i) => {
                const from = i === 0 ? 1 : classes.breaks[i - 1] + 1;
                return { colour: classes.colours[i], label: from === b ? String(b) : `${from}–${b}` };
              }),
            ].map((c) => (
              <span key={c.label} className="map-legend-step">
                <span className="map-legend-swatch" style={{ background: c.colour }} aria-hidden="true" />
                {c.label}
              </span>
            ))}
          </div>
        </div>
        {showChargers && (
          <div className="map-legend-block">
            <span className="map-legend-title">Charging stations</span>
            <ul className="station-key">
              <li><span className="dot" aria-hidden="true" />Public AC</li>
              <li><span className="dot dot-dc" aria-hidden="true" />Fast charger (DC)</li>
              <li><span className="dot dot-offstreet" aria-hidden="true" />Car park, customers</li>
              <li className="station-key-note">
                <span className="dot dot-big" aria-hidden="true">2</span>Size and number = charging points
              </li>
            </ul>
          </div>
        )}
      </div>
      {stationHover && (
        <div className="map-tooltip" style={{ left: stationHover.x + 14, top: stationHover.y + 14 }} role="status">
          <strong>
            {stationHover.station.points} charging point{stationHover.station.points === 1 ? '' : 's'}
            {stationHover.station.kw != null ? ` · ${stationHover.station.kw.toLocaleString('en-GB')} kW` : ''}
          </strong>
          <span>{STATION_KIND(stationHover.station)}</span>
          <span className="muted">{stationHover.station.name ?? stationHover.station.address}</span>
          <span className="muted">
            {stationHover.station.operator}
            {stationHover.station.since ? ` · since ${stationHover.station.since.slice(0, 4)}` : ''}
          </span>
        </div>
      )}
      {!stationHover && hover && hovered && (
        <div className="map-tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }} role="status">
          <strong>{hovered.name}</strong>
          <span className="muted">{hovered.stadtbezirk}</span>
          <span>Missing charging points: <b className="num">{hovered.gap.toLocaleString('en-GB')}</b></span>
          <span>Existing: {hovered.existing.toLocaleString('en-GB')} · Required: {hovered.needed.toLocaleString('en-GB')}</span>
        </div>
      )}
    </div>
  );
}
