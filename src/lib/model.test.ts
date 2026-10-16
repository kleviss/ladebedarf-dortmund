import { describe, expect, it } from 'vitest';
import { computeDistrict, homeShareFor, type DistrictInput, type Scenario } from './model';

const district: DistrictInput = {
  ubz: '123',
  name: 'Obereving',
  sbz: '120',
  sbzName: 'Eving',
  stadtbezirk: 'Eving',
  areaKm2: 2,
  buildings: 1000,
  residents: 10000,
  residentsSbz: 20000,
  chargers: 5,
};

const scenario: Scenario = {
  evShare: 0.2,
  homeChargingShare: 0.5,
  densityEffect: 0,
  evsPerPoint: 10,
  pkwPer1000: 500,
};

describe('computeDistrict', () => {
  it('runs the chain residents → cars → EVs → public EVs → needed points', () => {
    const r = computeDistrict(district, scenario, { residentsPerBuilding: 10 });
    expect(r.cars).toBe(5000);
    expect(r.evs).toBe(1000);
    expect(r.publicEvs).toBe(500);
    expect(r.needed).toBe(50);
    expect(r.gap).toBe(45);
    expect(r.gapPer1000).toBe(4.5);
  });

  it('never returns a negative gap', () => {
    const r = computeDistrict({ ...district, chargers: 500 }, scenario, { residentsPerBuilding: 10 });
    expect(r.gap).toBe(0);
  });

  it('exposes every factor as a step for the UI', () => {
    const r = computeDistrict(district, scenario, { residentsPerBuilding: 10 });
    expect(r.steps.map((s) => s.key)).toEqual([
      'residents',
      'cars',
      'evs',
      'publicEvs',
      'needed',
      'chargers',
      'gap',
    ]);
  });
});

describe('homeShareFor', () => {
  const s = { ...scenario, densityEffect: 1 };

  it('lowers home charging in dense districts', () => {
    expect(homeShareFor(20, s, { residentsPerBuilding: 10 })).toBeCloseTo(0.25);
  });

  it('raises home charging in low-density districts, capped at 95 %', () => {
    expect(homeShareFor(5, s, { residentsPerBuilding: 10 })).toBeCloseTo(0.95);
  });

  it('falls back to the base share without residents', () => {
    expect(homeShareFor(0, s, { residentsPerBuilding: 10 })).toBe(0.5);
  });
});
