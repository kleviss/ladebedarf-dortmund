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

      <TourismCheck data={data} scenario={base} />

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

/** Cross-check: how tourists are spread with city attractions vs OSM shops/leisure only. */
function TourismCheck({ data, scenario }: { data: AppData; scenario: Scenario }) {
  const districts = data.districts.features.map((f) => f.properties);
  const poiOf = (d: (typeof districts)[number]) => (d.poisShopping ?? 0) + (d.poisLeisure ?? 0);
  const totalPoi = sum(districts, poiOf);
  const totalAttr = sum(districts, (d) => d.attractions ?? 0);
  if (!totalAttr || !totalPoi) return null;
  const a = districts.map((d) => (d.attractions ?? 0) / totalAttr);
  const p = districts.map((d) => poiOf(d) / totalPoi);
  const r = correlation(a, p);
  const now = new Map(computeAll(districts, { ...scenario, touristKey: 'mixed' }).results.map((x) => [x.ubz, x.bevTourists]));
  const before = new Map(computeAll(districts, { ...scenario, touristKey: 'pois' }).results.map((x) => [x.ubz, x.bevTourists]));
  const rows = districts
    .map((d, i) => ({ d, attr: a[i], poi: p[i], now: now.get(d.ubz) ?? 0, before: before.get(d.ubz) ?? 0 }))
    .sort((x, y) => Math.abs(y.now - y.before) - Math.abs(x.now - x.before))
    .slice(0, 10);
  const t = data.meta.tourism;
  return (
    <>
      <h3>Tourismus: Ziele der Stadt gegen Einkauf/Freizeit</h3>
      <p className="muted small">
        Tagesgäste werden je zur Hälfte nach den {fmt(totalAttr)} touristischen Zielen der Stadt (Sehenswürdigkeiten, Museen, Veranstaltungsorte,
        Stadion) und nach {fmt(totalPoi)} Einkaufs- und Freizeitorten aus OpenStreetMap verteilt, Übernachtungsgäste nach {fmt(t?.hotels ?? 0)}{' '}
        Unterkünften ({fmt(t?.overnightStays ?? 0)} Übernachtungen {t?.overnightYear}). Beide Verteilungen hängen eng zusammen (Korrelation{' '}
        {fmt(r, 2)}); die größten Unterschiede:
      </p>
      <div className="rtable-wrap">
        <table className="rtable">
          <thead>
            <tr>
              <th>Unterbezirk</th>
              <th className="num">Ziele</th>
              <th className="num">Anteil Ziele</th>
              <th className="num">Anteil POIs</th>
              <th className="num">Tourismus-BEV nur POIs</th>
              <th className="num">mit Zielen + Hotels</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ d, attr, poi, now: n, before: b }) => (
              <tr key={d.ubz}>
                <td>
                  {d.name}
                  {d.attractionNames && d.attractionNames.length > 0 && <small>{d.attractionNames.slice(0, 3).join(', ')}</small>}
                </td>
                <td className="num">{fmt(d.attractions ?? 0)}</td>
                <td className="num">{pct(attr, 1)}</td>
                <td className="num">{pct(poi, 1)}</td>
                <td className="num">{fmt(b)}</td>
                <td className="num strong">
                  {fmt(n)} <small>({fmtDelta(n - b)})</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <HotelsNearAttractions data={data} />
    </>
  );
}

/** Do guests stay close to what they visit? Hotels within 1.5 km of each attraction. */
function HotelsNearAttractions({ data }: { data: AppData }) {
  const ziele = data.ziele.features.map((f) => f.properties);
  if (!ziele.length) return null;
  const districts = data.districts.features.map((f) => f.properties);
  const r = correlation(
    districts.map((d) => d.attractions ?? 0),
    districts.map((d) => d.hotels ?? 0),
  );
  const t = data.meta.tourism;
  // outside the city centre (> 2 km from the Reinoldikirche), where hotel clusters say more
  const coords = new Map(data.ziele.features.map((f) => [f.properties.name, f.geometry.coordinates]));
  const fromCentre = (name: string) => {
    const [x, y] = coords.get(name) ?? [0, 0];
    return Math.hypot((x - 7.4653) * 69400, (y - 51.5139) * 110570);
  };
  const outside = ziele
    .filter((z) => fromCentre(z.name) > 2000)
    .sort((a, b) => b.hotelsNear - a.hotelsNear)
    .slice(0, 8);
  const lonely = ziele.filter((z) => z.hotelsNear === 0);
  const names = new Map(districts.map((d) => [d.ubz, d.name]));
  return (
    <>
      <h3>Übernachten nahe den Zielen</h3>
      <p className="muted small">
        {fmt(t?.hotelsNearAttractions ?? 0)} von {fmt(t?.hotels ?? 0)} Unterkünften liegen höchstens 1,5 km von einem touristischen Ziel entfernt;
        Ziele und Unterkünfte je Unterbezirk korrelieren mit {fmt(r, 2)}. Deshalb zählt eine Unterkunft mit Zielen in der Nähe bis zu doppelt, wenn
        Übernachtungsgäste verteilt werden: Wer zum Spiel ins Stadion fährt, übernachtet oft in den Hotels an den Westfalenhallen. Ziele mehr als 2 km vom Stadtzentrum:
      </p>
      <div className="rtable-wrap">
        <table className="rtable">
          <thead>
            <tr>
              <th>Ziel</th>
              <th>Unterbezirk</th>
              <th className="num">Unterkünfte ≤ 1,5 km</th>
              <th>z. B.</th>
            </tr>
          </thead>
          <tbody>
            {outside.map((z) => (
              <tr key={z.name}>
                <td>
                  {z.name}
                  <small>{z.kind}</small>
                </td>
                <td>{names.get(z.ubz)}</td>
                <td className="num strong">{fmt(z.hotelsNear)}</td>
                <td>{z.hotelNames.slice(0, 3).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {lonely.length > 0 && (
        <p className="muted small">
          Ohne Unterkunft in 1,5 km ({lonely.length}): {lonely.map((z) => z.name).join(', ')}.
        </p>
      )}
    </>
  );
}

function correlation(x: number[], y: number[]) {
  const n = x.length;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
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
