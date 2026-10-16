// Where inside a district: score every public parking spot as a site for new
// public charging points, from the five distribution criteria. Each factor is
// 0–1; the score is their weighted mean. Factors and weights are shown in the UI.

import type { ParkingSpot } from './data';

export interface SiteSpot extends ParkingSpot {
  id: number;
  /** buildings within 225 m */
  buildings225: number;
  /** cars per km² in the spot's Unterbezirk */
  carDensity: number;
}

export type FactorKey = 'proximity' | 'density' | 'feasibility' | 'grid' | 'parking';

export interface Factor {
  key: FactorKey;
  label: string;
  explain: string;
  /** honest flag when the factor is a stand-in */
  proxy?: string;
}

export const FACTORS: Factor[] = [
  {
    key: 'proximity',
    label: 'Nähe',
    explain: 'Versorgungslücke (kein Ladestandort im Umkreis, voll ab 500 m) und Wohngebäude in 225 m Gehweite',
  },
  { key: 'density', label: 'Fahrzeugdichte', explain: 'Pkw je km² im Unterbezirk (Statistik Stadt), voll ab 3.000' },
  {
    key: 'feasibility',
    label: 'Bauliche Machbarkeit',
    explain: 'Parkhaus/P+R 1,0 · Parkplatz 0,8 · Straßenrand 0,5 (Fläche ohne Eingriff in Geh- und Radwege)',
  },
  {
    key: 'grid',
    label: 'Stromnetz',
    explain: 'Bestehender Ladestandort ≤ 500 m (Netzanschluss in der Nähe belegt) und Bebauungsdichte (Niederspannungsnetz)',
    proxy: 'Näherung, keine Netzdaten',
  },
  {
    key: 'parking',
    label: 'Parkplätze',
    explain: 'Bekannte Stellplätze (voll ab 100); ohne Angabe nach Art geschätzt',
  },
];

export type Weights = Record<FactorKey, number>;
export const defaultWeights: Weights = { proximity: 1, density: 1, feasibility: 1, grid: 1, parking: 1 };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const HOMES_FULL = 230; // ~95th percentile of buildings within 225 m
const DENSITY_FULL = 3000; // ~95th percentile of cars per km²

export function factorsOf(s: SiteSpot): Record<FactorKey, number> {
  const gap = clamp01((s.distance - 100) / 400); // 0 within 100 m, 1 from 500 m
  const homes = clamp01(s.buildings225 / HOMES_FULL);
  const gridNear = s.distance <= 500 ? 1 : clamp01(1 - (s.distance - 500) / 500); // 0 from 1 km
  const capacityGuess = { garage: 0.7, 'park-ride': 0.8, lot: 0.3, street: 0.2 }[s.kind];
  return {
    proximity: 0.6 * gap + 0.4 * homes,
    density: clamp01(s.carDensity / DENSITY_FULL),
    feasibility: { garage: 1, 'park-ride': 1, lot: 0.8, street: 0.5 }[s.kind],
    grid: 0.6 * gridNear + 0.4 * homes,
    parking: s.capacity != null ? clamp01(s.capacity / 100) : capacityGuess,
  };
}

export interface ScoredSite extends SiteSpot {
  factors: Record<FactorKey, number>;
  score: number;
}

export function scoreSites(spots: SiteSpot[], w: Weights): ScoredSite[] {
  const total = FACTORS.reduce((a, f) => a + w[f.key], 0) || 1;
  return spots.map((s) => {
    const factors = factorsOf(s);
    const score = FACTORS.reduce((a, f) => a + w[f.key] * factors[f.key], 0) / total;
    return { ...s, factors, score };
  });
}

/** Score classes for the map: 0 < 0.4 ≤ 1 < 0.5 ≤ 2 < 0.6 ≤ 3 < 0.7 ≤ 4 */
export const SCORE_BREAKS = [0.4, 0.5, 0.6, 0.7];
export const scoreClass = (v: number) => SCORE_BREAKS.filter((b) => v >= b).length;
// Sequential teal ramp, distinct from the blue district ramp.
export const SCORE_RAMP = ['#cfe9e3', '#8fcfc0', '#4fae9a', '#1f8a74', '#0b5e4e'];
/** A site counts as a strong candidate from this score. */
export const STRONG = 0.6;

export interface DistrictSites {
  candidates: number;
  strong: number;
  best: ScoredSite[];
}

export function sitesByDistrict(sites: ScoredSite[], top = 5): Map<string, DistrictSites> {
  const map = new Map<string, ScoredSite[]>();
  for (const s of sites) {
    if (!map.has(s.ubz)) map.set(s.ubz, []);
    map.get(s.ubz)!.push(s);
  }
  return new Map(
    [...map].map(([ubz, list]) => {
      const sorted = list.sort((a, b) => b.score - a.score);
      return [ubz, { candidates: list.length, strong: list.filter((s) => s.score >= STRONG).length, best: sorted.slice(0, top) }];
    }),
  );
}

export const KIND_LABEL: Record<ParkingSpot['kind'], string> = {
  lot: 'Parkplatz',
  street: 'Straßenrand',
  garage: 'Parkhaus / Tiefgarage',
  'park-ride': 'Park+Ride',
};
