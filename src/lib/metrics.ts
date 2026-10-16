import { fmt, type DistrictResult } from './model';

export type MetricKey = 'gap' | 'gapPer1000' | 'needed' | 'chargers' | 'densityPerKm2';

export interface Metric {
  key: MetricKey;
  label: string;
  short: string;
  value: (r: DistrictResult) => number;
  format: (n: number) => string;
}

export const METRICS: Metric[] = [
  {
    key: 'gap',
    label: 'Fehlende Ladepunkte',
    short: 'Lücke',
    value: (r) => r.gap,
    format: (n) => `${fmt(n, n < 10 ? 1 : 0)} LP`,
  },
  {
    key: 'gapPer1000',
    label: 'Fehlende Ladepunkte je 1.000 Einwohner*innen',
    short: 'Lücke je 1.000 EW',
    value: (r) => r.gapPer1000,
    format: (n) => fmt(n, 2),
  },
  {
    key: 'needed',
    label: 'Benötigte öffentliche Ladepunkte',
    short: 'Bedarf',
    value: (r) => r.needed,
    format: (n) => `${fmt(n, n < 10 ? 1 : 0)} LP`,
  },
  {
    key: 'chargers',
    label: 'Vorhandene Ladepunkte (NOX-Block)',
    short: 'Bestand',
    value: (r) => r.chargers,
    format: (n) => `${fmt(n)} LP`,
  },
  {
    key: 'densityPerKm2',
    label: 'Einwohner*innen je km²',
    short: 'Dichte',
    value: (r) => r.densityPerKm2,
    format: (n) => `${fmt(n)} EW/km²`,
  },
];

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
  // keep breaks strictly increasing
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
