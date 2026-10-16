import type { AppData } from '../lib/data';
import { fmt, pct, type CityBev, type DistrictResult } from '../lib/isme';
import { defaultWeights, FACTORS, KIND_LABEL, scoreSites, sitesByDistrict, STRONG, type ScoredSite, type SiteSpot } from '../lib/sites';

// Report "Standorte im Unterbezirk" and the computed status of every criterion.

export const scoredSites = (data: AppData) =>
  scoreSites(data.parking.features.map((f) => f.properties as SiteSpot), defaultWeights);

export interface Criterion {
  name: string;
  role: 'Menge' | 'Verteilung';
  data: string;
  result: string;
  status: 'im ISME-Modell' | 'im Standort-Score' | 'Kennzahl' | 'Näherung';
}

export function criteriaOf(data: AppData, results: DistrictResult[], city: CityBev, sites: ScoredSite[]): Criterion[] {
  const t = data.meta.totals;
  const e = data.meta.enrichment;
  const n = sites.length || 1;
  const share = (pred: (s: ScoredSite) => boolean) => sites.filter(pred).length / n;
  const densities = results.map((r) => (r.areaKm2 > 0 ? r.cars / r.areaKm2 : 0)).sort((a, b) => a - b);
  const median = densities[Math.floor(densities.length / 2)] ?? 0;
  const withRecentPlans = results.filter((r) => (r.bplansRecent ?? 0) > 0).length;
  const kinds = (k: ScoredSite['kind']) => sites.filter((s) => s.kind === k).length;
  return [
    {
      name: 'E-Fahrzeuge',
      role: 'Menge',
      data: 'Statistik Stadt: Pkw, E-Pkw, Neuzulassungen je Unterbezirk',
      result: `${fmt(t.totalEvs)} E-Pkw heute, ${fmt(t.newEvs)} Neuzulassungen; ${fmt(city.residents)} BEV Einwohner*innen verteilt`,
      status: 'im ISME-Modell',
    },
    {
      name: 'Pendelnde / Büroflächen',
      role: 'Menge',
      data: 'Gewerbeflächen, RVR-Flächennutzung 2021 (Stadt)',
      result: `${fmt(e?.commercialHa ?? 0)} ha; ${fmt(city.commuters)} BEV Einpendelnde danach verteilt`,
      status: 'im ISME-Modell',
    },
    {
      name: 'Tourismus / Ziele',
      role: 'Menge',
      data: 'Einkaufs- und Freizeit-POIs (OpenStreetMap), wie im Gutachten',
      result: `${fmt(e?.poisShopping ?? 0)} Einkauf + ${fmt(e?.poisLeisure ?? 0)} Freizeit; ${fmt(city.tourists)} BEV Tourismus danach verteilt`,
      status: 'im ISME-Modell',
    },
    {
      name: 'Zuzug / Neubau',
      role: 'Menge',
      data: 'Bebauungspläne (Open Data), in Kraft seit 2015',
      result: `${fmt(e?.bplansRecent ?? 0)} Pläne in ${fmt(withRecentPlans)} Unterbezirken; keine Wohnungszahlen, daher nicht im Modell`,
      status: 'Kennzahl',
    },
    {
      name: 'Nähe',
      role: 'Verteilung',
      data: 'Abstand zum nächsten der Ladestandorte; Gebäude in 225 m',
      result: `${pct(share((s) => s.distance > 225))} der Parkflächen ohne Ladestandort in 225 m; ${pct((e?.buildingsCovered ?? 0) / (e?.buildings || 1))} der Gebäude versorgt`,
      status: 'im Standort-Score',
    },
    {
      name: 'Fahrzeugdichte',
      role: 'Verteilung',
      data: 'Pkw je km² (Statistik Stadt)',
      result: `Median ${fmt(median)} Pkw/km², Spanne ${fmt(densities[0] ?? 0)} bis ${fmt(densities[densities.length - 1] ?? 0)}`,
      status: 'im Standort-Score',
    },
    {
      name: 'Bauliche Machbarkeit',
      role: 'Verteilung',
      data: 'Art der Parkfläche (OSM, Open Data)',
      result: `${fmt(kinds('garage') + kinds('park-ride'))} Parkhäuser/P+R, ${fmt(kinds('lot'))} Parkplätze, ${fmt(kinds('street'))} Straßenrand`,
      status: 'im Standort-Score',
    },
    {
      name: 'Stromnetz',
      role: 'Verteilung',
      data: 'keine Netzdaten; Näherung: bestehender Ladestandort ≤ 500 m und Bebauungsdichte',
      result: `${pct(share((s) => s.distance <= 500))} der Parkflächen haben einen Ladestandort (Netzanschluss) in 500 m`,
      status: 'Näherung',
    },
    {
      name: 'Parkplätze',
      role: 'Verteilung',
      data: 'OSM, Parkhäuser, Park+Ride; Stellplätze wo bekannt',
      result: `${fmt(sites.length)} öffentliche Parkflächen, ${fmt(sites.filter((s) => s.capacity).length)} mit bekannter Platzzahl`,
      status: 'im Standort-Score',
    },
  ];
}

export function CriteriaTable({ criteria }: { criteria: Criterion[] }) {
  return (
    <div className="rtable-wrap">
      <table className="rtable">
        <thead>
          <tr>
            <th>Kriterium</th>
            <th>Wofür</th>
            <th>Daten</th>
            <th>Berechnet</th>
            <th>Stand</th>
          </tr>
        </thead>
        <tbody>
          {criteria.map((c) => (
            <tr key={c.name}>
              <td>{c.name}</td>
              <td>{c.role}</td>
              <td>{c.data}</td>
              <td>{c.result}</td>
              <td>
                <span className={`status status-${c.status === 'Kennzahl' || c.status === 'Näherung' ? 'part' : 'ok'}`}>{c.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SitesReport({ data, results, sites }: { data: AppData; results: DistrictResult[]; sites: ScoredSite[] }) {
  const byUbz = sitesByDistrict(sites);
  const names = new Map(results.map((r) => [r.ubz, r]));
  const strong = sites.filter((s) => s.score >= STRONG);
  const top = [...sites].sort((a, b) => b.score - a.score).slice(0, 20);
  // districts that need points and have strong sites to put them on
  const ready = results
    .filter((r) => r.gap > 0)
    .map((r) => ({ r, strong: byUbz.get(r.ubz)?.strong ?? 0 }))
    .sort((a, b) => b.strong - a.strong || b.r.gap - a.r.gap)
    .slice(0, 12);
  const maxStrong = Math.max(...ready.map((x) => x.strong), 1);
  return (
    <section id="standorte" className="report" aria-labelledby="standorte-h">
      <p className="eyebrow">Bericht</p>
      <h2 id="standorte-h">Standorte im Unterbezirk</h2>
      <p className="lede">
        Wo im Unterbezirk die neuen Ladepunkte hin können: jede öffentliche Parkfläche bekommt einen Score aus Nähe, Fahrzeugdichte, baulicher
        Machbarkeit, Stromnetz (Näherung) und Parkplätzen, alle gleich gewichtet.
      </p>
      <dl className="rkpis">
        <div>
          <dt>Standortkandidaten</dt>
          <dd className="num">{fmt(sites.length)}</dd>
          <span className="note">öffentliche Parkflächen</span>
        </div>
        <div className="accent">
          <dt>Score ab {fmt(STRONG * 100)}</dt>
          <dd className="num">{fmt(strong.length)}</dd>
          <span className="note">{pct(strong.length / (sites.length || 1))} der Flächen</span>
        </div>
        <div>
          <dt>Unterbezirke mit starken Kandidaten</dt>
          <dd className="num">{fmt([...byUbz.values()].filter((d) => d.strong > 0).length)}</dd>
          <span className="note">von {fmt(results.length)}</span>
        </div>
      </dl>

      <h3>Unterbezirke mit Lücke und den meisten starken Kandidaten</h3>
      <ol className="rbars">
        {ready.map(({ r, strong: n }) => (
          <li key={r.ubz}>
            <span className="rbars-label">
              {r.name}
              <small>Lücke {fmt(r.gap)} LP</small>
            </span>
            <span className="rbars-track">
              <span className="rbars-bar" style={{ width: `${(n / maxStrong) * 100}%`, background: '#1f8a74' }} />
            </span>
            <span className="rbars-value num">{fmt(n)} Flächen</span>
          </li>
        ))}
      </ol>

      <h3>Die 20 besten Standortkandidaten der Stadt</h3>
      <div className="rtable-wrap">
        <table className="rtable">
          <thead>
            <tr>
              <th>#</th>
              <th>Fläche</th>
              <th>Unterbezirk</th>
              <th className="num">Score</th>
              {FACTORS.map((f) => (
                <th key={f.key} className="num">
                  {f.label}
                </th>
              ))}
              <th className="num">Abstand</th>
            </tr>
          </thead>
          <tbody>
            {top.map((s, i) => (
              <tr key={s.id}>
                <td className="num">{i + 1}</td>
                <td>
                  {s.name ?? KIND_LABEL[s.kind]}
                  <small>
                    {s.name ? KIND_LABEL[s.kind] : 'ohne Namen'}
                    {s.capacity ? ` · ${fmt(s.capacity)} Plätze` : ''}
                  </small>
                </td>
                <td>{names.get(s.ubz)?.name}</td>
                <td className="num strong">{fmt(s.score * 100)}</td>
                {FACTORS.map((f) => (
                  <td key={f.key} className="num">
                    {fmt(s.factors[f.key] * 100)}
                  </td>
                ))}
                <td className="num">{fmt(s.distance)} m</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        Stromnetz ist eine Näherung (keine Netzdaten vorhanden). Gewichte lassen sich im Werkzeug unter „Verteilung im Unterbezirk“ ändern. Quellen:{' '}
        {data.meta.parking?.sources.join('; ')}.
      </p>
    </section>
  );
}
