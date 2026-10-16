import type { FactorResult } from '../lib/factors';
import type { DistrictResult } from '../lib/isme';

interface Props {
  district: DistrictResult;
  /** Street-space factor model for this district; without it the ISME estimate is shown */
  factors?: FactorResult;
  fetchedAt: string;
  onClose: () => void;
}

const fmt = (value: number, digits = 0) =>
  value.toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function DistrictPanel({ district, factors, fetchedAt, onClose }: Props) {
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
          <dt>{factors ? 'Required in street space (estimated)' : 'Currently required (estimated)'}</dt>
          <dd className="num">{fmt(district.needed)}</dd>
        </div>
        <div className="accent">
          <dt>Missing charging points (estimated)</dt>
          <dd className="num">{fmt(district.gap)}</dd>
        </div>
      </dl>
      {factors ? (
        <>
          <dl className="factor-split" aria-label="Required points by group">
            <div>
              <dt>Residents</dt>
              <dd className="num">{fmt(factors.residents, 1)}</dd>
              <dd className="hint">{fmt(district.privateEvs)} private EVs, {fmt(factors.homeCoverage * 100)} % can charge at home</dd>
            </div>
            <div>
              <dt>In-commuters</dt>
              <dd className="num">{fmt(factors.commuters, 1)}</dd>
              <dd className="hint">{fmt(factors.jobs)} estimated jobs</dd>
            </div>
            <div>
              <dt>Visitors</dt>
              <dd className="num">{fmt(factors.tourists, 1)}</dd>
              <dd className="hint">day trips to destinations, overnight guests by hotels</dd>
            </div>
          </dl>
          <p className="hint">
            Street-space factor model with today's registered electric cars, no forecast. Car parks, customer
            parking and fast chargers are not included. Demand is rounded up to whole charging points.
          </p>
        </>
      ) : (
        <p className="hint">
          Estimated from {fmt(district.totalEvs)} recorded electric cars and the ISME public-charging
          use cases. No future growth or additional commuter or tourist demand is included.
          Demand is rounded up to whole charging points.
        </p>
      )}
      <p className="hint">
        * Existing stock assumes one charging point per recorded location. Connector counts
        and live availability are not verified. Data retrieved: {new Date(fetchedAt).toLocaleDateString('en-GB')};
        source observations may be older.
      </p>
    </aside>
  );
}
