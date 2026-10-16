import { fmt, pct, type DistrictResult, type SourceKind } from '../lib/isme';
import { FACTORS, KIND_LABEL, STRONG, type DistrictSites } from '../lib/sites';

const SOURCE_LABEL: Record<SourceKind, string> = {
  'city-data': 'Daten Stadt',
  isme: 'ISME',
  assumption: 'Annahme',
  result: 'Ergebnis',
};

interface Props {
  district: DistrictResult;
  rank: number;
  total: number;
  sites?: DistrictSites;
  onClose: () => void;
}

export function DistrictPanel({ district: d, rank, total, sites, onClose }: Props) {
  return (
    <aside className="district" aria-labelledby="district-title">
      <header className="district-head">
        <div>
          <p className="eyebrow">
            Unterbezirk {d.ubz} · {d.stadtbezirk}
          </p>
          <h2 id="district-title">{d.name}</h2>
          <p className="muted">
            Rang {rank} von {total} nach fehlenden Ladepunkten · {fmt(d.areaKm2, 1)} km² · E-Anteil heute{' '}
            {pct(d.evShareToday, 1)}
          </p>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Details schließen">
          ×
        </button>
      </header>

      <ol className="steps">
        {d.steps.map((s) => (
          <li key={s.key} className={`step step-${s.source}${s.indent ? ' step-indent' : ''}${s.key === 'gap' ? ' step-gap' : ''}`}>
            <div className="step-main">
              <span className="step-label">{s.label}</span>
              <span className="step-value num">
                {fmt(s.value, s.value > 0 && s.value < 10 ? 1 : 0)} <small>{s.unit}</small>
              </span>
            </div>
            <div className="step-meta">
              <span className={`chip chip-${s.source}`}>{SOURCE_LABEL[s.source]}</span>
              <span className="step-formula">{s.formula}</span>
            </div>
          </li>
        ))}
      </ol>

      {sites && sites.best.length > 0 && (
        <section className="district-parking" aria-label="Beste Standortkandidaten">
          <h3>Beste Standortkandidaten</h3>
          <p className="hint">
            {fmt(sites.strong)} von {fmt(sites.candidates)} Parkflächen mit Score ab {fmt(STRONG * 100)}.
          </p>
          <ol className="site-list">
            {sites.best.map((s) => (
              <li key={s.id}>
                <div className="site-head">
                  <span>
                    {s.name ?? KIND_LABEL[s.kind]}
                    <small>
                      {s.name ? `${KIND_LABEL[s.kind]} · ` : ''}
                      {fmt(s.distance)} m zum Ladestandort{s.capacity ? ` · ${fmt(s.capacity)} Plätze` : ''}
                    </small>
                  </span>
                  <b className="num">{fmt(s.score * 100)}</b>
                </div>
                <div className="site-factors" aria-label="Kriterien">
                  {FACTORS.map((f) => (
                    <span key={f.key} title={`${f.label}: ${fmt(s.factors[f.key] * 100)}`}>
                      <i style={{ width: `${s.factors[f.key] * 100}%` }} />
                      <em>{f.label}</em>
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {d.parkingPublic != null && (
        <section className="district-parking" aria-label="Öffentliches Parken">
          <h3>Öffentliches Parken</h3>
          <dl>
            <div>
              <dt>Parkflächen</dt>
              <dd className="num">{fmt(d.parkingPublic)}</dd>
            </div>
            <div>
              <dt>ohne Ladestandort in 225 m</dt>
              <dd className="num strong">
                {fmt(d.parkingUncovered ?? 0)}
                {d.parkingPublic > 0 && <small> ({pct((d.parkingUncovered ?? 0) / d.parkingPublic)})</small>}
              </dd>
            </div>
            <div>
              <dt>Parkhäuser, Tiefgaragen, P+R</dt>
              <dd className="num">{fmt(d.parkingGarages ?? 0)}</dd>
            </div>
            <div>
              <dt>bekannte Stellplätze</dt>
              <dd className="num">{fmt(d.parkingCapacity ?? 0)}</dd>
            </div>
          </dl>
          <p className="hint">OpenStreetMap und Open Data Dortmund. Kapazität ist in OSM oft nicht erfasst.</p>
        </section>
      )}

      {d.buildings != null && (
        <section className="district-parking" aria-label="Weitere Faktoren">
          <h3>Weitere Faktoren</h3>
          <dl>
            <div>
              <dt>Gebäude ≤ 225 m zum Ladestandort</dt>
              <dd className="num strong">
                {d.buildings > 0 ? pct((d.buildingsCovered ?? 0) / d.buildings) : '–'} <small>von {fmt(d.buildings)}</small>
              </dd>
            </div>
            <div>
              <dt>Pkw je km²</dt>
              <dd className="num">{fmt(d.areaKm2 > 0 ? d.cars / d.areaKm2 : 0)}</dd>
            </div>
            <div>
              <dt>Einkaufs- / Freizeitziele</dt>
              <dd className="num">
                {fmt(d.poisShopping ?? 0)} / {fmt(d.poisLeisure ?? 0)}
              </dd>
            </div>
            <div>
              <dt>Gewerbeflächen</dt>
              <dd className="num">{fmt(d.commercialHa ?? 0, 1)} ha</dd>
            </div>
            <div>
              <dt>Bebauungspläne (seit 2015)</dt>
              <dd className="num">
                {fmt(d.bplans ?? 0)} ({fmt(d.bplansRecent ?? 0)})
              </dd>
            </div>
            <div>
              <dt>Stromnetz</dt>
              <dd>keine Daten</dd>
            </div>
          </dl>
        </section>
      )}
    </aside>
  );
}
