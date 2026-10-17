import { describe, expect, it } from 'vitest';
import { applyBonus, bonusDefaults, bonusEffect, type BonusDistrict } from './bonus';
import type { FactorResult } from './factors';
import type { DistrictResult } from './isme';

const fp = { evsPerStreetPoint: 2.8, residentsStreetShare: 0.4, commuterStreetShare: 0.07 };
const factor = (o: Partial<FactorResult>): FactorResult =>
  ({ ubz: '001', residents: 8, commuters: 2, tourists: 0, needed: 10, existing: 0, ...o }) as FactorResult;
const district = (o: Partial<BonusDistrict>): BonusDistrict => ({
  ubz: '001',
  supermarkets: 0,
  supermarketsWithParking: 0,
  commercialHa: 0,
  commercialLots: 0,
  commercialSpaces: 0,
  priorityLots: 0,
  priorityGarages: 0,
  prioritySpaces: 0,
  ...o,
});

describe('bonusEffect', () => {
  it('changes nothing with every scenario off', () => {
    const e = bonusEffect(factor({}), district({ supermarketsWithParking: 3, prioritySpaces: 500 }), bonusDefaults, fp, 0.18);
    expect(e.before).toBe(10);
    expect(e.after).toBe(10);
  });

  it('lets a supermarket take 20 % of 10 missing points: 2 there, 8 left in street space', () => {
    const e = bonusEffect(factor({}), district({ supermarketsWithParking: 1 }), { ...bonusDefaults, supermarket: true }, fp, 0.18);
    expect(e.supermarket.points).toBe(10);
    expect(e.supermarket.takes).toBe(2);
    expect(e.after).toBe(8);
  });

  it('caps what supermarkets take at their charging points', () => {
    const e = bonusEffect(factor({ needed: 100, residents: 100 }), district({ supermarketsWithParking: 1 }), { ...bonusDefaults, supermarket: true, absorbShare: 1 }, fp, 0.18);
    expect(e.supermarket.takes).toBe(10);
    expect(e.after).toBe(90);
  });

  it('counts only EV drivers on new points at buildings in the priority area', () => {
    // 500 spaces × 20 % = 100 points, but only 500 × 4 % = 20 EVs use them
    const e = bonusEffect(factor({ needed: 20, residents: 20 }), district({ prioritySpaces: 500 }), { ...bonusDefaults, priority: true }, fp, 0.04);
    expect(e.priority.points).toBe(100);
    expect(e.priority.evs).toBe(20);
    expect(e.priority.relief).toBeCloseTo((20 * 0.4) / 2.8);
    expect(e.after).toBe(Math.ceil(20 - (20 * 0.4) / 2.8));
  });

  it('never relieves more than the group needs', () => {
    const e = bonusEffect(factor({ needed: 3, residents: 1, commuters: 2 }), district({ prioritySpaces: 5000, commercialSpaces: 5000 }), { ...bonusDefaults, priority: true, commercial: true }, fp, 0.5);
    expect(e.priority.relief).toBe(1);
    expect(e.commercial.relief).toBe(2);
    expect(e.after).toBe(0);
  });

  it('applies the supermarkets to what is left after the other scenarios', () => {
    const p = { ...bonusDefaults, supermarket: true, priority: true };
    const e = bonusEffect(factor({ needed: 20, residents: 20 }), district({ prioritySpaces: 500, supermarketsWithParking: 2 }), p, fp, 0.18);
    expect(e.middle).toBeLessThan(e.before);
    expect(e.supermarket.takes).toBe(Math.round(0.2 * e.middle));
    expect(e.after).toBe(e.middle - e.supermarket.takes);
  });
});

describe('applyBonus', () => {
  it('lowers missing and required points and keeps the value before', () => {
    const r = { needed: 10, existing: 0, gap: 10, cars: 1000 } as DistrictResult;
    const e = bonusEffect(factor({}), district({ supermarketsWithParking: 1 }), { ...bonusDefaults, supermarket: true }, fp, 0.18);
    const out = applyBonus(r, e);
    expect(out.gap).toBe(8);
    expect(out.gapBefore).toBe(10);
    expect(out.needed).toBe(8);
  });
});
