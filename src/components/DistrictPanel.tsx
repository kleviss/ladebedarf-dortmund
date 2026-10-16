import { fmt, type DistrictResult, type SourceKind } from '../lib/model';

const SOURCE_LABEL: Record<SourceKind, string> = {
  'open-data': 'Open Data',
  estimate: 'Schätzung',
  assumption: 'Annahme',
  result: 'Ergebnis',
};

interface Props {
  district: DistrictResult;
  rank: number;
  total: number;
  onClose: () => void;
}

export function DistrictPanel({ district: d, rank, total, onClose }: Props) {
  return (
    <aside className="district" aria-labelledby="district-title">
      <header className="district-head">
        <div>
          <p className="eyebrow">
            Unterbezirk {d.ubz} · {d.stadtbezirk}
          </p>
          <h2 id="district-title">{d.name}</h2>
          <p className="muted">
            Rang {rank} von {total} nach fehlenden Ladepunkten · {fmt(d.areaKm2, 1)} km² · {fmt(d.buildings)} Gebäude
          </p>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Details schließen">
          ×
        </button>
      </header>

      <ol className="steps">
        {d.steps.map((s) => (
          <li key={s.key} className={`step step-${s.source}`}>
            <div className="step-main">
              <span className="step-label">{s.label}</span>
              <span className="step-value num">
                {fmt(s.value, s.value < 10 && s.value > 0 ? 1 : 0)} <small>{s.unit}</small>
              </span>
            </div>
            <div className="step-meta">
              <span className={`chip chip-${s.source}`}>{SOURCE_LABEL[s.source]}</span>
              <span className="step-formula">{s.formula}</span>
            </div>
          </li>
        ))}
      </ol>
    </aside>
  );
}
