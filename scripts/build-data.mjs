#!/usr/bin/env node
// Fetches Open Data Dortmund datasets, joins them per statistical Unterbezirk
// and writes static files to public/data/. Run with `npm run data`.
//
// Output:
//   public/data/unterbezirke.geojson  170 polygons with all factors as properties
//   public/data/ladepunkte.geojson    existing public charging points
//   public/data/meta.json             city-wide constants + source list

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://open-data.dortmund.de/api/explore/v2.1/catalog/datasets';
const PORTAL = 'https://open-data.dortmund.de/explore/dataset';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');

const DS = {
  unterbezirke: 'fb62-unterbezirke',
  gebaeude: 'fb62-gebaeude',
  ladepunkte: 'fb1-ii-smart-city-e-tankstellen-ladepunkte-nox',
  bevoelkerung: 'ds-bevolkerung-nach-geschlecht-und-migrationshintergrund-2023',
  kfzDichte: 'kraftfahrzeugdichte',
  kfzEnergie: 'bestand-an-kraftfahrzeugen-nach-energiequelle',
  fahrzeugarten: 'fahrzeugbestand-nach-fahrzeugarten',
};

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

const exportUrl = (id, format, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return `${API}/${id}/exports/${format}${qs ? `?${qs}` : ''}`;
};

// --- geometry helpers -------------------------------------------------------

const round = (n) => Math.round(n * 1e5) / 1e5; // ~1 m

// Ramer-Douglas-Peucker on one ring, tolerance in degrees.
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
  const out = ring.filter((_, i) => keep[i]).map(([x, y]) => [round(x), round(y)]);
  return out.length >= 4 ? out : ring.map(([x, y]) => [round(x), round(y)]);
}

function simplifyGeometry(geom, tol = 0.00004) {
  if (geom.type === 'Polygon') {
    return { type: 'Polygon', coordinates: geom.coordinates.map((r) => simplifyRing(r, tol)) };
  }
  if (geom.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      coordinates: geom.coordinates.map((p) => p.map((r) => simplifyRing(r, tol))),
    };
  }
  return geom;
}

// Area in km² using an equirectangular projection at Dortmund's latitude.
function ringAreaKm2(ring) {
  const kx = 111.32 * Math.cos((51.51 * Math.PI) / 180);
  const ky = 110.57;
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += ring[j][0] * kx * ring[i][1] * ky - ring[i][0] * kx * ring[j][1] * ky;
  }
  return Math.abs(sum) / 2;
}

function areaKm2(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  return polys.reduce(
    (acc, rings) => acc + ringAreaKm2(rings[0]) - rings.slice(1).reduce((h, r) => h + ringAreaKm2(r), 0),
    0,
  );
}

// --- main -------------------------------------------------------------------

async function main() {
  console.log('Fetching datasets from open-data.dortmund.de …');

  const [ubzGeo, buildingCounts, chargerGeo, population, kfzDichte, kfzEnergie, fahrzeugarten] =
    await Promise.all([
      getJson(exportUrl(DS.unterbezirke, 'geojson')),
      getJson(
        exportUrl(DS.gebaeude, 'json', {
          select: 'unterbezirk_nr,count(*) as n',
          group_by: 'unterbezirk_nr',
        }),
      ),
      getJson(exportUrl(DS.ladepunkte, 'geojson')),
      getJson(
        exportUrl(DS.bevoelkerung, 'json', {
          select: 'unterbezirk_nr,unterbezirk,insgesamt_zusammen',
          where: 'unterbezirk_nr is not null',
        }),
      ),
      getJson(exportUrl(DS.kfzDichte, 'json', { order_by: 'jahr desc', limit: '1' })),
      getJson(exportUrl(DS.kfzEnergie, 'json', { order_by: 'jahr desc', limit: '1' })),
      getJson(exportUrl(DS.fahrzeugarten, 'json', { order_by: 'jahr desc', limit: '1' })),
    ]);

  // Buildings per Unterbezirk
  const buildingsByUbz = new Map(
    buildingCounts.filter((r) => r.unterbezirk_nr).map((r) => [r.unterbezirk_nr, r.n]),
  );

  // Population is published per statistical district (62), not per Unterbezirk (170).
  const popBySbz = new Map(population.map((r) => [r.unterbezirk_nr, r.insgesamt_zusammen]));

  // Charging points per Unterbezirk
  const chargersByUbz = new Map();
  for (const f of chargerGeo.features) {
    const k = f.properties.unterbezirk_nr;
    if (k) chargersByUbz.set(k, (chargersByUbz.get(k) ?? 0) + 1);
  }

  // Buildings per statistical district (to distribute population to Unterbezirke)
  const buildingsBySbz = new Map();
  for (const f of ubzGeo.features) {
    const p = f.properties;
    const b = buildingsByUbz.get(p.unterbezirk_nr) ?? 0;
    buildingsBySbz.set(p.statistischer_bezirk_nr, (buildingsBySbz.get(p.statistischer_bezirk_nr) ?? 0) + b);
  }

  const missingPop = new Set();
  const features = ubzGeo.features
    .map((f) => {
      const p = f.properties;
      const buildings = buildingsByUbz.get(p.unterbezirk_nr) ?? 0;
      const sbzPop = popBySbz.get(p.statistischer_bezirk_nr);
      const sbzBuildings = buildingsBySbz.get(p.statistischer_bezirk_nr) ?? 0;
      if (sbzPop == null) missingPop.add(p.statistischer_bezirk_nr);
      const residents =
        sbzPop != null && sbzBuildings > 0 ? Math.round((sbzPop * buildings) / sbzBuildings) : 0;
      return {
        type: 'Feature',
        id: Number(p.unterbezirk_nr),
        geometry: simplifyGeometry(f.geometry),
        properties: {
          ubz: p.unterbezirk_nr,
          name: p.unterbezirk_bezeichnung,
          sbz: p.statistischer_bezirk_nr,
          sbzName: p.statistischer_bezirk,
          stadtbezirk: p.stadtbezirk_bezeichnung,
          areaKm2: Math.round(areaKm2(f.geometry) * 100) / 100,
          buildings,
          residents,
          residentsSbz: sbzPop ?? null,
          chargers: chargersByUbz.get(p.unterbezirk_nr) ?? 0,
        },
      };
    })
    .sort((a, b) => a.properties.ubz.localeCompare(b.properties.ubz));

  const chargers = {
    type: 'FeatureCollection',
    features: chargerGeo.features.map((f) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: f.geometry.coordinates.map(round),
      },
      properties: {
        adresse: f.properties.adresse,
        ubz: f.properties.unterbezirk_nr,
        betreiber: 'NOX-Block',
      },
    })),
  };

  const dichte = kfzDichte[0];
  const energie = kfzEnergie[0];
  const arten = fahrzeugarten[0];
  const fetchedAt = new Date().toISOString();

  const meta = {
    fetchedAt,
    city: {
      residents: [...popBySbz.values()].reduce((a, b) => a + b, 0),
      residentsYear: 2023,
      pkwPer1000: dichte.personenkraftwagen_auf_1_000_einwohner_innen,
      pkwPer1000Year: Number(dichte.jahr),
      pkwTotal: arten.personenkraftwagen,
      pkwTotalYear: Number(arten.jahr),
      kfzTotalEnergy: energie.insgesamt,
      bev: energie.elektro,
      phev: energie.plug_in_hybrid,
      evYear: Number(energie.jahr),
      chargers: chargers.features.length,
      buildings: [...buildingsByUbz.values()].reduce((a, b) => a + b, 0),
    },
    sources: Object.entries(DS).map(([key, id]) => ({ key, id, url: `${PORTAL}/${id}/` })),
    license: 'Datenlizenz Deutschland – Namensnennung – Version 2.0 (dl-de/by-2-0), Stadt Dortmund',
  };

  await mkdir(OUT, { recursive: true });
  await writeFile(
    join(OUT, 'unterbezirke.geojson'),
    JSON.stringify({ type: 'FeatureCollection', features }),
  );
  await writeFile(join(OUT, 'ladepunkte.geojson'), JSON.stringify(chargers));
  await writeFile(join(OUT, 'meta.json'), JSON.stringify(meta, null, 2));

  console.log(`✔ ${features.length} Unterbezirke, ${chargers.features.length} Ladepunkte`);
  console.log(`  Einwohner (Summe): ${meta.city.residents.toLocaleString('de-DE')}`);
  console.log(`  Pkw je 1.000 EW (${meta.city.pkwPer1000Year}): ${meta.city.pkwPer1000}`);
  if (missingPop.size) console.warn(`⚠ Keine Einwohnerzahl für stat. Bezirke: ${[...missingPop].join(', ')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
