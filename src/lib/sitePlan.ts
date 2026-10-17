// Planned public AC stations per demand level (scripts/model/build_sites.py):
// greedy placement on kerbs and public car parks, ranked by the demand without
// a charger within walking distance. Precomputed with the default model settings.

import type { FactorParams } from './factors';

/** main user group around a site: residents, in-commuters, visitors */
export type SiteGroup = 'r' | 'c' | 'v';
export type SiteKind = 'kerb' | 'street' | 'lot' | 'park-ride';

export interface SiteCandidate {
  lon: number;
  lat: number;
  ubz: string;
  kind: SiteKind;
  street: string | null;
  /** house number interpolated along the street segment */
  no: number | null;
  mainRoad: boolean;
  /** disabled parking bay within 25 m */
  bayNear: boolean;
  /** listed monument within 25 m */
  monument: boolean;
  /** street light within 15 m: lamp-post charging possible */
  lamp: boolean;
  /** planned roadworks within 75 m */
  roadworks: string | null;
}

/** [candidate id, rank, charging points, EVs without a charger within walking distance, main group] */
export type SiteRow = [number, number, number, number, SiteGroup];

export interface SiteLevel {
  key: string;
  label: string;
  share: number;
  today: boolean;
  stations: SiteRow[];
  /** missing points that found no candidate, per Unterbezirk */
  unplaced: Record<string, number>;
}

export interface SitePlan {
  pointsPerStation: number;
  radius: Record<'residents' | 'commuters' | 'visitors', number>;
  levels: SiteLevel[];
  candidates: Record<string, SiteCandidate>;
}

/** public/data/model/sites.json: candidates as arrays in the order of candidateFields, flags as bits */
export interface RawSitePlan extends Omit<SitePlan, 'candidates'> {
  candidateFields: string[];
  flags: Record<'mainRoad' | 'bayNear' | 'monument' | 'lamp', number>;
  candidates: Record<string, (string | number | null)[]>;
}

export function parseSitePlan(raw: RawSitePlan): SitePlan {
  const at = Object.fromEntries(raw.candidateFields.map((f, i) => [f, i]));
  const candidates: Record<string, SiteCandidate> = {};
  for (const [id, c] of Object.entries(raw.candidates)) {
    const flags = Number(c[at.flags] ?? 0);
    candidates[id] = {
      lon: Number(c[at.lon]),
      lat: Number(c[at.lat]),
      ubz: String(c[at.ubz]),
      kind: c[at.kind] as SiteKind,
      street: (c[at.street] as string | null) ?? null,
      no: c[at.no] == null ? null : Number(c[at.no]),
      mainRoad: (flags & raw.flags.mainRoad) > 0,
      bayNear: (flags & raw.flags.bayNear) > 0,
      monument: (flags & raw.flags.monument) > 0,
      lamp: (flags & raw.flags.lamp) > 0,
      roadworks: (c[at.roadworks] as string | null) ?? null,
    };
  }
  return { pointsPerStation: raw.pointsPerStation, radius: raw.radius, levels: raw.levels, candidates };
}

export interface PlannedSite extends SiteCandidate {
  /** stable across rebuilds: rounded coordinates */
  id: string;
  rank: number;
  points: number;
  evsNearby: number;
  group: SiteGroup;
  /** 0 = high, 1 = medium, 2 = low (thirds of the ranking) */
  tier: 0 | 1 | 2;
}

export const GROUP_LABEL: Record<SiteGroup, string> = { r: 'Residents', c: 'In-commuters', v: 'Visitors' };
export const TIER_LABEL = ['High', 'Medium', 'Low'] as const;
export const TIER_COLOUR = ['#166534', '#22a355', '#9ee0b0'] as const;
export const KIND_LABEL: Record<SiteKind, string> = {
  kerb: 'Kerbside',
  street: 'Street parking',
  lot: 'Public car park',
  'park-ride': 'Park & ride',
};

export const siteId = (c: Pick<SiteCandidate, 'lat' | 'lon'>) => `${c.lat.toFixed(5)},${c.lon.toFixed(5)}`;

export function address(s: Pick<SiteCandidate, 'street' | 'no' | 'kind'>): string {
  const street = s.street ? (s.no != null ? `${s.street} ${s.no}` : s.street) : 'No street name';
  return s.kind === 'kerb' ? street : `${KIND_LABEL[s.kind]}, ${street}`;
}

/** The precomputed level that matches the model's EV basis; exact = the same share. */
export function levelFor(plan: SitePlan, p: Pick<FactorParams, 'bevMode' | 'bevShareScenario'>): { level: SiteLevel; exact: boolean } {
  if (p.bevMode === 'today') {
    const today = plan.levels.find((l) => l.today) ?? plan.levels[0];
    return { level: today, exact: true };
  }
  const scenarios = plan.levels.filter((l) => !l.today);
  const level = scenarios.reduce((a, l) => (Math.abs(l.share - p.bevShareScenario) < Math.abs(a.share - p.bevShareScenario) ? l : a));
  return { level, exact: Math.abs(level.share - p.bevShareScenario) < 0.0005 };
}

/** Model parameters for a level: today's EVs or the scenario share. */
export const paramsForLevel = (level: SiteLevel): Pick<FactorParams, 'bevMode'> & Partial<Pick<FactorParams, 'bevShareScenario'>> =>
  level.today ? { bevMode: 'today' } : { bevMode: 'scenario', bevShareScenario: level.share };

export function sitesOf(plan: SitePlan, level: SiteLevel): PlannedSite[] {
  const n = level.stations.length;
  return level.stations
    .map(([cid, rank, points, evsNearby, group]) => {
      const c = plan.candidates[String(cid)];
      const tier = (Math.min(2, Math.floor(((rank - 1) * 3) / Math.max(n, 1))) as 0 | 1 | 2);
      return { ...c, id: siteId(c), rank, points, evsNearby, group, tier };
    })
    .sort((a, b) => a.rank - b.rank);
}

export type CheckStatus = 'ok' | 'note' | 'option' | 'todo';

export interface Check {
  id: string;
  status: CheckStatus;
  label: string;
}

/** Hard exclusions every planned site passed (scripts/model/build_sites.py) */
export const DATA_CHECKS: Check[] = [
  { id: 'tree', status: 'ok', label: 'No tree root zone (crown radius + 1.5 m)' },
  { id: 'stop', status: 'ok', label: 'No bus or tram stop within 15 m' },
  { id: 'cycle', status: 'ok', label: 'No cycle track or cycle lane' },
  { id: 'bay', status: 'ok', label: 'Not on a disabled parking bay' },
  { id: 'charger', status: 'ok', label: 'No charging station within 50 m' },
];

/** What the data cannot show: checked on site, ticked off by the user */
export function onSiteChecks(s: Pick<SiteCandidate, 'kind'>): Check[] {
  return [
    { id: 'pavement', status: 'todo', label: 'Pavement keeps at least 1.80 m clear width' },
    { id: 'grid', status: 'todo', label: 'Grid connection confirmed by the network operator' },
    { id: 'signs', status: 'todo', label: 'Bays can be signed for EV charging (sign 314 with 1010-66)' },
    ...(s.kind === 'kerb' ? [] : [{ id: 'owner', status: 'todo' as const, label: 'Owner agrees to the use of the car park' }]),
  ];
}

export function siteNotes(s: SiteCandidate): Check[] {
  const notes: Check[] = [];
  if (s.lamp) notes.push({ id: 'lamp', status: 'option', label: 'Street light within 15 m: lamp-post charging possible' });
  if (s.monument) notes.push({ id: 'monument', status: 'note', label: 'Listed monument within 25 m: involve the heritage authority' });
  if (s.bayNear) notes.push({ id: 'bayNear', status: 'note', label: 'Disabled parking bay within 25 m: keep access free' });
  if (s.roadworks) notes.push({ id: 'roadworks', status: 'note', label: `Planned roadworks within 75 m: ${s.roadworks}` });
  if (s.mainRoad) notes.push({ id: 'mainRoad', status: 'note', label: 'Main road: check traffic safety when parking' });
  return notes;
}

const csvCell = (v: string | number | boolean | null) => {
  const s = v == null ? '' : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function sitesCsv(sites: PlannedSite[], level: SiteLevel, names: Map<string, string>, done: Record<string, string[]>): string {
  const head = [
    'level', 'rank', 'priority', 'ubz', 'subdistrict', 'address', 'type', 'lat', 'lon', 'newPoints', 'evsNearby', 'mainGroup',
    'lampPostCharging', 'notes', 'checkedOnSite',
  ];
  const rows = sites.map((s) => [
    level.label, s.rank, TIER_LABEL[s.tier], s.ubz, names.get(s.ubz) ?? '', address(s), KIND_LABEL[s.kind], s.lat, s.lon, s.points,
    s.evsNearby, GROUP_LABEL[s.group], s.lamp,
    siteNotes(s).filter((n) => n.status === 'note').map((n) => n.label).join(' | '),
    (done[s.id] ?? []).join(' | '),
  ]);
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
}
