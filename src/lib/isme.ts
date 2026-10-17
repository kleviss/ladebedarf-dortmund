// ISME method of the City of Dortmund ("Berechnungsmethode ISME.xlsx", sheet
// Tabelle1, plus the report "Gutachten ISME", Dec 2023), made per Unterbezirk.
//
// City level, exactly as in the Excel:
//   BEV = cars(year) × BEV share            residents      (rows 5–6 / 15–16)
//       + 99,400 × BEV share                commuters      (row 7 / 17: 142,000 × 70 % by car)
//       + 24,180,000 × BEV share / 365      day tourists   (row 9 / 19: 39 M × 62 % by car)
//       + 923,800 × BEV share / 365         overnight      (row 10 / 20: 1.49 M × 62 % by car)
//   Charging points either
//       ratio method:     BEV / (11 | 15 | 20)                              (rows 24–26)
//       use-case method:  Σ BEV × use-case share / EVs per point            (rows 29–44)
//
// Per Unterbezirk (our addition, following the report's chapter 6.1):
//   residents' BEV are spread by private cars (or by today's private EVs),
//   commuters' BEV by commercial land (RVR land-use mapping, workplaces stand-in),
//   tourists' BEV by shopping and leisure points of interest (OSM), as in the report.
//   Commercial cars remain available as the earlier fallback for both.

import { computeBottomUp, type Calibration } from './bottomup';

export interface District {
  ubz: string;
  name: string;
  stadtbezirk: string;
  areaKm2: number;
  privateCars: number;
  privateEvs: number;
  privateNewEvs: number;
  commercialCars: number;
  commercialEvs: number;
  commercialNewEvs: number;
  totalEvs: number;
  chargers: number;
  /** Public parking areas (OSM + Open Data) in the district */
  parkingPublic?: number;
  /** … of which no charging location within 225 m */
  parkingUncovered?: number;
  /** Known spaces (OSM capacity is often missing) */
  parkingCapacity?: number;
  /** Multi-storey, underground and Park+Ride */
  parkingGarages?: number;
  /** OSM shops ("Einkaufen") */
  poisShopping?: number;
  /** OSM gastronomy, culture, sport, accommodation ("Freizeit") */
  poisLeisure?: number;
  /** Commercial/industrial land in hectares */
  commercialHa?: number;
  buildings?: number;
  /** Buildings within 225 m of a charging location */
  buildingsCovered?: number;
  /** Development plans, all / in force since 2015 */
  bplans?: number;
  bplansRecent?: number;
  // bottom-up factors (scripts/build-bottomup.mjs)
  efhBuildings?: number;
  mfhBuildings?: number;
  /** Estimated dwellings in detached / semi-detached houses (≤ 2 storeys) */
  dwellingsEfh?: number;
  /** Estimated dwellings in apartment blocks and mixed-use buildings */
  dwellingsMfh?: number;
  garages?: number;
  commerceBuildings?: number;
  industryBuildings?: number;
  residentialBuildings?: number;
  /** Share of residential buildings ≤ 600 m from rail (Stadtbahn, tram, station) */
  transitRail?: number;
  /** Share with only a bus stop ≤ 300 m */
  transitBus?: number;
  /** transitRail + 0.3 × transitBus */
  transitShare?: number;
  hpcSites?: number;
  hpcPoints?: number;
  // tourism (scripts/build-tourism.mjs)
  /** Sights, museums, event venues and the stadium (city lists) */
  attractions?: number;
  attractionNames?: string[];
  /** Hotels, guest houses, hostels (OSM) */
  hotels?: number;
  /** Hotels weighted 1–2 by attractions within 1.5 km (guests stay near what they visit) */
  hotelWeight?: number;
}

export type Year = 2030 | 2036;
export type Method = 'usecase' | 'ratio';
export type Scope = 'street' | 'public';
export type ResidentKey = 'cars' | 'evs';
export type CommuterKey = 'commercialArea' | 'commercialCars';
export type TouristKey = 'mixed' | 'pois' | 'commercialCars';
export type Model = 'bottomup' | 'isme';

export interface Scenario {
  /** bottomup: local factors per Unterbezirk; isme: city-wide ISME shares spread to districts */
  model: Model;
  year: Year;
  /** BEV share of the car stock, 0–1 (Excel columns: 5–50 %) */
  bevShare: number;
  method: Method;
  /** Ratio method: BEV per charging point (Excel: 11, 15, 20) */
  ratio: number;
  /** Use-case method: which charging points count as demand */
  scope: Scope;
  /** EVs per point in street space (Excel: 2.8, alternative 5 in row 47) */
  streetFactor: number;
  /** Customer parking share: 10.3 % per label, 1.3 % per the Excel formula */
  customerShare: number;
  /** How residents' BEV are spread to Unterbezirke */
  residentKey: ResidentKey;
  /** How commuters' BEV are spread */
  commuterKey: CommuterKey;
  /** How tourists' BEV are spread: mixed = day 50 % attractions + 50 % POIs, overnight by hotels */
  touristKey: TouristKey;
  /** Overnight stays per year for the bottom-up model (ISME Excel: 1,490,000 in 2023) */
  overnightStays: number;
  /** Charging points per location in the city's charger file */
  pointsPerSite: number;
  // --- bottom-up model ---
  /** Home-charging share for dwellings in detached / semi-detached houses */
  homeEfh: number;
  /** Home-charging share in apartment blocks (only used without calibration) */
  homeMfh: number;
  /** BEV per street point in the most residential / most commercial district */
  sharingRes: number;
  sharingCom: number;
  /** Scale home shares and sharing factors so the city averages match ISME */
  calibrate: boolean;
  /** Existing HPC points relieve street demand (≤ 38 %) */
  hpcLever: boolean;
  /** Share of commercial-fleet BEV that needs public charging */
  fleetPublic: number;
  /** Car reduction in the best-served district (scaled by transit access) */
  carReduction: number;
}

export interface UseCase {
  key: string;
  label: string;
  share: number;
  evsPerPoint: number;
  access: 'private' | 'public';
}

/** Excel B9/B10: share of tourists arriving by car (modal split, short holidays). */
export const TOURISM_CAR_SHARE = 0.62;

/** Constants from the ISME Excel. */
export const ISME = {
  cars: { 2030: 291451, 2036: 302435 } as Record<Year, number>, // C5, B15
  commuterCars: 99400, // B7: 142,000 in-commuters × 70 %
  dayTouristCars: 24180000, // B9: 39,000,000 × 62 %
  overnightTouristCars: 923800, // B10: 1,490,000 × 62 %
  useCases: [
    { key: 'efh', label: 'Einfamilienhaus mit Stellplatz', share: 0.08, evsPerPoint: 1.39, access: 'private' },
    { key: 'mfh', label: 'Mehrfamilienhaus mit Stellplatz', share: 0.44, evsPerPoint: 1.39, access: 'private' },
    { key: 'employer', label: 'Arbeitgeber', share: 0.11, evsPerPoint: 1.17, access: 'private' },
    { key: 'carpark', label: 'Öffentlich zugängliche Parkhäuser', share: 0.026, evsPerPoint: 2.94, access: 'public' },
    { key: 'customer', label: 'Kundenparkplätze inkl. POI-Destinationen', share: 0.103, evsPerPoint: 4.08, access: 'public' },
    { key: 'hpc', label: 'HPC-Hubs', share: 0.039, evsPerPoint: 19.1, access: 'public' },
    { key: 'street', label: 'Straßenraum', share: 0.202, evsPerPoint: 2.8, access: 'public' },
  ] satisfies UseCase[],
} as const;

export const defaultScenario: Scenario = {
  year: 2030,
  bevShare: 0.15,
  method: 'usecase',
  ratio: 15,
  scope: 'public',
  streetFactor: 2.8,
  customerShare: 0.103,
  residentKey: 'cars',
  commuterKey: 'commercialArea',
  touristKey: 'mixed',
  overnightStays: 1583100, // Open Data, Fremdenverkehr 2024
  pointsPerSite: 1,
  model: 'bottomup',
  homeEfh: 0.9,
  homeMfh: 0.45,
  sharingRes: 1.5,
  sharingCom: 5,
  calibrate: true,
  hpcLever: true,
  fleetPublic: 0.3,
  carReduction: 0,
};

export interface CityBev {
  residents: number;
  commuters: number;
  dayTourists: number;
  overnightTourists: number;
  tourists: number;
  total: number;
}

/** City-wide BEV per user group, Excel rows 5–11 / 15–22. */
export function cityBev(s: Pick<Scenario, 'year' | 'bevShare'> & Partial<Pick<Scenario, 'model' | 'overnightStays'>>): CityBev {
  const residents = ISME.cars[s.year] * s.bevShare;
  const commuters = ISME.commuterCars * s.bevShare;
  const dayTourists = (ISME.dayTouristCars * s.bevShare) / 365;
  // bottom-up uses the latest overnight stays; the ISME model keeps the Excel's 2023 figure
  const overnightCars = s.model === 'bottomup' && s.overnightStays ? s.overnightStays * TOURISM_CAR_SHARE : ISME.overnightTouristCars;
  const overnightTourists = (overnightCars * s.bevShare) / 365;
  const tourists = dayTourists + overnightTourists;
  return { residents, commuters, dayTourists, overnightTourists, tourists, total: residents + commuters + tourists };
}

export function useCasesFor(s: Scenario): UseCase[] {
  return ISME.useCases.map((u) => {
    if (u.key === 'street') return { ...u, evsPerPoint: s.streetFactor };
    if (u.key === 'customer') return { ...u, share: s.customerShare };
    return { ...u };
  });
}

/** Charging points for a BEV count, per the chosen method and scope. */
export function pointsFor(bev: number, s: Scenario): { total: number; byUseCase: { uc: UseCase; bev: number; points: number }[] } {
  if (s.method === 'ratio') return { total: bev / s.ratio, byUseCase: [] };
  const byUseCase = useCasesFor(s)
    .filter((uc) => (s.scope === 'street' ? uc.key === 'street' : uc.access === 'public'))
    .map((uc) => ({ uc, bev: bev * uc.share, points: (bev * uc.share) / uc.evsPerPoint }));
  return { total: byUseCase.reduce((a, x) => a + x.points, 0), byUseCase };
}

// --- per Unterbezirk ------------------------------------------------------------

export type SourceKind = 'city-data' | 'isme' | 'assumption' | 'result';

export interface Step {
  key: string;
  label: string;
  value: number;
  unit: string;
  formula: string;
  source: SourceKind;
  indent?: boolean;
}

export interface DistrictResult extends District {
  cars: number;
  evShareToday: number;
  bevResidents: number;
  bevCommuters: number;
  bevTourists: number;
  bev: number;
  needed: number;
  existing: number;
  gap: number;
  gapPer1000Cars: number;
  coverage: number;
  steps: Step[];
  /** missing points before the bonus scenarios, when they are applied */
  gapBefore?: number;
}

/** Stock-only estimate; no projected growth or additional visitor demand. */
export function computeCurrentDemand(d: District): DistrictResult {
  const needed = Math.ceil(pointsFor(d.totalEvs, defaultScenario).total);
  const existing = d.chargers;
  const gap = Math.max(0, needed - existing);
  const cars = d.privateCars + d.commercialCars;
  return {
    ...d,
    cars,
    evShareToday: cars > 0 ? d.totalEvs / cars : 0,
    bevResidents: d.privateEvs,
    bevCommuters: 0,
    bevTourists: 0,
    bev: d.totalEvs,
    needed,
    existing,
    gap,
    gapPer1000Cars: cars > 0 ? gap / cars * 1000 : 0,
    coverage: needed > 0 ? Math.min(existing / needed, 1) : 1,
    steps: [],
  };
}

export interface Totals {
  privateCars: number;
  privateEvs: number;
  commercialCars: number;
  totalEvs: number;
  chargers: number;
  commercialHa: number;
  pois: number;
  attractions: number;
  hotels: number;
  hotelWeight: number;
}

export function totalsOf(districts: District[]): Totals {
  return districts.reduce<Totals>(
    (t, d) => ({
      privateCars: t.privateCars + d.privateCars,
      privateEvs: t.privateEvs + d.privateEvs,
      commercialCars: t.commercialCars + d.commercialCars,
      totalEvs: t.totalEvs + d.totalEvs,
      chargers: t.chargers + d.chargers,
      commercialHa: t.commercialHa + (d.commercialHa ?? 0),
      pois: t.pois + poisOf(d),
      attractions: t.attractions + (d.attractions ?? 0),
      hotels: t.hotels + (d.hotels ?? 0),
      hotelWeight: t.hotelWeight + (d.hotelWeight ?? d.hotels ?? 0),
    }),
    { privateCars: 0, privateEvs: 0, commercialCars: 0, totalEvs: 0, chargers: 0, commercialHa: 0, pois: 0, attractions: 0, hotels: 0, hotelWeight: 0 },
  );
}

const poisOf = (d: District) => (d.poisShopping ?? 0) + (d.poisLeisure ?? 0);

export interface TouristShares {
  day: number;
  overnight: number;
  /** what the day share is based on, for the calculation steps */
  dayBasis: 'mixed' | 'attractions' | 'pois' | 'commercialCars';
  overnightBasis: 'hotels' | 'day';
}

/**
 * Share of the city's tourist BEV that a district receives.
 * mixed: day tourists 50 % by attractions + 50 % by shops/leisure (POIs), overnight guests
 * by hotels. Missing data falls back step by step to POIs, then commercial cars.
 */
export function touristShares(d: District, s: Pick<Scenario, 'touristKey'>, t: Totals): TouristShares {
  const commercial = t.commercialCars > 0 ? d.commercialCars / t.commercialCars : 0;
  const poi = t.pois > 0 ? poisOf(d) / t.pois : null;
  const attr = t.attractions > 0 ? (d.attractions ?? 0) / t.attractions : null;
  if (s.touristKey === 'commercialCars') return { day: commercial, overnight: commercial, dayBasis: 'commercialCars', overnightBasis: 'day' };
  if (s.touristKey === 'pois') {
    return poi != null ? { day: poi, overnight: poi, dayBasis: 'pois', overnightBasis: 'day' } : { day: commercial, overnight: commercial, dayBasis: 'commercialCars', overnightBasis: 'day' };
  }
  let day: number;
  let dayBasis: TouristShares['dayBasis'];
  if (attr != null && poi != null) [day, dayBasis] = [0.5 * attr + 0.5 * poi, 'mixed'];
  else if (attr != null) [day, dayBasis] = [attr, 'attractions'];
  else if (poi != null) [day, dayBasis] = [poi, 'pois'];
  else [day, dayBasis] = [commercial, 'commercialCars'];
  // hotels near attractions count up to double: guests stay close to what they visit
  const hotels = t.hotelWeight > 0 ? (d.hotelWeight ?? d.hotels ?? 0) / t.hotelWeight : null;
  return hotels != null ? { day, overnight: hotels, dayBasis, overnightBasis: 'hotels' } : { day, overnight: day, dayBasis, overnightBasis: 'day' };
}

const BASIS_LABEL: Record<TouristShares['dayBasis'], string> = {
  mixed: 'je ½ touristische Ziele und Einkauf/Freizeit',
  attractions: 'touristische Ziele',
  pois: 'Einkauf/Freizeit (POIs)',
  commercialCars: 'gewerbliche Pkw',
};

/** Calculation-step text for the tourist BEV of a district. */
export function touristFormula(d: District, city: CityBev, sh: TouristShares): string {
  const day = `Tagesgäste ${fmt(city.dayTourists)} × ${pct(sh.day, 2)} (${BASIS_LABEL[sh.dayBasis]}: ${fmt(d.attractions ?? 0)} Ziele, ${fmt(poisOf(d))} POIs)`;
  const night =
    sh.overnightBasis === 'hotels'
      ? `Übernachtungsgäste ${fmt(city.overnightTourists)} × ${pct(sh.overnight, 2)} (${fmt(d.hotels ?? 0)} Unterkünfte, Gewicht ${fmt(d.hotelWeight ?? d.hotels ?? 0, 1)} nach Nähe zu Zielen)`
      : `Übernachtungsgäste ${fmt(city.overnightTourists)} × ${pct(sh.overnight, 2)}`;
  return `${day} + ${night}`;
}

export function computeDistrict(d: District, s: Scenario, city: CityBev, t: Totals): DistrictResult {
  const residentBase = s.residentKey === 'evs' ? d.privateEvs : d.privateCars;
  const residentTotal = s.residentKey === 'evs' ? t.privateEvs : t.privateCars;
  const residentShare = residentTotal > 0 ? residentBase / residentTotal : 0;
  const commercialShare = t.commercialCars > 0 ? d.commercialCars / t.commercialCars : 0;
  // fall back to commercial cars when the enrichment data is missing
  const useArea = s.commuterKey === 'commercialArea' && t.commercialHa > 0;
  const commuterShare = useArea ? (d.commercialHa ?? 0) / t.commercialHa : commercialShare;
  const tourist = touristShares(d, s, t);

  const bevResidents = city.residents * residentShare;
  const bevCommuters = city.commuters * commuterShare;
  const bevTourists = city.dayTourists * tourist.day + city.overnightTourists * tourist.overnight;
  const bev = bevResidents + bevCommuters + bevTourists;

  const { total: needed, byUseCase } = pointsFor(bev, s);
  const existing = d.chargers * s.pointsPerSite;
  const gap = Math.max(0, needed - existing);
  const cars = d.privateCars + d.commercialCars;

  const steps: Step[] = [
    {
      key: 'cars',
      label: 'Pkw heute (privat + gewerblich)',
      value: cars,
      unit: 'Pkw',
      formula: `${fmt(d.privateCars)} privat, ${fmt(d.commercialCars)} gewerblich; davon ${fmt(d.totalEvs)} E-Pkw (${pct(cars > 0 ? d.totalEvs / cars : 0, 1)})`,
      source: 'city-data',
    },
    {
      key: 'bevResidents',
      label: 'BEV Einwohner*innen',
      value: bevResidents,
      unit: 'BEV',
      formula: `${fmt(city.residents)} BEV stadtweit × ${pct(residentShare, 2)} Anteil ${s.residentKey === 'evs' ? 'private E-Pkw' : 'private Pkw'}`,
      source: 'isme',
    },
    {
      key: 'bevCommuters',
      label: 'BEV Einpendelnde',
      value: bevCommuters,
      unit: 'BEV',
      formula: useArea
        ? `${fmt(city.commuters)} BEV stadtweit × ${pct(commuterShare, 2)} Anteil Gewerbeflächen (${fmt(d.commercialHa ?? 0, 1)} ha)`
        : `${fmt(city.commuters)} BEV stadtweit × ${pct(commuterShare, 2)} Anteil gewerbliche Pkw`,
      source: useArea ? 'isme' : 'assumption',
    },
    {
      key: 'bevTourists',
      label: 'BEV Tourismus (Tagesmittel)',
      value: bevTourists,
      unit: 'BEV',
      formula: touristFormula(d, city, tourist),
      source: tourist.dayBasis === 'commercialCars' ? 'assumption' : 'isme',
    },
    {
      key: 'bev',
      label: `BEV ${s.year} im Unterbezirk`,
      value: bev,
      unit: 'BEV',
      formula: `BEV-Anteil ${pct(s.bevShare)} (ISME-Szenario ${s.year})`,
      source: 'result',
    },
    ...(s.method === 'ratio'
      ? []
      : byUseCase.map<Step>((x) => ({
          key: `uc-${x.uc.key}`,
          label: x.uc.label,
          value: x.points,
          unit: 'LP',
          formula: `${fmt(x.bev, 1)} BEV (${pct(x.uc.share, 1)}) ÷ ${fmt(x.uc.evsPerPoint, 2)} BEV je LP`,
          source: 'isme',
          indent: true,
        }))),
    {
      key: 'needed',
      label: s.method === 'ratio' ? 'Benötigte Ladepunkte' : s.scope === 'street' ? 'Benötigte LP im Straßenraum' : 'Benötigte öffentlich zugängliche LP',
      value: needed,
      unit: 'LP',
      formula: s.method === 'ratio' ? `${fmt(bev, 1)} BEV ÷ ${s.ratio} BEV je LP` : 'Summe der Lade-Use-Cases oben',
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
    {
      key: 'gap',
      label: 'Fehlende Ladepunkte',
      value: gap,
      unit: 'LP',
      formula: 'Bedarf − Bestand, mindestens 0',
      source: 'result',
    },
  ];

  return {
    ...d,
    cars,
    evShareToday: cars > 0 ? d.totalEvs / cars : 0,
    bevResidents,
    bevCommuters,
    bevTourists,
    bev,
    needed,
    existing,
    gap,
    gapPer1000Cars: cars > 0 ? (gap / cars) * 1000 : 0,
    coverage: needed > 0 ? Math.min(existing / needed, 9.99) : 0,
    steps,
  };
}

export function computeAll(
  districts: District[],
  s: Scenario,
): { results: DistrictResult[]; city: CityBev; cityPoints: number; calibration?: Calibration } {
  if (s.model === 'bottomup') return computeBottomUp(districts, s);
  const city = cityBev(s);
  const t = totalsOf(districts);
  return {
    results: districts.map((d) => computeDistrict(d, s, city, t)),
    city,
    cityPoints: pointsFor(city.total, s).total,
  };
}

// --- formatting -------------------------------------------------------------------

export const fmt = (n: number, digits = 0) =>
  n.toLocaleString('de-DE', { maximumFractionDigits: digits, minimumFractionDigits: digits });

export const pct = (n: number, digits = 0) =>
  (n * 100).toLocaleString('de-DE', { maximumFractionDigits: digits, minimumFractionDigits: digits }) + ' %';
