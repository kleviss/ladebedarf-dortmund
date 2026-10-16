#!/usr/bin/env node
// Public parking in Dortmund and its distance to the nearest charging location.
// Runs after build-city-data.mjs (part of `npm run data`).
//
// Sources: OpenStreetMap (amenity=parking via Overpass, cached in data/raw/),
// Open Data Dortmund "parkhauser" and "park-and-ride".
// Writes public/data/city/parkplaetze.geojson and adds per-district parking
// counts to public/data/city/unterbezirke.geojson.

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data', 'raw');
const CITY = join(ROOT, 'public', 'data', 'city');
const OPEN_DATA = 'https://open-data.dortmund.de/api/explore/v2.1/catalog/datasets';
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const QUERY = '[out:json][timeout:180];area["name"="Dortmund"]["admin_level"="6"]->.a;nwr["amenity"="parking"](area.a);out center tags;';

/** ISME walking distance for the use "Wohnen". */
export const COVERED_M = 225;
const NEAR_M = 100;
// OSM access values we count as publicly usable; no tag means public in OSM.
const PUBLIC_ACCESS = new Set(['yes', 'permissive', 'destination', undefined]);

async function overpass(refresh) {
  const cache = join(RAW, 'osm-parking.json');
  if (!refresh && existsSync(cache)) return JSON.parse(await readFile(cache, 'utf8'));
  let lastError;
  for (const url of OVERPASS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'ladebedarf-dortmund' },
          body: new URLSearchParams({ data: QUERY }),
        });
        if (!res.ok) throw new Error(`${res.status} from ${url}`);
        const json = await res.json();
        await mkdir(RAW, { recursive: true });
        await writeFile(cache, JSON.stringify(json));
        return json;
      } catch (e) {
        lastError = e;
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }
  throw lastError;
}

const getJson = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.json();
};

// --- geometry -----------------------------------------------------------------

const KX = 111320 * Math.cos((51.51 * Math.PI) / 180);
const KY = 110570;
const metres = (a, b) => Math.hypot((a[0] - b[0]) * KX, (a[1] - b[1]) * KY);
const round = (n) => Math.round(n * 1e5) / 1e5;

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inMultiPolygon = (pt, mp) =>
  mp.coordinates.some((poly) => pointInRing(pt, poly[0]) && !poly.slice(1).some((h) => pointInRing(pt, h)));

// --- main ---------------------------------------------------------------------

async function main() {
  const refresh = process.argv.includes('--refresh');
  const districts = JSON.parse(await readFile(join(CITY, 'unterbezirke.geojson'), 'utf8'));
  const chargers = JSON.parse(await readFile(join(CITY, 'ladepunkte.geojson'), 'utf8')).features.map((f) => f.geometry.coordinates);

  console.log('Reading parking from OpenStreetMap and Open Data Dortmund …');
  const [osm, garages, parkRide] = await Promise.all([
    overpass(refresh),
    getJson(`${OPEN_DATA}/parkhauser/exports/json?select=name,capacity,geo_point_2d`),
    getJson(`${OPEN_DATA}/park-and-ride/exports/json`),
  ]);

  const spots = [];
  // Customer-only parking (supermarkets etc.) is not a site for public charging,
  // but we report how close it is to chargers for comparison.
  const customerPts = [];
  for (const e of osm.elements) {
    const t = e.tags ?? {};
    if (t.access === 'customers') {
      const c = [e.center?.lon ?? e.lon, e.center?.lat ?? e.lat];
      if (c[0] != null) customerPts.push(c);
      continue;
    }
    if (!PUBLIC_ACCESS.has(t.access)) continue;
    const lon = e.center?.lon ?? e.lon;
    const lat = e.center?.lat ?? e.lat;
    if (lon == null) continue;
    spots.push({
      pt: [lon, lat],
      kind: t.parking === 'multi-storey' || t.parking === 'underground' ? 'garage' : t.parking === 'street_side' || t.parking === 'lane' || t.parking === 'half_on_kerb' ? 'street' : 'lot',
      name: t.name ?? null,
      capacity: /^\d+$/.test(t.capacity ?? '') ? Number(t.capacity) : null,
      source: 'OSM',
    });
  }
  for (const g of garages) {
    if (!g.geo_point_2d) continue;
    spots.push({ pt: [g.geo_point_2d.lon, g.geo_point_2d.lat], kind: 'garage', name: g.name, capacity: g.capacity ?? null, source: 'Open Data' });
  }
  for (const p of parkRide) {
    const geo = p.geo_point_2d;
    if (!geo) continue;
    spots.push({ pt: [geo.lon, geo.lat], kind: 'park-ride', name: p.objektname ?? 'Park+Ride', capacity: null, source: 'Open Data' });
  }

  // OSM sometimes maps one car park twice (node and area), and Open Data repeats some
  // OSM car parks. Keep one spot per name within ~150 m.
  const seen = new Map();
  const unique = spots.filter((s) => {
    if (!s.name) return true;
    const key = s.name.toLowerCase().replace(/\s+/g, ' ').trim();
    const others = seen.get(key) ?? [];
    const twin = others.find((o) => metres(o.pt, s.pt) < 150);
    if (twin) {
      // keep the more specific type (Open Data's Parkhaus / P+R) and any known capacity
      if (s.kind === 'garage' || s.kind === 'park-ride') twin.kind = s.kind;
      twin.capacity ??= s.capacity;
      return false;
    }
    seen.set(key, [...others, s]);
    return true;
  });
  const removed = spots.length - unique.length;
  spots.length = 0;
  spots.push(...unique);

  const stats = new Map(districts.features.map((f) => [f.properties.ubz, { parkingPublic: 0, parkingUncovered: 0, parkingCapacity: 0, parkingGarages: 0 }]));
  const features = [];
  for (const s of spots) {
    const distance = Math.round(Math.min(...chargers.map((c) => metres(s.pt, c))));
    const district = districts.features.find((f) => inMultiPolygon(s.pt, f.geometry));
    if (!district) continue; // outside the city
    const st = stats.get(district.properties.ubz);
    st.parkingPublic += 1;
    if (distance > COVERED_M) st.parkingUncovered += 1;
    st.parkingCapacity += s.capacity ?? 0;
    if (s.kind === 'garage' || s.kind === 'park-ride') st.parkingGarages += 1;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: s.pt.map(round) },
      properties: {
        ubz: district.properties.ubz,
        kind: s.kind,
        name: s.name,
        capacity: s.capacity,
        source: s.source,
        distance,
        cover: distance <= NEAR_M ? 0 : distance <= COVERED_M ? 1 : 2,
      },
    });
  }

  for (const f of districts.features) Object.assign(f.properties, stats.get(f.properties.ubz));
  await writeFile(join(CITY, 'unterbezirke.geojson'), JSON.stringify(districts));
  await writeFile(join(CITY, 'parkplaetze.geojson'), JSON.stringify({ type: 'FeatureCollection', features }));

  // Distance bands to the nearest charger, for the reports
  const BANDS = [50, 100, 225, 500];
  const band = (distances) => ({
    n: distances.length,
    within: Object.fromEntries(BANDS.map((m) => [m, distances.filter((d) => d <= m).length])),
    median: distances.length ? [...distances].sort((a, b) => a - b)[Math.floor(distances.length / 2)] : 0,
  });
  const customerDistances = customerPts
    .filter((pt) => districts.features.some((f) => inMultiPolygon(pt, f.geometry)))
    .map((pt) => Math.round(Math.min(...chargers.map((c) => metres(pt, c)))));
  const distanceBands = {
    bands: BANDS,
    public: band(features.map((f) => f.properties.distance)),
    customers: band(customerDistances),
    byKind: Object.fromEntries(
      ['garage', 'park-ride', 'lot', 'street'].map((k) => [k, band(features.filter((f) => f.properties.kind === k).map((f) => f.properties.distance))]),
    ),
  };

  const metaPath = join(CITY, 'meta.json');
  const meta = JSON.parse(await readFile(metaPath, 'utf8'));
  const uncovered = features.filter((f) => f.properties.cover === 2).length;
  meta.parking = {
    fetchedAt: new Date().toISOString(),
    sources: ['OpenStreetMap amenity=parking (© OpenStreetMap contributors, ODbL)', 'Open Data Dortmund: parkhauser, park-and-ride'],
    publicSpots: features.length,
    uncovered,
    coveredMetres: COVERED_M,
    distance: distanceBands,
  };
  await writeFile(metaPath, JSON.stringify(meta, null, 2));

  console.log(`  ${removed} Doppelungen entfernt`);
  console.log(`✔ ${features.length} öffentliche Parkflächen · ${uncovered} ohne Ladestandort im Umkreis von ${COVERED_M} m`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
