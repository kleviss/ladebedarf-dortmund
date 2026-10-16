import { useEffect, useMemo, useState } from 'react';
import { MapView } from './components/MapView';
import { ScenarioPanel } from './components/ScenarioPanel';
import { DistrictPanel } from './components/DistrictPanel';
import { RankingTable } from './components/RankingTable';
import { Legend } from './components/Legend';
import { loadData, type AppData } from './lib/data';
import { computeAll, currentEvShare, defaultScenario, fmt, totals, type Scenario } from './lib/model';
import { metricByKey, quantileClasses, type MetricKey } from './lib/metrics';
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
          Führe <code>npm run data</code> aus, damit die Dateien in <code>public/data/</code> erzeugt werden.
        </p>
      </div>
    );
  }
  if (!data) return <div className="state">Lade Daten …</div>;
  return <Dashboard data={data} />;
}

function Dashboard({ data }: { data: AppData }) {
  const city = data.meta.city;
  const initial = useMemo(() => readUrlState(), []);
  const [scenario, setScenario] = useState<Scenario>({ ...defaultScenario(city), ...initial.scenario });
  const [metricKey, setMetricKey] = useState<MetricKey>(initial.metric ?? 'gap');
  const [selected, setSelected] = useState<string | null>(initial.ubz ?? null);
  const [showChargers, setShowChargers] = useState(true);
  const [copied, setCopied] = useState(false);

  const districts = useMemo(() => data.districts.features.map((f) => f.properties), [data]);
  const results = useMemo(() => computeAll(districts, scenario, city), [districts, scenario, city]);
  const byUbz = useMemo(() => new Map(results.map((r) => [r.ubz, r])), [results]);
  const metric = metricByKey(metricKey);
  const classes = useMemo(() => quantileClasses(results.map(metric.value)), [results, metric]);
  const sum = useMemo(() => totals(results), [results]);
  const gapRank = useMemo(
    () => new Map([...results].sort((a, b) => b.gap - a.gap).map((r, i) => [r.ubz, i + 1])),
    [results],
  );

  useEffect(() => writeUrlState(scenario, metricKey, selected), [scenario, metricKey, selected]);

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
          <h1>Ladebedarf Dortmund</h1>
          <p className="muted">Öffentliche Ladepunkte je statistischem Unterbezirk · Prototyp</p>
        </div>
        <dl className="kpis">
          <div>
            <dt>Bedarf</dt>
            <dd className="num">{fmt(sum.needed)} LP</dd>
          </div>
          <div>
            <dt>Bestand</dt>
            <dd className="num">{fmt(sum.chargers)} LP</dd>
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

      <main className="layout">
        <div className="sidebar">
          <Legend
            metric={metric}
            classes={classes}
            showChargers={showChargers}
            onMetric={setMetricKey}
            onToggleChargers={setShowChargers}
          />
          <ScenarioPanel
            scenario={scenario}
            currentEvShare={currentEvShare(city)}
            evYear={city.evYear}
            onChange={setScenario}
            onReset={() => setScenario(defaultScenario(city))}
          />
          <RankingTable results={results} selected={selected} onSelect={setSelected} />
          <section className="panel sources" aria-labelledby="sources-title">
            <h2 id="sources-title">Datenquellen</h2>
            <p className="muted">
              Stand {stand}. {data.meta.license}. Einwohner*innen je Unterbezirk sind aus den 62 statistischen
              Bezirken nach Gebäudeanteil geschätzt.
            </p>
            <ul>
              {data.meta.sources.map((s) => (
                <li key={s.id}>
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.id}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="map-area">
          <MapView
            data={data}
            results={byUbz}
            metric={metric}
            classes={classes}
            selected={selected}
            showChargers={showChargers}
            onSelect={setSelected}
          />
          {selectedResult && (
            <DistrictPanel
              district={selectedResult}
              rank={gapRank.get(selectedResult.ubz) ?? 0}
              total={results.length}
              onClose={() => setSelected(null)}
            />
          )}
        </div>
      </main>
    </div>
  );
}
