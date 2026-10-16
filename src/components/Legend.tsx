import { METRICS, RAMP, ZERO_COLOR, type Classes, type Metric, type MetricKey } from '../lib/metrics';

interface Props {
  metric: Metric;
  classes: Classes;
  showChargers: boolean;
  onMetric: (k: MetricKey) => void;
  onToggleChargers: (v: boolean) => void;
}

export function Legend({ metric, classes, showChargers, onMetric, onToggleChargers }: Props) {
  const lower = (i: number) => (i === 0 ? 0 : classes.breaks[i - 1]);
  return (
    <div className="legend">
      <label htmlFor="metric" className="legend-label">
        Kartenfarbe
      </label>
      <select id="metric" value={metric.key} onChange={(e) => onMetric(e.target.value as MetricKey)}>
        {METRICS.map((m) => (
          <option key={m.key} value={m.key}>
            {m.label}
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
        <input
          id="show-chargers"
          type="checkbox"
          checked={showChargers}
          onChange={(e) => onToggleChargers(e.target.checked)}
        />
        <span className="dot" aria-hidden="true" />
        Vorhandene Ladepunkte (NOX-Block)
      </label>
    </div>
  );
}
