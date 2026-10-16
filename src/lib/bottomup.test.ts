import { describe, expect, it } from 'vitest';
import { computeBottomUp, percentiles } from './bottomup';
import { defaultScenario, type District, type Scenario } from './isme';

const base = (ubz: string, over: Partial<District>): District => ({
  ubz,
  name: ubz,
  stadtbezirk: '',
  areaKm2: 1,
  privateCars: 1000,
  privateEvs: 20,
  privateNewEvs: 0,
  commercialCars: 100,
  commercialEvs: 0,
  commercialNewEvs: 0,
  totalEvs: 20,
  chargers: 0,
  commercialHa: 10,
  poisShopping: 10,
  poisLeisure: 10,
  residentialBuildings: 100,
  ...over,
});

// a suburb of detached houses, a dense block district, a commercial centre with an HPC hub
const districts = [
  base('001', { dwellingsEfh: 900, dwellingsMfh: 100, commerceBuildings: 2, industryBuildings: 1, transitShare: 0.2 }),
  base('002', { dwellingsEfh: 100, dwellingsMfh: 2000, commerceBuildings: 20, industryBuildings: 5, transitShare: 0.7 }),
  base('003', { dwellingsEfh: 50, dwellingsMfh: 800, commerceBuildings: 200, industryBuildings: 80, transitShare: 1, hpcPoints: 20 }),
];
const s: Scenario = { ...defaultScenario, model: 'bottomup' };

describe('percentiles', () => {
  it('ranks from 0 to 1 and shares ties', () => {
    expect(percentiles([3, 1, 2])).toEqual([1, 0, 0.5]);
    expect(percentiles([5, 5, 1])).toEqual([0.75, 0.75, 0]);
  });
});

describe('computeBottomUp', () => {
  it('calibrates home charging to the ISME city average of 52 %', () => {
    const { results } = computeBottomUp(districts, s);
    const bev = results.reduce((a, r) => a + r.bevResidents, 0);
    const home = results.reduce((a, r) => a + r.bevResidents * r.homeShare, 0);
    expect(home / bev).toBeCloseTo(0.52, 6);
    // detached-house suburb charges at home far more than the block district
    expect(results[0].homeShare).toBeGreaterThan(results[1].homeShare);
  });

  it('calibrates street sharing factors to a harmonic mean of 2.8', () => {
    const { results } = computeBottomUp(districts, { ...s, hpcLever: false });
    const street = (r: (typeof results)[number]) => {
      const st = r.steps.find((x) => x.key === 'uc-street')!;
      return st.value * r.streetFactorLocal; // street BEV
    };
    const sb = results.reduce((a, r) => a + street(r), 0);
    const sbOverF = results.reduce((a, r) => a + street(r) / r.streetFactorLocal, 0);
    expect(sb / sbOverF).toBeCloseTo(2.8, 6);
    expect(results[2].streetFactorLocal).toBeGreaterThan(results[0].streetFactorLocal);
  });

  it('lets HPC points relieve at most 38 % of street demand', () => {
    const off = computeBottomUp(districts, { ...s, hpcLever: false, calibrate: false }).results[2];
    const on = computeBottomUp(districts, { ...s, hpcLever: true, calibrate: false }).results[2];
    const streetOff = off.steps.find((x) => x.key === 'uc-street')!.value;
    const streetOn = on.steps.find((x) => x.key === 'uc-street')!.value;
    expect(on.hpcRelief).toBeGreaterThan(0);
    expect(streetOn).toBeGreaterThanOrEqual(streetOff * 0.62 - 1e-9);
  });

  it('adds fleet demand and cuts cars most where transit is best', () => {
    const noFleet = computeBottomUp(districts, { ...s, fleetPublic: 0 }).results;
    const fleet = computeBottomUp(districts, { ...s, fleetPublic: 0.3 }).results;
    expect(fleet[0].publicBev).toBeGreaterThan(noFleet[0].publicBev);
    const cut = computeBottomUp(districts, { ...s, carReduction: 0.2 }).results;
    expect(cut[2].carReduction).toBeCloseTo(0.2, 6);
    expect(cut[0].carReduction).toBeCloseTo(0, 6);
  });
});
