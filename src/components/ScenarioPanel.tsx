import { fmt, pct, type CityBev, type Scenario } from '../lib/isme';

interface Props {
  scenario: Scenario;
  city: CityBev;
  cityPoints: number;
  evShareToday: number;
  onChange: (s: Scenario) => void;
  onReset: () => void;
}

interface Option<T> {
  value: T;
  label: string;
}

function Segmented<T extends string | number>({
  name,
  label,
  value,
  options,
  onChange,
  hint,
}: {
  name: string;
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  hint?: string;
}) {
  return (
    <fieldset className="segmented">
      <legend>{label}</legend>
      <div className="segmented-options">
        {options.map((o) => (
          <label key={String(o.value)} className={o.value === value ? 'is-active' : undefined}>
            <input
              type="radio"
              name={name}
              value={String(o.value)}
              checked={o.value === value}
              onChange={() => onChange(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>
      {hint && <p className="hint">{hint}</p>}
    </fieldset>
  );
}

function Slider({
  id,
  label,
  hint,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="slider">
      <div className="slider-head">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id} className="num">
          {display}
        </output>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <p className="hint">{hint}</p>
    </div>
  );
}

export function ScenarioPanel({ scenario: s, city, cityPoints, evShareToday, onChange, onReset }: Props) {
  const set = (patch: Partial<Scenario>) => onChange({ ...s, ...patch });

  return (
    <section className="panel" aria-labelledby="scenario-title">
      <div className="panel-head">
        <h2 id="scenario-title">ISME-Szenario</h2>
        <button type="button" className="link-button" onClick={onReset}>
          Zurücksetzen
        </button>
      </div>

      <div className="city-sum">
        <span>
          Stadtweit <b className="num">{fmt(city.total)}</b> BEV
        </span>
        <span>
          → <b className="num">{fmt(cityPoints)}</b> LP
        </span>
        <span className="muted">
          {fmt(city.residents)} Einwohner · {fmt(city.commuters)} Pendelnde · {fmt(city.tourists)} Tourismus
        </span>
      </div>

      <Segmented<Scenario['year']>
        name="year"
        label="Zieljahr"
        value={s.year}
        options={[
          { value: 2030, label: '2030' },
          { value: 2036, label: '2036' },
        ]}
        onChange={(year) => set({ year })}
        hint={`Pkw-Bestand laut ISME: ${s.year === 2030 ? '291.451' : '302.435'}`}
      />

      <Slider
        id="bev-share"
        label="BEV-Anteil am Pkw-Bestand"
        hint={`Heute ${pct(evShareToday, 1)} E-Pkw (Statistik Stadt, inkl. gewerblich). Excel-Szenarien: 5–50 %`}
        value={Math.round(s.bevShare * 100)}
        min={5}
        max={50}
        step={1}
        display={pct(s.bevShare)}
        onChange={(v) => set({ bevShare: v / 100 })}
      />

      <Segmented<Scenario['method']>
        name="method"
        label="Berechnung"
        value={s.method}
        options={[
          { value: 'usecase', label: 'Lade-Use-Cases' },
          { value: 'ratio', label: 'Verhältnis BEV : LP' },
        ]}
        onChange={(method) => set({ method })}
      />

      {s.method === 'ratio' ? (
        <Segmented<number>
          name="ratio"
          label="BEV je Ladepunkt"
          value={s.ratio}
          options={[11, 15, 20].map((r) => ({ value: r, label: `${r} : 1` }))}
          onChange={(ratio) => set({ ratio })}
          hint="Zeilen 24–26 der ISME-Tabelle"
        />
      ) : (
        <>
          <Segmented<Scenario['scope']>
            name="scope"
            label="Welche Ladepunkte zählen"
            value={s.scope}
            options={[
              { value: 'public', label: 'Öffentlich zugänglich' },
              { value: 'street', label: 'Nur Straßenraum' },
            ]}
            onChange={(scope) => set({ scope })}
            hint={s.scope === 'public' ? 'Straßenraum, Parkhäuser, Kundenparkplätze, HPC-Hubs' : 'Der Teil, den die Stadt direkt steuert'}
          />
          <Segmented<number>
            name="street-factor"
            label="BEV je Ladepunkt im Straßenraum"
            value={s.streetFactor}
            options={[
              { value: 2.8, label: '2,8 (ISME)' },
              { value: 5, label: '5 (Alternative)' },
            ]}
            onChange={(streetFactor) => set({ streetFactor })}
          />
          {s.scope === 'public' && (
            <Segmented<number>
              name="customer-share"
              label="Anteil Kundenparkplätze"
              value={s.customerShare}
              options={[
                { value: 0.103, label: '10,3 % (Beschriftung)' },
                { value: 0.013, label: '1,3 % (Excel-Formel)' },
              ]}
              onChange={(customerShare) => set({ customerShare })}
              hint="Die ISME-Tabelle beschriftet 10,3 %, rechnet aber mit 1,3 %."
            />
          )}
        </>
      )}

      <Segmented<Scenario['residentKey']>
        name="resident-key"
        label="Einwohner-BEV verteilen nach"
        value={s.residentKey}
        options={[
          { value: 'cars', label: 'Private Pkw' },
          { value: 'evs', label: 'Private E-Pkw heute' },
        ]}
        onChange={(residentKey) => set({ residentKey })}
      />

      <Segmented<Scenario['commuterKey']>
        name="commuter-key"
        label="Pendelnde verteilen nach"
        value={s.commuterKey}
        options={[
          { value: 'commercialArea', label: 'Gewerbeflächen' },
          { value: 'commercialCars', label: 'Gewerbliche Pkw' },
        ]}
        onChange={(commuterKey) => set({ commuterKey })}
        hint="Gewerbeflächen: RVR-Flächennutzung 2021 (Stadt), Näherung für Arbeitsplätze"
      />

      <Segmented<Scenario['touristKey']>
        name="tourist-key"
        label="Tourismus verteilen nach"
        value={s.touristKey}
        options={[
          { value: 'pois', label: 'Einkauf + Freizeit (POIs)' },
          { value: 'commercialCars', label: 'Gewerbliche Pkw' },
        ]}
        onChange={(touristKey) => set({ touristKey })}
        hint="POIs aus OpenStreetMap, wie im ISME-Gutachten"
      />

      <Slider
        id="points-per-site"
        label="Ladepunkte je Bestandsstandort"
        hint="Die Bestandsdatei enthält 912 Standorte; ob das Säulen oder Ladepunkte sind, klären wir mit der Stadt."
        value={s.pointsPerSite}
        min={1}
        max={4}
        step={1}
        display={fmt(s.pointsPerSite)}
        onChange={(pointsPerSite) => set({ pointsPerSite })}
      />
    </section>
  );
}
