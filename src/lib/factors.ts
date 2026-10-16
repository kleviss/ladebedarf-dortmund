// Street-space factor model (docs/factor-model.md): charging points in street space per
// Unterbezirk for residents, commuters and tourists, from measured local data instead of
// city-wide shares. Not wired into the UI yet. Inputs: public/data/model/factors.csv,
// destinations.csv and parameters.json (built by scripts/model/build_factors.py, which
// uses the same formulas and writes reference results the tests compare against).
//
//   residents  E-PKW × (1 − home coverage) × residentsStreetShare ÷ evsPerStreetPoint
//              home coverage = min(1, (garages + driveway × EFH/ZFH dwellings
//                                     + mfhPerDwelling × MFH dwellings × OSM factor) ÷ dwellings)
//   commuters  inCommuters × commuterCarShare × BEV share × commuterStreetShare ÷ evsPerStreetPoint
//              × district share of estimated jobs (ALKIS floor area ÷ m² per job)
//   tourists   (day visitors + overnight stays) ÷ 365 × touristCarShare ÷ personsPerCar × BEV share
//              × chargeAtDestinationShare × touristStreetShare ÷ evsPerStreetPoint
//              × district share of visits (day) or of hotel weight (overnight)

import { fmt, pct, type Step } from './isme';

export interface FactorDistrict {
  ubz: string;
  name: string;
  stadtbezirk: string;
  privateCars: number;
  privateEvs: number;
  chargers: number;
  hotelWeight: number;
  dwellings: number;
  dwellingsEfhZfh: number;
  dwellingsMfh: number;
  garagesCarports: number;
  osmFactor: number;
  floorOffice: number;
  floorRetail: number;
  floorSocial: number;
  floorIndustry: number;
  floorWarehouse: number;
  floorMixed: number;
}

export interface Destination {
  ubz: string;
  name: string;
  event: boolean;
  /** Visits per year; null where no public figure exists */
  visitors: number | null;
}

export type JobClass = 'office' | 'retail' | 'social' | 'industry' | 'warehouse' | 'mixed';

export interface FactorParams {
  bevMode: 'today' | 'scenario';
  bevShareToday: number;
  bevShareScenario: number;
  evsPerStreetPoint: number;
  homeShareCity: number;
  drivewayPerDwelling: number;
  mfhPerDwelling: number;
  calibrate: boolean;
  useOsmFactor: boolean;
  residentsStreetShare: number;
  inCommuters: number;
  commuterCarShare: number;
  commuterStreetShare: number;
  m2PerJob: Record<JobClass, number>;
  dayVisitorsPerYear: number;
  overnightStaysPerYear: number;
  touristCarShare: number;
  personsPerCar: number;
  chargeAtDestinationShare: number;
  touristStreetShare: number;
  defaultVisitors: number;
  includeEvents: boolean;
  pointsPerSite: number;
}

export interface ParameterSpec {
  key: keyof FactorParams;
  factor: string;
  label: string;
  default: unknown;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  kind: string;
  source?: string;
  note?: string;
}

/** Defaults from public/data/model/parameters.json. */
export function defaultFactorParams(json: { parameters: ParameterSpec[] }): FactorParams {
  return Object.fromEntries(json.parameters.map((p) => [p.key, p.default])) as unknown as FactorParams;
}

export interface FactorResult {
  ubz: string;
  name: string;
  homeCoverage: number;
  jobs: number;
  residents: number;
  commuters: number;
  tourists: number;
  needed: number;
  existing: number;
  gap: number;
  steps: Step[];
}

export const jobsOf = (d: FactorDistrict, m2: Record<JobClass, number>) =>
  d.floorOffice / m2.office +
  d.floorRetail / m2.retail +
  d.floorSocial / m2.social +
  d.floorIndustry / m2.industry +
  d.floorWarehouse / m2.warehouse +
  (0.5 * d.floorMixed) / m2.mixed;

const mfhLocal = (d: FactorDistrict, p: FactorParams) => d.dwellingsMfh * (p.useOsmFactor ? d.osmFactor : 1);

export function homeCoverage(d: FactorDistrict, p: FactorParams, mfhPerDwelling: number): number {
  if (d.dwellings <= 0) return 0;
  const sites = d.garagesCarports + p.drivewayPerDwelling * d.dwellingsEfhZfh + mfhPerDwelling * mfhLocal(d, p);
  return Math.min(1, sites / d.dwellings);
}

/** mfhPerDwelling that makes the car-weighted mean home coverage equal homeShareCity. */
export function calibrateMfh(districts: FactorDistrict[], p: FactorParams): number {
  const cars = districts.reduce((a, d) => a + Math.max(0, d.privateCars), 0);
  const mean = (s: number) => districts.reduce((a, d) => a + Math.max(0, d.privateCars) * homeCoverage(d, p, s), 0) / cars;
  let lo = 0;
  let hi = 5;
  let s = p.mfhPerDwelling;
  for (let i = 0; i < 60; i++) {
    s = (lo + hi) / 2;
    if (mean(s) < p.homeShareCity) lo = s;
    else hi = s;
  }
  return s;
}

/** Visits per year that count for day tourists in each Unterbezirk. */
export function visitsByDistrict(destinations: Destination[], p: FactorParams): Map<string, number> {
  const out = new Map<string, number>();
  for (const x of destinations) {
    const v = x.event && !p.includeEvents ? 0 : (x.visitors ?? p.defaultVisitors);
    out.set(x.ubz, (out.get(x.ubz) ?? 0) + v);
  }
  return out;
}

export function computeFactors(
  districts: FactorDistrict[],
  destinations: Destination[],
  p: FactorParams,
): { results: FactorResult[]; mfhPerDwelling: number; bevShare: number } {
  const mfhPerDwelling = p.calibrate ? calibrateMfh(districts, p) : p.mfhPerDwelling;
  const bevShare = p.bevMode === 'today' ? p.bevShareToday : p.bevShareScenario;
  const jobs = districts.map((d) => jobsOf(d, p.m2PerJob));
  const jobsTotal = jobs.reduce((a, j) => a + j, 0);
  const visits = visitsByDistrict(destinations, p);
  const visitsTotal = [...visits.values()].reduce((a, v) => a + v, 0);
  const hotelTotal = districts.reduce((a, d) => a + d.hotelWeight, 0);
  const commuterPoints = (p.inCommuters * p.commuterCarShare * bevShare * p.commuterStreetShare) / p.evsPerStreetPoint;
  const touristPerGuest =
    ((p.touristCarShare / p.personsPerCar) * bevShare * p.chargeAtDestinationShare * p.touristStreetShare) / p.evsPerStreetPoint;
  const dayGuests = p.dayVisitorsPerYear / 365;
  const nightGuests = p.overnightStaysPerYear / 365;

  const results = districts.map<FactorResult>((d, i) => {
    const cov = homeCoverage(d, p, mfhPerDwelling);
    const bevResidents = p.bevMode === 'today' ? d.privateEvs : Math.max(0, d.privateCars) * bevShare;
    const residents = (bevResidents * (1 - cov) * p.residentsStreetShare) / p.evsPerStreetPoint;
    const jobShare = jobsTotal > 0 ? jobs[i] / jobsTotal : 0;
    const commuters = commuterPoints * jobShare;
    const dayShare = visitsTotal > 0 ? (visits.get(d.ubz) ?? 0) / visitsTotal : 0;
    const nightShare = hotelTotal > 0 ? d.hotelWeight / hotelTotal : 0;
    const tourists = touristPerGuest * (dayGuests * dayShare + nightGuests * nightShare);
    const needed = residents + commuters + tourists;
    const existing = d.chargers * p.pointsPerSite;
    const gap = Math.max(0, needed - existing);
    const ev = p.bevMode === 'today' ? `${fmt(d.privateEvs)} private E-Pkw` : `${fmt(d.privateCars)} private Pkw × ${pct(bevShare)}`;

    const steps: Step[] = [
      {
        key: 'homeCoverage',
        label: 'Private Lademöglichkeiten',
        value: cov * 100,
        unit: '%',
        formula: `(${fmt(d.garagesCarports)} Garagen/Carports + ${fmt(p.drivewayPerDwelling, 1)} × ${fmt(d.dwellingsEfhZfh)} Whg. EFH/ZFH + ${fmt(mfhPerDwelling, 3)} × ${fmt(d.dwellingsMfh)} Whg. MFH${p.useOsmFactor ? ` × OSM ${fmt(d.osmFactor, 2)}` : ''}) ÷ ${fmt(d.dwellings)} Wohnungen`,
        source: 'city-data',
      },
      {
        key: 'residents',
        label: 'Anwohner*innen',
        value: residents,
        unit: 'LP',
        formula: `${ev} × ${pct(1 - cov, 1)} ohne Heimladen × ${pct(p.residentsStreetShare, 1)} Straßenraum ÷ ${fmt(p.evsPerStreetPoint, 1)}`,
        source: 'result',
        indent: true,
      },
      {
        key: 'commuters',
        label: 'Einpendelnde',
        value: commuters,
        unit: 'LP',
        formula: `${fmt(jobs[i])} geschätzte Arbeitsplätze = ${pct(jobShare, 2)} von ${fmt(commuterPoints, 1)} LP stadtweit`,
        source: 'result',
        indent: true,
      },
      {
        key: 'tourists',
        label: 'Gäste',
        value: tourists,
        unit: 'LP',
        formula: `${pct(dayShare, 2)} der Besuche (Tagesgäste) + ${pct(nightShare, 2)} der Hotels (Übernachtung)`,
        source: 'result',
        indent: true,
      },
      { key: 'needed', label: 'Benötigte LP im Straßenraum', value: needed, unit: 'LP', formula: 'Anwohner + Pendelnde + Gäste', source: 'result' },
      {
        key: 'existing',
        label: 'Vorhandene Ladepunkte',
        value: existing,
        unit: 'LP',
        formula: `${fmt(d.chargers)} Standorte × ${fmt(p.pointsPerSite)} LP`,
        source: p.pointsPerSite === 1 ? 'city-data' : 'assumption',
      },
      { key: 'gap', label: 'Fehlende Ladepunkte', value: gap, unit: 'LP', formula: 'Bedarf − Bestand, mindestens 0', source: 'result' },
    ];

    return { ubz: d.ubz, name: d.name, homeCoverage: cov, jobs: jobs[i], residents, commuters, tourists, needed, existing, gap, steps };
  });

  return { results, mfhPerDwelling, bevShare };
}

// --- CSV input --------------------------------------------------------------------

/** Minimal CSV reader for the model files (comma-separated, double quotes allowed). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') [cell, i] = [cell + '"', i + 1];
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') [row, cell] = [[...row, cell], ''];
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      rows.push([...row, cell]);
      [row, cell] = [[], ''];
    } else cell += c;
  }
  if (cell || row.length) rows.push([...row, cell]);
  const [head, ...body] = rows.filter((r) => r.length > 1 || r[0] !== '');
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

const num = (v: string | undefined) => (v === undefined || v === '' ? 0 : Number(v));

export const toFactorDistrict = (r: Record<string, string>): FactorDistrict => ({
  ubz: r.ubz,
  name: r.name,
  stadtbezirk: r.stadtbezirk,
  privateCars: num(r.privateCars),
  privateEvs: num(r.privateEvs),
  chargers: num(r.chargers),
  hotelWeight: num(r.hotelWeight),
  dwellings: num(r.dwellings),
  dwellingsEfhZfh: num(r.dwellingsEfhZfh),
  dwellingsMfh: num(r.dwellingsMfh),
  garagesCarports: num(r.garagesCarports),
  osmFactor: num(r.osmFactor),
  floorOffice: num(r.floorOffice),
  floorRetail: num(r.floorRetail),
  floorSocial: num(r.floorSocial),
  floorIndustry: num(r.floorIndustry),
  floorWarehouse: num(r.floorWarehouse),
  floorMixed: num(r.floorMixed),
});

export const toDestination = (r: Record<string, string>): Destination => ({
  ubz: r.ubz,
  name: r.name,
  event: r.event === 'True' || r.event === 'true',
  visitors: r.visitors === '' ? null : Number(r.visitors),
});
