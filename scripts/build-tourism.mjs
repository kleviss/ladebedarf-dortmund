#!/usr/bin/env node
// Tourist destinations per Unterbezirk (part of `npm run data`, after build-bottomup.mjs).
// Adds to public/data/city/unterbezirke.geojson:
//   attractions  city lists: Sehenswürdigkeiten, Museen, Veranstaltungsorte and the
//                stadium (SIGNAL IDUNA PARK), de-duplicated by name
//   hotels       hotels, guest houses, hostels from OpenStreetMap
// and to meta.json the latest overnight stays (Open Data, Fremdenverkehr).

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

const ATTRACTION_LISTS = ['sehenswurdigkeiten', 'museum', 'veranstaltungsorte'];
// the stadium list is mostly local sports grounds; only the stadium itself draws visitors
const STADIUM = /SIGNAL IDUNA PARK/i;

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

const fetchText = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.text();
};

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const locateIn = (features) => (pt) =>
  features.find((f) => f.geometry.coordinates.some((poly) => pointInRing(pt, poly[0]) && !poly.slice(1).some((h) => pointInRing(pt, h))))
    ?.properties.ubz ?? null;

async function main() {
  const path = join(CITY, 'unterbezirke.geojson');
  const districts = JSON.parse(await readFile(path, 'utf8'));
  const locate = locateIn(districts.features);

  console.log('Reading attractions, stadium, hotels and overnight stays …');
  const lists = await Promise.all(
    [...ATTRACTION_LISTS, 'fussballstadion'].map(async (id) => ({
      id,
      rows: JSON.parse(await cached(`opendata-${id}.json`, () => fetchText(`${OPEN_DATA}/${id}/exports/json?select=geo_point_2d,objektname,objektart`))),
    })),
  );
  const hotels = JSON.parse(
    await cached('osm-hotels.json', () => overpass(`[out:json][timeout:180];${AREA}nwr["tourism"~"^(hotel|hostel|guest_house|motel|apartment)$"](area.a);out center tags;`)),
  ).elements;
  const stays = JSON.parse(
    await cached('opendata-fremdenverkehr.json', () =>
      fetchText(`${OPEN_DATA}/ds-betriebe-betten-ankunfte-und-ubernachtungen-im-fremdenverkehr-seit-1990/exports/json?order_by=jahr%20desc&limit=1`),
    ),
  )[0];

  const stats = new Map(districts.features.map((f) => [f.properties.ubz, { attractions: 0, hotels: 0, attractionNames: [] }]));
  const seen = new Set();
  let attractions = 0;
  for (const { id, rows } of lists) {
    for (const r of rows) {
      const g = r.geo_point_2d;
      const name = (r.objektname ?? '').trim();
      if (!g || !name || seen.has(name.toLowerCase())) continue;
      if (id === 'fussballstadion' && !STADIUM.test(name)) continue;
      seen.add(name.toLowerCase());
      const ubz = locate([g.lon, g.lat]);
      if (!ubz) continue;
      const s = stats.get(ubz);
      s.attractions += 1;
      s.attractionNames.push(name);
      attractions += 1;
    }
  }
  let hotelCount = 0;
  for (const e of hotels) {
    const ubz = locate([e.center?.lon ?? e.lon, e.center?.lat ?? e.lat]);
    if (!ubz) continue;
    stats.get(ubz).hotels += 1;
    hotelCount += 1;
  }

  for (const f of districts.features) {
    const s = stats.get(f.properties.ubz);
    f.properties.attractions = s.attractions;
    f.properties.attractionNames = s.attractionNames.slice(0, 6);
    f.properties.hotels = s.hotels;
  }
  await writeFile(path, JSON.stringify(districts));

  const metaPath = join(CITY, 'meta.json');
  const meta = JSON.parse(await readFile(metaPath, 'utf8'));
  meta.tourism = {
    fetchedAt: new Date().toISOString(),
    sources: [
      'Open Data Dortmund: sehenswurdigkeiten, museum, veranstaltungsorte, fussballstadion (nur SIGNAL IDUNA PARK)',
      'OpenStreetMap: Hotels, Pensionen, Hostels',
      'Open Data Dortmund: Betriebe, Betten, Ankünfte und Übernachtungen im Fremdenverkehr',
    ],
    attractions,
    hotels: hotelCount,
    overnightStays: stays.ubernachtungen_insgesamt,
    overnightYear: Number(stays.jahr),
    accommodationBusinesses: stays.angebot_betriebe,
  };
  await writeFile(metaPath, JSON.stringify(meta, null, 2));
  console.log(
    `✔ ${attractions} touristische Ziele · ${hotelCount} Unterkünfte (Statistik: ${stays.angebot_betriebe}) · ${stays.ubernachtungen_insgesamt.toLocaleString('de-DE')} Übernachtungen ${stays.jahr}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
