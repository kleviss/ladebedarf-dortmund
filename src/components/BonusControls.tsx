import type { ReactNode } from 'react';
import { bonusDefaults, type BonusData, type BonusParams } from '../lib/bonus';
import { InfoTip, Tex } from './InfoTip';

export interface BonusSummary {
  /** missing points city-wide without and with the active scenarios */
  before: number;
  after: number;
  /** city-wide reduction of missing street points per scenario */
  priority: number;
  commercial: number;
  supermarket: number;
  /** new charging points the scenarios install off the street */
  newPoints: { priority: number; commercial: number; supermarket: number };
}

export type BonusMap = 'after' | 'reduction';

interface Props {
  data: BonusData | null;
  params: BonusParams;
  summary: BonusSummary;
  /** EV share the model uses now (today or scenario) */
  bevShare: number;
  map: BonusMap;
  showLayers: boolean;
  onChange: (params: BonusParams) => void;
  onMap: (map: BonusMap) => void;
  onToggleLayers: (visible: boolean) => void;
}

const fmt = (n: number, digits = 0) => n.toLocaleString('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: digits });
const pct = (n: number) => `${fmt(n * 100)} %`;

interface Tip {
  title: string;
  task: string;
  tex: string[];
  legend: [string, string][];
  data: string;
  assumptions: string[];
}

const COMMON: [string, string][] = [
  ['e', 'EV share: today 4.2 % or the scenario'],
  ['k', 'EVs per street charging point'],
];

function ScenarioTip({ tip }: { tip: Tip }) {
  return (
    <InfoTip label={tip.title}>
      <header className="info-card-head">
        <span className="info-card-title">{tip.title}</span>
        <span className="info-label">Formula</span>
      </header>
      <p className="bonus-task">„{tip.task}“</p>
      <div className="info-formula">
        {tip.tex.map((t) => (
          <Tex key={t} tex={t} display />
        ))}
      </div>
      <dl className="info-legend">
        {tip.legend.map(([sym, text]) => (
          <div key={sym}>
            <dt>
              <Tex tex={sym} />
            </dt>
            <dd>{text}</dd>
          </div>
        ))}
      </dl>
      <p>
        <span className="info-label">Data</span>
        {tip.data}
      </p>
      <div>
        <span className="info-label">Assumptions</span>
        <ul className="info-sources">
          {tip.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </div>
    </InfoTip>
  );
}

export function BonusControls({ data, params, summary, bevShare, map, showLayers, onChange, onMap, onToggleLayers }: Props) {
  const set = <K extends keyof BonusParams>(key: K, value: BonusParams[K]) => onChange({ ...params, [key]: value });
  const active = params.supermarket || params.priority || params.commercial;
  const t = data?.totals;
  const a = data?.assumptions;
  const parkingRule = a ? `Spaces: capacity tag where mapped, else car-park area ÷ ${a.m2PerSpace} m² (aisles included).` : '';

  const TIPS: Record<'supermarket' | 'priority' | 'commercial', Tip> = {
    supermarket: {
      title: 'Bonus 1 · Supermarket car parks',
      task: 'auf jeden Supermarktparkplatz im Unterbezirk 10 LP installiert sind',
      tex: [
        'L_u = \\lambda\\, S_u',
        '\\Delta^{S}_u = \\operatorname{round}\\!\\big(\\min(L_u,\\ \\alpha\\cdot \\text{missing}\'_u)\\big)',
        '\\text{missing}\'\'_u = \\text{missing}\'_u - \\Delta^{S}_u',
      ],
      legend: [
        ['S_u', 'supermarkets with their own car park'],
        ['\\lambda', 'charging points per supermarket (10)'],
        ['\\alpha', 'share of the missing points a supermarket can take'],
        ['\\text{missing}\'_u', 'missing street points after bonus 2 and 3'],
      ],
      data: `OpenStreetMap shop=supermarket: ${t ? fmt(t.supermarkets) : '…'} supermarkets, ${t ? fmt(t.supermarketsWithParking) : '…'} with an off-street car park within ${a?.supermarketMetres ?? 100} m.`,
      assumptions: [
        'Example: 10 missing points and α = 20 % → the supermarket takes 2, 8 remain in street space.',
        'Supermarket points are open only during opening hours and serve short stays, so they cannot replace overnight charging at the kerb; α caps what they take, even when 10 points are installed.',
        'α = 100 % counts every supermarket point fully against the street demand.',
      ],
    },
    priority: {
      title: 'Bonus 2 · Buildings in the priority area',
      task: '20 % der Parkplätze an Gebäuden in der Fläche mit Priorität für den Ladeinfrastruktur-Ausbau mit Ladepunkten ausgerüstet werden',
      tex: [
        'p_u = \\operatorname{round}(\\beta\\, B_u)',
        'n_u = \\min(p_u,\\ e\\, B_u)',
        '\\Delta^{B}_u = \\min\\!\\left(R_u,\\ \\dfrac{n_u\\, r_R}{k}\\right)',
      ],
      legend: [
        ['B_u', 'parking spaces at buildings in priority cells'],
        ['\\beta', 'share of those spaces that get a charging point (20 %)'],
        ['n_u', 'EVs that now charge at home: only EV drivers use a new point'],
        ['R_u', 'street points for residents (factor model)'],
        ['r_R', 'residents without home charging who use street space'],
        ...COMMON,
      ],
      data: `City priority cells (prioritaet.geojson) × OpenStreetMap: ${t ? fmt(t.priorityLots) : '…'} non-public car parks and ${t ? fmt(t.priorityGarages) : '…'} garages/carports, ${t ? fmt(t.prioritySpaces) : '…'} spaces in total.`,
      assumptions: [
        'Parking at buildings = car parks tagged private, customers, residents or permit, plus garage and carport buildings; public car parks and kerbside parking are left out.',
        parkingRule,
        `Block garages: area ÷ ${a?.m2PerGarage ?? 18} m² per box. Each EV that charges at home frees r_R ÷ k street points.`,
      ],
    },
    commercial: {
      title: 'Bonus 3 · Commercial areas',
      task: '20 % der Parkplätze in Gewerbegebieten mit Ladepunkten ausgerüstet werden',
      tex: [
        'p_u = \\operatorname{round}(\\gamma\\, C_u),\\quad n_u = \\min(p_u,\\ e\\, C_u)',
        '\\Delta^{C}_u = \\min\\!\\left(W_u,\\ \\dfrac{n_u\\, r_W}{k}\\right)',
        '\\Delta^{N}_u = \\min\\!\\left(R_u - \\Delta^{B}_u,\\ \\dfrac{(p_u - n_u)\\, e\\, r_R}{k}\\right)',
      ],
      legend: [
        ['C_u', 'parking spaces in commercial and industrial areas'],
        ['\\gamma', 'share of those spaces that get a charging point (20 %)'],
        ['W_u', 'street points for in-commuters (factor model)'],
        ['r_W', 'in-commuters who would charge in street space'],
        ['\\Delta^{N}_u', 'only when shared overnight: residents use the points left free by day'],
        ...COMMON,
      ],
      data: `OpenStreetMap landuse=commercial|industrial × amenity=parking: ${t ? fmt(t.commercialLots) : '…'} car parks, ${t ? fmt(t.commercialSpaces) : '…'} spaces.`,
      assumptions: [
        parkingRule,
        'Workplace charging relieves the in-commuters first; few of them charge at the kerb (r_W), so the street effect is small unless the points are opened to residents at night.',
      ],
    },
  };

  const scenario = (key: 'supermarket' | 'priority' | 'commercial', label: string, reduction: number, points: number, body: ReactNode) => (
    <div className={`bonus-card${params[key] ? ' is-on' : ''}`}>
      <div className="bonus-card-head">
        <input id={`bonus-${key}`} type="checkbox" checked={params[key]} disabled={!data} onChange={(e) => set(key, e.target.checked)} />
        <label htmlFor={`bonus-${key}`}>{label}</label>
        <ScenarioTip tip={TIPS[key]} />
      </div>
      <p className="bonus-task">„{TIPS[key].task}“</p>
      {params[key] && (
        <>
          {body}
          <p className="bonus-effect">
            <b className="num">{fmt(points)}</b> new points off the street ·{' '}
            <b className="num">−{fmt(reduction)}</b> missing in street space
          </p>
        </>
      )}
    </div>
  );

  const slider = (key: 'absorbShare' | 'priorityShare' | 'commercialShare' | 'pointsPerSupermarket', label: string, min: number, max: number, step: number, show: (v: number) => string) => (
    <div className="param">
      <span className="param-label">
        <label htmlFor={`bonus-${key}`}>{label}</label>
      </span>
      <div className="param-row">
        <input id={`bonus-${key}`} type="range" min={min} max={max} step={step} value={params[key]} onChange={(e) => set(key, Number(e.target.value))} />
        <output htmlFor={`bonus-${key}`} className={`num${params[key] === bonusDefaults[key] ? '' : ' is-changed'}`}>
          {show(params[key])}
        </output>
      </div>
    </div>
  );

  return (
    <section className="bonus-controls" aria-labelledby="bonus-title">
      <div className="factor-controls-head">
        <h2 id="bonus-title">
          Bonus scenarios <span className="bonus-badge">Bonus tasks</span>
        </h2>
        <button type="button" className="link-button" onClick={() => onChange(bonusDefaults)} disabled={!active}>
          Reset
        </button>
      </div>
      <p className="hint">How does the street-space demand per subdistrict change if charging moves to private and semi-public car parks?</p>
      {!data && <p className="hint site-warning">Scenario data is missing: run npm run data to build public/data/city/bonus.json.</p>}

      {scenario(
        'supermarket',
        '1 · Supermarket car parks',
        summary.supermarket,
        summary.newPoints.supermarket,
        <>
          {slider('pointsPerSupermarket', 'Charging points per supermarket', 2, 20, 1, (v) => `${v} LP`)}
          {slider('absorbShare', 'Share of the missing points a supermarket takes', 0.05, 1, 0.05, pct)}
        </>,
      )}
      {scenario(
        'priority',
        '2 · Buildings in the priority area',
        summary.priority,
        summary.newPoints.priority,
        slider('priorityShare', 'Parking spaces with a charging point', 0.05, 1, 0.05, pct),
      )}
      {scenario(
        'commercial',
        '3 · Commercial areas',
        summary.commercial,
        summary.newPoints.commercial,
        <>
          {slider('commercialShare', 'Parking spaces with a charging point', 0.05, 1, 0.05, pct)}
          <div className="param param-check">
            <input id="bonus-night" type="checkbox" checked={params.commercialNight} onChange={(e) => set('commercialNight', e.target.checked)} />
            <label htmlFor="bonus-night">Open to residents overnight</label>
          </div>
        </>,
      )}

      {active && (
        <div className="bonus-result" aria-live="polite">
          <p>
            Missing in street space, city-wide: <b className="num">{fmt(summary.before)}</b> → <b className="num">{fmt(summary.after)}</b>{' '}
            <span className="bonus-delta num">(−{fmt(summary.before - summary.after)}, −{summary.before > 0 ? fmt(((summary.before - summary.after) / summary.before) * 100) : 0} %)</span>
          </p>
          <p className="hint">EV basis: {pct(bevShare)} of cars. Raise it under Model settings to see the scenarios grow with the fleet.</p>
          <div className="param">
            <span className="param-label">Map colour</span>
            <div className="segmented" role="radiogroup" aria-label="Map colour">
              <label>
                <input type="radio" name="bonus-map" checked={map === 'after'} onChange={() => onMap('after')} />
                Missing after scenarios
              </label>
              <label>
                <input type="radio" name="bonus-map" checked={map === 'reduction'} onChange={() => onMap('reduction')} />
                Reduction
              </label>
            </div>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={showLayers} onChange={(e) => onToggleLayers(e.target.checked)} />
            <span className="dot dot-supermarket" aria-hidden="true" />
            Show supermarkets and priority area
          </label>
        </div>
      )}
    </section>
  );
}
