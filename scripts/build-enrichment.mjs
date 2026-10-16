#!/usr/bin/env node
// Adds the remaining ISME factors per Unterbezirk (part of `npm run data`):
//   poisShopping, poisLeisure   OpenStreetMap points of interest, as in the ISME report
//                               (shopping → tourists' "Einkaufen", leisure → "Freizeit")
//   commercialHa                Commercial/industrial land from the city's "Gewerbe in Dortmund.kml"
//                               (RVR land-use mapping 2021), a stand-in for workplaces
//   buildings, buildingsCovered Open Data buildings and how many lie within 225 m of a
//                               charging location (ISME walking distance for "Wohnen")
//   bplans, bplansRecent        Development plans (Open Data b-plan), all / in force since 2015
//
// Reads and rewrites public/data/city/unterbezirke.geojson; raw downloads cached in data/raw/.

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data', 'raw');
const CITY = join(ROOT, 'public', 'data', 'city');
const OPEN_DATA = 'https://open-data.dortmund.de/api/explore/v2.1/catalog/datasets';
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const SHARE_TOKEN = process.env.SCIEBO_SHARE ?? 'kHXddKmMZpK8ECR';
const KML = 'Gewerbegebiete/Gewerbe in Dortmund.kml';
const COVERED_M = 225;

const AREA = 'area["name"="Dortmund"]["admin_level"="6"]->.a;';
const QUERIES = {
  shopping: `[out:json][timeout:180];${AREA}nwr["shop"](area.a);out center;`,
  leisure: `[out:json][timeout:180];${AREA}(nwr["tourism"~"^(attraction|museum|gallery|zoo|theme_park|hotel|hostel|guest_house)$"](area.a);nwr["amenity"~"^(restaurant|cafe|bar|pub|biergarten|cinema|theatre|arts_centre|nightclub|events_venue)$"](area.a);nwr["leisure"~"^(stadium|sports_centre|swimming_pool|fitness_centre|ice_rink|water_park)$"](area.a););out center;`,
};

const refresh = process.argv.includes('--refresh');

async function cached(name, load) {
  const file = join(RAW, name);
  if (!refresh && existsSync(file)) return readFile(file, 'utf8');
  const text = await load();
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text);
  return text;
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

const fetchText = async (url, init) => {
  const res = await fetch(url, init);
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

/** District lookup with bounding-box prefilter. */
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

/** Nearest-distance check against points using a ~225 m grid. */
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

function ringAreaCentroid(ring) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x0, y0] = [ring[j][0] * KX, ring[j][1] * KY];
    const [x1, y1] = [ring[i][0] * KX, ring[i][1] * KY];
    const f = x0 * y1 - x1 * y0;
    a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
  }
  a /= 2;
  if (a === 0) return { area: 0, centroid: ring[0] };
  return { area: Math.abs(a), centroid: [cx / (6 * a) / KX, cy / (6 * a) / KY] };
}

// --- main -------------------------------------------------------------------------

async function main() {
  const path = join(CITY, 'unterbezirke.geojson');
  const districts = JSON.parse(await readFile(path, 'utf8'));
  const chargers = JSON.parse(await readFile(join(CITY, 'ladepunkte.geojson'), 'utf8')).features.map((f) => f.geometry.coordinates);
  const locate = makeLocator(districts.features);
  const nearCharger = makeNearIndex(chargers, COVERED_M);

  console.log('Reading points of interest, commercial land, buildings and development plans …');
  // Overpass rejects parallel queries from one client, so run them one after another.
  const shopping = JSON.parse(await cached('osm-shopping.json', () => overpass(QUERIES.shopping)));
  const leisure = JSON.parse(await cached('osm-leisure.json', () => overpass(QUERIES.leisure)));
  const [kml, buildings, bplans] = await Promise.all([
    cached(KML, () =>
      fetchText(`https://tu-dortmund.sciebo.de/public.php/webdav/Teams/07_Team/${encodeURIComponent('Daten für Verwaltungschallenge')}/Gewerbegebiete/${encodeURIComponent('Gewerbe in Dortmund.kml')}`, {
        headers: { Authorization: `Basic ${Buffer.from(`${SHARE_TOKEN}:`).toString('base64')}` },
      }),
    ),
    cached('opendata-gebaeude.json', () => fetchText(`${OPEN_DATA}/fb62-gebaeude/exports/json?select=georafische_koordinaten`)).then(JSON.parse),
    cached('opendata-bplan.json', () => fetchText(`${OPEN_DATA}/b-plan/exports/json?select=geo_point_2d,rechtsstand,datum_des_inkrafttretens`)).then(JSON.parse),
  ]);

  const stats = new Map(
    districts.features.map((f) => [f.properties.ubz, { poisShopping: 0, poisLeisure: 0, commercialHa: 0, buildings: 0, buildingsCovered: 0, bplans: 0, bplansRecent: 0 }]),
  );
  const add = (pt, key, n = 1) => {
    const ubz = locate(pt);
    if (ubz) stats.get(ubz)[key] += n;
    return ubz;
  };

  for (const e of shopping.elements) add([e.center?.lon ?? e.lon, e.center?.lat ?? e.lat], 'poisShopping');
  for (const e of leisure.elements) add([e.center?.lon ?? e.lon, e.center?.lat ?? e.lat], 'poisLeisure');

  // Commercial land: outer ring of each placemark, assigned by centroid
  const outer = /<outerBoundaryIs>\s*<LinearRing>\s*<coordinates>([\s\S]*?)<\/coordinates>/g;
  let m;
  let kmlPolys = 0;
  while ((m = outer.exec(kml))) {
    const ring = m[1].trim().split(/\s+/).map((c) => c.split(',').slice(0, 2).map(Number));
    const { area, centroid } = ringAreaCentroid(ring);
    add(centroid, 'commercialHa', area / 10000);
    kmlPolys++;
  }

  for (const b of buildings) {
    const g = b.georafische_koordinaten;
    if (!g) continue;
    const pt = [g.lon, g.lat];
    const ubz = add(pt, 'buildings');
    if (ubz && nearCharger(pt)) stats.get(ubz).buildingsCovered += 1;
  }

  for (const p of bplans) {
    if (!p.geo_point_2d) continue;
    const pt = [p.geo_point_2d.lon, p.geo_point_2d.lat];
    const ubz = add(pt, 'bplans');
    const year = Number(String(p.datum_des_inkrafttretens ?? '').slice(0, 4));
    if (ubz && year >= 2015) stats.get(ubz).bplansRecent += 1;
  }

  for (const f of districts.features) {
    const s = stats.get(f.properties.ubz);
    s.commercialHa = Math.round(s.commercialHa * 10) / 10;
    Object.assign(f.properties, s);
  }
  await writeFile(path, JSON.stringify(districts));

  const sum = (k) => [...stats.values()].reduce((a, s) => a + s[k], 0);
  const metaPath = join(CITY, 'meta.json');
  const meta = JSON.parse(await readFile(metaPath, 'utf8'));
  meta.enrichment = {
    fetchedAt: new Date().toISOString(),
    sources: [
      'OpenStreetMap shops, gastronomy, culture, sport and accommodation (© OpenStreetMap contributors, ODbL)',
      'Stadt Dortmund / RVR Flächennutzungskartierung 2021 (Gewerbe in Dortmund.kml, Sciebo)',
      'Open Data Dortmund: fb62-gebaeude, b-plan',
    ],
    poisShopping: sum('poisShopping'),
    poisLeisure: sum('poisLeisure'),
    commercialHa: Math.round(sum('commercialHa')),
    commercialPolygons: kmlPolys,
    buildings: sum('buildings'),
    buildingsCovered: sum('buildingsCovered'),
    bplans: sum('bplans'),
    bplansRecent: sum('bplansRecent'),
    coveredMetres: COVERED_M,
  };
  await writeFile(metaPath, JSON.stringify(meta, null, 2));

  const e = meta.enrichment;
  console.log(`✔ POIs: ${e.poisShopping} Einkaufen, ${e.poisLeisure} Freizeit · Gewerbe ${e.commercialHa} ha (${kmlPolys} Flächen)`);
  console.log(`✔ Gebäude: ${e.buildings}, davon ${e.buildingsCovered} (${Math.round((e.buildingsCovered / e.buildings) * 100)} %) ≤ ${COVERED_M} m zum Ladestandort · B-Pläne: ${e.bplans} (${e.bplansRecent} seit 2015)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
