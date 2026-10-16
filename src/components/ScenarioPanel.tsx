import { fmt, pct, type Scenario } from '../lib/model';

interface Props {
  scenario: Scenario;
  currentEvShare: number;
  evYear: number;
  onChange: (s: Scenario) => void;
  onReset: () => void;
}

interface SliderProps {
  id: string;
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}

function Slider({ id, label, hint, value, min, max, step, display, onChange }: SliderProps) {
  return (
    <div className="slider">
      <div className="slider-head">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id} className="num">
          {display}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <p className="hint">{hint}</p>
    </div>
  );
}

export function ScenarioPanel({ scenario: s, currentEvShare, evYear, onChange, onReset }: Props) {
  const set = (patch: Partial<Scenario>) => onChange({ ...s, ...patch });

  return (
    <section className="panel" aria-labelledby="scenario-title">
      <div className="panel-head">
        <h2 id="scenario-title">Annahmen</h2>
        <button type="button" className="link-button" onClick={onReset}>
          Zurücksetzen
        </button>
      </div>
      <Slider
        id="ev-share"
        label="E-Anteil am Pkw-Bestand"
        hint={`Heute ${pct(currentEvShare, 1)} (${evYear}, BEV + Plug-in-Hybrid)`}
        value={Math.round(s.evShare * 100)}
        min={1}
        max={60}
        step={1}
        display={pct(s.evShare)}
        onChange={(v) => set({ evShare: v / 100 })}
      />
      <Slider
        id="home-share"
        label="Laden zu Hause oder beim Arbeitgeber"
        hint="Stadtdurchschnitt; wird je Unterbezirk nach Bebauungsdichte angepasst"
        value={Math.round(s.homeChargingShare * 100)}
        min={0}
        max={95}
        step={5}
        display={pct(s.homeChargingShare)}
        onChange={(v) => set({ homeChargingShare: v / 100 })}
      />
      <Slider
        id="density-effect"
        label="Einfluss der Bebauungsdichte"
        hint="0 = überall gleich, 100 = dichte Quartiere laden stark öffentlich"
        value={Math.round(s.densityEffect * 100)}
        min={0}
        max={100}
        step={10}
        display={fmt(s.densityEffect * 100)}
        onChange={(v) => set({ densityEffect: v / 100 })}
      />
      <Slider
        id="evs-per-point"
        label="E-Pkw je öffentlichem Ladepunkt"
        hint="Versorgungsschlüssel; die EU-Richtlinie AFIR rechnet mit ca. 1 : 10"
        value={s.evsPerPoint}
        min={2}
        max={30}
        step={1}
        display={`${fmt(s.evsPerPoint)} : 1`}
        onChange={(v) => set({ evsPerPoint: v })}
      />
      <Slider
        id="pkw-density"
        label="Pkw je 1.000 Einwohner*innen"
        hint="Open Data Dortmund, Kraftfahrzeugdichte"
        value={s.pkwPer1000}
        min={300}
        max={650}
        step={5}
        display={fmt(s.pkwPer1000)}
        onChange={(v) => set({ pkwPer1000: v })}
      />
    </section>
  );
}
