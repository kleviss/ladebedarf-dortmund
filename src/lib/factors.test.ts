import { describe, expect, it } from 'vitest';
import destinationsCsv from '../../public/data/model/destinations.csv?raw';
import factorsCsv from '../../public/data/model/factors.csv?raw';
import parametersJson from '../../public/data/model/parameters.json';
import {
  calibrateMfh,
  computeFactors,
  defaultFactorParams,
  homeCoverage,
  parseCsv,
  toDestination,
  toFactorDistrict,
  type FactorParams,
  type ParameterSpec,
} from './factors';

const rows = parseCsv(factorsCsv);
const districts = rows.map(toFactorDistrict);
const destinations = parseCsv(destinationsCsv).map(toDestination);
const defaults = defaultFactorParams(parametersJson as unknown as { parameters: ParameterSpec[] });
const ref = new Map(rows.map((r) => [r.ubz, r]));
const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);

describe('model files', () => {
  it('cover all 145 Unterbezirke and 99 destinations', () => {
    expect(districts).toHaveLength(145);
    expect(destinations).toHaveLength(99);
    expect(ref.get('071')?.name).toBe('Kaiserbrunnen');
  });
});

describe('computeFactors with the defaults', () => {
  const today = computeFactors(districts, destinations, defaults);
  const scenario = computeFactors(districts, destinations, { ...defaults, bevMode: 'scenario' });

  it('calibrates apartment blocks so the city matches the ISME home share', () => {
    expect(today.mfhPerDwelling).toBeCloseTo(0.409, 3);
    const cars = sum(districts.map((d) => d.privateCars));
    const mean = sum(districts.map((d, i) => d.privateCars * today.results[i].homeCoverage)) / cars;
    expect(mean).toBeCloseTo(defaults.homeShareCity, 4);
  });

  it('reproduces the reference results of scripts/model/build_factors.py', () => {
    for (const [mode, run] of [['Today', today], ['Scenario', scenario]] as const) {
      for (const r of run.results) {
        const x = ref.get(r.ubz)!;
        expect(r.homeCoverage).toBeCloseTo(Number(x.homeCoverage), 3);
        expect(r.residents).toBeCloseTo(Number(x[`residents${mode}`]), 1);
        expect(r.commuters).toBeCloseTo(Number(x[`commuters${mode}`]), 1);
        expect(r.tourists).toBeCloseTo(Number(x[`tourists${mode}`]), 1);
        expect(r.gap).toBeCloseTo(Number(x[`gap${mode}`]), 1);
      }
    }
  });

  it('gives Kaiserbrunnen 7.1 resident points today and 51 at 18 % BEV', () => {
    const k = (run: typeof today) => run.results.find((r) => r.ubz === '071')!;
    expect(k(today).homeCoverage).toBeCloseTo(0.425, 3);
    expect(k(today).residents).toBeCloseTo(7.1, 1);
    expect(k(scenario).residents).toBeCloseTo(51, 0);
  });

  it('keeps the city totals in a plausible range', () => {
    const t = (run: typeof today, key: 'residents' | 'commuters' | 'tourists') => sum(run.results.map((r) => r[key]));
    expect(t(today, 'residents')).toBeCloseTo(245, 0);
    expect(t(scenario, 'commuters')).toBeCloseTo(399, 0);
    expect(t(scenario, 'tourists')).toBeCloseTo(345, 0);
  });

  it('exposes every factor as a step for the UI', () => {
    expect(today.results[0].steps.map((s) => s.key)).toEqual(['homeCoverage', 'residents', 'commuters', 'tourists', 'needed', 'existing', 'gap']);
  });
});

describe('parameters', () => {
  const p: FactorParams = { ...defaults, calibrate: false };

  it('caps home coverage at 100 % and handles districts without dwellings', () => {
    const d = { ...districts[0], garagesCarports: 10_000 };
    expect(homeCoverage(d, p, 0.4)).toBe(1);
    expect(homeCoverage({ ...d, dwellings: 0 }, p, 0.4)).toBe(0);
  });

  it('recalibrates when the driveway assumption changes', () => {
    expect(calibrateMfh(districts, { ...defaults, drivewayPerDwelling: 1 })).toBeLessThan(calibrateMfh(districts, defaults));
  });

  it('reproduces the ISME tourist assumption with charging share 1 and one person per car', () => {
    const base = sum(computeFactors(districts, destinations, defaults).results.map((r) => r.tourists));
    const isme = sum(
      computeFactors(districts, destinations, { ...defaults, chargeAtDestinationShare: 1, personsPerCar: 1 }).results.map((r) => r.tourists),
    );
    expect(isme / base).toBeCloseTo((1 / 0.2) * 1.46, 6);
  });

  it('counts events only when switched on', () => {
    const off = computeFactors(districts, destinations, defaults).results.find((r) => r.ubz === '011')!;
    const on = computeFactors(districts, destinations, { ...defaults, includeEvents: true }).results.find((r) => r.ubz === '011')!;
    expect(on.tourists).toBeGreaterThan(off.tourists);
  });
});
