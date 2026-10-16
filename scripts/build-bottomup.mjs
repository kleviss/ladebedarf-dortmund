#!/usr/bin/env node
// Per-Unterbezirk factors for the bottom-up ISME model (part of `npm run data`,
// after build-enrichment.mjs). Adds to public/data/city/unterbezirke.geojson:
//
//   1 Private parking   efhBuildings, mfhBuildings, dwellingsEfh, dwellingsMfh, garages
//                       ALKIS building function + storeys: Wohnhaus ≤ 2 storeys = detached /
//                       semi-detached (EFH), ≥ 3 storeys or mixed use = apartment block (MFH)
//   2 Sharing factor    commerceBuildings, industryBuildings (ALKIS) → residential vs commercial mix
//   3 HPC lever         hpcSites, hpcPoints: OSM charging stations with ≥ 100 kW
//   4 Fleets            uses the city's commercial-car statistics already in the file
//   5 Mobility          transitRail: share of residential buildings within 600 m of a Stadtbahn,
//                       tram stop or rail station; transitBus: share with only a bus stop within 300 m;
//                       transitShare = transitRail + 0.3 × transitBus (bus alone covers almost all homes)
//
// Raw downloads are cached in data/raw/ (--refresh downloads again).

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data', 'raw');
const CITY = join(ROOT, 'public', 'data', 'city');
const OPEN_DATA = 'https://open-data.dortmund.de/api/explore/v2.1/catalog/datasets';
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const AREA = 'area["name"="Dortmund"]["admin_level"="6"]->.a;';
const refresh = process.argv.includes('--refresh');

const HPC_KW = 100;
const RAIL_M = 600;
const BUS_M = 300;

// ALKIS building functions
const RES_HOUSE = 'Wohnhaus';
const RES_MULTI = new Set(['Wohngebäude', 'Gemischt genutztes Gebäude mit Wohnen', 'Wohngebäude mit Handel und Dienstleistungen']);
const COMMERCE = new Set(['Gebäude für Handel und Dienstleistungen', 'Bürogebäude', 'Wohngebäude mit Handel und Dienstleistungen', 'Gemischt genutztes Gebäude mit Wohnen']);
const INDUSTRY = new Set(['Gebäude für Gewerbe und Industrie', 'Lagerhalle, Lagerschuppen, Lagerhaus', 'Werkstatt']);
const GARAGE = new Set(['Garage', 'Carport']);

async function cached(name, load, { optional = false } = {}) {
  const file = join(RAW, name);
  if (!refresh && existsSync(file)) return readFile(file, 'utf8');
  try {
    const text = await load();
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text);
    return text;
  } catch (e) {
    if (optional && existsSync(file)) return readFile(file, 'utf8');
    if (optional) return null;
    throw e;
  }
}

async function overpass(query) {
  let lastError;
  for (const url of OVERPASS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'ladebedarf-dortmund' },
          body: new URLSearchParams({ data: query }),
        });
        if (!res.ok) throw new Error(`${res.status} from ${url}`);
        return await res.text();
      } catch (e) {
        lastError = e;
        await new Promise((r) => setTimeout(r, 10000 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

const fetchText = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.text();
};

// --- geometry ---------------------------------------------------------------------

const KX = 111320 * Math.cos((51.51 * Math.PI) / 180);
const KY = 110570;

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function makeLocator(features) {
  const items = features.map((f) => {
    let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const poly of f.geometry.coordinates) for (const [x, y] of poly[0]) {
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    return { f, bbox: [minX, minY, maxX, maxY] };
  });
  return (pt) => {
    for (const { f, bbox } of items) {
      if (pt[0] < bbox[0] || pt[0] > bbox[2] || pt[1] < bbox[1] || pt[1] > bbox[3]) continue;
      if (f.geometry.coordinates.some((poly) => pointInRing(pt, poly[0]) && !poly.slice(1).some((h) => pointInRing(pt, h)))) return f.properties.ubz;
    }
    return null;
  };
}

function makeNearIndex(points, radius) {
  const cell = (x, y) => `${Math.floor((x * KX) / radius)}:${Math.floor((y * KY) / radius)}`;
  const grid = new Map();
  for (const p of points) {
    const k = cell(p[0], p[1]);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(p);
  }
  return (pt) => {
    const cx = Math.floor((pt[0] * KX) / radius);
    const cy = Math.floor((pt[1] * KY) / radius);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const p of grid.get(`${cx + dx}:${cy + dy}`) ?? []) {
        if (Math.hypot((pt[0] - p[0]) * KX, (pt[1] - p[1]) * KY) <= radius) return true;
      }
    }
    return false;
  };
}

const maxKw = (tags) => {
  let best = 0;
  for (const [k, v] of Object.entries(tags)) {
    if (!k.startsWith('socket:') || !k.endsWith(':output')) continue;
    for (const m of String(v).matchAll(/([\d.]+)\s*kW/gi)) best = Math.max(best, Number(m[1]));
  }
  return best;
};

/** Rough dwellings per building, from function and storeys. */
function dwellings(funktion, storeys) {
  if (funktion === RES_HOUSE) return storeys != null && storeys >= 3 ? Math.max(3, storeys * 2) : 1.3;
  if (RES_MULTI.has(funktion)) return storeys != null ? Math.max(2, (storeys - 1) * 2) : 4;
  return 0;
}

// --- main -------------------------------------------------------------------------

async function main() {
  const path = join(CITY, 'unterbezirke.geojson');
  const districts = JSON.parse(await readFile(path, 'utf8'));
  const locate = makeLocator(districts.features);

  console.log('Reading ALKIS buildings, Stadtbahn stops, OSM bus stops and fast chargers …');
  const alkis = JSON.parse(
    await cached('opendata-alkis-gebaeude.json', () =>
      fetchText(`${OPEN_DATA}/liegenschaftskataster-gebaude-bauwerke/exports/json?select=geo_point_2d,funktion,anzahlgs`),
    ),
  );
  const stadtbahn = JSON.parse(await cached('opendata-haltestellen.json', () => fetchText(`${OPEN_DATA}/haltestellen/exports/json?select=geo_point_2d,objektname`)));
  const osmStopsText = await cached(
    'osm-stops.json',
    () => overpass(`[out:json][timeout:180];${AREA}(node["highway"="bus_stop"](area.a);node["railway"~"^(tram_stop|station|halt)$"](area.a););out;`),
    { optional: true },
  );
  const chargingText = await cached('osm-charging.json', () => overpass(`[out:json][timeout:180];${AREA}nwr["amenity"="charging_station"](area.a);out center tags;`), {
    optional: true,
  });

  const stats = new Map(
    districts.features.map((f) => [
      f.properties.ubz,
      { efhBuildings: 0, mfhBuildings: 0, resUnknown: 0, dwellingsEfh: 0, dwellingsMfh: 0, garages: 0, commerceBuildings: 0, industryBuildings: 0, resBuildings: 0, resNearRail: 0, resNearBusOnly: 0, hpcSites: 0, hpcPoints: 0 },
    ]),
  );

  // Transit: Stadtbahn (Open Data) + OSM rail stations / tram stops, and OSM bus stops if available
  const railPts = stadtbahn.filter((s) => s.geo_point_2d).map((s) => [s.geo_point_2d.lon, s.geo_point_2d.lat]);
  const busPts = [];
  let osmStops = null;
  if (osmStopsText) {
    try {
      osmStops = JSON.parse(osmStopsText).elements;
      for (const e of osmStops) (e.tags?.highway === 'bus_stop' ? busPts : railPts).push([e.lon, e.lat]);
    } catch {
      osmStops = null;
    }
  }
  const nearRail = makeNearIndex(railPts, RAIL_M);
  const nearBus = busPts.length ? makeNearIndex(busPts, BUS_M) : () => false;

  for (const b of alkis) {
    const g = b.geo_point_2d;
    if (!g) continue;
    const pt = [g.lon, g.lat];
    const f = b.funktion;
    const isRes = f === RES_HOUSE || RES_MULTI.has(f);
    const relevant = isRes || COMMERCE.has(f) || INDUSTRY.has(f) || GARAGE.has(f);
    if (!relevant) continue;
    const ubz = locate(pt);
    if (!ubz) continue;
    const s = stats.get(ubz);
    const storeys = b.anzahlgs == null ? null : Number(b.anzahlgs);
    if (GARAGE.has(f)) s.garages += 1;
    if (COMMERCE.has(f)) s.commerceBuildings += 1;
    if (INDUSTRY.has(f)) s.industryBuildings += 1;
    if (!isRes) continue;
    s.resBuildings += 1;
    if (nearRail(pt)) s.resNearRail += 1;
    else if (nearBus(pt)) s.resNearBusOnly += 1;
    if (f === RES_HOUSE && storeys == null) {
      s.resUnknown += 1; // split later in the district's known EFH / MFH ratio
    } else if (f === RES_HOUSE && storeys <= 2) {
      s.efhBuildings += 1;
      s.dwellingsEfh += dwellings(f, storeys);
    } else {
      s.mfhBuildings += 1;
      s.dwellingsMfh += dwellings(f, storeys);
    }
  }

  // Fast chargers from OSM
  let hpcTotal = 0;
  if (chargingText) {
    try {
      for (const e of JSON.parse(chargingText).elements) {
        const t = e.tags ?? {};
        if (maxKw(t) < HPC_KW) continue;
        const pt = [e.center?.lon ?? e.lon, e.center?.lat ?? e.lat];
        const ubz = locate(pt);
        if (!ubz) continue;
        const points = /^\d+$/.test(t.capacity ?? '') ? Number(t.capacity) : 2;
        const s = stats.get(ubz);
        s.hpcSites += 1;
        s.hpcPoints += points;
        hpcTotal += points;
      }
    } catch {
      /* keep zero */
    }
  }

  for (const f of districts.features) {
    const s = stats.get(f.properties.ubz);
    const known = s.efhBuildings + s.mfhBuildings;
    const efhPart = known > 0 ? s.efhBuildings / known : 0.7;
    // unknown-storey houses follow the district's known mix
    s.dwellingsEfh += s.resUnknown * efhPart * 1.3;
    s.dwellingsMfh += s.resUnknown * (1 - efhPart) * 6;
    s.efhBuildings += Math.round(s.resUnknown * efhPart);
    s.mfhBuildings += Math.round(s.resUnknown * (1 - efhPart));
    f.properties.efhBuildings = s.efhBuildings;
    f.properties.mfhBuildings = s.mfhBuildings;
    f.properties.dwellingsEfh = Math.round(s.dwellingsEfh);
    f.properties.dwellingsMfh = Math.round(s.dwellingsMfh);
    f.properties.garages = s.garages;
    f.properties.commerceBuildings = s.commerceBuildings;
    f.properties.industryBuildings = s.industryBuildings;
    f.properties.residentialBuildings = s.resBuildings;
    const rail = s.resBuildings > 0 ? s.resNearRail / s.resBuildings : 0;
    const bus = s.resBuildings > 0 ? s.resNearBusOnly / s.resBuildings : 0;
    f.properties.transitRail = Math.round(rail * 1000) / 1000;
    f.properties.transitBus = Math.round(bus * 1000) / 1000;
    f.properties.transitShare = Math.round((rail + 0.3 * bus) * 1000) / 1000;
    f.properties.hpcSites = s.hpcSites;
    f.properties.hpcPoints = s.hpcPoints;
  }
  await writeFile(path, JSON.stringify(districts));

  const sum = (k) => districts.features.reduce((a, f) => a + (f.properties[k] ?? 0), 0);
  const metaPath = join(CITY, 'meta.json');
  const meta = JSON.parse(await readFile(metaPath, 'utf8'));
  meta.bottomup = {
    fetchedAt: new Date().toISOString(),
    sources: [
      'Open Data Dortmund: liegenschaftskataster-gebaude-bauwerke (ALKIS, Gebäudefunktion und Geschosse)',
      'Open Data Dortmund: haltestellen (Stadtbahn)',
      osmStops ? 'OpenStreetMap: Bushaltestellen, Bahnhöfe, Straßenbahn' : 'OpenStreetMap-Haltestellen nicht verfügbar (nur Stadtbahn)',
      chargingText ? `OpenStreetMap: Ladestationen ≥ ${HPC_KW} kW` : 'OpenStreetMap-Ladestationen nicht verfügbar',
    ],
    efhBuildings: sum('efhBuildings'),
    mfhBuildings: sum('mfhBuildings'),
    dwellingsEfh: sum('dwellingsEfh'),
    dwellingsMfh: sum('dwellingsMfh'),
    garages: sum('garages'),
    commerceBuildings: sum('commerceBuildings'),
    industryBuildings: sum('industryBuildings'),
    railStops: railPts.length,
    busStops: busPts.length,
    hpcPoints: hpcTotal,
    railMetres: RAIL_M,
    busMetres: BUS_M,
    hpcKw: HPC_KW,
  };
  await writeFile(metaPath, JSON.stringify(meta, null, 2));

  const m = meta.bottomup;
  console.log(`✔ Wohngebäude: ${m.efhBuildings} EFH, ${m.mfhBuildings} MFH · Wohnungen ≈ ${m.dwellingsEfh + m.dwellingsMfh} · Garagen/Carports ${m.garages}`);
  console.log(`✔ Gewerbe: ${m.commerceBuildings} Handel/Büro, ${m.industryBuildings} Industrie/Lager · ÖPNV: ${m.railStops} Schiene, ${m.busStops} Bus · HPC: ${m.hpcPoints} LP`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
