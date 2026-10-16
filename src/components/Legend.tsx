import { METRIC_GROUPS, RAMP, SIMPLE_METRICS, ZERO_COLOR, metricByKey, type Classes, type Metric, type MetricKey } from '../lib/metrics';

interface Props {
  /** expert: all metrics grouped + priority grid; simple: four metrics */
  expert: boolean;
  metric: Metric;
  classes: Classes;
  showChargers: boolean;
  showPriority: boolean;
  showParking: boolean;
  onToggleParking: (v: boolean) => void;
  onMetric: (k: MetricKey) => void;
  onToggleChargers: (v: boolean) => void;
  onTogglePriority: (v: boolean) => void;
}

export function Legend({ expert, metric, classes, showChargers, showPriority, showParking, onMetric, onToggleChargers, onTogglePriority, onToggleParking }: Props) {
  const lower = (i: number) => (i === 0 ? 0 : classes.breaks[i - 1]);
  return (
    <div className="legend">
      <label htmlFor="metric" className="legend-label">
        Kartenfarbe
      </label>
      <select id="metric" value={metric.key} onChange={(e) => onMetric(e.target.value as MetricKey)}>
        {expert
          ? METRIC_GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.keys.map((k) => (
                  <option key={k} value={k}>
                    {metricByKey(k).label}
                  </option>
                ))}
              </optgroup>
            ))
          : SIMPLE_METRICS.map((k) => (
              <option key={k} value={k}>
                {metricByKey(k).label}
              </option>
            ))}
      </select>
      <ul className="legend-scale">
        {classes.hasZero && (
          <li>
            <span className="swatch" style={{ background: ZERO_COLOR }} />
            <span className="num">0</span>
          </li>
        )}
        {RAMP.map((c, i) => (
          <li key={c}>
            <span className="swatch" style={{ background: c }} />
            <span className="num">
              {metric.format(lower(i)).replace(/ .*/, '')} – {metric.format(classes.breaks[i])}
            </span>
          </li>
        ))}
      </ul>
      <label className="toggle">
        <input id="show-chargers" type="checkbox" checked={showChargers} onChange={(e) => onToggleChargers(e.target.checked)} />
        <span className="dot" aria-hidden="true" />
        Ladestandorte heute (Stadt, 912)
      </label>
      {expert && (
        <label className="toggle">
          <input id="show-priority" type="checkbox" checked={showPriority} onChange={(e) => onTogglePriority(e.target.checked)} />
          <span className="square" aria-hidden="true" />
          Prioritätsflächen LIS-Ausbau (225-m-Raster)
        </label>
      )}
      <label className="toggle">
        <input id="show-parking" type="checkbox" checked={showParking} onChange={(e) => onToggleParking(e.target.checked)} />
        <span className="dot dot-parking" aria-hidden="true" />
        Öffentliche Parkflächen (OSM, Parkhäuser, P+R)
      </label>
      {showParking && (
        <ul className="legend-status">
          <li><span className="sdot" style={{ background: '#0ca30c' }} />Ladestandort ≤ 100 m</li>
          <li><span className="sdot" style={{ background: '#fab219' }} />Ladestandort ≤ 225 m</li>
          <li><span className="sdot" style={{ background: '#d03b3b' }} />Kein Ladestandort in 225 m</li>
          <li className="muted">Große Punkte: Parkhaus, Tiefgarage, P+R</li>
        </ul>
      )}
    </div>
  );
}
