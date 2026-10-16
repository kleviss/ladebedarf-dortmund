#!/usr/bin/env node
// Builds the app's data from the City of Dortmund files on Sciebo
// (Team 07 folder "Daten für Verwaltungschallenge"). Run with `npm run data`.
//
// Downloads raw files to data/raw/ (git-ignored, reused on later runs; pass
// --refresh to download again) and writes:
//   public/data/city/unterbezirke.geojson  145 statistical units with car/EV stock and charger counts
//   public/data/city/ladepunkte.geojson    912 current charging locations
//   public/data/city/prioritaet.geojson    225 m grid cells from "Fläche mit hoher Priorität für LIS-Ausbau"
//   public/data/city/meta.json             totals, sources, data fixes

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data', 'raw');
const OUT = join(ROOT, 'public', 'data', 'city');

const SHARE_TOKEN = process.env.SCIEBO_SHARE ?? 'kHXddKmMZpK8ECR';
const WEBDAV = 'https://tu-dortmund.sciebo.de/public.php/webdav';
const FOLDER = 'Teams/07_Team/Daten für Verwaltungschallenge';
const SHARE_URL = `https://tu-dortmund.sciebo.de/s/${SHARE_TOKEN}?dir=/${encodeURI(FOLDER)}`;

const FILES = {
  ubzShp: 'Unterbezirke/Unterbezirke_Auto_Bestand_Neuzulassungen.shp',
  ubzDbf: 'Unterbezirke/Unterbezirke_Auto_Bestand_Neuzulassungen.dbf',
  stats: 'Statistik/2026_Auswertung der Statistik für QGIS.csv',
  chargersDbf: 'aktueller Bestand an Ladesäulen/Ladesaeulen_Punkte.dbf',
  prioDbf: 'Fläche mit Priorität für LIS-Ausbau/Fläche mit hoher Priorität für LIS-Ausbau.dbf',
};

// --- download ---------------------------------------------------------------

async function download(rel, refresh) {
  const local = join(RAW, rel);
  if (!refresh && existsSync(local)) return readFile(local);
  const url = `${WEBDAV}/${FOLDER}/${rel}`.split('/').map((p, i) => (i < 3 ? p : encodeURIComponent(p))).join('/');
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${Buffer.from(`${SHARE_TOKEN}:`).toString('base64')}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${rel}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(local), { recursive: true });
  await writeFile(local, buf);
  return buf;
}

// --- dBase (.dbf) -------------------------------------------------------------

function readDbf(buf) {
  const n = buf.readUInt32LE(4);
  const headerLen = buf.readUInt16LE(8);
  const recLen = buf.readUInt16LE(10);
  const fields = [];
  for (let off = 32; buf[off] !== 0x0d; off += 32) {
    fields.push({ name: buf.toString('latin1', off, off + 11).replace(/\0.*$/, ''), len: buf[off + 16] });
  }
  const rows = [];
  for (let i = 0; i < n; i++) {
    let pos = headerLen + i * recLen + 1;
    const row = {};
    for (const f of fields) {
      row[f.name] = buf.toString('utf8', pos, pos + f.len).trim();
      pos += f.len;
    }
    rows.push(row);
  }
  return rows;
}

// --- shapefile polygons (.shp, type 5) ----------------------------------------

function readPolygons(buf) {
  const shapes = [];
  let off = 100;
  while (off < buf.length) {
    const contentLen = buf.readInt32BE(off + 4) * 2;
    const c = off + 8;
    const type = buf.readInt32LE(c);
    if (type === 5) {
      const numParts = buf.readInt32LE(c + 36);
      const numPoints = buf.readInt32LE(c + 40);
      const parts = [];
      for (let p = 0; p < numParts; p++) parts.push(buf.readInt32LE(c + 44 + p * 4));
      const ptsOff = c + 44 + numParts * 4;
      const rings = parts.map((start, p) => {
        const end = p + 1 < numParts ? parts[p + 1] : numPoints;
        const ring = [];
        for (let k = start; k < end; k++) {
          ring.push([buf.readDoubleLE(ptsOff + k * 16), buf.readDoubleLE(ptsOff + k * 16 + 8)]);
        }
        return ring;
      });
      shapes.push(rings);
    } else {
      shapes.push(null);
    }
    off = c + contentLen;
  }
  return shapes;
}

// --- geometry helpers ---------------------------------------------------------

const R = 6378137;
const toLonLat = ([x, y]) => [
  Math.round(((x / R) * 180) / Math.PI * 1e5) / 1e5,
  Math.round(((2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180) / Math.PI * 1e5) / 1e5,
];

const signedArea = (ring) => {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return s / 2; // > 0 = clockwise (shapefile outer ring)
};

function simplifyRing(ring, tol) {
  if (ring.length <= 4) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = ring[a];
    const [bx, by] = ring[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-12;
    let maxD = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * ring[i][0] - dx * ring[i][1] + bx * ay - by * ax) / len;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out = ring.filter((_, i) => keep[i]);
  return out.length >= 4 ? out : ring;
}

/** Shapefile rings (Web Mercator) → GeoJSON MultiPolygon (WGS84). Holes join the preceding outer ring. */
function toMultiPolygon(rings) {
  const polys = [];
  for (const ring of rings) {
    const simplified = simplifyRing(ring, 4); // metres
    const ll = simplified.map(toLonLat);
    if (signedArea(ring) >= 0 || polys.length === 0) polys.push([ll.slice().reverse()]); // GeoJSON outer = counter-clockwise
    else polys[polys.length - 1].push(ll.slice().reverse());
  }
  return { type: 'MultiPolygon', coordinates: polys };
}

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const pointInMultiPolygon = (pt, mp) =>
  mp.coordinates.some((poly) => pointInRing(pt, poly[0]) && !poly.slice(1).some((h) => pointInRing(pt, h)));

const areaKm2 = (mp) => {
  const kx = 111.32 * Math.cos((51.51 * Math.PI) / 180);
  const ringArea = (r) => {
    let s = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += r[j][0] * kx * r[i][1] * 110.57 - r[i][0] * kx * r[j][1] * 110.57;
    return Math.abs(s) / 2;
  };
  return mp.coordinates.reduce((a, poly) => a + ringArea(poly[0]) - poly.slice(1).reduce((h, r) => h + ringArea(r), 0), 0);
};

// --- statistics CSV (semicolon, DOS code page 437, German thousands) ----------

const CP437 = { 0x81: 'ü', 0x84: 'ä', 0x94: 'ö', 0x9a: 'Ü', 0x8e: 'Ä', 0x99: 'Ö', 0xe1: 'ß' };
const decodeCp437 = (buf) => [...buf].map((b) => (b < 0x80 ? String.fromCharCode(b) : CP437[b] ?? '?')).join('');
const toNumber = (s) => Number(String(s).replace(/\./g, '').replace(',', '.')) || 0;

function readStats(buf) {
  const lines = decodeCp437(buf).split(/\r?\n/).filter((l) => l.trim());
  return lines.slice(1).map((line) => {
    const c = line.split(';');
    return {
      id: String(Number(c[0])).padStart(3, '0'),
      name: c[1].trim(),
      privateCars: toNumber(c[2]),
      privateEvs: toNumber(c[3]),
      privateNewEvs: toNumber(c[4]),
      commercialCars: toNumber(c[5]),
      commercialEvs: toNumber(c[6]),
      commercialNewEvs: toNumber(c[7]),
      totalEvs: toNumber(c[8]),
    };
  });
}

// Stadtbezirk from the Unterbezirk number (same scheme as Open Data's fb62-unterbezirke).
const STADTBEZIRK = { 1: 'Eving', 2: 'Scharnhorst', 3: 'Brackel', 4: 'Aplerbeck', 5: 'Hörde', 6: 'Hombruch', 7: 'Lütgendortmund', 8: 'Huckarde', 9: 'Mengede' };
function stadtbezirkOf(id) {
  if (id[0] !== '0') return STADTBEZIRK[id[0]] ?? '';
  const d = Number(id[1]);
  return d <= 3 ? 'Innenstadt-West' : d <= 6 ? 'Innenstadt-Nord' : 'Innenstadt-Ost';
}

// --- main ---------------------------------------------------------------------

async function main() {
  const refresh = process.argv.includes('--refresh');
  console.log(`Reading city data from Sciebo${refresh ? ' (refresh)' : ''} …`);
  const [ubzShp, ubzDbf, statsCsv, chargersDbf, prioDbf] = await Promise.all(
    Object.values(FILES).map((f) => download(f, refresh)),
  );

  const fixes = [];
  const stats = new Map(readStats(statsCsv).map((s) => [s.id, s]));
  const shapes = readPolygons(ubzShp);
  const attrs = readDbf(ubzDbf);

  const features = attrs.map((a, i) => {
    let id = String(Number(a.unterbezir)).padStart(3, '0');
    // The shapefile gives "Kirchhörde-West/ Schanze" the ID of its neighbour (697); the statistics use 698.
    if (id === '697' && /Kirchhörde-West/i.test(a.unterbez_1) && stats.has('698')) {
      fixes.push(`"${a.unterbez_1}": ID 697 → 698 (duplicate ID in shapefile; statistics use 698)`);
      id = '698';
    }
    const s = stats.get(id);
    if (!s) throw new Error(`No statistics for Unterbezirk ${id} ${a.unterbez_1}`);
    const geometry = toMultiPolygon(shapes[i]);
    return {
      type: 'Feature',
      id: Number(id),
      geometry,
      properties: {
        ubz: id,
        name: a.unterbez_1.replace(/\s*\/\s*/g, ' / '),
        stadtbezirk: stadtbezirkOf(id),
        areaKm2: Math.round(areaKm2(geometry) * 100) / 100,
        privateCars: s.privateCars,
        privateEvs: s.privateEvs,
        privateNewEvs: s.privateNewEvs,
        commercialCars: s.commercialCars,
        commercialEvs: s.commercialEvs,
        commercialNewEvs: s.commercialNewEvs,
        totalEvs: s.totalEvs,
        chargers: 0,
      },
    };
  });

  const missing = [...stats.keys()].filter((id) => !features.some((f) => f.properties.ubz === id));
  if (missing.length) fixes.push(`Statistics without geometry: ${missing.join(', ')}`);

  // Charging locations → count per Unterbezirk
  const chargers = readDbf(chargersDbf)
    .map((r) => [Math.round(Number(r.Laengengra) * 1e5) / 1e5, Math.round(Number(r.Breitengra) * 1e5) / 1e5])
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
  let outside = 0;
  const chargerFeatures = chargers.map((pt) => {
    const f = features.find((x) => pointInMultiPolygon(pt, x.geometry));
    if (f) f.properties.chargers += 1;
    else outside += 1;
    return { type: 'Feature', geometry: { type: 'Point', coordinates: pt }, properties: { ubz: f?.properties.ubz ?? null } };
  });

  // Priority grid: keep cells with at least one point
  const prio = readDbf(prioDbf)
    .map((r) => ({ n: Number(r.NUMPOINTS), l: Number(r.left), t: Number(r.top), r: Number(r.right), b: Number(r.bottom) }))
    .filter((c) => Number.isFinite(c.n) && c.n > 0)
    .map((c) => ({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[[c.l, c.b], [c.r, c.b], [c.r, c.t], [c.l, c.t], [c.l, c.b]].map(toLonLat)],
      },
      properties: { points: c.n },
    }));

  const sum = (k) => features.reduce((a, f) => a + f.properties[k], 0);
  const meta = {
    fetchedAt: new Date().toISOString(),
    source: { name: 'Stadt Dortmund via Sciebo (Team 07)', url: SHARE_URL, files: Object.values(FILES) },
    totals: {
      units: features.length,
      privateCars: sum('privateCars'),
      privateEvs: sum('privateEvs'),
      commercialCars: sum('commercialCars'),
      commercialEvs: sum('commercialEvs'),
      totalEvs: sum('totalEvs'),
      newEvs: sum('privateNewEvs') + sum('commercialNewEvs'),
      chargers: chargers.length,
      chargersOutside: outside,
      priorityCells: prio.length,
    },
    fixes,
  };

  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, 'unterbezirke.geojson'), JSON.stringify({ type: 'FeatureCollection', features }));
  await writeFile(join(OUT, 'ladepunkte.geojson'), JSON.stringify({ type: 'FeatureCollection', features: chargerFeatures }));
  await writeFile(join(OUT, 'prioritaet.geojson'), JSON.stringify({ type: 'FeatureCollection', features: prio }));
  await writeFile(join(OUT, 'meta.json'), JSON.stringify(meta, null, 2));

  const t = meta.totals;
  console.log(`✔ ${t.units} Unterbezirke · ${t.privateCars.toLocaleString('de-DE')} private Pkw · ${t.totalEvs.toLocaleString('de-DE')} E-Pkw`);
  console.log(`✔ ${t.chargers} Ladestandorte (${outside} außerhalb aller Unterbezirke) · ${t.priorityCells} Prioritätszellen`);
  for (const f of fixes) console.log(`  Fix: ${f}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
