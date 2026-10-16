import { useEffect, useMemo, useState } from 'react';
import { MapView } from './components/MapView';
import { Legend } from './components/Legend';
import { DistrictPanel } from './components/DistrictPanel';
import { loadData, type AppData } from './lib/data';
import { computeCurrentDemand } from './lib/isme';
import { computeFactors, currentStreetDemand } from './lib/factors';
import { factorDefaults, factorDestinations, factorDistricts, factorSpecs } from './lib/factorData';
import type { FactorParams } from './lib/factors';
import { quantileClasses } from './lib/metrics';

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData().then(setData, (e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="state">
        <h1>Data could not be loaded</h1>
        <p>{error}</p>
        <p>
          Run <code>npm run data</code> to generate the files in <code>public/data/city/</code>.
        </p>
      </div>
    );
  }
  if (!data) return <div className="state">Loading data …</div>;
  return <Dashboard data={data} />;
}

function Dashboard({ data }: { data: AppData }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [showChargers, setShowChargers] = useState(true);
  // street-space demand from the factor model; districts missing there keep the ISME estimate
  const [params, setParams] = useState<FactorParams>(factorDefaults);
  const run = useMemo(() => computeFactors(factorDistricts, factorDestinations, params), [params]);
  const factors = useMemo(() => new Map(run.results.map((r) => [r.ubz, r])), [run]);
  const totals = useMemo(
    () => ({
      residents: run.results.reduce((a, r) => a + r.residents, 0),
      commuters: run.results.reduce((a, r) => a + r.commuters, 0),
      tourists: run.results.reduce((a, r) => a + r.tourists, 0),
      mfhPerDwelling: run.mfhPerDwelling,
    }),
    [run],
  );
  const results = useMemo(
    () =>
      data.districts.features.map((f) => {
        const fr = factors.get(f.properties.ubz);
        return fr ? currentStreetDemand(f.properties, fr) : computeCurrentDemand(f.properties);
      }),
    [data, factors],
  );
  const byUbz = useMemo(() => new Map(results.map((r) => [r.ubz, r])), [results]);
  const classes = useMemo(() => quantileClasses(results.map((r) => r.gap)), [results]);
  const district = selected ? byUbz.get(selected) : undefined;

  return (
    <div className="app current-app">
      <header className="topbar">
        <div className="brand">
          <h1>Dortmund Charging Demand</h1>
        </div>
      </header>
      <main className={`current-layout${district ? ' has-selection' : ''}`}>
        <Legend
          districts={results}
          selected={selected}
          showChargers={showChargers}
          onSelect={setSelected}
          onToggleChargers={setShowChargers}
          factorSettings={{ specs: factorSpecs, params, defaults: factorDefaults, totals, onChange: setParams }}
        />
        <div className="map-area">
          <MapView
            data={data}
            results={byUbz}
            classes={classes}
            selected={selected}
            showChargers={showChargers}
            onSelect={setSelected}
          />
        </div>
        {district && (
          <DistrictPanel
            district={district}
            factors={factors.get(district.ubz)}
            scenario={params.bevMode === 'scenario' ? params.bevShareScenario : null}
            fetchedAt={data.meta.fetchedAt}
            onClose={() => setSelected(null)}
          />
        )}
      </main>
    </div>
  );
}
