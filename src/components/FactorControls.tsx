import type { FactorParams, ParameterSpec } from '../lib/factors';
import { InfoTip, Tex } from './InfoTip';

export interface FactorTotals {
  residents: number;
  commuters: number;
  tourists: number;
  /** mfhPerDwelling actually used (calibrated or set) */
  mfhPerDwelling: number;
}

interface Props {
  specs: ParameterSpec[];
  params: FactorParams;
  defaults: FactorParams;
  totals: FactorTotals;
  onChange: (params: FactorParams) => void;
}

const KIND: Record<string, string> = {
  data: 'Data',
  isme: 'ISME report',
  tested: 'Tested',
  calibrated: 'Calibrated',
  assumption: 'Assumption',
};

const KIND_TEXT: Record<string, string> = {
  data: 'Measured or published figure',
  isme: 'Taken from the ISME report (Dec 2023)',
  tested: 'Chosen by testing variants against real district data',
  calibrated: 'Solved so the city result matches an ISME figure',
  assumption: 'Rule of thumb or team decision, no direct source',
};

/** Symbol of each parameter in the section formulas. */
const SYMBOL: Partial<Record<keyof FactorParams, string>> = {
  bevShareToday: 'e',
  bevShareScenario: 'e',
  evsPerStreetPoint: 'k',
  pointsPerSite: 'p',
  homeShareCity: '\\bar A',
  drivewayPerDwelling: 's_{\\mathrm{EZ}}',
  mfhPerDwelling: 's_{\\mathrm{MFH}}',
  useOsmFactor: 'f^{\\mathrm{OSM}}_b',
  residentsStreetShare: 'r_R',
  inCommuters: 'P',
  commuterCarShare: 'a_W',
  commuterStreetShare: 'r_W',
  m2PerJob: 'm_c',
  dayVisitorsPerYear: 'V_d',
  overnightStaysPerYear: 'V_n',
  touristCarShare: 'a_T',
  personsPerCar: '\\pi',
  chargeAtDestinationShare: 'c',
  touristStreetShare: 'r_T',
  defaultVisitors: 'v_0',
};

interface Section {
  key: string;
  title: string;
  factors: string[];
  total?: keyof FactorTotals;
  tex: string[];
  /** other symbols used in the formula: [TeX, meaning] */
  legend: [string, string][];
  data: string;
}

const SECTIONS: Section[] = [
  {
    key: 'general',
    title: 'General',
    factors: ['global', 'existing'],
    tex: ['\\text{missing}_u = \\max\\!\\big(0,\\ \\lceil R_u + W_u + T_u \\rceil - n_u\\,p\\big)'],
    legend: [
      ['R_u, W_u, T_u', 'points for residence, work, travel'],
      ['n_u', 'existing charging locations'],
      ['e', 'EV share: today 4.2 % or the scenario'],
      ['k', 'EVs per street charging point'],
    ],
    data: 'Today: registered EVs per subdistrict (city statistics 2026). Scenario: private cars × EV share. Existing: city charger file, 912 locations.',
  },
  {
    key: 'residents',
    title: 'Residence',
    factors: ['residents'],
    total: 'residents',
    tex: [
      'A_u = \\min\\!\\left(1,\\ \\dfrac{G_u + s_{\\mathrm{EZ}}\\,D^{\\mathrm{EZ}}_u + s_{\\mathrm{MFH}}\\,D^{\\mathrm{MFH}}_u\\,f^{\\mathrm{OSM}}_b}{D_u}\\right)',
      'R_u = \\dfrac{E_u\\,(1 - A_u)\\,r_R}{k}',
    ],
    legend: [
      ['A_u', 'share of households that can charge at home'],
      ['G_u', 'garages and carports'],
      ['D_u, D^{\\mathrm{EZ}}_u, D^{\\mathrm{MFH}}_u', 'dwellings: all, in houses, in apartment blocks'],
      ['f^{\\mathrm{OSM}}_b', 'private parking per apartment in the Stadtbezirk ÷ city'],
      ['E_u', 'EVs: registered today or cars × e'],
    ],
    data: 'Dwellings: Zensus 2022, 100 m grid. Garages and carports: ALKIS (Open Data Dortmund). OSM factor: private parking and underground garages, OpenStreetMap. s_MFH is calibrated so the city mean of A equals the ISME home share (66.3 %).',
  },
  {
    key: 'commuters',
    title: 'Work',
    factors: ['commuters'],
    total: 'commuters',
    tex: ['W_u = \\dfrac{P\\,a_W\\,e\\,r_W}{k}\\cdot\\dfrac{J_u}{\\sum_v J_v}', 'J_u = \\sum_c \\dfrac{F_{u,c}}{m_c}'],
    legend: [
      ['J_u', 'estimated jobs in the subdistrict'],
      ['F_{u,c}', 'floor area of building class c (footprint × storeys)'],
      ['m_c', 'm² per job: office 30, retail 50, education/health 60, industry 100, warehouse 200, mixed use ½ × 40'],
    ],
    data: 'In-commuters: Open Data Dortmund, 2022. Floor area: ALKIS. Check: 269,963 estimated jobs vs 264,322 employees at place of work (2024).',
  },
  {
    key: 'tourists',
    title: 'Travel',
    factors: ['tourists'],
    total: 'tourists',
    tex: ['T_u = \\dfrac{V_d\\,\\delta_u + V_n\\,\\nu_u}{365}\\cdot\\dfrac{a_T}{\\pi}\\cdot\\dfrac{e\\,c\\,r_T}{k}'],
    legend: [
      ['\\delta_u', 'share of all visits to destinations in the subdistrict'],
      ['\\nu_u', 'share of hotels, weighted by nearby destinations'],
    ],
    data: 'Visits: Open Data Dortmund (Zoo, museums, Dortmunder U, Konzerthaus, Theater); destinations without a figure use v₀. Hotels: OpenStreetMap. Overnight stays: Open Data 2024.',
  },
];

const isShare = (s: ParameterSpec) => s.unit === 'share';

function format(spec: ParameterSpec, value: unknown): string {
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  if (typeof value !== 'number') return String(value);
  if (isShare(spec)) return `${(value * 100).toLocaleString('en-GB', { maximumFractionDigits: 1 })} %`;
  const digits = spec.step !== undefined && spec.step < 1 ? (spec.step < 0.1 ? 3 : 2) : 0;
  return value.toLocaleString('en-GB', { maximumFractionDigits: digits });
}

function ParamTip({ spec, value, defaults }: { spec: ParameterSpec; value: unknown; defaults: FactorParams }) {
  const def = defaults[spec.key];
  const symbol = SYMBOL[spec.key];
  const label = spec.labelEn ?? spec.label;
  return (
    <InfoTip label={label}>
      <header className="info-card-head">
        <span className="info-card-title">
          {symbol && <Tex tex={symbol} />} {label}
        </span>
        <span className={`kind kind-${spec.kind}`} title={KIND_TEXT[spec.kind]}>
          {KIND[spec.kind] ?? spec.kind}
        </span>
      </header>
      {typeof def === 'object' && def !== null ? (
        <dl className="info-values">
          {Object.entries(def).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{String(v)} m²</dd>
            </div>
          ))}
        </dl>
      ) : (
        <dl className="info-values">
          <div>
            <dt>Default</dt>
            <dd>{format(spec, def)}</dd>
          </div>
          {JSON.stringify(value) !== JSON.stringify(def) && (
            <div>
              <dt>Now</dt>
              <dd className="is-changed">{format(spec, value)}</dd>
            </div>
          )}
        </dl>
      )}
      <p className="info-kind">{KIND_TEXT[spec.kind]}</p>
      {spec.source && (
        <p>
          <span className="info-label">Source</span>
          {spec.source}
        </p>
      )}
      {spec.note && <p className="info-note">{spec.note}</p>}
    </InfoTip>
  );
}

function SectionTip({ section }: { section: Section }) {
  return (
    <InfoTip label={section.title}>
      <header className="info-card-head">
        <span className="info-card-title">{section.title}</span>
        <span className="info-label">Formula</span>
      </header>
      <div className="info-formula">
        {section.tex.map((t) => (
          <Tex key={t} tex={t} display />
        ))}
      </div>
      <dl className="info-legend">
        {section.legend.map(([sym, text]) => (
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
        {section.data}
      </p>
      <p className="info-note">Details and validation: docs/factor-model.md</p>
    </InfoTip>
  );
}

export function FactorControls({ specs, params, defaults, totals, onChange }: Props) {
  const set = <K extends keyof FactorParams>(key: K, value: FactorParams[K]) => onChange({ ...params, [key]: value });
  const changed = specs.filter((s) => JSON.stringify(params[s.key]) !== JSON.stringify(defaults[s.key])).length;

  const control = (spec: ParameterSpec) => {
    const value = params[spec.key];
    const label = spec.labelEn ?? spec.label;
    const id = `param-${spec.key}`;
    const isDefault = JSON.stringify(value) === JSON.stringify(defaults[spec.key]);
    const tip = <ParamTip spec={spec} value={value} defaults={defaults} />;

    if (spec.key === 'bevMode') {
      return (
        <div className="param" key={spec.key}>
          <span className="param-label">
            {label} {tip}
          </span>
          <div className="segmented" role="radiogroup" aria-label={label}>
            {(['today', 'scenario'] as const).map((mode) => (
              <label key={mode}>
                <input type="radio" name="bevMode" checked={params.bevMode === mode} onChange={() => set('bevMode', mode)} />
                {mode === 'today' ? 'Today' : 'Scenario'}
              </label>
            ))}
          </div>
        </div>
      );
    }
    if (typeof value === 'boolean') {
      return (
        <div className="param param-check" key={spec.key}>
          <input id={id} type="checkbox" checked={value} onChange={(e) => set(spec.key, e.target.checked as never)} />
          <label htmlFor={id}>{label}</label> {tip}
        </div>
      );
    }
    if (typeof value === 'number' && spec.min !== undefined && spec.max !== undefined) {
      const calibrated = spec.key === 'mfhPerDwelling' && params.calibrate;
      const disabled = calibrated || (spec.key === 'bevShareScenario' && params.bevMode === 'today');
      const shown = calibrated ? totals.mfhPerDwelling : value;
      return (
        <div className={`param${disabled ? ' is-disabled' : ''}`} key={spec.key}>
          <span className="param-label">
            <label htmlFor={id}>{label}</label> {tip}
          </span>
          <div className="param-row">
            <input
              id={id}
              type="range"
              min={spec.min}
              max={spec.max}
              step={spec.step ?? 'any'}
              value={shown}
              disabled={disabled}
              onChange={(e) => set(spec.key, Number(e.target.value) as never)}
            />
            <output htmlFor={id} className={`num${isDefault ? '' : ' is-changed'}`}>
              {format(spec, shown)}
              {calibrated ? ' (cal.)' : ''}
            </output>
          </div>
        </div>
      );
    }
    // fixed values (measured data, nested rules of thumb)
    return (
      <div className="param param-fixed" key={spec.key}>
        <span className="param-label">
          {label} {tip}
        </span>
        <span className="num">{typeof value === 'object' ? 'see info' : format(spec, value)}</span>
      </div>
    );
  };

  return (
    <div className="factor-controls">
      <div className="factor-controls-head">
        <h2>Model settings</h2>
        <button type="button" className="link-button" onClick={() => onChange(defaults)} disabled={changed === 0}>
          Reset to defaults{changed > 0 ? ` (${changed})` : ''}
        </button>
      </div>
      {SECTIONS.map((section) => (
        <details key={section.key} className="factor-section">
          <summary>
            <span>{section.title}</span>
            {section.total && (
              <span className="num muted">{Math.round(totals[section.total]).toLocaleString('en-GB')} points</span>
            )}
            <SectionTip section={section} />
          </summary>
          <div className="factor-params">{specs.filter((s) => section.factors.includes(s.factor)).map(control)}</div>
        </details>
      ))}
    </div>
  );
}
