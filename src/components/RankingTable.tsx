import { useMemo, useState } from 'react';
import { fmt, type DistrictResult, type Scenario } from '../lib/isme';

interface Props {
  results: DistrictResult[];
  scenario: Scenario;
  selected: string | null;
  onSelect: (ubz: string) => void;
  /** simple mode: show only the first rows */
  limit?: number;
}

type SortKey = 'gap' | 'gapPer1000Cars' | 'needed' | 'existing' | 'bev' | 'name' | 'parkingUncovered';

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: 'name', label: 'Unterbezirk', numeric: false },
  { key: 'bev', label: 'BEV', numeric: true },
  { key: 'needed', label: 'Bedarf', numeric: true },
  { key: 'existing', label: 'Bestand', numeric: true },
  { key: 'gap', label: 'Lücke', numeric: true },
  { key: 'gapPer1000Cars', label: 'je 1.000 Pkw', numeric: true },
  { key: 'parkingUncovered', label: 'Parken o. LP', numeric: true },
];

function toCsv(rows: DistrictResult[], s: Scenario) {
  const header = [
    'Unterbezirk_Nr',
    'Unterbezirk',
    'Stadtbezirk',
    'Pkw_privat',
    'Pkw_gewerblich',
    'E_Pkw_heute',
    `BEV_${s.year}`,
    'Bedarf_LP',
    'Bestand_LP',
    'Luecke_LP',
    'Luecke_je_1000_Pkw',
    'Parkflaechen_oeffentlich',
    'Parkflaechen_ohne_LP_225m',
  ];
  const lines = rows.map((r) =>
    [
      r.ubz,
      `"${r.name}"`,
      `"${r.stadtbezirk}"`,
      r.privateCars,
      r.commercialCars,
      r.totalEvs,
      r.bev.toFixed(1),
      r.needed.toFixed(1),
      r.existing,
      r.gap.toFixed(1),
      r.gapPer1000Cars.toFixed(2),
      r.parkingPublic ?? 0,
      r.parkingUncovered ?? 0,
    ].join(';'),
  );
  return [header.join(';'), ...lines].join('\n');
}

export function RankingTable({ results, scenario, selected, limit, onSelect }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('gap');
  const [asc, setAsc] = useState(false);

  const rows = useMemo(
    () =>
      [...results].sort((a, b) => {
        const av = a[sortKey] ?? 0;
        const bv = b[sortKey] ?? 0;
        const cmp = typeof av === 'string' ? av.localeCompare(bv as string, 'de') : (av as number) - (bv as number);
        return asc ? cmp : -cmp;
      }),
    [results, sortKey, asc],
  );

  const sortBy = (key: SortKey) => {
    if (key === sortKey) setAsc(!asc);
    else {
      setSortKey(key);
      setAsc(key === 'name');
    }
  };

  const download = () => {
    const blob = new Blob(['﻿' + toCsv(rows, scenario)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ladebedarf-dortmund-isme-${scenario.year}-${Math.round(scenario.bevShare * 100)}pct.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="panel" aria-labelledby="ranking-title">
      <div className="panel-head">
        <h2 id="ranking-title">Rangliste</h2>
        <button type="button" className="link-button" onClick={download}>
          CSV exportieren
        </button>
      </div>
      <div className="table-wrap">
        <table className="ranking">
          <thead>
            <tr>
              <th scope="col" className="num">
                #
              </th>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={c.numeric ? 'num' : undefined}
                  aria-sort={sortKey === c.key ? (asc ? 'ascending' : 'descending') : 'none'}
                >
                  <button type="button" onClick={() => sortBy(c.key)}>
                    {c.label}
                    {sortKey === c.key ? (asc ? ' ▲' : ' ▼') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(limit ? rows.slice(0, limit) : rows).map((r, i) => (
              <tr key={r.ubz} className={r.ubz === selected ? 'is-selected' : undefined}>
                <td className="num muted">{i + 1}</td>
                <td>
                  <button type="button" className="row-button" onClick={() => onSelect(r.ubz)}>
                    {r.name}
                  </button>
                  <span className="sub">{r.stadtbezirk}</span>
                </td>
                <td className="num">{fmt(r.bev)}</td>
                <td className="num">{fmt(r.needed, 1)}</td>
                <td className="num">{fmt(r.existing)}</td>
                <td className="num strong">{fmt(r.gap, 1)}</td>
                <td className="num">{fmt(r.gapPer1000Cars, 1)}</td>
                <td className="num">{fmt(r.parkingUncovered ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {limit && rows.length > limit && (
        <p className="hint">
          Top {limit} von {rows.length} Unterbezirken. Alle im Expertenmodus; der CSV-Export enthält immer alle.
        </p>
      )}
    </section>
  );
}
