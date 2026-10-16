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
  parking?: { publicSpots: number; uncovered: number; coveredMetres: number; sources: string[] };
  enrichment?: {
    sources: string[];
    poisShopping: number;
    poisLeisure: number;
    commercialHa: number;
    buildings: number;
    buildingsCovered: number;
    bplans: number;
    bplansRecent: number;
    coveredMetres: number;
  };
}

export interface ParkingSpot {
  ubz: string;
  kind: 'lot' | 'street' | 'garage' | 'park-ride';
  name: string | null;
  capacity: number | null;
  source: string;
  /** metres to the nearest charging location */
  distance: number;
  /** 0 = within 100 m, 1 = within 225 m, 2 = further */
  cover: 0 | 1 | 2;
}

export interface AppData {
  districts: GeoJSON.FeatureCollection<GeoJSON.MultiPolygon, District>;
  chargers: GeoJSON.FeatureCollection<GeoJSON.Point, { ubz: string | null }>;
  priority: GeoJSON.FeatureCollection<GeoJSON.Polygon, { points: number }>;
  parking: GeoJSON.FeatureCollection<GeoJSON.Point, ParkingSpot>;
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
  const [districts, chargers, priority, parking, meta] = await Promise.all([
    getJson<AppData['districts']>(`${base}unterbezirke.geojson`),
    getJson<AppData['chargers']>(`${base}ladepunkte.geojson`),
    getJson<AppData['priority']>(`${base}prioritaet.geojson`),
    getJson<AppData['parking']>(`${base}parkplaetze.geojson`),
    getJson<CityMeta>(`${base}meta.json`),
  ]);
  return { districts, chargers, priority, parking, meta };
}
