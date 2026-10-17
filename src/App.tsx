import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapView } from './components/MapView';
import { Legend } from './components/Legend';
import { DistrictPanel } from './components/DistrictPanel';
import { PriorityPanel } from './components/PriorityPanel';
import { loadBonus, loadData, loadSitePlan, type AppData } from './lib/data';
import { anyBonus, applyBonus, bonusDefaults, bonusEffect, type BonusData, type BonusEffect, type BonusParams } from './lib/bonus';
import type { BonusMap, BonusSummary } from './components/BonusControls';
import { levelFor, paramsForLevel, sitesOf, type SiteLevel, type SitePlan } from './lib/sitePlan';
import { computeCurrentDemand, type DistrictResult } from './lib/isme';
import { computeFactors, currentStreetDemand } from './lib/factors';
import { factorDefaults, factorDestinations, factorDistricts, factorSpecs } from './lib/factorData';
import type { FactorParams } from './lib/factors';
import { quantileClasses } from './lib/metrics';
import { SidebarResizer, useSidebar } from './components/SidebarResizer';
import { hideBoot } from './lib/boot';

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData().then(setData, (e: Error) => {
      setError(e.message);
      hideBoot();
    });
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
  // the boot screen from index.html stays up until the map has drawn
  if (!data) return null;
  return <Dashboard data={data} />;
}

const CHECKS_KEY = 'ladebedarf-site-checks';

/** On-site checks ticked per planned site, remembered in this browser only. */
function useSiteChecks() {
  const [done, setDone] = useState<Record<string, string[]>>(() => {
    try {
      return JSON.parse(localStorage.getItem(CHECKS_KEY) ?? '{}') as Record<string, string[]>;
    } catch {
      return {};
    }
  });
  const toggle = useCallback((siteId: string, checkId: string) => {
    setDone((prev) => {
      const items = prev[siteId] ?? [];
      const next = { ...prev, [siteId]: items.includes(checkId) ? items.filter((c) => c !== checkId) : [...items, checkId] };
      try {
        localStorage.setItem(CHECKS_KEY, JSON.stringify(next));
      } catch {
        // storage blocked: keep the ticks for this session only
      }
      return next;
    });
  }, []);
  return [done, toggle] as const;
}

function Dashboard({ data }: { data: AppData }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [showChargers, setShowChargers] = useState(true);
  // street-space demand from the factor model; districts missing there keep the ISME estimate
  const [params, setParams] = useState<FactorParams>(factorDefaults);
  const sidebar = useSidebar();
  const detail = useSidebar('ladebedarf-detail-panel', 360, '--panel-w');
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
  // off-street charging: charging points at supermarkets, buildings in the priority area and commercial car parks
  const [bonusData, setBonusData] = useState<BonusData | null>(null);
  const [bonus, setBonus] = useState<BonusParams>(bonusDefaults);
  const [bonusMap, setBonusMap] = useState<BonusMap>('after');
  const [showBonusLayers, setShowBonusLayers] = useState(true);
  useEffect(() => {
    loadBonus().then(setBonusData);
  }, []);
  const bonusOn = anyBonus(bonus) && bonusData !== null;
  const effects = useMemo(() => {
    const out = new Map<string, BonusEffect>();
    if (!bonusOn || !bonusData) return out;
    const byUbz = new Map(bonusData.districts.map((d) => [d.ubz, d]));
    for (const r of run.results) out.set(r.ubz, bonusEffect(r, byUbz.get(r.ubz), bonus, params, run.bevShare));
    return out;
  }, [bonusOn, bonusData, bonus, run, params]);
  const results = useMemo(
    () =>
      data.districts.features.map((f) => {
        const fr = factors.get(f.properties.ubz);
        if (!fr) return computeCurrentDemand(f.properties);
        const r = currentStreetDemand(f.properties, fr);
        const e = effects.get(r.ubz);
        return e ? applyBonus(r, e) : r;
      }),
    [data, factors, effects],
  );
  const bonusSummary = useMemo<BonusSummary>(() => {
    const s: BonusSummary = { before: 0, after: 0, priority: 0, commercial: 0, supermarket: 0, newPoints: { priority: 0, commercial: 0, supermarket: 0 } };
    for (const r of results) {
      s.before += r.gapBefore ?? r.gap;
      s.after += r.gap;
    }
    // per-scenario reductions in the order they are applied, so they add up to the total
    for (const e of effects.values()) {
      s.supermarket += e.supermarket.takes;
      s.newPoints.priority += e.priority.points;
      s.newPoints.commercial += e.commercial.points;
      s.newPoints.supermarket += e.supermarket.points;
    }
    const reliefOnly = s.before - s.after - s.supermarket;
    const relief = [...effects.values()].reduce(
      (a, e) => [a[0] + e.priority.relief, a[1] + e.commercial.relief + e.commercial.night],
      [0, 0],
    );
    const total = relief[0] + relief[1];
    s.priority = total > 0 ? Math.round((reliefOnly * relief[0]) / total) : 0;
    s.commercial = reliefOnly - s.priority;
    return s;
  }, [results, effects]);
  const byUbz = useMemo(() => new Map(results.map((r) => [r.ubz, r])), [results]);
  const showReduction = bonusOn && bonusMap === 'reduction';
  const shade = useMemo(
    () =>
      showReduction
        ? { title: 'Fewer missing points (off-street charging)', value: (r: DistrictResult) => (r.gapBefore ?? r.gap) - r.gap }
        : { title: bonusOn ? 'Missing charging points (with off-street charging)' : 'Missing charging points', value: (r: DistrictResult) => r.gap },
    [showReduction, bonusOn],
  );
  const classes = useMemo(() => quantileClasses(results.map(shade.value)), [results, shade]);
  const district = selected ? byUbz.get(selected) : undefined;

  // site planning: precomputed stations for the level that matches the model's EV basis
  const [plan, setPlan] = useState<SitePlan | null>(null);
  const [showSites, setShowSites] = useState(true);
  const [showList, setShowList] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [done, toggleCheck] = useSiteChecks();
  useEffect(() => {
    loadSitePlan().then(setPlan);
  }, []);
  const siteLevel = useMemo(
    () => (plan ? levelFor(plan, { bevMode: params.bevMode, bevShareScenario: params.bevShareScenario }) : null),
    [plan, params.bevMode, params.bevShareScenario],
  );
  const sites = useMemo(() => (plan && siteLevel ? sitesOf(plan, siteLevel.level) : []), [plan, siteLevel]);
  const otherDefaults = useMemo(
    () =>
      (Object.keys(factorDefaults) as (keyof FactorParams)[]).every(
        (k) => k === 'bevMode' || k === 'bevShareScenario' || JSON.stringify(params[k]) === JSON.stringify(factorDefaults[k]),
      ),
    [params],
  );
  const names = useMemo(() => new Map(results.map((r) => [r.ubz, r.name])), [results]);
  const setLevel = useCallback((level: SiteLevel) => setParams((p) => ({ ...p, ...paramsForLevel(level) })), []);
  const openSite = useCallback((id: string) => {
    setFocusId(id);
    setShowList(true);
    setShowSites(true);
  }, []);
  useEffect(() => {
    if (focusId && !sites.some((s) => s.id === focusId)) setFocusId(null);
  }, [sites, focusId]);
  const panel = showList && siteLevel ? 'sites' : district ? 'district' : null;
  // picking something new on the map brings a collapsed detail panel back
  const { expand } = detail;
  useEffect(() => {
    if (selected || showList) expand();
  }, [selected, showList, expand]);

  return (
    <div className={`app current-app${sidebar.floating || detail.floating ? ' is-immersive' : ''}`}>
      <header className="topbar">
        <h1 className="brand">
          <picture>
            <source srcSet={`${import.meta.env.BASE_URL}electricity-logo-dark.png`} media="(prefers-color-scheme: dark)" />
            <img
              className="brand-logo"
              src={`${import.meta.env.BASE_URL}electricity-logo.png`}
              alt="ElectriCity: Dortmund charging demand"
              width="699"
              height="125"
            />
          </picture>
        </h1>
      </header>
      <main
        className={`current-layout${panel ? ' has-selection' : ''}${panel === 'sites' ? ' has-sites' : ''}${
          sidebar.collapsed ? ' is-collapsed' : ''
        }${sidebar.floating ? ' is-floating' : ''}${detail.collapsed ? ' panel-collapsed' : ''}${
          detail.floating ? ' panel-floating' : ''
        }`}
        style={{ ...sidebar.style, ...detail.style }}
      >
        <div className="filters-slot" hidden={sidebar.collapsed}>
          <Legend
            districts={results}
            selected={selected}
            showChargers={showChargers}
            onSelect={setSelected}
            onToggleChargers={setShowChargers}
            bonus={{
              data: bonusData,
              params: bonus,
              summary: bonusSummary,
              bevShare: run.bevShare,
              map: bonusMap,
              showLayers: showBonusLayers,
              onChange: setBonus,
              onMap: setBonusMap,
              onToggleLayers: setShowBonusLayers,
              area:
                selected && bonusData
                  ? {
                      name: district?.name ?? selected,
                      sites: bonusData.districts.find((d) => d.ubz === selected),
                      effect: effects.get(selected),
                    }
                  : null,
            }}
            factorSettings={{ specs: factorSpecs, params, defaults: factorDefaults, totals, onChange: setParams }}
            sitePlan={
              plan && siteLevel
                ? {
                    levels: plan.levels,
                    level: siteLevel.level,
                    exact: siteLevel.exact && otherDefaults,
                    stations: sites.length,
                    points: sites.reduce((a, s) => a + s.points, 0),
                    showSites,
                    showList,
                    onLevel: setLevel,
                    onToggleSites: setShowSites,
                    onToggleList: setShowList,
                  }
                : undefined
            }
          />
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
            classes={classes}
            shade={shade}
            bonusLayers={
              bonusOn && showBonusLayers && bonusData
                ? { supermarkets: bonus.supermarket ? bonusData.supermarkets : [], priority: bonus.priority }
                : null
            }
            selected={selected}
            showChargers={showChargers}
            onSelect={setSelected}
            sites={sites}
            showSites={showSites}
            focusId={focusId}
            onSiteClick={openSite}
            onReady={hideBoot}
          />
        </div>
        {panel && (
          <SidebarResizer
            side="right"
            label="details"
            width={detail.width}
            collapsed={detail.collapsed}
            floating={detail.floating}
            onWidth={detail.setWidth}
            onToggle={detail.toggle}
            onToggleFloating={detail.toggleFloating}
            onReset={detail.reset}
          />
        )}
        <div className="detail-slot" hidden={!panel || detail.collapsed}>
          {panel === 'sites' && plan && siteLevel && (
            <PriorityPanel
              sites={sites}
              level={siteLevel.level}
              radius={plan.radius}
              names={names}
              district={district ? { ubz: district.ubz, name: district.name } : null}
              focusId={focusId}
              done={done}
              onFocus={setFocusId}
              onToggleCheck={toggleCheck}
              onClearDistrict={() => setSelected(null)}
              onBack={
                district
                  ? () => {
                      setShowList(false);
                      setFocusId(null);
                    }
                  : undefined
              }
              onClose={() => {
                setShowList(false);
                setFocusId(null);
                setSelected(null);
              }}
            />
          )}
          {panel === 'district' && district && (
            <DistrictPanel
              district={district}
              factors={factors.get(district.ubz)}
              bonus={effects.get(district.ubz)}
              bonusParams={bonus}
              scenario={params.bevMode === 'scenario' ? params.bevShareScenario : null}
              fetchedAt={data.meta.fetchedAt}
              onClose={() => setSelected(null)}
              plannedSites={
                siteLevel
                  ? {
                      level: siteLevel.level.label,
                      stations: sites.filter((s) => s.ubz === district.ubz).length,
                      points: sites.filter((s) => s.ubz === district.ubz).reduce((a, s) => a + s.points, 0),
                      unplaced: siteLevel.level.unplaced[district.ubz] ?? 0,
                      onShow: () => setShowList(true),
                    }
                  : undefined
              }
            />
          )}
        </div>
      </main>
    </div>
  );
}
