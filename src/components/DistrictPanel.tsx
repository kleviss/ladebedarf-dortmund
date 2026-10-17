import type { FactorResult } from '../lib/factors';
import type { DistrictResult } from '../lib/isme';
import type { BonusEffect, BonusParams } from '../lib/bonus';

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
  /** effect of the active off-street charging features on this district */
  bonus?: BonusEffect;
  bonusParams?: BonusParams;
}

const fmt = (value: number, digits = 0) =>
  value.toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function DistrictPanel({ district, factors, scenario = null, fetchedAt, onClose, plannedSites, bonus, bonusParams }: Props) {
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
      {bonus && bonusParams && bonus.before !== bonus.after && <BonusSteps e={bonus} p={bonusParams} />}
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

const minus = (n: number, digits = 0) => (n > 0 ? `−${fmt(n, digits)}` : fmt(0, digits));

/** How the off-street charging features change the missing street points, step by step. */
function BonusSteps({ e, p }: { e: BonusEffect; p: BonusParams }) {
  const kerb = e.priority.relief + e.commercial.relief + e.commercial.night > 0;
  return (
    <div className="bonus-steps" aria-label="Off-street charging in this subdistrict">
      <p className="eyebrow">Off-street charging</p>
      <dl>
        <div>
          <dt>Missing without off-street charging</dt>
          <dd className="num">{fmt(e.before)}</dd>
        </div>
        {p.priority && e.priority.points > 0 && (
          <div className="is-step">
            <dt>
              Buildings in the priority area
              <span className="hint">
                {fmt(e.priority.points)} new private points, {fmt(e.priority.evs, 1)} EVs charge at home
              </span>
            </dt>
            <dd className="num">{minus(e.priority.relief, 1)}</dd>
          </div>
        )}
        {p.commercial && e.commercial.points > 0 && (
          <div className="is-step">
            <dt>
              Commercial car parks
              <span className="hint">
                {fmt(e.commercial.points)} new points, {fmt(e.commercial.evs, 1)} EVs charge at work
                {p.commercialNight ? `, residents use them at night (−${fmt(e.commercial.night, 1)})` : ''}
              </span>
            </dt>
            <dd className="num">{minus(e.commercial.relief + e.commercial.night, 1)}</dd>
          </div>
        )}
        {kerb && p.supermarket && e.supermarket.count > 0 && (
          <div>
            <dt>Missing after buildings and commercial car parks</dt>
            <dd className="num">{fmt(e.middle)}</dd>
          </div>
        )}
        {p.supermarket && e.supermarket.count > 0 && (
          <div className="is-step">
            <dt>
              Supermarkets
              <span className="hint">
                {`${fmt(e.supermarket.count)} with a car park × ${fmt(p.pointsPerSupermarket)} = ${fmt(e.supermarket.points)} points; they take ${fmt(p.absorbShare * 100)} % of ${fmt(e.middle)}`}
              </span>
            </dt>
            <dd className="num">{minus(e.supermarket.takes)}</dd>
          </div>
        )}
        <div className="is-total">
          <dt>Remaining in street space</dt>
          <dd className="num">{fmt(e.after)}</dd>
        </div>
      </dl>
    </div>
  );
}
