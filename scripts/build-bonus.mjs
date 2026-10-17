#!/usr/bin/env node
// Inputs for the three bonus scenarios of the challenge (part of `npm run data`).
// How does street-space demand per Unterbezirk change if …
//
//   1 Supermarkets   … every supermarket car park gets 10 charging points?
//                    OSM shop=supermarket; a supermarket "has a car park" when an off-street
//                    amenity=parking lies within SUPERMARKET_M of it.
//   2 Priority area  … 20 % of the parking at buildings inside the city's priority cells
//                    (prioritaet.geojson) get charging points?
//                    OSM non-public amenity=parking (private, customers, residents, permit …)
//                    and garage/carport buildings whose centre lies in a priority cell.
//   3 Commercial     … 20 % of the parking in commercial areas get charging points?
//                    OSM amenity=parking whose centre lies in landuse=commercial|industrial.
//
// Spaces: the capacity tag where mapped, else area ÷ M2_PER_SPACE (aisles included), at least 1;
// garage buildings: 1 space, block garages (building=garages) area ÷ M2_PER_GARAGE.
// Writes public/data/city/bonus.json. Raw downloads are cached in data/raw/ (--refresh downloads again).

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data', 'raw');
const CITY = join(ROOT, 'public', 'data', 'city');
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const AREA = '[out:json][timeout:300];area["name"="Dortmund"]["admin_level"="6"]->.a;';
const QUERIES = {
  'osm-supermarkets.json': `${AREA}nwr["shop"="supermarket"](area.a);out center tags;`,
  'osm-parking-geom.json': `${AREA}nwr["amenity"="parking"](area.a);out geom tags;`,
  'osm-landuse-commercial.json': `${AREA}(way["landuse"~"^(commercial|industrial)$"](area.a);relation["landuse"~"^(commercial|industrial)$"](area.a););out geom tags;`,
  'osm-garages.json': `${AREA}way["building"~"^(garage|garages|carport)$"](area.a);out geom tags;`,
};
const refresh = process.argv.includes('--refresh');

const SUPERMARKET_M = 100;
const M2_PER_SPACE = 25;
const M2_PER_GARAGE = 18;
const PUBLIC_ACCESS = new Set(['yes', 'permissive', 'destination', undefined]);
const ON_STREET = new Set(['street_side', 'lane', 'half_on_kerb', 'on_kerb', 'shoulder']);

async function cached(name) {
  const file = join(RAW, name);
  if (!refresh && existsSync(file)) return JSON.parse(await readFile(file, 'utf8'));
  let lastError;
  for (const url of OVERPASS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'ladebedarf-dortmund' },
          body: new URLSearchParams({ data: QUERIES[name] }),
        });
        if (!res.ok) throw new Error(`${res.status} from ${url}`);
        const text = await res.text();
        await mkdir(RAW, { recursive: true });
        await writeFile(file, text);
        return JSON.parse(text);
      } catch (e) {
        lastError = e;
        await new Promise((r) => setTimeout(r, 10000 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

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

/** Area of a lon/lat ring in m². */
function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * KX * ring[i][1] * KY - ring[i][0] * KX * ring[j][1] * KY;
  return Math.abs(a) / 2;
}

const bboxOf = (rings) => {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of rings) for (const [x, y] of r) [b[0], b[1], b[2], b[3]] = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)];
  return b;
};
const inBbox = ([x, y], b) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];

/** Joins open member ways of a relation into closed rings. */
function joinRings(ways) {
  const rings = [];
  const open = ways.filter((w) => w.length > 1).map((w) => [...w]);
  while (open.length) {
    let ring = open.shift();
    let grew = true;
    while (grew && !samePt(ring[0], ring[ring.length - 1])) {
      grew = false;
      for (let i = 0; i < open.length; i++) {
        const w = open[i];
        const end = ring[ring.length - 1];
        if (samePt(w[0], end)) ring = [...ring, ...w.slice(1)];
        else if (samePt(w[w.length - 1], end)) ring = [...ring, ...[...w].reverse().slice(1)];
        else continue;
        open.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}
const samePt = (a, b) => a[0] === b[0] && a[1] === b[1];
const coords = (geom) => (geom ?? []).map((g) => [g.lon, g.lat]);

/** Outer rings and centre of an Overpass element read with `out geom` (or `out center`). */
function shape(e) {
  if (e.type === 'node') return { centre: [e.lon, e.lat], rings: [] };
  if (e.type === 'way') {
    const ring = coords(e.geometry);
    const closed = ring.length >= 4 && samePt(ring[0], ring[ring.length - 1]);
    const rings = closed ? [ring] : [];
    return { centre: e.center ? [e.center.lon, e.center.lat] : centroid(ring), rings };
  }
  const outer = joinRings((e.members ?? []).filter((m) => m.type === 'way' && m.role !== 'inner').map((m) => coords(m.geometry)));
  return { centre: e.center ? [e.center.lon, e.center.lat] : centroid(outer.flat()), rings: outer };
}
const centroid = (pts) => (pts.length ? [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length] : [null, null]);

// --- main ---------------------------------------------------------------------

async function main() {
  const districts = JSON.parse(await readFile(join(CITY, 'unterbezirke.geojson'), 'utf8')).features;
  const cells = JSON.parse(await readFile(join(CITY, 'prioritaet.geojson'), 'utf8')).features.map((f) => f.geometry.coordinates[0]);
  const cellBox = cells.map((c) => bboxOf([c]));
  const inPriority = (pt) => cells.some((c, i) => inBbox(pt, cellBox[i]) && pointInRing(pt, c));
  const districtBox = districts.map((f) => bboxOf(f.geometry.coordinates.map((p) => p[0])));
  const ubzOf = (pt) => districts.find((f, i) => inBbox(pt, districtBox[i]) && inMultiPolygon(pt, f.geometry))?.properties.ubz ?? null;

  console.log('Reading supermarkets, parking, commercial areas and garages from OpenStreetMap …');
  const supermarketsOsm = await cached('osm-supermarkets.json');
  const parkingOsm = await cached('osm-parking-geom.json');
  const landuseOsm = await cached('osm-landuse-commercial.json');
  const garagesOsm = await cached('osm-garages.json');

  const stats = new Map(
    districts.map((f) => [
      f.properties.ubz,
      { ubz: f.properties.ubz, supermarkets: 0, supermarketsWithParking: 0, commercialHa: 0, commercialLots: 0, commercialSpaces: 0, priorityLots: 0, priorityGarages: 0, prioritySpaces: 0 },
    ]),
  );

  // car parks with their spaces
  const lots = [];
  for (const e of parkingOsm.elements) {
    const t = e.tags ?? {};
    const { centre, rings } = shape(e);
    if (centre[0] == null) continue;
    const area = rings.reduce((a, r) => a + ringArea(r), 0);
    const capacity = /^\d+$/.test(t.capacity ?? '') ? Number(t.capacity) : null;
    lots.push({
      pt: centre,
      spaces: capacity ?? Math.max(1, Math.round(area / M2_PER_SPACE)),
      onStreet: ON_STREET.has(t.parking),
      isPublic: PUBLIC_ACCESS.has(t.access),
      ubz: ubzOf(centre),
    });
  }

  // 1 supermarkets
  const supermarkets = [];
  for (const e of supermarketsOsm.elements) {
    const t = e.tags ?? {};
    const pt = e.center ? [e.center.lon, e.center.lat] : [e.lon, e.lat];
    if (pt[0] == null) continue;
    const ubz = ubzOf(pt);
    if (!ubz) continue;
    const near = lots.filter((l) => !l.onStreet && Math.abs(l.pt[1] - pt[1]) < 0.002 && metres(l.pt, pt) <= SUPERMARKET_M);
    const parking = near.length > 0;
    const st = stats.get(ubz);
    st.supermarkets += 1;
    if (parking) st.supermarketsWithParking += 1;
    supermarkets.push({ ubz, name: t.name ?? t.brand ?? null, brand: t.brand ?? null, parking, spaces: near.reduce((a, l) => a + l.spaces, 0), pt: pt.map(round) });
  }

  // 3 commercial areas
  const areas = landuseOsm.elements.map(shape).filter((s) => s.rings.length);
  const areaBox = areas.map((s) => bboxOf(s.rings));
  for (const s of areas) {
    const ubz = ubzOf(s.centre);
    if (ubz) stats.get(ubz).commercialHa += s.rings.reduce((a, r) => a + ringArea(r), 0) / 1e4;
  }
  const inCommercial = (pt) => areas.some((s, i) => inBbox(pt, areaBox[i]) && s.rings.some((r) => pointInRing(pt, r)));
  for (const l of lots) {
    if (!l.ubz || l.onStreet) continue;
    const st = stats.get(l.ubz);
    if (inCommercial(l.pt)) {
      st.commercialLots += 1;
      st.commercialSpaces += l.spaces;
    }
    // 2 parking at buildings (not public) in a priority cell
    if (!l.isPublic && inPriority(l.pt)) {
      st.priorityLots += 1;
      st.prioritySpaces += l.spaces;
    }
  }
  for (const e of garagesOsm.elements) {
    const { centre, rings } = shape(e);
    if (centre[0] == null || !inPriority(centre)) continue;
    const ubz = ubzOf(centre);
    if (!ubz) continue;
    const st = stats.get(ubz);
    const spaces = e.tags?.building === 'garages' ? Math.max(1, Math.round(rings.reduce((a, r) => a + ringArea(r), 0) / M2_PER_GARAGE)) : 1;
    st.priorityGarages += 1;
    st.prioritySpaces += spaces;
  }

  const districtsOut = [...stats.values()].map((s) => ({ ...s, commercialHa: Math.round(s.commercialHa * 10) / 10 }));
  const sum = (k) => districtsOut.reduce((a, d) => a + d[k], 0);
  const out = {
    fetchedAt: new Date().toISOString(),
    sources: ['OpenStreetMap via Overpass (© OpenStreetMap contributors, ODbL)', 'Stadt Dortmund, Prioritätsflächen Ladeinfrastruktur (prioritaet.geojson)'],
    assumptions: { supermarketMetres: SUPERMARKET_M, m2PerSpace: M2_PER_SPACE, m2PerGarage: M2_PER_GARAGE },
    totals: {
      supermarkets: sum('supermarkets'),
      supermarketsWithParking: sum('supermarketsWithParking'),
      commercialLots: sum('commercialLots'),
      commercialSpaces: sum('commercialSpaces'),
      priorityLots: sum('priorityLots'),
      priorityGarages: sum('priorityGarages'),
      prioritySpaces: sum('prioritySpaces'),
    },
    districts: districtsOut,
    supermarkets,
  };
  await writeFile(join(CITY, 'bonus.json'), JSON.stringify(out));
  console.log('bonus.json:', out.totals);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
