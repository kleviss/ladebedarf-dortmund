import type { District } from './isme';

export interface CityMeta {
  fetchedAt: string;
  source: { name: string; url: string; files: string[] };
  totals: {
    units: number;
    privateCars: number;
    privateEvs: number;
    commercialCars: number;
    commercialEvs: number;
    totalEvs: number;
    newEvs: number;
    chargers: number;
    chargersOutside: number;
    priorityCells: number;
  };
  fixes: string[];
}

export interface AppData {
  districts: GeoJSON.FeatureCollection<GeoJSON.MultiPolygon, District>;
  chargers: GeoJSON.FeatureCollection<GeoJSON.Point, { ubz: string | null }>;
  priority: GeoJSON.FeatureCollection<GeoJSON.Polygon, { points: number }>;
  meta: CityMeta;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} konnte nicht geladen werden (${res.status}).`);
  return res.json() as Promise<T>;
}

/** Loads the static files written by `npm run data` (city data from Sciebo). */
export async function loadData(): Promise<AppData> {
  const base = `${import.meta.env.BASE_URL}data/city/`;
  const [districts, chargers, priority, meta] = await Promise.all([
    getJson<AppData['districts']>(`${base}unterbezirke.geojson`),
    getJson<AppData['chargers']>(`${base}ladepunkte.geojson`),
    getJson<AppData['priority']>(`${base}prioritaet.geojson`),
    getJson<CityMeta>(`${base}meta.json`),
  ]);
  return { districts, chargers, priority, meta };
}
