import { useMemo } from 'react';
import type { AppData } from '../lib/data';
import { computeAll, fmt, pct, type DistrictResult, type Scenario } from '../lib/isme';
import type { BottomUpResult } from '../lib/bottomup';

// "From city-wide to bottom-up": the same scenario through the city-wide ISME spread
// and through the bottom-up model, what each local factor changes, and where.

interface Props {
  data: AppData;
  scenario: Scenario;
}

const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((a, r) => a + f(r), 0);

export function BottomUpReport({ data, scenario }: Props) {
  const districts = useMemo(() => data.districts.features.map((f) => f.properties), [data]);
  const base: Scenario = { ...scenario, model: 'bottomup' };
  const isme = useMemo(() => computeAll(districts, { ...scenario, model: 'isme', method: 'usecase' }), [districts, scenario]);
  const bu = useMemo(() => computeAll(districts, base), [districts, scenario]); // eslint-disable-line react-hooks/exhaustive-deps
  const buRows = bu.results as BottomUpResult[];

  // one factor at a time, everything else as in the scenario
  const effect = (patch: Partial<Scenario>) => computeAll(districts, { ...base, ...patch }).cityPoints - bu.cityPoints;
  const effects = [
    { label: 'Gewerbeflotten öffentlich', delta: -effect({ fleetPublic: 0 }) },
    { label: 'Entlastung durch HPC', delta: -effect({ hpcLever: false }) },
    { label: 'Verkehrswende (−20 % im Zentrum)', delta: computeAll(districts, { ...base, carReduction: 0.2 }).cityPoints - computeAll(districts, { ...base, carReduction: 0 }).cityPoints },
  ];

  const ismeBy = new Map(isme.results.map((r) => [r.ubz, r]));
  const changes = buRows
    .map((r) => ({ r, isme: (ismeBy.get(r.ubz) as DistrictResult).needed, delta: r.needed - (ismeBy.get(r.ubz) as DistrictResult).needed }))
    .sort((a, b) => b.delta - a.delta);
  const up = changes.slice(0, 8);
  const down = changes.slice(-8).reverse();
  const moved = sum(changes, (c) => Math.abs(c.delta)) / 2;

  const meta = data.meta.bottomup;
  const homeMin = Math.min(...buRows.map((r) => r.homeShare));
  const homeMax = Math.max(...buRows.map((r) => r.homeShare));
  const fMin = Math.min(...buRows.map((r) => r.streetFactorLocal));
  const fMax = Math.max(...buRows.map((r) => r.streetFactorLocal));

  return (
    <section id="bottom-up" className="report" aria-labelledby="bottom-up-h">
      <p className="eyebrow">Bericht</p>
      <h2 id="bottom-up-h">Von stadtweit zu Bottom-up</h2>
      <p className="lede">
        Die ISME-Tabelle rechnet mit Stadtdurchschnitten. Das Bottom-up-Modell ersetzt sie je Unterbezirk durch lokale Daten: wer zu Hause laden kann,
        wie oft Ladepunkte wechseln, wo Schnelllader entlasten, wo Flotten laden und wo weniger Autos zu erwarten sind.
      </p>

      <dl className="rkpis">
        <div>
          <dt>ISME stadtweit</dt>
          <dd className="num">{fmt(isme.cityPoints)} LP</dd>
          <span className="note">Excel-Anteile, auf Unterbezirke verteilt</span>
        </div>
        <div className="accent">
          <dt>Bottom-up</dt>
          <dd className="num">{fmt(bu.cityPoints)} LP</dd>
          <span className="note">{pct(bu.cityPoints / isme.cityPoints - 1)} gegenüber ISME</span>
        </div>
        <div>
          <dt>Umverteilt</dt>
          <dd className="num">{fmt(moved)} LP</dd>
          <span className="note">zwischen Unterbezirken verschoben</span>
        </div>
      </dl>

      <h3>Was die fünf lokalen Faktoren bewirken</h3>
      <div className="rtable-wrap">
        <table className="rtable">
          <thead>
            <tr>
              <th>Faktor</th>
              <th>Daten je Unterbezirk</th>
              <th>Spanne / Wirkung</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1 · Privates Laden zu Hause</td>
              <td>
                Wohnform aus ALKIS: {fmt(meta?.dwellingsEfh ?? 0)} Wohnungen in Ein-/Zweifamilienhäusern, {fmt(meta?.dwellingsMfh ?? 0)} in Mehrfamilienhäusern
              </td>
              <td>
                {pct(homeMin)} bis {pct(homeMax)} laden zu Hause (ISME: überall 52 %)
              </td>
            </tr>
            <tr>
              <td>2 · Teilungsfaktor Straßenraum</td>
              <td>
                Mischung Wohnen / Gewerbe aus ALKIS: {fmt(meta?.commerceBuildings ?? 0)} Handel/Büro, {fmt(meta?.industryBuildings ?? 0)} Gewerbe/Lager
              </td>
              <td>
                {fmt(fMin, 1)} bis {fmt(fMax, 1)} BEV je Ladepunkt (ISME: überall 2,8)
              </td>
            </tr>
            <tr>
              <td>3 · Schnelllader (HPC)</td>
              <td>{fmt(meta?.hpcPoints ?? 0)} HPC-Ladepunkte ≥ {meta?.hpcKw ?? 100} kW (OpenStreetMap)</td>
              <td>{fmtDelta(effects[1].delta)} LP</td>
            </tr>
            <tr>
              <td>4 · Gewerbeflotten</td>
              <td>{fmt(data.meta.totals.commercialCars)} gewerbliche Pkw (Statistik Stadt), von ISME nicht gezählt</td>
              <td>{fmtDelta(effects[0].delta)} LP</td>
            </tr>
            <tr>
              <td>5 · Verkehrswende</td>
              <td>
                ÖPNV-Anbindung: {fmt(meta?.railStops ?? 0)} Schienen- und {fmt(meta?.busStops ?? 0)} Bushaltestellen
              </td>
              <td>{fmtDelta(effects[2].delta)} LP, wenn −20 % im bestangebundenen Bezirk</td>
            </tr>
            <tr>
              <td>Gäste</td>
              <td>Pendelnde laden meist beim Arbeitgeber, Tourist*innen nur öffentlich (ISME-Gutachten, Sankey)</td>
              <td>Die Excel-Tabelle verteilt sie wie Einwohner*innen</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="ba">
        <div className="ba-col after">
          <h3>Mehr Bedarf als ISME stadtweit</h3>
          <ChangeList rows={up} />
        </div>
        <div className="ba-col before">
          <h3>Weniger Bedarf als ISME stadtweit</h3>
          <ChangeList rows={down} />
        </div>
      </div>
      <p className="muted small">
        Lesart: Dichte, gewerblich geprägte Quartiere mit vielen Zielen brauchen mehr öffentliche Ladepunkte als der Stadtdurchschnitt annimmt;
        Einfamilienhaus-Gebiete am Stadtrand deutlich weniger. Mit Kalibrierung bleiben 52 % Laden zu Hause und 2,8 BEV je Ladepunkt im Stadtmittel.
      </p>
    </section>
  );
}

function ChangeList({ rows }: { rows: { r: BottomUpResult; isme: number; delta: number }[] }) {
  return (
    <ol className="change-list">
      {rows.map(({ r, isme, delta }) => (
        <li key={r.ubz}>
          <span>
            {r.name}
            <small>
              {pct(r.homeShare)} zu Hause · {fmt(r.streetFactorLocal, 1)} BEV/LP
            </small>
          </span>
          <span className="num">
            {fmt(isme)} → <b>{fmt(r.needed)}</b> <small>({fmtDelta(delta)})</small>
          </span>
        </li>
      ))}
    </ol>
  );
}

const fmtDelta = (n: number) => `${n >= 0 ? '+' : '−'}${fmt(Math.abs(n))}`;
