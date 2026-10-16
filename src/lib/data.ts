import type { CityMeta, DistrictInput } from './model';

export interface AppData {
  districts: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, DistrictInput>;
  chargers: GeoJSON.FeatureCollection<GeoJSON.Point, { adresse: string; ubz: string; betreiber: string }>;
  meta: {
    fetchedAt: string;
    city: CityMeta;
    sources: { key: string; id: string; url: string }[];
    license: string;
  };
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} konnte nicht geladen werden (${res.status}).`);
  return res.json() as Promise<T>;
}

/** Loads the static files written by `npm run data`. */
export async function loadData(): Promise<AppData> {
  const base = import.meta.env.BASE_URL;
  const [districts, chargers, meta] = await Promise.all([
    getJson<AppData['districts']>(`${base}data/unterbezirke.geojson`),
    getJson<AppData['chargers']>(`${base}data/ladepunkte.geojson`),
    getJson<AppData['meta']>(`${base}data/meta.json`),
  ]);
  return { districts, chargers, meta };
}
