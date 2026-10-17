// Off-street charging: how street-space demand per Unterbezirk changes if …
//   1 every supermarket car park gets 10 charging points (and takes a share of the demand),
//   2 20 % of the parking at buildings in the city's priority area gets charging points,
//   3 20 % of the parking in commercial areas gets charging points.
// Inputs: public/data/city/bonus.json (scripts/build-bonus.mjs, OpenStreetMap).
//
//   new points      p = round(share × spaces)
//   EVs served      n = min(p, spaces × e)            only EV drivers use a new point
//   street relief   priority:   min(R_u, n × r_R ÷ k)   (residents charge at their building)
//                   commercial: min(W_u, n × r_W ÷ k)   (in-commuters charge at work)
//                   + residents at night, if shared:  min(R_u − relief, (p − n_W) × e × r_R ÷ k)
//   missing'        max(0, ⌈needed − relief⌉ − existing)
//   supermarket     takes round(min(10 × supermarkets with car park, absorb × missing'))
//   missing''       missing' − supermarket

import type { FactorParams, FactorResult } from './factors';
import type { DistrictResult } from './isme';

export interface BonusDistrict {
  ubz: string;
  supermarkets: number;
  supermarketsWithParking: number;
  commercialHa: number;
  commercialLots: number;
  commercialSpaces: number;
  priorityLots: number;
  priorityGarages: number;
  prioritySpaces: number;
}

export interface Supermarket {
  ubz: string;
  name: string | null;
  brand: string | null;
  parking: boolean;
  spaces: number;
  pt: [number, number];
}

export interface BonusData {
  fetchedAt: string;
  sources: string[];
  assumptions: { supermarketMetres: number; m2PerSpace: number; m2PerGarage: number };
  totals: Record<string, number>;
  districts: BonusDistrict[];
  supermarkets: Supermarket[];
}

export interface BonusParams {
  supermarket: boolean;
  pointsPerSupermarket: number;
  /** share of the remaining missing points a supermarket can take */
  absorbShare: number;
  priority: boolean;
  priorityShare: number;
  commercial: boolean;
  commercialShare: number;
  /** commercial charging points open to residents overnight */
  commercialNight: boolean;
}

export const bonusDefaults: BonusParams = {
  supermarket: false,
  pointsPerSupermarket: 10,
  absorbShare: 0.2,
  priority: false,
  priorityShare: 0.2,
  commercial: false,
  commercialShare: 0.2,
  commercialNight: false,
};

export const anyBonus = (p: BonusParams) => p.supermarket || p.priority || p.commercial;

export interface BonusEffect {
  /** missing points without off-street charging */
  before: number;
  priority: { points: number; evs: number; relief: number };
  commercial: { points: number; evs: number; relief: number; night: number };
  /** missing points after priority and commercial, before the supermarkets */
  middle: number;
  supermarket: { count: number; points: number; takes: number };
  after: number;
}

const ZERO = { ubz: '', supermarkets: 0, supermarketsWithParking: 0, commercialHa: 0, commercialLots: 0, commercialSpaces: 0, priorityLots: 0, priorityGarages: 0, prioritySpaces: 0 };

/** Street-space effect of the active off-street charging features on one district. */
export function bonusEffect(
  f: FactorResult,
  b: BonusDistrict | undefined,
  p: BonusParams,
  fp: Pick<FactorParams, 'evsPerStreetPoint' | 'residentsStreetShare' | 'commuterStreetShare'>,
  bevShare: number,
): BonusEffect {
  const d = b ?? ZERO;
  const k = fp.evsPerStreetPoint;
  const before = Math.max(0, Math.ceil(f.needed) - f.existing);

  const priority = { points: 0, evs: 0, relief: 0 };
  if (p.priority) {
    priority.points = Math.round(p.priorityShare * d.prioritySpaces);
    priority.evs = Math.min(priority.points, d.prioritySpaces * bevShare);
    priority.relief = Math.min(f.residents, (priority.evs * fp.residentsStreetShare) / k);
  }
  const commercial = { points: 0, evs: 0, relief: 0, night: 0 };
  if (p.commercial) {
    commercial.points = Math.round(p.commercialShare * d.commercialSpaces);
    commercial.evs = Math.min(commercial.points, d.commercialSpaces * bevShare);
    commercial.relief = Math.min(f.commuters, (commercial.evs * fp.commuterStreetShare) / k);
    if (p.commercialNight) {
      const free = Math.max(0, commercial.points - commercial.evs) * bevShare;
      commercial.night = Math.min(Math.max(0, f.residents - priority.relief), (free * fp.residentsStreetShare) / k);
    }
  }
  const relief = priority.relief + commercial.relief + commercial.night;
  const middle = relief > 0 ? Math.max(0, Math.ceil(f.needed - relief) - f.existing) : before;

  const supermarket = { count: d.supermarketsWithParking, points: 0, takes: 0 };
  if (p.supermarket) {
    supermarket.points = d.supermarketsWithParking * p.pointsPerSupermarket;
    supermarket.takes = Math.round(Math.min(supermarket.points, p.absorbShare * middle));
  }
  return { before, priority, commercial, middle, supermarket, after: middle - supermarket.takes };
}

/** A district result with the features applied: missing points after them, demand reduced by the relief. */
export function applyBonus(r: DistrictResult, e: BonusEffect): DistrictResult {
  const reduction = e.before - e.after;
  if (reduction === 0) return { ...r, gapBefore: e.before };
  const needed = Math.max(0, r.needed - reduction);
  return {
    ...r,
    needed,
    gap: e.after,
    gapBefore: e.before,
    gapPer1000Cars: r.cars > 0 ? (e.after / r.cars) * 1000 : 0,
    coverage: needed > 0 ? Math.min(r.existing / needed, 1) : 1,
  };
}
