import type { DistrictResult } from '../lib/isme';

interface Props {
  district: DistrictResult;
  fetchedAt: string;
  onClose: () => void;
}

const fmt = (value: number) => value.toLocaleString('en-GB');

export function DistrictPanel({ district, fetchedAt, onClose }: Props) {
  return (
    <aside className="current-district" aria-labelledby="district-title" aria-live="polite">
      <header className="district-head">
        <div>
          <p className="eyebrow">Subdistrict {district.ubz} · {district.stadtbezirk}</p>
          <h2 id="district-title">{district.name}</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close details and return to city view" title="Return to city view">
          ×
        </button>
      </header>
      <dl className="key-figures current-figures">
        <div>
          <dt>Existing charging points*</dt>
          <dd className="num">{fmt(district.existing)}</dd>
        </div>
        <div>
          <dt>Currently required (estimated)</dt>
          <dd className="num">{fmt(district.needed)}</dd>
        </div>
        <div className="accent">
          <dt>Missing charging points (estimated)</dt>
          <dd className="num">{fmt(district.gap)}</dd>
        </div>
      </dl>
      <p className="hint">
        Estimated from {fmt(district.totalEvs)} recorded electric cars and the ISME public-charging
        use cases. No future growth or additional commuter or tourist demand is included.
        Demand is rounded up to whole charging points.
      </p>
      <p className="hint">
        * Existing stock assumes one charging point per recorded location. Connector counts
        and live availability are not verified. Data retrieved: {new Date(fetchedAt).toLocaleDateString('en-GB')};
        source observations may be older.
      </p>
    </aside>
  );
}
