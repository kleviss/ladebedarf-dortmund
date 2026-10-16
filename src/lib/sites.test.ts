import { describe, expect, it } from 'vitest';
import { defaultWeights, factorsOf, scoreSites, sitesByDistrict, type SiteSpot } from './sites';

const spot = (over: Partial<SiteSpot>): SiteSpot => ({
  id: 1,
  ubz: '001',
  kind: 'lot',
  name: null,
  capacity: null,
  source: 'OSM',
  distance: 600,
  cover: 2,
  buildings225: 230,
  carDensity: 3000,
  ...over,
});

describe('site factors', () => {
  it('rewards a gap in coverage, but only past 100 m', () => {
    expect(factorsOf(spot({ distance: 50, buildings225: 0 })).proximity).toBe(0);
    expect(factorsOf(spot({ distance: 600, buildings225: 0 })).proximity).toBeCloseTo(0.6);
  });

  it('treats a nearby charger as evidence of a grid connection', () => {
    expect(factorsOf(spot({ distance: 400, buildings225: 0 })).grid).toBeCloseTo(0.6);
    expect(factorsOf(spot({ distance: 1200, buildings225: 0 })).grid).toBe(0);
  });

  it('prefers off-street sites and known capacity', () => {
    expect(factorsOf(spot({ kind: 'garage' })).feasibility).toBe(1);
    expect(factorsOf(spot({ kind: 'street' })).feasibility).toBe(0.5);
    expect(factorsOf(spot({ capacity: 50 })).parking).toBe(0.5);
  });
});

describe('scoreSites', () => {
  it('is the weighted mean of the factors and ignores zero weights', () => {
    const [s] = scoreSites([spot({ kind: 'garage', capacity: 200 })], { ...defaultWeights, proximity: 0, density: 0, grid: 0 });
    expect(s.score).toBeCloseTo(1); // feasibility 1, parking 1
  });

  it('groups the best sites per district', () => {
    const sites = scoreSites([spot({ id: 1 }), spot({ id: 2, distance: 50 }), spot({ id: 3, ubz: '002' })], defaultWeights);
    const by = sitesByDistrict(sites, 1);
    expect(by.get('001')!.candidates).toBe(2);
    expect(by.get('001')!.best[0].id).toBe(1);
  });
});
