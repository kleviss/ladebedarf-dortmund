// Bottom-up ISME: the city's method, but every city-wide assumption that varies
// by neighbourhood is replaced with that Unterbezirk's own data.
//
//   1 Private parking   ISME assumes 52 % of BEV charge at home (8 % detached houses,
//                       44 % apartment blocks with parking). Here each district gets its
//                       own home share from its mix of dwellings in detached houses (EFH)
//                       and apartment blocks (MFH), from ALKIS building function + storeys.
//   2 Sharing factor    ISME uses 2.8 BEV per street charging point everywhere. Here
//                       residential districts get a low factor (cars park overnight) and
//                       commercial districts a high one (short stays), from the ALKIS mix.
//   3 HPC lever         ISME: fast chargers can cut AC demand by up to 38 %. Here existing
//                       HPC points (≥ 100 kW, OSM) in a district absorb street demand there,
//                       19.1 BEV per HPC point, capped at 38 % of the district's street demand.
//   4 Fleets            ISME counts private cars only. Here commercial cars per district
//                       (city statistics) add BEV, a share of which needs public charging.
//   5 Mobility          ISME shows a 20 % car reduction as a scenario. Here the reduction is
//                       scaled by public-transport access: full in well-served districts,
//                       close to none in districts far from rail.
//
// With calibration on (default), 1 and 2 are scaled so the city-wide averages match ISME
// (52 % home charging, 2.8 BEV per street point): the bottom-up model then redistributes
// the ISME demand by local conditions instead of changing its total. 3–5 change the total
// on purpose. Visitors follow the ISME report's Sankey instead of the Excel's uniform split:
// tourists charge only in public, commuters mostly at their employer.

import {
  ISME,
  cityBev,
  fmt,
  pct,
  totalsOf,
  touristFormula,
  touristShares,
  useCasesFor,
  type CityBev,
  type District,
  type DistrictResult,
  type Scenario,
  type Step,
  type UseCase,
} from './isme';

/** Excel B5: private cars the 2030 projection starts from. */
export const BASE_PRIVATE_CARS = 269745;
const ISME_HOME_SHARE = 0.52; // EFH 8 % + MFH 44 %
const ISME_EMPLOYER_SHARE = 0.11;
const HPC_MAX_RELIEF = 0.38; // ISME Minderbedarfsfaktor I
const HPC_BEV_PER_POINT = 19.1;
/**
 * Commuters charge mostly at their employer. ISME report, table 5 / chapter 5.6: commuters
 * take 107 of 5,567 street points at 18 % BEV = 107 × 2.8 / 4,491 BEV ≈ 6.7 % in street space.
 * Street is 20.2 / 37 of all public charging, so ≈ 12 % of commuter BEV charge publicly.
 */
const COMMUTER_PUBLIC = (107 * 2.8) / 4491 / (0.202 / 0.37);

export interface BottomUpDetail {
  transitScore: number;
  carReduction: number;
  efhShare: number;
  homeShare: number;
  fleetBev: number;
  publicBev: number;
  hpcRelief: number;
  streetFactorLocal: number;
}

export type BottomUpResult = DistrictResult & BottomUpDetail;

export interface Calibration {
  /** Home-charging share in apartment blocks that makes the city average 52 % */
  homeMfh: number;
  /** Scale applied to the local sharing factors so their mean is the ISME street factor */
  sharingScale: number;
}

/** 0 for the lowest value, 1 for the highest; ties share their average rank. */
export function percentiles(values: number[]): number[] {
  const n = values.length;
  if (n < 2) return values.map(() => 0.5);
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(n);
  for (let i = 0; i < n; ) {
    let j = i;
    while (j + 1 < n && order[j + 1][0] === order[i][0]) j++;
    const rank = (i + j) / 2 / (n - 1);
    for (let k = i; k <= j; k++) out[order[k][1]] = rank;
    i = j + 1;
  }
  return out;
}

const efhShareOf = (d: District) => {
  const e = d.dwellingsEfh ?? 0;
  const m = d.dwellingsMfh ?? 0;
  return e + m > 0 ? e / (e + m) : null;
};

const commerceMixOf = (d: District) => {
  const c = (d.commerceBuildings ?? 0) + (d.industryBuildings ?? 0);
  const r = d.residentialBuildings ?? 0;
  return c + r > 0 ? c / (c + r) : 0;
};

export function computeBottomUp(
  districts: District[],
  s: Scenario,
): { results: BottomUpResult[]; city: CityBev; cityPoints: number; calibration: Calibration } {
  const city = cityBev(s);
  const t = totalsOf(districts);
  const growth = ISME.cars[s.year] / BASE_PRIVATE_CARS;
  const transit = percentiles(districts.map((d) => d.transitShare ?? 0));
  const commerce = percentiles(districts.map(commerceMixOf));
  const cityEfh = (() => {
    const e = districts.reduce((a, d) => a + (d.dwellingsEfh ?? 0), 0);
    const m = districts.reduce((a, d) => a + (d.dwellingsMfh ?? 0), 0);
    return e + m > 0 ? e / (e + m) : 0.3;
  })();

  const useCases = useCasesFor(s);
  const publicCases = useCases.filter((u) => u.access === 'public');
  const publicTotalShare = publicCases.reduce((a, u) => a + u.share, 0);

  // --- pass 1: BEV per group, before calibration ---
  const pre = districts.map((d, i) => {
    const carReduction = s.carReduction * transit[i];
    const cars = d.privateCars * growth * (1 - carReduction);
    const bevResidents = cars * s.bevShare;
    const efhShare = efhShareOf(d) ?? cityEfh;
    const commuterShare =
      s.commuterKey === 'commercialArea' && t.commercialHa > 0
        ? (d.commercialHa ?? 0) / t.commercialHa
        : t.commercialCars > 0
          ? d.commercialCars / t.commercialCars
          : 0;
    const tourist = touristShares(d, s, t);
    const bevCommuters = city.commuters * commuterShare;
    const bevTourists = city.dayTourists * tourist.day + city.overnightTourists * tourist.overnight;
    const fleetBev = d.commercialCars * growth * s.bevShare;
    return { d, carReduction, bevResidents, efhShare, commuterShare, tourist, bevCommuters, bevTourists, fleetBev, transit: transit[i], commerce: commerce[i] };
  });

  // --- calibration 1: home share in apartment blocks ---
  const maxHome = 1 - ISME_EMPLOYER_SHARE;
  const homeEfh = Math.min(s.homeEfh, maxHome);
  let homeMfh = s.homeMfh;
  if (s.calibrate) {
    const sumB = pre.reduce((a, p) => a + p.bevResidents, 0);
    const sumBEfh = pre.reduce((a, p) => a + p.bevResidents * p.efhShare, 0);
    const sumBMfh = sumB - sumBEfh;
    homeMfh = sumBMfh > 0 ? (ISME_HOME_SHARE * sumB - homeEfh * sumBEfh) / sumBMfh : s.homeMfh;
  }
  homeMfh = Math.min(maxHome, Math.max(0, homeMfh));

  // --- pass 2: public BEV, HPC relief, street BEV ---
  const mid = pre.map((p) => {
    const homeShare = Math.min(maxHome, p.efhShare * homeEfh + (1 - p.efhShare) * homeMfh);
    const residentsPublic = p.bevResidents * (1 - homeShare - ISME_EMPLOYER_SHARE);
    const commutersPublic = p.bevCommuters * COMMUTER_PUBLIC;
    const touristsPublic = p.bevTourists;
    const fleetPublic = p.fleetBev * s.fleetPublic;
    const publicBev = residentsPublic + commutersPublic + touristsPublic + fleetPublic;
    const byCase = publicCases.map((uc) => ({ uc, bev: (publicBev * uc.share) / publicTotalShare }));
    const street = byCase.find((x) => x.uc.key === 'street')!;
    const hpcRelief = s.hpcLever ? Math.min((p.d.hpcPoints ?? 0) * HPC_BEV_PER_POINT, HPC_MAX_RELIEF * street.bev) : 0;
    street.bev -= hpcRelief;
    const localFactor = s.sharingRes + (s.sharingCom - s.sharingRes) * p.commerce;
    return { ...p, homeShare, residentsPublic, commutersPublic, touristsPublic, fleetPublic, publicBev, byCase, hpcRelief, streetBev: street.bev, localFactor };
  });

  // --- calibration 2: sharing factors so their (street-BEV weighted, harmonic) mean is the ISME factor ---
  let sharingScale = 1;
  if (s.calibrate) {
    const sb = mid.reduce((a, m) => a + m.streetBev, 0);
    const sbOverF = mid.reduce((a, m) => a + m.streetBev / m.localFactor, 0);
    if (sb > 0 && sbOverF > 0) sharingScale = s.streetFactor * (sbOverF / sb);
  }

  const results = mid.map<BottomUpResult>((m) => {
    const d = m.d;
    const streetFactorLocal = m.localFactor * sharingScale;
    const points = m.byCase.map((x) => ({
      uc: x.uc,
      bev: x.bev,
      factor: x.uc.key === 'street' ? streetFactorLocal : x.uc.evsPerPoint,
      points: x.bev / (x.uc.key === 'street' ? streetFactorLocal : x.uc.evsPerPoint),
    }));
    const counted = points.filter((x) => (s.scope === 'street' ? x.uc.key === 'street' : true));
    const needed = counted.reduce((a, x) => a + x.points, 0);
    const existing = d.chargers * s.pointsPerSite;
    const gap = Math.max(0, needed - existing);
    const carsToday = d.privateCars + d.commercialCars;
    const bev = m.bevResidents + m.bevCommuters + m.bevTourists + m.fleetBev;

    const steps: Step[] = [
      {
        key: 'cars',
        label: 'Pkw heute (privat + gewerblich)',
        value: carsToday,
        unit: 'Pkw',
        formula: `${fmt(d.privateCars)} privat, ${fmt(d.commercialCars)} gewerblich; ${fmt(d.totalEvs)} E-Pkw (${pct(carsToday > 0 ? d.totalEvs / carsToday : 0, 1)})`,
        source: 'city-data',
      },
      {
        key: 'transit',
        label: 'Verkehrswende: weniger Pkw',
        value: m.carReduction * 100,
        unit: '%',
        formula:
          s.carReduction > 0
            ? `${pct(s.carReduction)} × ÖPNV-Rang ${pct(m.transit)} (${pct(d.transitRail ?? 0)} der Wohngebäude ≤ 600 m zur Schiene)`
            : 'aus (Regler „Verkehrswende“)',
        source: 'assumption',
      },
      {
        key: 'bevResidents',
        label: `BEV Einwohner*innen ${s.year}`,
        value: m.bevResidents,
        unit: 'BEV',
        formula: `${fmt(d.privateCars)} private Pkw × ${fmt(growth, 3)} Wachstum × (1 − ${pct(m.carReduction, 1)}) × ${pct(s.bevShare)} BEV`,
        source: 'isme',
      },
      {
        key: 'home',
        label: 'Laden zu Hause',
        value: m.homeShare * 100,
        unit: '%',
        formula: `${pct(m.efhShare)} der Wohnungen in Ein-/Zweifamilienhäusern × ${pct(homeEfh)} + Mehrfamilienhäuser × ${pct(homeMfh)}${s.calibrate ? ' (kalibriert auf ISME 52 %)' : ''}`,
        source: 'city-data',
      },
      {
        key: 'residentsPublic',
        label: 'Einwohner*innen, öffentlich ladend',
        value: m.residentsPublic,
        unit: 'BEV',
        formula: `BEV × (1 − ${pct(m.homeShare)} zu Hause − 11 % Arbeitgeber)`,
        source: 'result',
        indent: true,
      },
      {
        key: 'commutersPublic',
        label: 'Einpendelnde, öffentlich ladend',
        value: m.commutersPublic,
        unit: 'BEV',
        formula: `${fmt(m.bevCommuters, 1)} BEV (${pct(m.commuterShare, 2)} der Pendelnden) × ${pct(COMMUTER_PUBLIC)} öffentlich, Rest beim Arbeitgeber (ISME-Gutachten)`,
        source: 'isme',
        indent: true,
      },
      {
        key: 'touristsPublic',
        label: 'Tourismus, öffentlich ladend',
        value: m.touristsPublic,
        unit: 'BEV',
        formula: `${touristFormula(d, city, m.tourist)}; Gäste laden nicht zu Hause`,
        source: 'isme',
        indent: true,
      },
      {
        key: 'fleetPublic',
        label: 'Gewerbeflotten, öffentlich ladend',
        value: m.fleetPublic,
        unit: 'BEV',
        formula: `${fmt(d.commercialCars)} gewerbliche Pkw × ${fmt(growth, 3)} × ${pct(s.bevShare)} × ${pct(s.fleetPublic)} öffentlich`,
        source: 'assumption',
        indent: true,
      },
      {
        key: 'hpcRelief',
        label: 'Entlastung durch HPC im Bezirk',
        value: m.hpcRelief,
        unit: 'BEV',
        formula: s.hpcLever
          ? `${fmt(d.hpcPoints ?? 0)} HPC-LP × 19,1 BEV, höchstens 38 % des Straßenbedarfs`
          : 'aus (Schalter „HPC-Entlastung“)',
        source: 'isme',
      },
      ...points.map<Step>((x) => ({
        key: `uc-${x.uc.key}`,
        label: x.uc.label,
        value: x.points,
        unit: 'LP',
        formula: `${fmt(x.bev, 1)} BEV ÷ ${fmt(x.factor, 2)} BEV je LP${x.uc.key === 'street' ? ` (Mischung Wohnen/Gewerbe: Rang ${pct(m.commerce)})` : ''}`,
        source: x.uc.key === 'street' ? 'city-data' : 'isme',
        indent: true,
      })),
      {
        key: 'needed',
        label: s.scope === 'street' ? 'Benötigte LP im Straßenraum' : 'Benötigte öffentlich zugängliche LP',
        value: needed,
        unit: 'LP',
        formula: s.scope === 'street' ? 'nur Straßenraum' : 'Summe der öffentlichen Lade-Use-Cases',
        source: 'result',
      },
      {
        key: 'existing',
        label: 'Vorhandene Ladepunkte',
        value: existing,
        unit: 'LP',
        formula: `${fmt(d.chargers)} Standorte (Bestand Stadt) × ${fmt(s.pointsPerSite)} LP je Standort`,
        source: s.pointsPerSite === 1 ? 'city-data' : 'assumption',
      },
      { key: 'gap', label: 'Fehlende Ladepunkte', value: gap, unit: 'LP', formula: 'Bedarf − Bestand, mindestens 0', source: 'result' },
    ];

    return {
      ...d,
      cars: carsToday,
      evShareToday: carsToday > 0 ? d.totalEvs / carsToday : 0,
      bevResidents: m.bevResidents,
      bevCommuters: m.bevCommuters,
      bevTourists: m.bevTourists,
      bev,
      needed,
      existing,
      gap,
      gapPer1000Cars: carsToday > 0 ? (gap / carsToday) * 1000 : 0,
      coverage: needed > 0 ? Math.min(existing / needed, 9.99) : 0,
      steps,
      transitScore: m.transit,
      carReduction: m.carReduction,
      efhShare: m.efhShare,
      homeShare: m.homeShare,
      fleetBev: m.fleetBev,
      publicBev: m.publicBev,
      hpcRelief: m.hpcRelief,
      streetFactorLocal,
    };
  });

  return { results, city, cityPoints: results.reduce((a, r) => a + r.needed, 0), calibration: { homeMfh, sharingScale } };
}

export type { UseCase };
