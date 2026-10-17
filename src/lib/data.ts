import type { District } from './isme';
import { parseSitePlan, type RawSitePlan, type SitePlan } from './sitePlan';

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
  parking?: {
    publicSpots: number;
    uncovered: number;
    coveredMetres: number;
    sources: string[];
    distance?: {
      bands: number[];
      public: DistanceBand;
      customers: DistanceBand;
      byKind: Record<ParkingSpot['kind'], DistanceBand>;
    };
  };
  tourism?: {
    sources: string[];
    attractions: number;
    hotels: number;
    hotelsNearAttractions?: number;
    nearMetres?: number;
    overnightStays: number;
    overnightYear: number;
    accommodationBusinesses: number;
  };
  bottomup?: {
    sources: string[];
    efhBuildings: number;
    mfhBuildings: number;
    dwellingsEfh: number;
    dwellingsMfh: number;
    garages: number;
    commerceBuildings: number;
    industryBuildings: number;
    railStops: number;
    busStops: number;
    hpcPoints: number;
    railMetres: number;
    busMetres: number;
    hpcKw: number;
  };
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

/** Parking areas within each distance band (metres) to the nearest charging location. */
export interface DistanceBand {
  n: number;
  within: Record<string, number>;
  median: number;
}

export interface Attraction {
  name: string;
  kind: string;
  type: string | null;
  ubz: string;
  /** hotels / guest houses within 1.5 km */
  hotelsNear: number;
  hotelNames: string[];
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

/** Charging station from the Bundesnetzagentur register (public/data/model/chargers.json) */
export interface Station {
  ubz: string | null;
  points: number;
  kw: number | null;
  type: 'AC' | 'DC';
  /** public AC charging outside car parks and customer parking */
  streetAc: boolean;
  access: 'public' | 'customers';
  operator: string;
  name: string | null;
  address: string;
  since: string | null;
}

export interface AppData {
  districts: GeoJSON.FeatureCollection<GeoJSON.MultiPolygon, District>;
  /** Register stations with charging points per station; empty if the file is missing */
  stations: GeoJSON.FeatureCollection<GeoJSON.Point, Station>;
  chargers: GeoJSON.FeatureCollection<GeoJSON.Point, { ubz: string | null }>;
  priority: GeoJSON.FeatureCollection<GeoJSON.Polygon, { points: number }>;
  parking: GeoJSON.FeatureCollection<GeoJSON.Point, ParkingSpot>;
  /** Tourist attractions with hotels nearby (scripts/build-tourism.mjs) */
  ziele: GeoJSON.FeatureCollection<GeoJSON.Point, Attraction>;
  meta: CityMeta;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status}).`);
  return res.json() as Promise<T>;
}

/** Loads the static files written by `npm run data` (city data from Sciebo). */
export async function loadData(): Promise<AppData> {
  const base = `${import.meta.env.BASE_URL}data/city/`;
  const empty = { type: 'FeatureCollection' as const, features: [] };
  const [districts, chargers, priority, parking, ziele, meta, stations] = await Promise.all([
    getJson<AppData['districts']>(`${base}unterbezirke.geojson`),
    getJson<AppData['chargers']>(`${base}ladepunkte.geojson`),
    getJson<AppData['priority']>(`${base}prioritaet.geojson`),
    getJson<AppData['parking']>(`${base}parkplaetze.geojson`),
    getJson<AppData['ziele']>(`${base}ziele.geojson`).catch(() => ({ type: 'FeatureCollection' as const, features: [] })),
    getJson<CityMeta>(`${base}meta.json`),
    getJson<AppData['stations']>(`${import.meta.env.BASE_URL}data/model/chargers.json`).catch(() => empty),
  ]);
  return { districts, chargers, priority, parking, ziele, meta, stations };
}

/** Planned charging sites per demand level (scripts/model/build_sites.py); null if the file is missing. */
export async function loadSitePlan(): Promise<SitePlan | null> {
  try {
    return parseSitePlan(await getJson<RawSitePlan>(`${import.meta.env.BASE_URL}data/model/sites.json`));
  } catch {
    return null;
  }
}
