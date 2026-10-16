import type { ReactNode } from 'react';
import type { FactorParams, ParameterSpec } from '../lib/factors';

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
  data: 'Measured / published data',
  isme: 'From the ISME report (Dec 2023)',
  tested: 'Chosen by testing against real district data',
  calibrated: 'Calibrated to an ISME city figure',
  assumption: 'Assumption',
};

interface Section {
  key: string;
  title: string;
  factors: string[];
  total?: keyof FactorTotals;
  formula: string;
  data: string;
}

const SECTIONS: Section[] = [
  {
    key: 'general',
    title: 'General',
    factors: ['global', 'existing'],
    formula: 'Missing points = max(0, ⌈residents + work + travel⌉ − locations × points per location)',
    data: 'Today: registered EVs per subdistrict (city statistics 2026). Scenario: private cars × EV share. Existing: city charger file (912 locations).',
  },
  {
    key: 'residents',
    title: 'Residence',
    factors: ['residents'],
    total: 'residents',
    formula:
      'Home coverage = min(1, (garages + driveway × house dwellings + spaces per apartment × apartments × OSM factor) ÷ dwellings). Points = EVs × (1 − coverage) × street share ÷ EVs per point',
    data: 'Dwellings by building type: Zensus 2022 (100 m grid). Garages and carports: ALKIS (Open Data Dortmund). OSM factor: private parking and underground garages per apartment in the Stadtbezirk.',
  },
  {
    key: 'commuters',
    title: 'Work',
    factors: ['commuters'],
    total: 'commuters',
    formula:
      'Points = in-commuters × by car × EV share × street share ÷ EVs per point × share of estimated jobs. Jobs = floor area ÷ m² per job (office 30, retail 50, education/health 60, industry 100, warehouse 200, mixed use ½ × 40)',
    data: 'In-commuters: Open Data Dortmund (2022). Floor area: ALKIS footprint × storeys. Check: 269,963 estimated jobs vs 264,322 employees at place of work.',
  },
  {
    key: 'tourists',
    title: 'Travel',
    factors: ['tourists'],
    total: 'tourists',
    formula:
      'Points = (day visitors × share of visits + overnight stays × share of hotels) ÷ 365 × by car ÷ persons per car × EV share × charge at destination × street share ÷ EVs per point',
    data: 'Visits: Open Data Dortmund (Zoo, museums, Dortmunder U, Konzerthaus, Theater), others use the default. Hotels: OpenStreetMap, weighted by nearby destinations. Overnight stays: Open Data 2024.',
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

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="info">
      <button
        type="button"
        className="info-btn"
        aria-label={`How is ${label} calculated?`}
        onClick={(e) => e.preventDefault() /* inside <summary>: don't toggle the section */}
      >
        i
      </button>
      <span role="tooltip" className="info-tip">
        {children}
      </span>
    </span>
  );
}

function ParamInfo({ spec, defaults }: { spec: ParameterSpec; defaults: FactorParams }) {
  const def = defaults[spec.key];
  return (
    <Info label={spec.labelEn ?? spec.label}>
      <strong>{KIND[spec.kind] ?? spec.kind}</strong>
      {typeof def !== 'object' && <span>Default: {format(spec, def)}</span>}
      {typeof def === 'object' && def !== null && (
        <span>
          {Object.entries(def)
            .map(([k, v]) => `${k} ${v}`)
            .join(' · ')}
        </span>
      )}
      {spec.source && <span>Source: {spec.source}</span>}
      {spec.note && <span>{spec.note}</span>}
    </Info>
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

    if (spec.key === 'bevMode') {
      return (
        <div className="param" key={spec.key}>
          <span className="param-label">
            {label} <ParamInfo spec={spec} defaults={defaults} />
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
        <label className="param param-check" key={spec.key}>
          <input type="checkbox" checked={value} onChange={(e) => set(spec.key, e.target.checked as never)} />
          <span>{label}</span> <ParamInfo spec={spec} defaults={defaults} />
        </label>
      );
    }
    if (typeof value === 'number' && spec.min !== undefined && spec.max !== undefined) {
      const calibrated = spec.key === 'mfhPerDwelling' && params.calibrate;
      const disabled = calibrated || (spec.key === 'bevShareScenario' && params.bevMode === 'today');
      const shown = calibrated ? totals.mfhPerDwelling : value;
      return (
        <div className={`param${disabled ? ' is-disabled' : ''}`} key={spec.key}>
          <label htmlFor={id} className="param-label">
            {label} <ParamInfo spec={spec} defaults={defaults} />
          </label>
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
              {calibrated ? ' (calibrated)' : ''}
            </output>
          </div>
        </div>
      );
    }
    // fixed values (measured data, nested rules of thumb)
    return (
      <div className="param param-fixed" key={spec.key}>
        <span className="param-label">
          {label} <ParamInfo spec={spec} defaults={defaults} />
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
            <Info label={section.title}>
              <strong>Formula</strong>
              <span>{section.formula}</span>
              <strong>Data</strong>
              <span>{section.data}</span>
              <span>Details: docs/factor-model.md</span>
            </Info>
          </summary>
          <div className="factor-params">{specs.filter((s) => section.factors.includes(s.factor)).map(control)}</div>
        </details>
      ))}
    </div>
  );
}
