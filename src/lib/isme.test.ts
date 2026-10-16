import { describe, expect, it } from 'vitest';
import { cityBev, computeAll, defaultScenario, pointsFor, type District, type Scenario, totalsOf, touristShares } from './isme';

// Expected values are cells from "Berechnungsmethode ISME.xlsx", sheet Tabelle1.

describe('cityBev reproduces the ISME Excel', () => {
  it('2030, 15 % BEV (column F)', () => {
    const b = cityBev({ year: 2030, bevShare: 0.15 });
    expect(b.residents).toBeCloseTo(43717.65, 2); // F6
    expect(b.commuters).toBeCloseTo(14910, 2); // F7
    expect(b.overnightTourists).toBeCloseTo(379.6438, 3); // F10
    // F9 is typed in as 9936; the formula gives 9936.99
    expect(b.dayTourists).toBeCloseTo(9936.99, 1);
    expect(b.total).toBeCloseTo(68943.29, -1); // F11, within the rounding of F9
  });

  it('2036, 30 % BEV (column G)', () => {
    const b = cityBev({ year: 2036, bevShare: 0.3 });
    expect(b.residents).toBeCloseTo(90730.5, 2); // G16
    expect(b.commuters).toBeCloseTo(29820, 2); // G17
    expect(b.tourists).toBeCloseTo(20633.26, 2); // G18
    expect(b.total).toBeCloseTo(141183.76, 2); // G22
  });
});

describe('pointsFor', () => {
  const bev2036 = cityBev({ year: 2036, bevShare: 0.3 }).total;

  it('ratio method matches rows 24–26', () => {
    expect(pointsFor(bev2036, { ...defaultScenario, method: 'ratio', ratio: 11 }).total).toBeCloseTo(12834.89, 2); // G24
    expect(pointsFor(bev2036, { ...defaultScenario, method: 'ratio', ratio: 20 }).total).toBeCloseTo(7059.19, 2); // G26
  });

  it('street space matches rows 44 and 47', () => {
    const street: Scenario = { ...defaultScenario, method: 'usecase', scope: 'street' };
    expect(pointsFor(bev2036, street).total).toBeCloseTo(10185.4, 1); // G44
    expect(pointsFor(bev2036, { ...street, streetFactor: 5 }).total).toBeCloseTo(5703.82, 1); // G47
  });

  it('public scope adds car parks, customer parking and HPC hubs', () => {
    const r = pointsFor(1000, { ...defaultScenario, scope: 'public' });
    expect(r.byUseCase.map((x) => x.uc.key)).toEqual(['carpark', 'customer', 'hpc', 'street']);
    expect(r.total).toBeCloseTo(1000 * (0.026 / 2.94 + 0.103 / 4.08 + 0.039 / 19.1 + 0.202 / 2.8), 6);
  });
});

describe('computeAll per Unterbezirk (city-wide ISME spread)', () => {
  const ismeDefault: Scenario = { ...defaultScenario, model: 'isme' };
  const d = (ubz: string, privateCars: number, commercialCars: number, chargers: number): District => ({
    ubz,
    name: ubz,
    stadtbezirk: '',
    areaKm2: 1,
    privateCars,
    privateEvs: privateCars / 50,
    privateNewEvs: 0,
    commercialCars,
    commercialEvs: 0,
    commercialNewEvs: 0,
    totalEvs: privateCars / 50,
    chargers,
  });
  const districts = [d('001', 3000, 900, 2), d('002', 1000, 100, 0)];

  it('distributes exactly the city-wide BEV and charging points', () => {
    const { results, city, cityPoints } = computeAll(districts, ismeDefault);
    expect(results.reduce((a, r) => a + r.bev, 0)).toBeCloseTo(city.total, 6);
    expect(results.reduce((a, r) => a + r.needed, 0)).toBeCloseTo(cityPoints, 6);
  });

  it('falls back to commercial cars when land and POI data are missing', () => {
    const { results, city } = computeAll(districts, ismeDefault);
    expect(results[0].bevResidents).toBeCloseTo(city.residents * 0.75, 6);
    expect(results[0].bevCommuters).toBeCloseTo(city.commuters * 0.9, 6);
    expect(results[0].bevTourists).toBeCloseTo(city.tourists * 0.9, 6);
  });

  it('spreads commuters by commercial land and tourists by POIs, as in the report', () => {
    const enriched = [
      { ...districts[0], commercialHa: 10, poisShopping: 1, poisLeisure: 0 },
      { ...districts[1], commercialHa: 30, poisShopping: 2, poisLeisure: 1 },
    ];
    const { results, city } = computeAll(enriched, ismeDefault);
    expect(results[0].bevCommuters).toBeCloseTo(city.commuters * 0.25, 6);
    expect(results[0].bevTourists).toBeCloseTo(city.tourists * 0.25, 6);
    expect(results.reduce((a, r) => a + r.bev, 0)).toBeCloseTo(city.total, 6);
  });

  it('subtracts existing points and never returns a negative gap', () => {
    // two test districts carry the whole city's demand, so the stock has to be huge
    const { results } = computeAll(districts, { ...ismeDefault, pointsPerSite: 100000 });
    expect(results[0].existing).toBe(200000);
    expect(results[0].gap).toBe(0);
    expect(results[1].gap).toBeCloseTo(results[1].needed, 6);
  });
});

describe('touristShares', () => {
  const d = (ubz: string, over: Partial<District>): District => ({
    ubz,
    name: ubz,
    stadtbezirk: '',
    areaKm2: 1,
    privateCars: 100,
    privateEvs: 0,
    privateNewEvs: 0,
    commercialCars: 10,
    commercialEvs: 0,
    commercialNewEvs: 0,
    totalEvs: 0,
    chargers: 0,
    ...over,
  });
  const a = d('001', { attractions: 3, poisShopping: 10, poisLeisure: 0, hotels: 1 });
  const b = d('002', { attractions: 1, poisShopping: 30, poisLeisure: 0, hotels: 3 });
  const t = totalsOf([a, b]);

  it('spreads day tourists half by attractions, half by POIs, and overnight guests by hotels', () => {
    const sh = touristShares(a, { touristKey: 'mixed' }, t);
    expect(sh.day).toBeCloseTo(0.5 * 0.75 + 0.5 * 0.25, 9);
    expect(sh.overnight).toBeCloseTo(0.25, 9);
    expect(sh.dayBasis).toBe('mixed');
  });

  it('falls back to POIs when attractions and hotels are missing', () => {
    const plain = [d('001', { poisShopping: 1 }), d('002', { poisShopping: 3 })];
    const sh = touristShares(plain[0], { touristKey: 'mixed' }, totalsOf(plain));
    expect(sh.day).toBeCloseTo(0.25, 9);
    expect(sh.overnight).toBeCloseTo(0.25, 9);
  });

  it('keeps the Excel overnight stays in the ISME model and uses 2024 in bottom-up', () => {
    const isme = cityBev({ year: 2030, bevShare: 0.15, model: 'isme', overnightStays: 1583100 });
    const bu = cityBev({ year: 2030, bevShare: 0.15, model: 'bottomup', overnightStays: 1583100 });
    expect(isme.overnightTourists).toBeCloseTo(379.6438, 3);
    expect(bu.overnightTourists).toBeCloseTo((1583100 * 0.62 * 0.15) / 365, 6);
  });
});
