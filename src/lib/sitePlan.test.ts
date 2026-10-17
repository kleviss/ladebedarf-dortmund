import { describe, expect, it } from 'vitest';
import sitesJson from '../../public/data/model/sites.json?raw';
import {
  address,
  levelFor,
  onSiteChecks,
  paramsForLevel,
  parseSitePlan,
  siteNotes,
  sitesCsv,
  sitesOf,
  type RawSitePlan,
  type SiteCandidate,
  type SitePlan,
} from './sitePlan';

const candidate = (over: Partial<SiteCandidate> = {}): SiteCandidate => ({
  lon: 7.465,
  lat: 51.512,
  ubz: '011',
  kind: 'kerb',
  street: 'Kampstraße',
  no: 26,
  mainRoad: false,
  bayNear: false,
  monument: false,
  lamp: false,
  roadworks: null,
  ...over,
});

const plan: SitePlan = {
  pointsPerStation: 2,
  radius: { residents: 225, commuters: 500, visitors: 375 },
  candidates: {
    '1': candidate(),
    '2': candidate({ lon: 7.47, kind: 'lot', street: 'Hansastraße', no: null, lamp: true }),
    '3': candidate({ lon: 7.48, monument: true, roadworks: 'Kanal (2026-11-01 – 2026-12-01)' }),
  },
  levels: [
    { key: 'today', label: 'Today', share: 0.0422, today: true, stations: [[2, 2, 1, 2.1, 'c'], [1, 1, 2, 5.6, 'r']], unplaced: {} },
    { key: 'e10', label: '10 %', share: 0.1, today: false, stations: [[1, 1, 2, 9, 'v'], [2, 2, 2, 8, 'r'], [3, 3, 2, 7, 'r']], unplaced: {} },
    { key: 'e18', label: '18 %', share: 0.18, today: false, stations: [], unplaced: {} },
  ],
};

describe('site plan', () => {
  it('picks the level that matches the EV basis', () => {
    expect(levelFor(plan, { bevMode: 'today', bevShareScenario: 0.18 })).toMatchObject({ level: { key: 'today' }, exact: true });
    expect(levelFor(plan, { bevMode: 'scenario', bevShareScenario: 0.18 })).toMatchObject({ level: { key: 'e18' }, exact: true });
    expect(levelFor(plan, { bevMode: 'scenario', bevShareScenario: 0.11 })).toMatchObject({ level: { key: 'e10' }, exact: false });
    expect(paramsForLevel(plan.levels[1])).toEqual({ bevMode: 'scenario', bevShareScenario: 0.1 });
    expect(paramsForLevel(plan.levels[0])).toEqual({ bevMode: 'today' });
  });

  it('joins stations with their candidates in rank order, split into thirds', () => {
    const today = sitesOf(plan, plan.levels[0]);
    expect(today.map((s) => s.rank)).toEqual([1, 2]);
    expect(today[0]).toMatchObject({ street: 'Kampstraße', points: 2, group: 'r', id: '51.51200,7.46500' });
    expect(sitesOf(plan, plan.levels[1]).map((s) => s.tier)).toEqual([0, 1, 2]);
  });

  it('labels addresses and lists notes and on-site checks', () => {
    expect(address(candidate())).toBe('Kampstraße 26');
    expect(address(candidate({ kind: 'lot', no: null }))).toBe('Public car park, Kampstraße');
    expect(siteNotes(plan.candidates['3']).map((n) => n.id)).toEqual(['monument', 'roadworks']);
    expect(siteNotes(plan.candidates['2'])[0].status).toBe('option');
    expect(onSiteChecks({ kind: 'kerb' }).map((c) => c.id)).toEqual(['pavement', 'grid', 'signs']);
    expect(onSiteChecks({ kind: 'lot' }).map((c) => c.id)).toContain('owner');
  });

  it('exports the list as CSV with quoted fields', () => {
    const sites = sitesOf(plan, plan.levels[1]);
    const csv = sitesCsv(sites, plan.levels[1], new Map([['011', 'City-Ost / City-West']]), { [sites[0].id]: ['pavement'] }).split('\n');
    expect(csv).toHaveLength(4);
    expect(csv[1]).toContain('Kampstraße 26');
    expect(csv[1]).toContain('pavement');
    expect(csv[3]).toContain(',Listed monument within 25 m: involve the heritage authority | Planned roadworks');
    const quoted = sitesCsv([{ ...sites[0], street: 'A, B' }], plan.levels[1], new Map(), {}).split('\n');
    expect(quoted[1]).toContain('"A, B 26"');
  });

  it('matches the built file: every station has a candidate and districts get their missing points', () => {
    const built = parseSitePlan(JSON.parse(sitesJson) as RawSitePlan);
    expect(built.levels.map((l) => l.key)).toEqual(['today', 'e10', 'e18', 'e20', 'e30', 'e40', 'e50', 'e60', 'e70', 'e80', 'e90', 'e100']);
    for (const level of built.levels) {
      const sites = sitesOf(built, level);
      expect(sites.every((s) => s.lat > 51.4 && s.lat < 51.61 && s.lon > 7.3 && s.lon < 7.65)).toBe(true);
      expect(sites.map((s) => s.rank)).toEqual(sites.map((_, i) => i + 1));
      expect(new Set(sites.map((s) => s.id)).size).toBe(sites.length);
    }
    const counts = built.levels.map((l) => l.stations.length);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    expect(Object.values(built.candidates).some((c) => c.lamp)).toBe(true);
  });

  it('decodes candidate arrays and flag bits', () => {
    const raw: RawSitePlan = {
      ...plan,
      candidateFields: ['lon', 'lat', 'ubz', 'kind', 'street', 'no', 'flags', 'roadworks'],
      flags: { mainRoad: 1, bayNear: 2, monument: 4, lamp: 8 },
      candidates: { '7': [7.4, 51.5, '011', 'lot', null, null, 9, 'Kanal'] },
    };
    expect(parseSitePlan(raw).candidates['7']).toEqual(
      candidate({ lon: 7.4, lat: 51.5, kind: 'lot', street: null, no: null, mainRoad: true, lamp: true, roadworks: 'Kanal' }),
    );
  });
});
