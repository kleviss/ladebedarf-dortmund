import type { SiteLevel } from '../lib/sitePlan';
import { TIER_COLOUR } from '../lib/sitePlan';

interface Props {
  levels: SiteLevel[];
  level: SiteLevel;
  /** the model's EV basis matches the level exactly and all other settings are defaults */
  exact: boolean;
  stations: number;
  points: number;
  showSites: boolean;
  showList: boolean;
  onLevel: (level: SiteLevel) => void;
  onToggleSites: (visible: boolean) => void;
  onToggleList: (visible: boolean) => void;
}

const fmt = (n: number) => n.toLocaleString('en-GB');

/** Site planning in the filter pane: demand level slider, map layer and priority list. */
export function SitePlanControls({ levels, level, exact, stations, points, showSites, showList, onLevel, onToggleSites, onToggleList }: Props) {
  const index = levels.indexOf(level);
  const unplaced = Object.values(level.unplaced).reduce((a, n) => a + n, 0);
  return (
    <section className="site-controls" aria-labelledby="site-controls-title">
      <h2 id="site-controls-title">Site planning</h2>
      <div className="param">
        <div className="slider-head">
          <label htmlFor="site-level">Demand basis</label>
          <output htmlFor="site-level" className="num">
            {level.today ? "Today's EVs" : `${level.label} EVs`}
          </output>
        </div>
        <input
          id="site-level"
          type="range"
          min={0}
          max={levels.length - 1}
          step={1}
          value={index}
          aria-valuetext={level.today ? "Today's electric cars" : `${level.label} electric cars`}
          onChange={(event) => onLevel(levels[Number(event.target.value)])}
        />
        <div className="site-level-ticks" aria-hidden="true">
          <span>Today</span>
          <span>{levels[Math.round((levels.length - 1) / 2)]?.label}</span>
          <span>{levels[levels.length - 1]?.label}</span>
        </div>
      </div>
      <p className="site-summary">
        <b className="num">{fmt(stations)}</b> stations · <b className="num">{fmt(points)}</b> new charging points
      </p>
      {unplaced > 0 && (
        <p className="hint site-warning">
          {fmt(unplaced)} points find no free kerb in {Object.keys(level.unplaced).length} subdistricts: street space is exhausted.
        </p>
      )}
      {!exact && <p className="hint">Sites are planned with the default model settings.</p>}
      <label className="toggle">
        <input type="checkbox" checked={showSites} onChange={(event) => onToggleSites(event.target.checked)} />
        <span className="dot dot-site" style={{ background: TIER_COLOUR[0] }} aria-hidden="true" />
        Show planned sites
      </label>
      <button type="button" className={`button site-list-button${showList ? ' is-active' : ''}`} aria-pressed={showList} onClick={() => onToggleList(!showList)}>
        {showList ? 'Hide priority list' : 'Show priority list'}
      </button>
    </section>
  );
}
