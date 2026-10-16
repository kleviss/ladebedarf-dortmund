#!/usr/bin/env node
// Site factors for every public parking spot, the candidate locations for new
// charging points (last step of `npm run data`). The app weights them into a score.
//
// Per spot:
//   buildings225  buildings within 225 m (ISME walking distance for housing) → demand
//                 and, as a stand-in, density of the low-voltage grid
//   carDensity    cars per km² of the spot's Unterbezirk (city statistics)
// Already present: distance to the nearest charger, kind, capacity.
// (Distance to commercial land was tested as a grid stand-in but 80 % of spots lie
// within 300 m of some commercial parcel, so it does not discriminate.)

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data', 'raw');
const CITY = join(ROOT, 'public', 'data', 'city');
const RADIUS = 225;

const KX = 111320 * Math.cos((51.51 * Math.PI) / 180);
const KY = 110570;
const metres = (a, b) => Math.hypot((a[0] - b[0]) * KX, (a[1] - b[1]) * KY);

function gridIndex(points, size) {
  const key = (x, y) => `${Math.floor((x * KX) / size)}:${Math.floor((y * KY) / size)}`;
  const grid = new Map();
  for (const p of points) {
    const k = key(p[0], p[1]);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(p);
  }
  return {
    count(pt, r) {
      const cx = Math.floor((pt[0] * KX) / size);
      const cy = Math.floor((pt[1] * KY) / size);
      let n = 0;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        for (const p of grid.get(`${cx + dx}:${cy + dy}`) ?? []) if (metres(pt, p) <= r) n++;
      }
      return n;
    },
  };
}

async function main() {
  const parkingPath = join(CITY, 'parkplaetze.geojson');
  const parking = JSON.parse(await readFile(parkingPath, 'utf8'));
  const districts = JSON.parse(await readFile(join(CITY, 'unterbezirke.geojson'), 'utf8'));
  const buildings = JSON.parse(await readFile(join(RAW, 'opendata-gebaeude.json'), 'utf8'))
    .map((b) => b.georafische_koordinaten)
    .filter(Boolean)
    .map((g) => [g.lon, g.lat]);

  const bIndex = gridIndex(buildings, RADIUS);
  const density = new Map(
    districts.features.map((f) => {
      const p = f.properties;
      return [p.ubz, p.areaKm2 > 0 ? Math.round((p.privateCars + p.commercialCars) / p.areaKm2) : 0];
    }),
  );

  parking.features.forEach((f, i) => {
    const pt = f.geometry.coordinates;
    f.id = i + 1;
    delete f.properties.onCommercial;
    Object.assign(f.properties, {
      id: i + 1,
      buildings225: bIndex.count(pt, RADIUS),
      carDensity: density.get(f.properties.ubz) ?? 0,
    });
  });
  await writeFile(parkingPath, JSON.stringify(parking));

  const metaPath = join(CITY, 'meta.json');
  const meta = JSON.parse(await readFile(metaPath, 'utf8'));
  meta.sites = {
    candidates: parking.features.length,
    radiusMetres: RADIUS,
  };
  await writeFile(metaPath, JSON.stringify(meta, null, 2));
  console.log(`✔ Standortfaktoren für ${parking.features.length} Parkflächen`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
