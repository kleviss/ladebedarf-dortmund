import { fmt, pct } from '../lib/isme';
import { FACTORS, SCORE_BREAKS, SCORE_RAMP, STRONG, type ScoredSite, type Weights } from '../lib/sites';

export type ParkingColour = 'distance' | 'score';

interface Props {
  sites: ScoredSite[];
  weights: Weights;
  colour: ParkingColour;
  showParking: boolean;
  onWeights: (w: Weights) => void;
  onColour: (c: ParkingColour) => void;
  onShowParking: (v: boolean) => void;
  onReset: () => void;
}

/** Distribution criteria: weights for the site score, and each criterion's computed status. */
export function SitePanel({ sites, weights, colour, showParking, onWeights, onColour, onShowParking, onReset }: Props) {
  const strong = sites.filter((s) => s.score >= STRONG).length;
  const mean = (k: keyof ScoredSite['factors']) => (sites.length ? sites.reduce((a, s) => a + s.factors[k], 0) / sites.length : 0);

  return (
    <section className="panel" aria-labelledby="sites-title">
      <div className="panel-head">
        <h2 id="sites-title">Verteilung im Unterbezirk</h2>
        <button type="button" className="link-button" onClick={onReset}>
          Zurücksetzen
        </button>
      </div>
      <p className="hint">
        Jede der {fmt(sites.length)} öffentlichen Parkflächen ist ein Standortkandidat. Der Standort-Score ist der gewichtete Mittelwert der
        fünf Kriterien (0–100). {fmt(strong)} Flächen erreichen mindestens {fmt(STRONG * 100)}.
      </p>

      <div className="site-weights">
        {FACTORS.map((f) => (
          <div key={f.key} className="slider">
            <div className="slider-head">
              <label htmlFor={`w-${f.key}`}>
                {f.label}
                {f.proxy && <span className="proxy"> · {f.proxy}</span>}
              </label>
              <output htmlFor={`w-${f.key}`} className="num">
                ×{fmt(weights[f.key])}
              </output>
            </div>
            <input
              id={`w-${f.key}`}
              type="range"
              min={0}
              max={3}
              step={1}
              value={weights[f.key]}
              onChange={(e) => onWeights({ ...weights, [f.key]: Number(e.target.value) })}
            />
            <p className="hint">
              {f.explain}. Stadtweit im Mittel {pct(mean(f.key))}.
            </p>
          </div>
        ))}
      </div>

      <div className="site-map-controls">
        <label className="toggle">
          <input id="sites-show" type="checkbox" checked={showParking} onChange={(e) => onShowParking(e.target.checked)} />
          Parkflächen auf der Karte
        </label>
        <fieldset className="segmented">
          <legend>Punkte färben nach</legend>
          <div className="segmented-options">
            {(
              [
                ['score', 'Standort-Score'],
                ['distance', 'Abstand zum Ladestandort'],
              ] as const
            ).map(([v, l]) => (
              <label key={v} className={colour === v ? 'is-active' : undefined}>
                <input type="radio" name="parking-colour" checked={colour === v} onChange={() => onColour(v)} />
                {l}
              </label>
            ))}
          </div>
        </fieldset>
        {colour === 'score' && (
          <ul className="legend-status">
            {SCORE_RAMP.map((c, i) => (
              <li key={c}>
                <span className="sdot" style={{ background: c }} />
                {i === 0 ? `unter ${fmt(SCORE_BREAKS[0] * 100)}` : i === SCORE_RAMP.length - 1 ? `ab ${fmt(SCORE_BREAKS[i - 1] * 100)}` : `${fmt(SCORE_BREAKS[i - 1] * 100)}–${fmt(SCORE_BREAKS[i] * 100)}`}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
