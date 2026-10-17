import type { FactorResult } from '../lib/factors';
import type { DistrictResult } from '../lib/isme';

interface Props {
  district: DistrictResult;
  /** Street-space factor model for this district; without it the ISME estimate is shown */
  factors?: FactorResult;
  /** EV share of the scenario, or null for today's registered EVs */
  scenario?: number | null;
  fetchedAt: string;
  onClose: () => void;
  /** planned stations in this district at the current demand level */
  plannedSites?: { level: string; stations: number; points: number; unplaced: number; onShow: () => void };
}

const fmt = (value: number, digits = 0) =>
  value.toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function DistrictPanel({ district, factors, scenario = null, fetchedAt, onClose, plannedSites }: Props) {
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
      {plannedSites && (
        <div className="district-sites">
          <p>
            <b className="num">{fmt(plannedSites.stations)}</b> planned station{plannedSites.stations === 1 ? '' : 's'} with{' '}
            <b className="num">{fmt(plannedSites.points)}</b> new point{plannedSites.points === 1 ? '' : 's'}
            {plannedSites.unplaced > 0 && <span className="site-warning"> · {fmt(plannedSites.unplaced)} without a free kerb</span>}
          </p>
          {plannedSites.stations > 0 && (
            <button type="button" className="link-button" onClick={plannedSites.onShow}>
              Show sites and checklist
            </button>
          )}
        </div>
      )}
      {factors && (
        <p className="hint station-summary">
          {fmt(factors.stations.sites)} charging stations with {fmt(factors.stations.points)} points: {fmt(factors.stations.streetAc)} public
          AC, {fmt(factors.stations.dc)} fast (DC), {fmt(factors.stations.points - factors.stations.streetAc - factors.stations.dc)} in car
          parks or customer parking.
        </p>
      )}
      {factors ? (
        <>
          <dl className="factor-split" aria-label="Required points by group">
            <div>
              <dt>Residents</dt>
              <dd className="num">{fmt(factors.residents, 1)}</dd>
              <dd className="hint">
                {scenario === null ? `${fmt(district.privateEvs)} private EVs` : `${fmt(district.privateCars)} private cars × ${fmt(scenario * 100)} %`},{' '}
                {fmt(factors.homeCoverage * 100)} % can charge at home
              </dd>
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
            Street-space factor model with{' '}
            {scenario === null ? "today's registered electric cars, no forecast" : `a scenario of ${fmt(scenario * 100)} % electric cars`}. Car parks, customer
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
        * {factors
          ? 'Charging points from the Bundesnetzagentur charging register (status 1 September 2026); by default only public AC points count against street-space demand.'
          : 'Existing stock assumes one charging point per recorded location.'}{' '}
        Live availability is not verified. Data retrieved: {new Date(fetchedAt).toLocaleDateString('en-GB')}.
      </p>
    </aside>
  );
}
