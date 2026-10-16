import { defaultScenario, type Scenario } from './isme';
import { METRICS, type MetricKey } from './metrics';

// Scenario, metric and selection live in the query string so a link
// reproduces exactly what the sender saw, e.g. ?y=2030&bev=15&m=usecase&s=public&ubz=123

export interface UrlState {
  scenario: Scenario;
  metric?: MetricKey;
  ubz?: string;
}

const num = (v: string | null) => (v != null && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : undefined);

export function readUrlState(search = window.location.search): UrlState {
  const p = new URLSearchParams(search);
  const s: Scenario = { ...defaultScenario };
  const year = num(p.get('y'));
  if (year === 2030 || year === 2036) s.year = year;
  const bev = num(p.get('bev'));
  if (bev != null) s.bevShare = bev / 100;
  if (p.get('m') === 'ratio' || p.get('m') === 'usecase') s.method = p.get('m') as Scenario['method'];
  const ratio = num(p.get('r'));
  if (ratio != null) s.ratio = ratio;
  if (p.get('s') === 'street' || p.get('s') === 'public') s.scope = p.get('s') as Scenario['scope'];
  const sf = num(p.get('sf'));
  if (sf != null) s.streetFactor = sf;
  const cs = num(p.get('cs'));
  if (cs != null) s.customerShare = cs / 1000;
  if (p.get('rk') === 'evs' || p.get('rk') === 'cars') s.residentKey = p.get('rk') as Scenario['residentKey'];
  if (p.get('ck') === 'commercialArea' || p.get('ck') === 'commercialCars') s.commuterKey = p.get('ck') as Scenario['commuterKey'];
  if (p.get('tk') === 'mixed' || p.get('tk') === 'pois' || p.get('tk') === 'commercialCars') s.touristKey = p.get('tk') as Scenario['touristKey'];
  if (p.get('mo') === 'isme' || p.get('mo') === 'bottomup') s.model = p.get('mo') as Scenario['model'];
  const pct = (k: string) => (num(p.get(k)) != null ? num(p.get(k))! / 100 : undefined);
  s.homeEfh = pct('he') ?? s.homeEfh;
  s.homeMfh = pct('hm') ?? s.homeMfh;
  s.sharingRes = num(p.get('sr')) ?? s.sharingRes;
  s.sharingCom = num(p.get('sc')) ?? s.sharingCom;
  if (p.get('cal') === '0' || p.get('cal') === '1') s.calibrate = p.get('cal') === '1';
  if (p.get('hpc') === '0' || p.get('hpc') === '1') s.hpcLever = p.get('hpc') === '1';
  s.fleetPublic = pct('fl') ?? s.fleetPublic;
  s.carReduction = pct('cr') ?? s.carReduction;
  const lp = num(p.get('lp'));
  if (lp != null) s.pointsPerSite = lp;
  const metric = p.get('k');
  return {
    scenario: s,
    metric: METRICS.some((x) => x.key === metric) ? (metric as MetricKey) : undefined,
    ubz: p.get('ubz') ?? undefined,
  };
}

export function writeUrlState(s: Scenario, metric: MetricKey, ubz: string | null) {
  const p = new URLSearchParams();
  p.set('y', String(s.year));
  p.set('bev', String(Math.round(s.bevShare * 100)));
  p.set('m', s.method);
  p.set('r', String(s.ratio));
  p.set('s', s.scope);
  p.set('sf', String(s.streetFactor));
  p.set('cs', String(Math.round(s.customerShare * 1000)));
  p.set('rk', s.residentKey);
  p.set('ck', s.commuterKey);
  p.set('tk', s.touristKey);
  p.set('lp', String(s.pointsPerSite));
  p.set('mo', s.model);
  p.set('he', String(Math.round(s.homeEfh * 100)));
  p.set('hm', String(Math.round(s.homeMfh * 100)));
  p.set('sr', String(s.sharingRes));
  p.set('sc', String(s.sharingCom));
  p.set('cal', s.calibrate ? '1' : '0');
  p.set('hpc', s.hpcLever ? '1' : '0');
  p.set('fl', String(Math.round(s.fleetPublic * 100)));
  p.set('cr', String(Math.round(s.carReduction * 100)));
  p.set('k', metric);
  if (ubz) p.set('ubz', ubz);
  if (new URLSearchParams(window.location.search).get('x') === '1') p.set('x', '1'); // expert mode
  window.history.replaceState(null, '', `${window.location.pathname}?${p.toString()}`);
}
