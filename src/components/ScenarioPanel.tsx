import { fmt, pct, type CityBev, type Scenario } from '../lib/isme';
import type { Calibration } from '../lib/bottomup';

interface Props {
  scenario: Scenario;
  city: CityBev;
  cityPoints: number;
  evShareToday: number;
  onChange: (s: Scenario) => void;
  onReset: () => void;
  calibration?: Calibration;
  /** simple mode: only year and EV share */
  simple?: boolean;
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

export function ScenarioPanel({ scenario: s, city, cityPoints, evShareToday, calibration, simple = false, onChange, onReset }: Props) {
  const bottomUp = s.model === 'bottomup';
  const set = (patch: Partial<Scenario>) => onChange({ ...s, ...patch });

  return (
    <section className="panel" aria-labelledby="scenario-title">
      <div className="panel-head">
        <h2 id="scenario-title">{simple ? 'Szenario' : 'ISME-Szenario'}</h2>
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

      {!simple && (
        <>
      <Segmented<Scenario['model']>
        name="model"
        label="Modell"
        value={s.model}
        options={[
          { value: 'bottomup', label: 'Bottom-up je Unterbezirk' },
          { value: 'isme', label: 'ISME stadtweit' },
        ]}
        onChange={(model) => set({ model })}
        hint={
          bottomUp
            ? 'ISME-Methode mit lokalen Daten: Wohnform, Gewerbemix, HPC, Flotten, ÖPNV'
            : 'ISME-Tabelle unverändert, nur auf Unterbezirke verteilt (Vergleich)'
        }
      />
        </>
      )}

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

      {simple ? (
        <p className="hint">
          Bottom-up-Modell mit Standardannahmen. Alle Annahmen, das ISME-Vergleichsmodell und die lokalen Faktoren im Expertenmodus.
        </p>
      ) : (
        <>
      {!bottomUp && (
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
      )}

      {!bottomUp && s.method === 'ratio' ? (
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
            label={bottomUp ? 'Mittel BEV je Ladepunkt im Straßenraum' : 'BEV je Ladepunkt im Straßenraum'}
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

      {bottomUp && (
        <div className="subpanel">
          <h3>Lokale Faktoren je Unterbezirk</h3>
          <Slider
            id="home-efh"
            label="1 · Laden zu Hause im Ein-/Zweifamilienhaus"
            hint={`Wohnform aus ALKIS (Gebäudefunktion, Geschosse). Mehrfamilienhaus: ${pct(calibration?.homeMfh ?? s.homeMfh)}${s.calibrate ? ', kalibriert auf ISME 52 %' : ''}`}
            value={Math.round(s.homeEfh * 100)}
            min={50}
            max={89}
            step={1}
            display={pct(s.homeEfh)}
            onChange={(v) => set({ homeEfh: v / 100 })}
          />
          {!s.calibrate && (
            <Slider
              id="home-mfh"
              label="Laden zu Hause im Mehrfamilienhaus"
              hint="Ohne Kalibrierung frei wählbar"
              value={Math.round(s.homeMfh * 100)}
              min={0}
              max={80}
              step={1}
              display={pct(s.homeMfh)}
              onChange={(v) => set({ homeMfh: v / 100 })}
            />
          )}
          <Slider
            id="sharing-res"
            label="2 · BEV je Straßen-LP im Wohngebiet"
            hint="Über Nacht parken: wenige Autos teilen sich einen Ladepunkt"
            value={s.sharingRes}
            min={1}
            max={3}
            step={0.1}
            display={fmt(s.sharingRes, 1)}
            onChange={(sharingRes) => set({ sharingRes })}
          />
          <Slider
            id="sharing-com"
            label="BEV je Straßen-LP im Gewerbegebiet"
            hint={`Kurzes Parken: mehr Wechsel. Mischung aus ALKIS (Handel, Büro, Gewerbe)${s.calibrate ? `; skaliert ×${fmt(calibration?.sharingScale ?? 1, 2)} auf Mittel ${fmt(s.streetFactor, 1)}` : ''}`}
            value={s.sharingCom}
            min={3}
            max={8}
            step={0.5}
            display={fmt(s.sharingCom, 1)}
            onChange={(sharingCom) => set({ sharingCom })}
          />
          <Segmented<'on' | 'off'>
            name="calibrate"
            label="Auf ISME-Stadtmittel kalibrieren"
            value={s.calibrate ? 'on' : 'off'}
            options={[
              { value: 'on', label: 'Ja (52 %, 2,8)' },
              { value: 'off', label: 'Nein' },
            ]}
            onChange={(v) => set({ calibrate: v === 'on' })}
            hint="Ja: lokale Faktoren verteilen den ISME-Bedarf um, ohne das Stadtmittel zu ändern"
          />
          <Segmented<'on' | 'off'>
            name="hpc-lever"
            label="3 · HPC-Entlastung"
            value={s.hpcLever ? 'on' : 'off'}
            options={[
              { value: 'on', label: 'An' },
              { value: 'off', label: 'Aus' },
            ]}
            onChange={(v) => set({ hpcLever: v === 'on' })}
            hint="Vorhandene Schnelllader ≥ 100 kW (OSM) ersetzen bis zu 38 % des Straßenbedarfs im Bezirk"
          />
          <Slider
            id="fleet-public"
            label="4 · Gewerbeflotten: öffentlich ladend"
            hint="Gewerbliche Pkw je Unterbezirk (Statistik Stadt), die ISME nicht zählt"
            value={Math.round(s.fleetPublic * 100)}
            min={0}
            max={60}
            step={5}
            display={pct(s.fleetPublic)}
            onChange={(v) => set({ fleetPublic: v / 100 })}
          />
          <Slider
            id="car-reduction"
            label="5 · Verkehrswende: weniger Pkw (max.)"
            hint="Voll im bestangebundenen Bezirk, kaum am Stadtrand (Wohngebäude ≤ 600 m zur Schiene). ISME zeigt −20 %."
            value={Math.round(s.carReduction * 100)}
            min={0}
            max={30}
            step={5}
            display={s.carReduction > 0 ? `−${pct(s.carReduction)}` : 'aus'}
            onChange={(v) => set({ carReduction: v / 100 })}
          />
        </div>
      )}

      {!bottomUp && (
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
      )}

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
          { value: 'mixed', label: 'Ziele + POIs, Hotels' },
          { value: 'pois', label: 'Nur POIs' },
          { value: 'commercialCars', label: 'Gewerbliche Pkw' },
        ]}
        onChange={(touristKey) => set({ touristKey })}
        hint={
          s.touristKey === 'mixed'
            ? 'Tagesgäste je ½ nach touristischen Zielen (Stadt) und Einkauf/Freizeit (OSM), Übernachtungsgäste nach Unterkünften'
            : 'POIs aus OpenStreetMap, wie im ISME-Gutachten'
        }
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
        </>
      )}
    </section>
  );
}
