import { useEffect, useMemo, useState } from 'react';
import { loadData, type AppData, type DistanceBand, type ParkingSpot } from '../lib/data';
import { computeAll, fmt, pct, ISME, useCasesFor, type DistrictResult, type Scenario } from '../lib/isme';
import { readUrlState } from '../lib/urlState';
import { PageTabs } from '../components/PageTabs';
import { BottomUpReport } from './BottomUpReport';
import { ModeToggle } from '../components/ModeToggle';
import { useExpertMode } from '../lib/mode';
import { CriteriaTable, criteriaOf, scoredSites, SitesReport, type Criterion } from './SitesReport';

// One page, several presentation-ready reports. Each report is a <section> with
// an anchor so it can be opened directly (berichte#vorher-nachher) and printed.

const REPORTS = [
  { id: 'vorher-nachher', title: 'Vorher / Nachher' },
  { id: 'prioritaeten', title: 'Prioritäten je Unterbezirk' },
  { id: 'parken', title: 'Parken und Ladeinfrastruktur' },
  { id: 'abdeckung', title: 'Abdeckung nach Gehweite' },
  { id: 'bottom-up', title: 'Von stadtweit zu Bottom-up' },
  { id: 'standorte', title: 'Standorte im Unterbezirk' },
  { id: 'methode', title: 'Methode und Kriterien' },
  { id: 'datenqualitaet', title: 'Datenqualität und offene Fragen' },
] as const;

/** Shown in simple mode: what the pitch needs. */
const SIMPLE_REPORTS = new Set<string>(['vorher-nachher', 'prioritaeten', 'parken']);

export function Reports() {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadData().then(setData, (e: Error) => setError(e.message));
  }, []);
  if (error) return <div className="state">{error}</div>;
  if (!data) return <div className="state">Lade Daten …</div>;
  return <ReportBody data={data} />;
}

function ReportBody({ data }: { data: AppData }) {
  const scenario = useMemo(() => readUrlState().scenario, []);
  const districts = useMemo(() => data.districts.features.map((f) => f.properties), [data]);
  const { results, city, cityPoints } = useMemo(() => computeAll(districts, scenario), [districts, scenario]);
  const sites = useMemo(() => scoredSites(data), [data]);
  const [expert, setExpert] = useExpertMode();
  const appLink = `/${window.location.search}`;
  const visible = REPORTS.filter((r) => expert || SIMPLE_REPORTS.has(r.id));

  return (
    <>
      {/* same top bar as the map page, so switching tabs doesn't move anything */}
      <header className="topbar">
        <div className="brand">
          <div className="title-row">
            <h1>Ladebedarf Dortmund</h1>
            <PageTabs current="berichte" />
            <ModeToggle expert={expert} onChange={setExpert} />
          </div>
          <p className="muted">
            Berichte · {scenario.year}, {pct(scenario.bevShare)} BEV ·{' '}
            {scenario.model === 'bottomup' ? 'Bottom-up je Unterbezirk' : scenario.method === 'usecase' ? 'ISME, Lade-Use-Cases' : `ISME, Verhältnis ${scenario.ratio}:1`} ·{' '}
            {scenario.scope === 'street' ? 'nur Straßenraum' : 'öffentlich zugängliche LP'}
          </p>
        </div>
        <button type="button" className="button" onClick={() => window.print()}>
          Drucken / PDF
        </button>
      </header>

    <div className="reports">
      <nav className="reports-nav" aria-label="Berichte">
        <span className="muted">Im Bericht springen:</span>
        {visible.map((r) => (
          <a key={r.id} href={`#${r.id}`}>
            {r.title}
          </a>
        ))}
        <a className="muted" href={appLink}>
          Szenario in der Karte ändern
        </a>
      </nav>

      <BeforeAfter results={results} cityPoints={cityPoints} scenario={scenario} totalBev={city.total} data={data} />
      <Priorities results={results} />
      <Parking results={results} spots={data.parking.features.map((f) => f.properties)} data={data} />
      {expert ? (
        <>
          <Coverage results={results} data={data} />
          <BottomUpReport data={data} scenario={scenario} />
          <SitesReport data={data} results={results} sites={sites} />
          <Method scenario={scenario} cityPoints={cityPoints} city={city} criteria={criteriaOf(data, results, city, sites)} />
          <DataQuality data={data} />
        </>
      ) : (
        <section className="report more-reports">
          <h2>Weitere Berichte</h2>
          <p className="muted">
            {REPORTS.length - visible.length} Berichte für die Fachdiskussion:{' '}
            {REPORTS.filter((r) => !SIMPLE_REPORTS.has(r.id))
              .map((r) => r.title)
              .join(', ')}
            .
          </p>
          <button type="button" className="button" onClick={() => setExpert(true)}>
            Im Expertenmodus anzeigen
          </button>
        </section>
      )}

      <footer className="reports-foot">
        Daten: Stadt Dortmund (Sciebo Team 07, ISME-Gutachten Dez. 2023), Open Data Dortmund (dl-de/by-2-0), © OpenStreetMap-Mitwirkende (ODbL).
        Stand {new Date(data.meta.fetchedAt).toLocaleDateString('de-DE')}.
      </footer>
    </div>
    </>
  );
}

function Report({ id, title, lede, children }: { id: string; title: string; lede: string; children: React.ReactNode }) {
  return (
    <section id={id} className="report" aria-labelledby={`${id}-h`}>
      <p className="eyebrow">Bericht</p>
      <h2 id={`${id}-h`}>{title}</h2>
      <p className="lede">{lede}</p>
      {children}
    </section>
  );
}

function Kpis({ items }: { items: { label: string; value: string; note?: string; accent?: boolean }[] }) {
  return (
    <dl className="rkpis">
      {items.map((k) => (
        <div key={k.label} className={k.accent ? 'accent' : undefined}>
          <dt>{k.label}</dt>
          <dd className="num">{k.value}</dd>
          {k.note && <span className="note">{k.note}</span>}
        </div>
      ))}
    </dl>
  );
}

/** Horizontal bars on one scale; labels in text colour, value at the end. */
function Bars({ rows, format, max }: { rows: { label: string; sub?: string; value: number }[]; format: (n: number) => string; max?: number }) {
  const top = max ?? Math.max(...rows.map((r) => r.value), 1);
  return (
    <ol className="rbars">
      {rows.map((r, i) => (
        <li key={r.label + i}>
          <span className="rbars-label">
            {r.label}
            {r.sub && <small>{r.sub}</small>}
          </span>
          <span className="rbars-track">
            <span className="rbars-bar" style={{ width: `${Math.max(0.5, (r.value / top) * 100)}%` }} />
          </span>
          <span className="rbars-value num">{format(r.value)}</span>
        </li>
      ))}
    </ol>
  );
}

// --- 1 Before / after -----------------------------------------------------------------

function BeforeAfter({ results, cityPoints, scenario, totalBev, data }: { results: DistrictResult[]; cityPoints: number; scenario: Scenario; totalBev: number; data: AppData }) {
  const gap = results.reduce((a, r) => a + r.gap, 0);
  const existing = results.reduce((a, r) => a + r.existing, 0);
  const noCharger = results.filter((r) => r.chargers === 0).length;
  const top10Share = [...results].sort((a, b) => b.gap - a.gap).slice(0, 10).reduce((a, r) => a + r.gap, 0) / (gap || 1);
  return (
    <Report
      id="vorher-nachher"
      title="Vorher / Nachher"
      lede="Was die Stadt heute hat, und was unser Werkzeug daraus macht."
    >
      <div className="ba">
        <div className="ba-col before">
          <h3>Vorher</h3>
          <ul>
            <li>Ein stadtweiter Korridor: <b>3.400 bis 7.000 Ladepunkte</b> bis 2030 (ISME-Gutachten).</li>
            <li>Rechenweg in einer Excel-Tabelle und einem 29-seitigen PDF.</li>
            <li>Verteilung auf Unterbezirke nur als statische Karte im Gutachten.</li>
            <li>Bestand, Parken, Gewerbe, Ziele und Neubau liegen in getrennten Dateien.</li>
            <li>Annahmen ändern heißt: Excel neu rechnen, Karte neu zeichnen.</li>
          </ul>
        </div>
        <div className="ba-col after">
          <h3>Nachher</h3>
          <ul>
            <li>
              <b>{fmt(cityPoints)} Ladepunkte</b> für {fmt(totalBev)} BEV im Szenario {scenario.year}, aufgeteilt auf{' '}
              <b>{results.length} Unterbezirke</b>.
            </li>
            <li>Jede Zahl mit Formel und Quelle: Daten Stadt, ISME, Annahme oder Ergebnis.</li>
            <li>Szenario in Sekunden ändern: Jahr, BEV-Anteil, Methode, Verteilschlüssel.</li>
            <li>{fmt(data.parking.features.length)} öffentliche Parkflächen als Standortkandidaten, mit Abstand zum nächsten Ladestandort.</li>
            <li>Rangliste als CSV, Szenario als Link teilbar.</li>
          </ul>
        </div>
      </div>
      <Kpis
        items={[
          { label: 'Bedarf', value: `${fmt(cityPoints)} LP`, note: `Szenario ${scenario.year}` },
          { label: 'Bestand', value: `${fmt(existing)} LP`, note: `${fmt(data.meta.totals.chargers)} Standorte` },
          { label: 'Lücke', value: `${fmt(gap)} LP`, accent: true },
          { label: 'Unterbezirke ohne Ladestandort', value: fmt(noCharger), note: `von ${results.length}` },
          { label: 'Top 10 tragen', value: pct(top10Share), note: 'der gesamten Lücke' },
        ]}
      />
      <h3>Nutzen für die Planung</h3>
      <ul className="value">
        <li><b>Begründbar:</b> Ausbau dort, wo Bedarf nachvollziehbar belegt ist; wichtig, weil Ladepunkte mit Radwegen, Gehwegen und Grün um Fläche konkurrieren.</li>
        <li><b>Schnell:</b> Analyse je Unterbezirk mit einem Klick statt Gutachten-Update.</li>
        <li><b>Steuerbar:</b> Parkhäuser und P+R ohne Ladepunkt zuerst, Straßenraum gezielt danach.</li>
        <li><b>Anschlussfähig:</b> Rangliste als Grundlage für eine Sondernutzungsrichtlinie oder Konzessionen.</li>
      </ul>
    </Report>
  );
}

// --- 2 Priorities ---------------------------------------------------------------------

function Priorities({ results }: { results: DistrictResult[] }) {
  const top = [...results].sort((a, b) => b.gap - a.gap).slice(0, 15);
  return (
    <Report id="prioritaeten" title="Prioritäten je Unterbezirk" lede="Die 15 Unterbezirke mit den meisten fehlenden Ladepunkten, mit den Faktoren dahinter.">
      <Bars rows={top.map((r) => ({ label: r.name, sub: r.stadtbezirk, value: r.gap }))} format={(n) => `${fmt(n)} LP`} />
      <div className="rtable-wrap">
        <table className="rtable">
          <thead>
            <tr>
              <th>#</th>
              <th>Unterbezirk</th>
              <th className="num">BEV</th>
              <th className="num">Bedarf</th>
              <th className="num">Bestand</th>
              <th className="num">Lücke</th>
              <th className="num">Parken o. LP</th>
              <th className="num">Gebäude abgedeckt</th>
            </tr>
          </thead>
          <tbody>
            {top.map((r, i) => (
              <tr key={r.ubz}>
                <td className="num">{i + 1}</td>
                <td>
                  {r.name}
                  <small>{r.stadtbezirk}</small>
                </td>
                <td className="num">{fmt(r.bev)}</td>
                <td className="num">{fmt(r.needed)}</td>
                <td className="num">{fmt(r.existing)}</td>
                <td className="num strong">{fmt(r.gap)}</td>
                <td className="num">{fmt(r.parkingUncovered ?? 0)}</td>
                <td className="num">{r.buildings ? pct((r.buildingsCovered ?? 0) / r.buildings) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Report>
  );
}

// --- 3 Parking ------------------------------------------------------------------------

const KIND_LABEL: Record<ParkingSpot['kind'], string> = {
  lot: 'Parkplatz',
  street: 'Straßenrand',
  garage: 'Parkhaus / Tiefgarage',
  'park-ride': 'Park+Ride',
};

function Parking({ results, spots, data }: { results: DistrictResult[]; spots: ParkingSpot[]; data: AppData }) {
  const kinds = (['garage', 'park-ride', 'lot', 'street'] as const).map((k) => {
    const all = spots.filter((s) => s.kind === k);
    return { k, n: all.length, uncovered: all.filter((s) => s.cover === 2).length };
  });
  const uncovered = spots.filter((s) => s.cover === 2).length;
  const bigFar = spots
    .filter((s) => s.cover === 2 && (s.kind === 'garage' || s.kind === 'park-ride' || (s.capacity ?? 0) >= 50))
    .sort((a, b) => (b.capacity ?? 0) - (a.capacity ?? 0));
  const byName = new Map(results.map((r) => [r.ubz, r]));
  const topDistricts = [...results]
    .filter((r) => r.gap > 0)
    .sort((a, b) => b.gap * (1 + (b.parkingUncovered ?? 0)) - a.gap * (1 + (a.parkingUncovered ?? 0)))
    .slice(0, 10);
  return (
    <Report
      id="parken"
      title="Parken und Ladeinfrastruktur"
      lede="Öffentliche Parkflächen sind die naheliegenden Standorte für neue Ladepunkte, ohne Radwegen oder Gehwegen Platz zu nehmen."
    >
      <Kpis
        items={[
          { label: 'Öffentliche Parkflächen', value: fmt(spots.length), note: 'OSM, Parkhäuser, P+R' },
          { label: 'Ohne Ladestandort in 225 m', value: fmt(uncovered), note: pct(uncovered / (spots.length || 1)), accent: true },
          { label: 'Große Flächen ohne Ladestandort', value: fmt(bigFar.length), note: 'Parkhaus, P+R oder ≥ 50 Plätze' },
        ]}
      />
      <DistanceTable data={data} />
      <h3>Anteil ohne Ladestandort in 225 m, nach Art</h3>
      <Bars
        rows={kinds.map((x) => ({ label: KIND_LABEL[x.k], sub: `${fmt(x.uncovered)} von ${fmt(x.n)}`, value: x.n ? x.uncovered / x.n : 0 }))}
        format={(n) => pct(n)}
        max={1}
      />
      <h3>Schnelle Kandidaten: große Parkflächen ohne Ladestandort</h3>
      <div className="rtable-wrap">
        <table className="rtable">
          <thead>
            <tr>
              <th>Fläche</th>
              <th>Art</th>
              <th>Unterbezirk</th>
              <th className="num">Plätze</th>
              <th className="num">Nächster Ladestandort</th>
            </tr>
          </thead>
          <tbody>
            {bigFar.slice(0, 15).map((s, i) => (
              <tr key={i}>
                <td>{s.name ?? <span className="muted">ohne Namen</span>}</td>
                <td>{KIND_LABEL[s.kind]}</td>
                <td>{byName.get(s.ubz)?.name}</td>
                <td className="num">{s.capacity ? fmt(s.capacity) : '–'}</td>
                <td className="num">{fmt(s.distance)} m</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Unterbezirke mit großer Lücke und viel ungenutzter Parkfläche</h3>
      <Bars rows={topDistricts.map((r) => ({ label: r.name, sub: `Lücke ${fmt(r.gap)} LP`, value: r.parkingUncovered ?? 0 }))} format={(n) => `${fmt(n)} Flächen`} />
      <p className="muted small">
        Quelle Parken: {data.meta.parking?.sources.join('; ')}. Kapazität ist in OSM oft nicht erfasst.
      </p>
    </Report>
  );
}

function DistanceTable({ data }: { data: AppData }) {
  const d = data.meta.parking?.distance;
  if (!d) return null;
  const rows: { label: string; b: DistanceBand; strong?: boolean }[] = [
    { label: 'Öffentliche Parkflächen, gesamt', b: d.public, strong: true },
    { label: 'davon Parkhaus / Tiefgarage', b: d.byKind.garage },
    { label: 'davon Park+Ride', b: d.byKind['park-ride'] },
    { label: 'davon Parkplatz', b: d.byKind.lot },
    { label: 'davon Straßenrand', b: d.byKind.street },
    { label: 'Kundenparkplätze (Handel, zum Vergleich)', b: d.customers, strong: true },
  ];
  const share = (b: DistanceBand, m: number) => (b.n ? (b.within[String(m)] ?? 0) / b.n : 0);
  return (
    <>
      <h3>Abstand zum nächsten Ladestandort</h3>
      <p className="muted small">
        Anteil der Parkflächen, die höchstens so weit vom nächsten der {fmt(data.meta.totals.chargers)} Ladestandorte entfernt sind. 225 m ist die
        ISME-Gehweite für Wohnen.
      </p>
      <div className="rtable-wrap">
        <table className="rtable">
          <thead>
            <tr>
              <th>Parkflächen</th>
              <th className="num">Anzahl</th>
              {d.bands.map((m) => (
                <th key={m} className="num">
                  ≤ {fmt(m)} m
                </th>
              ))}
              <th className="num">Median</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ label, b, strong }) => (
              <tr key={label} className={strong ? 'row-strong' : undefined}>
                <td>{label}</td>
                <td className="num">{fmt(b.n)}</td>
                {d.bands.map((m) => (
                  <td key={m} className={`num${m === 225 ? ' strong' : ''}`}>
                    {pct(share(b, m))}
                  </td>
                ))}
                <td className="num">{fmt(b.median)} m</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small">
        <b>Lesart:</b> Nur {pct(share(d.public, 225))} der öffentlichen Parkflächen liegen in Gehweite (225 m) eines Ladestandorts, bei
        Kundenparkplätzen sind es {pct(share(d.customers, 225))}. Die Hälfte der öffentlichen Parkflächen ist mehr als {fmt(d.public.median)} m vom
        nächsten Ladestandort entfernt.
      </p>
    </>
  );
}

// --- 4 Coverage -------------------------------------------------------------------------

function Coverage({ results, data }: { results: DistrictResult[]; data: AppData }) {
  const e = data.meta.enrichment;
  const worst = [...results]
    .filter((r) => (r.buildings ?? 0) >= 100)
    .map((r) => ({ r, share: (r.buildingsCovered ?? 0) / (r.buildings || 1) }))
    .sort((a, b) => a.share - b.share)
    .slice(0, 15);
  return (
    <Report
      id="abdeckung"
      title="Abdeckung nach Gehweite"
      lede="Das ISME-Gutachten misst Versorgung über Gehweiten: 225 m zum Wohnen. Wie viele Gebäude liegen so nah an einem Ladestandort?"
    >
      {e && (
        <Kpis
          items={[
            { label: 'Gebäude', value: fmt(e.buildings) },
            { label: '≤ 225 m zum Ladestandort', value: pct(e.buildingsCovered / e.buildings), accent: true },
            { label: 'Weiter entfernt', value: fmt(e.buildings - e.buildingsCovered) },
          ]}
        />
      )}
      <h3>Am schlechtesten abgedeckte Unterbezirke (ab 100 Gebäuden)</h3>
      <Bars rows={worst.map(({ r, share }) => ({ label: r.name, sub: `${fmt(r.buildings ?? 0)} Gebäude · Lücke ${fmt(r.gap)} LP`, value: share }))} format={(n) => pct(n)} max={1} />
      <p className="muted small">Weitere ISME-Gehweiten (Arbeit 500 m, Einkauf 100 m, Freizeit 375 m) sind als nächster Schritt vorgesehen.</p>
    </Report>
  );
}

// --- 5 Method --------------------------------------------------------------------------

function Method({ scenario, cityPoints, city, criteria }: { scenario: Scenario; cityPoints: number; city: { residents: number; commuters: number; tourists: number; total: number }; criteria: Criterion[] }) {
  const ucs = useCasesFor(scenario);
  return (
    <Report id="methode" title="Methode und Kriterien" lede="Die ISME-Methode der Stadt, je Unterbezirk umgesetzt, und welche Kriterien wir wie abdecken.">
      <ol className="chain">
        <li><b>{fmt(ISME.cars[scenario.year])}</b> Pkw {scenario.year} × {pct(scenario.bevShare)} → <b>{fmt(city.residents)}</b> BEV Einwohner*innen</li>
        <li>99.400 Pendler-Pkw × {pct(scenario.bevShare)} → <b>{fmt(city.commuters)}</b> BEV Einpendelnde</li>
        <li>Tages- und Übernachtungstourismus → <b>{fmt(city.tourists)}</b> BEV im Tagesmittel</li>
        <li>Summe <b>{fmt(city.total)}</b> BEV → sieben Lade-Use-Cases → <b>{fmt(cityPoints)}</b> Ladepunkte</li>
      </ol>
      <div className="rtable-wrap">
        <table className="rtable">
          <thead>
            <tr>
              <th>Lade-Use-Case</th>
              <th className="num">Anteil BEV</th>
              <th className="num">BEV je LP</th>
              <th>Zugang</th>
            </tr>
          </thead>
          <tbody>
            {ucs.map((u) => (
              <tr key={u.key}>
                <td>{u.label}</td>
                <td className="num">{pct(u.share, 1)}</td>
                <td className="num">{fmt(u.evsPerPoint, 2)}</td>
                <td>{u.access === 'public' ? 'öffentlich zugänglich' : 'privat'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Kriterien</h3>
      <CriteriaTable criteria={criteria} />
    </Report>
  );
}

// --- 6 Data quality --------------------------------------------------------------------

function DataQuality({ data }: { data: AppData }) {
  const t = data.meta.totals;
  return (
    <Report id="datenqualitaet" title="Datenqualität und offene Fragen" lede="Was uns beim Zusammenführen aufgefallen ist, und was wir mit der Stadt klären sollten.">
      <ul className="value">
        <li><b>ISME-Excel:</b> Kundenparkplätze sind mit 10,3 % beschriftet, die Formel rechnet mit 1,3 % (<code>=C22*0.013</code>). Im Werkzeug umschaltbar.</li>
        {data.meta.fixes.map((f) => (
          <li key={f}><b>Shapefile:</b> {f}. Beim Import korrigiert.</li>
        ))}
        <li><b>Ladebestand:</b> {fmt(t.chargers)} Einträge; ob Standorte oder Ladepunkte, ist offen. {t.chargersOutside} liegt außerhalb aller Unterbezirke.</li>
        <li><b>Gebietsstand:</b> Die Statistik nutzt {t.units} Einheiten, Open Data 170 Unterbezirke; einige sind zusammengefasst.</li>
        <li><b>Prioritätsraster:</b> {fmt(t.priorityCells)} Zellen (225 m) mit Punktzahl; die Bedeutung der Punkte ist zu klären.</li>
        <li><b>Stromnetz:</b> keine Daten vorhanden.</li>
        <li><b>Gehweiten:</b> Arbeit, Einkauf und Freizeit sind noch nicht berechnet, nur Wohnen (225 m).</li>
      </ul>
    </Report>
  );
}
