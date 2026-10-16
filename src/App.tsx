import { useEffect, useMemo, useState } from 'react';
import { MapView } from './components/MapView';
import { ScenarioPanel } from './components/ScenarioPanel';
import { DistrictPanel } from './components/DistrictPanel';
import { RankingTable } from './components/RankingTable';
import { Legend } from './components/Legend';
import { PageTabs } from './components/PageTabs';
import { ModeToggle } from './components/ModeToggle';
import { useExpertMode } from './lib/mode';
import { SidebarResizer, useSidebar } from './components/SidebarResizer';
import { SitePanel, type ParkingColour } from './components/SitePanel';
import { defaultWeights, scoreSites, sitesByDistrict, type SiteSpot, type Weights } from './lib/sites';
import { loadData, type AppData } from './lib/data';
import { computeAll, defaultScenario, fmt, type Scenario } from './lib/isme';
import { SIMPLE_METRICS, metricByKey, quantileClasses, type MetricKey } from './lib/metrics';
import { readUrlState, writeUrlState } from './lib/urlState';

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData().then(setData, (e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="state">
        <h1>Daten konnten nicht geladen werden</h1>
        <p>{error}</p>
        <p>
          Führe <code>npm run data</code> aus, damit die Dateien in <code>public/data/city/</code> erzeugt werden.
        </p>
      </div>
    );
  }
  if (!data) return <div className="state">Lade Daten …</div>;
  return <Dashboard data={data} />;
}

function Dashboard({ data }: { data: AppData }) {
  const initial = useMemo(() => readUrlState(), []);
  const [scenario, setScenario] = useState<Scenario>(initial.scenario);
  const [metricKey, setMetricKey] = useState<MetricKey>(initial.metric ?? 'gap');
  const [selected, setSelected] = useState<string | null>(initial.ubz ?? null);
  const [showChargers, setShowChargers] = useState(true);
  const [showPriority, setShowPriority] = useState(false);
  const [showParking, setShowParking] = useState(false);
  const [showAttractions, setShowAttractions] = useState(initial.metric === 'attractions');
  const [weights, setWeights] = useState<Weights>(defaultWeights);
  const [parkingColour, setParkingColour] = useState<ParkingColour>('score');
  const [copied, setCopied] = useState(false);
  const sidebar = useSidebar();
  const [expert, setExpert] = useExpertMode();
  // simple mode: only the four presentation metrics, parking coloured by distance, no priority grid
  const visibleMetric: MetricKey = expert || SIMPLE_METRICS.includes(metricKey) ? metricKey : 'gap';
  const effectiveColour: ParkingColour = expert ? parkingColour : 'distance';

  const districts = useMemo(() => data.districts.features.map((f) => f.properties), [data]);
  const { results, city, cityPoints, calibration } = useMemo(() => computeAll(districts, scenario), [districts, scenario]);
  const byUbz = useMemo(() => new Map(results.map((r) => [r.ubz, r])), [results]);
  const sites = useMemo(() => scoreSites(data.parking.features.map((f) => f.properties as SiteSpot), weights), [data, weights]);
  const sitesByUbz = useMemo(() => sitesByDistrict(sites), [sites]);
  const metric = metricByKey(visibleMetric);
  const classes = useMemo(() => quantileClasses(results.map(metric.value)), [results, metric]);
  const sum = useMemo(
    () => results.reduce((t, r) => ({ existing: t.existing + r.existing, gap: t.gap + r.gap }), { existing: 0, gap: 0 }),
    [results],
  );
  const gapRank = useMemo(
    () => new Map([...results].sort((a, b) => b.gap - a.gap).map((r, i) => [r.ubz, i + 1])),
    [results],
  );
  const t = data.meta.totals;
  const evShareToday = t.totalEvs / (t.privateCars + t.commercialCars);

  useEffect(() => writeUrlState(scenario, visibleMetric, selected), [scenario, visibleMetric, selected, expert]);

  const selectedResult = selected ? byUbz.get(selected) : undefined;
  const stand = new Date(data.meta.fetchedAt).toLocaleDateString('de-DE');

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Link kopieren:', window.location.href);
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="title-row">
            <h1>Ladebedarf Dortmund</h1>
            <PageTabs current="karte" />
            <ModeToggle expert={expert} onChange={setExpert} />
          </div>
          <p className="muted">
            ISME-Methode je statistischem Unterbezirk · {scenario.year}, {Math.round(scenario.bevShare * 100)} % BEV
          </p>
        </div>
        <dl className="kpis">
          <div>
            <dt>Bedarf</dt>
            <dd className="num">{fmt(cityPoints)} LP</dd>
          </div>
          <div>
            <dt>Bestand</dt>
            <dd className="num">{fmt(sum.existing)} LP</dd>
          </div>
          <div>
            <dt>Lücke</dt>
            <dd className="num strong">{fmt(sum.gap)} LP</dd>
          </div>
        </dl>
        <button type="button" className="button" onClick={copyLink}>
          {copied ? 'Link kopiert' : 'Szenario-Link kopieren'}
        </button>
      </header>

      <main
        className={`layout${sidebar.collapsed ? ' is-collapsed' : ''}${sidebar.floating ? ' is-floating' : ''}`}
        style={sidebar.style}
      >
        <div className="sidebar" hidden={sidebar.collapsed}>
          <Legend
            expert={expert}
            metric={metric}
            classes={classes}
            showChargers={showChargers}
            showPriority={showPriority}
            showParking={showParking}
            onToggleParking={setShowParking}
            showAttractions={showAttractions}
            attractionCount={data.ziele.features.length}
            onToggleAttractions={setShowAttractions}
            onMetric={(k) => {
              setMetricKey(k);
              if (k === 'attractions') setShowAttractions(true); // show the places with their names
            }}
            onToggleChargers={setShowChargers}
            onTogglePriority={setShowPriority}
          />
          {expert && (
            <SitePanel
              sites={sites}
              weights={weights}
              colour={parkingColour}
              showParking={showParking}
              onWeights={setWeights}
              onColour={setParkingColour}
              onShowParking={setShowParking}
              onReset={() => setWeights(defaultWeights)}
            />
          )}
          <ScenarioPanel
            scenario={scenario}
            city={city}
            cityPoints={cityPoints}
            evShareToday={evShareToday}
            calibration={calibration}
            simple={!expert}
            onChange={setScenario}
            onReset={() => setScenario(defaultScenario)}
          />
          <RankingTable results={results} scenario={scenario} selected={selected} limit={expert ? undefined : 10} onSelect={setSelected} />
          <section className="panel sources" aria-labelledby="sources-title">
            <h2 id="sources-title">Daten und Methode</h2>
            <p className="muted">
              Stadt Dortmund, Stand {stand}: {fmt(t.units)} statistische Unterbezirke mit {fmt(t.privateCars)} privaten und{' '}
              {fmt(t.commercialCars)} gewerblichen Pkw, {fmt(t.totalEvs)} E-Pkw und {fmt(t.chargers)} Ladestandorten.
              Berechnung nach dem ISME-Gutachten (Dez. 2023) und der ISME-Tabelle.
            </p>
            {data.meta.fixes.length > 0 && (
              <ul>
                {data.meta.fixes.map((f) => (
                  <li key={f}>Korrektur: {f}</li>
                ))}
              </ul>
            )}
            <p>
              <a href={data.meta.source.url} target="_blank" rel="noreferrer">
                Daten auf Sciebo (Team 07)
              </a>
            </p>
          </section>
        </div>

        <SidebarResizer
          width={sidebar.width}
          collapsed={sidebar.collapsed}
          floating={sidebar.floating}
          onWidth={sidebar.setWidth}
          onToggle={sidebar.toggle}
          onToggleFloating={sidebar.toggleFloating}
          onReset={sidebar.reset}
        />

        <div className="map-area">
          <MapView
            data={data}
            results={byUbz}
            metric={metric}
            classes={classes}
            selected={selected}
            showChargers={showChargers}
            showPriority={expert && showPriority}
            showParking={showParking}
            showAttractions={showAttractions}
            sites={sites}
            parkingColour={effectiveColour}
            onSelect={setSelected}
          />
          {selectedResult && (
            <DistrictPanel
              district={selectedResult}
              rank={gapRank.get(selectedResult.ubz) ?? 0}
              total={results.length}
              sites={sitesByUbz.get(selectedResult.ubz)}
              simple={!expert}
              onClose={() => setSelected(null)}
            />
          )}
        </div>
      </main>
    </div>
  );
}
