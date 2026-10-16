import type { Scenario } from './model';
import { METRICS, type MetricKey } from './metrics';

// Scenario, metric and selection live in the query string so a link
// reproduces exactly what the sender saw, e.g. ?ev=20&home=60&r=10&m=gap&ubz=123

export interface UrlState {
  scenario: Partial<Scenario>;
  metric?: MetricKey;
  ubz?: string;
}

const num = (v: string | null) => (v != null && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : undefined);

export function readUrlState(search = window.location.search): UrlState {
  const p = new URLSearchParams(search);
  const scenario: Partial<Scenario> = {};
  const ev = num(p.get('ev'));
  const home = num(p.get('home'));
  const dens = num(p.get('dens'));
  const r = num(p.get('r'));
  const pkw = num(p.get('pkw'));
  if (ev != null) scenario.evShare = ev / 100;
  if (home != null) scenario.homeChargingShare = home / 100;
  if (dens != null) scenario.densityEffect = dens / 100;
  if (r != null) scenario.evsPerPoint = r;
  if (pkw != null) scenario.pkwPer1000 = pkw;
  const m = p.get('m');
  return {
    scenario,
    metric: METRICS.some((x) => x.key === m) ? (m as MetricKey) : undefined,
    ubz: p.get('ubz') ?? undefined,
  };
}

export function writeUrlState(s: Scenario, metric: MetricKey, ubz: string | null) {
  const p = new URLSearchParams();
  p.set('ev', String(Math.round(s.evShare * 100)));
  p.set('home', String(Math.round(s.homeChargingShare * 100)));
  p.set('dens', String(Math.round(s.densityEffect * 100)));
  p.set('r', String(s.evsPerPoint));
  p.set('pkw', String(s.pkwPer1000));
  p.set('m', metric);
  if (ubz) p.set('ubz', ubz);
  window.history.replaceState(null, '', `${window.location.pathname}?${p.toString()}`);
}
