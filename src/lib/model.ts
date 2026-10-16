// Demand model for public EV charging points per statistical Unterbezirk.
//
// PLACEHOLDER METHOD: the City of Dortmund provides its own calculation method
// during the challenge. Replace `computeDistrict` with that method and keep the
// `steps` array so the UI can keep showing every factor transparently.

export interface DistrictInput {
  ubz: string;
  name: string;
  sbz: string;
  sbzName: string;
  stadtbezirk: string;
  areaKm2: number;
  buildings: number;
  residents: number;
  residentsSbz: number | null;
  chargers: number;
}

export interface CityMeta {
  residents: number;
  residentsYear: number;
  pkwPer1000: number;
  pkwPer1000Year: number;
  pkwTotal: number;
  pkwTotalYear: number;
  kfzTotalEnergy: number;
  bev: number;
  phev: number;
  evYear: number;
  chargers: number;
  buildings: number;
}

export interface Scenario {
  /** Plug-in share of all cars (BEV + PHEV), 0–1 */
  evShare: number;
  /** Base share of EVs that charge at home or at work, 0–1 */
  homeChargingShare: number;
  /** How strongly residential density lowers home charging, 0 (none) – 1 (strong) */
  densityEffect: number;
  /** EVs served by one public charging point */
  evsPerPoint: number;
  /** Cars per 1,000 residents */
  pkwPer1000: number;
}

export type SourceKind = 'open-data' | 'estimate' | 'assumption' | 'result';

export interface Step {
  key: string;
  label: string;
  value: number;
  unit: string;
  formula: string;
  source: SourceKind;
}

export interface DistrictResult extends DistrictInput {
  residentsPerBuilding: number;
  cars: number;
  evs: number;
  homeShare: number;
  publicEvs: number;
  needed: number;
  gap: number;
  gapPer1000: number;
  densityPerKm2: number;
  steps: Step[];
}

export interface CityContext {
  residentsPerBuilding: number;
}

export const currentEvShare = (city: CityMeta) =>
  city.kfzTotalEnergy > 0 ? (city.bev + city.phev) / city.kfzTotalEnergy : 0;

export const defaultScenario = (city: CityMeta): Scenario => ({
  evShare: 0.15,
  homeChargingShare: 0.6,
  densityEffect: 0.5,
  evsPerPoint: 10,
  pkwPer1000: city.pkwPer1000,
});

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function cityContext(city: CityMeta): CityContext {
  return { residentsPerBuilding: city.buildings > 0 ? city.residents / city.buildings : 0 };
}

/**
 * Share of EVs in a district that can charge privately. Districts with more
 * residents per building (apartment blocks) get a lower share than the city
 * average, districts with fewer (detached houses) a higher one.
 */
export function homeShareFor(residentsPerBuilding: number, s: Scenario, ctx: CityContext): number {
  if (residentsPerBuilding <= 0 || ctx.residentsPerBuilding <= 0) return s.homeChargingShare;
  const ratio = ctx.residentsPerBuilding / residentsPerBuilding;
  return clamp(s.homeChargingShare * Math.pow(ratio, s.densityEffect), 0.05, 0.95);
}

export function computeDistrict(d: DistrictInput, s: Scenario, ctx: CityContext): DistrictResult {
  const residentsPerBuilding = d.buildings > 0 ? d.residents / d.buildings : 0;
  const cars = (d.residents * s.pkwPer1000) / 1000;
  const evs = cars * s.evShare;
  const homeShare = homeShareFor(residentsPerBuilding, s, ctx);
  const publicEvs = evs * (1 - homeShare);
  const needed = s.evsPerPoint > 0 ? publicEvs / s.evsPerPoint : 0;
  const gap = Math.max(0, needed - d.chargers);
  const gapPer1000 = d.residents > 0 ? (gap / d.residents) * 1000 : 0;

  const steps: Step[] = [
    {
      key: 'residents',
      label: 'Einwohner*innen',
      value: d.residents,
      unit: 'EW',
      formula:
        d.residentsSbz != null && d.ubz !== d.sbz
          ? `${fmt(d.residentsSbz)} EW im stat. Bezirk ${d.sbzName}, verteilt nach Gebäudeanteil`
          : `Hauptwohnbevölkerung stat. Bezirk ${d.sbzName}`,
      source: d.ubz !== d.sbz ? 'estimate' : 'open-data',
    },
    {
      key: 'cars',
      label: 'Pkw',
      value: cars,
      unit: 'Pkw',
      formula: `× ${fmt(s.pkwPer1000)} Pkw je 1.000 EW`,
      source: 'open-data',
    },
    {
      key: 'evs',
      label: 'E-Pkw (BEV + PHEV)',
      value: evs,
      unit: 'E-Pkw',
      formula: `× ${pct(s.evShare)} E-Anteil`,
      source: 'assumption',
    },
    {
      key: 'publicEvs',
      label: 'davon auf öffentliches Laden angewiesen',
      value: publicEvs,
      unit: 'E-Pkw',
      formula: `× ${pct(1 - homeShare)} ohne privaten Stellplatz (${fmt(residentsPerBuilding, 1)} EW je Gebäude, Stadt ${fmt(ctx.residentsPerBuilding, 1)})`,
      source: 'assumption',
    },
    {
      key: 'needed',
      label: 'Benötigte öffentliche Ladepunkte',
      value: needed,
      unit: 'LP',
      formula: `÷ ${fmt(s.evsPerPoint)} E-Pkw je Ladepunkt`,
      source: 'result',
    },
    {
      key: 'chargers',
      label: 'Vorhandene Ladepunkte',
      value: d.chargers,
      unit: 'LP',
      formula: 'NOX-Block-Ladepunkte im Unterbezirk',
      source: 'open-data',
    },
    {
      key: 'gap',
      label: 'Fehlende Ladepunkte',
      value: gap,
      unit: 'LP',
      formula: 'Bedarf − Bestand, mindestens 0',
      source: 'result',
    },
  ];

  return {
    ...d,
    residentsPerBuilding,
    cars,
    evs,
    homeShare,
    publicEvs,
    needed,
    gap,
    gapPer1000,
    densityPerKm2: d.areaKm2 > 0 ? d.residents / d.areaKm2 : 0,
    steps,
  };
}

export function computeAll(districts: DistrictInput[], s: Scenario, city: CityMeta): DistrictResult[] {
  const ctx = cityContext(city);
  return districts.map((d) => computeDistrict(d, s, ctx));
}

export interface Totals {
  residents: number;
  evs: number;
  needed: number;
  chargers: number;
  gap: number;
}

export function totals(results: DistrictResult[]): Totals {
  return results.reduce<Totals>(
    (t, r) => ({
      residents: t.residents + r.residents,
      evs: t.evs + r.evs,
      needed: t.needed + r.needed,
      chargers: t.chargers + r.chargers,
      gap: t.gap + r.gap,
    }),
    { residents: 0, evs: 0, needed: 0, chargers: 0, gap: 0 },
  );
}

// --- formatting -------------------------------------------------------------

export const fmt = (n: number, digits = 0) =>
  n.toLocaleString('de-DE', { maximumFractionDigits: digits, minimumFractionDigits: digits });

export const pct = (n: number, digits = 0) =>
  (n * 100).toLocaleString('de-DE', { maximumFractionDigits: digits, minimumFractionDigits: digits }) + ' %';
