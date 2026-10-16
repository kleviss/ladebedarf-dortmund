import { fmt, pct, type DistrictResult } from './isme';

export type MetricKey = 'gap' | 'gapPer1000Cars' | 'needed' | 'existing' | 'evShareToday' | 'newEvsPer1000Cars' | 'coverage' | 'parkingUncovered' | 'carDensity' | 'buildingsCoveredShare' | 'bplansRecent' | 'pois' | 'commercialHa' | 'homeShare' | 'efhShare' | 'streetFactorLocal' | 'transit' | 'fleetBev' | 'hpcRelief';

export interface Metric {
  key: MetricKey;
  label: string;
  short: string;
  value: (r: DistrictResult) => number;
  format: (n: number) => string;
}

const points = (n: number) => `${fmt(n, n > 0 && n < 10 ? 1 : 0)} LP`;

export const METRICS: Metric[] = [
  { key: 'gap', label: 'Fehlende Ladepunkte', short: 'Lücke', value: (r) => r.gap, format: points },
  {
    key: 'gapPer1000Cars',
    label: 'Fehlende Ladepunkte je 1.000 Pkw',
    short: 'Lücke je 1.000 Pkw',
    value: (r) => r.gapPer1000Cars,
    format: (n) => fmt(n, 1),
  },
  { key: 'needed', label: 'Benötigte Ladepunkte', short: 'Bedarf', value: (r) => r.needed, format: points },
  { key: 'existing', label: 'Vorhandene Ladepunkte', short: 'Bestand', value: (r) => r.existing, format: points },
  { key: 'coverage', label: 'Deckungsgrad (Bestand ÷ Bedarf)', short: 'Deckung', value: (r) => r.coverage, format: (n) => pct(n) },
  {
    key: 'newEvsPer1000Cars',
    label: 'E-Neuzulassungen je 1.000 Pkw',
    short: 'E-Neuzulassungen',
    value: (r) => (r.cars > 0 ? ((r.privateNewEvs + r.commercialNewEvs) / r.cars) * 1000 : 0),
    format: (n) => fmt(n, 1),
  },
  {
    key: 'parkingUncovered',
    label: 'Öffentliche Parkflächen ohne Ladestandort (225 m)',
    short: 'Parkflächen ohne LP',
    value: (r) => r.parkingUncovered ?? 0,
    format: (n) => fmt(n),
  },
  {
    key: 'buildingsCoveredShare',
    label: 'Gebäude ≤ 225 m zum Ladestandort (ISME-Gehweite Wohnen)',
    short: 'Gebäude abgedeckt',
    value: (r) => (r.buildings ? (r.buildingsCovered ?? 0) / r.buildings : 0),
    format: (n) => pct(n),
  },
  { key: 'carDensity', label: 'Pkw je km² (Fahrzeugdichte)', short: 'Pkw/km²', value: (r) => (r.areaKm2 > 0 ? r.cars / r.areaKm2 : 0), format: (n) => fmt(n) },
  { key: 'pois', label: 'Einkaufs- und Freizeitziele (POIs)', short: 'POIs', value: (r) => (r.poisShopping ?? 0) + (r.poisLeisure ?? 0), format: (n) => fmt(n) },
  { key: 'commercialHa', label: 'Gewerbeflächen (ha)', short: 'Gewerbe', value: (r) => r.commercialHa ?? 0, format: (n) => `${fmt(n)} ha` },
  { key: 'bplansRecent', label: 'Bebauungspläne seit 2015 (Neubau-Indikator)', short: 'B-Pläne seit 2015', value: (r) => r.bplansRecent ?? 0, format: (n) => fmt(n) },
  // bottom-up factors (0 when the city-wide ISME model is active)
  { key: 'homeShare', label: 'Laden zu Hause (Bottom-up)', short: 'zu Hause', value: (r) => num(r, 'homeShare'), format: (n) => pct(n) },
  {
    key: 'efhShare',
    label: 'Wohnungen in Ein-/Zweifamilienhäusern (ALKIS)',
    short: 'EFH-Anteil',
    value: (r) => {
      const e = r.dwellingsEfh ?? 0;
      const m = r.dwellingsMfh ?? 0;
      return e + m > 0 ? e / (e + m) : 0;
    },
    format: (n) => pct(n),
  },
  {
    key: 'streetFactorLocal',
    label: 'BEV je Straßen-Ladepunkt (Bottom-up)',
    short: 'BEV je LP',
    value: (r) => num(r, 'streetFactorLocal'),
    format: (n) => fmt(n, 2),
  },
  { key: 'transit', label: 'ÖPNV-Anbindung (Wohngebäude ≤ 600 m Schiene)', short: 'ÖPNV', value: (r) => r.transitRail ?? 0, format: (n) => pct(n) },
  { key: 'fleetBev', label: 'BEV Gewerbeflotten (Bottom-up)', short: 'Flotten-BEV', value: (r) => num(r, 'fleetBev'), format: (n) => fmt(n) },
  { key: 'hpcRelief', label: 'Entlastung durch HPC (BEV, Bottom-up)', short: 'HPC-Entlastung', value: (r) => num(r, 'hpcRelief'), format: (n) => fmt(n) },
  { key: 'evShareToday', label: 'E-Anteil am Pkw-Bestand heute', short: 'E-Anteil', value: (r) => r.evShareToday, format: (n) => pct(n, 1) },
];

/** Bottom-up-only fields; 0 for the city-wide ISME model. */
function num(r: DistrictResult, key: string): number {
  const v = (r as unknown as Record<string, unknown>)[key];
  return typeof v === 'number' ? v : 0;
}

export const metricByKey = (key: MetricKey) => METRICS.find((m) => m.key === key) ?? METRICS[0];

// Sequential blue ramp (light → dark), validated for the light map surface.
export const RAMP = ['#b7d3f6', '#6da7ec', '#3987e5', '#256abf', '#104281'];
export const ZERO_COLOR = '#e6e5df';

export interface Classes {
  /** Upper bounds of each class, ascending; length = RAMP.length */
  breaks: number[];
  hasZero: boolean;
  classOf: (v: number) => number; // -1 = zero class
}

const niceRound = (v: number) => {
  if (v === 0) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(v))) - 1);
  return Math.ceil(v / mag) * mag;
};

/** Quantile classes over the positive values; zero gets its own neutral class. */
export function quantileClasses(values: number[]): Classes {
  const positive = values.filter((v) => v > 0).sort((a, b) => a - b);
  const hasZero = values.some((v) => v <= 0);
  const k = RAMP.length;
  const breaks: number[] = [];
  for (let i = 1; i <= k; i++) {
    const idx = Math.min(positive.length - 1, Math.ceil((i / k) * positive.length) - 1);
    breaks.push(positive.length ? niceRound(positive[Math.max(0, idx)]) : 0);
  }
  for (let i = 1; i < breaks.length; i++) {
    if (breaks[i] <= breaks[i - 1]) breaks[i] = breaks[i - 1] + Number.EPSILON;
  }
  const classOf = (v: number) => {
    if (v <= 0) return -1;
    const i = breaks.findIndex((b) => v <= b);
    return i === -1 ? k - 1 : i;
  };
  return { breaks, hasZero, classOf };
}
