import { useMemo, useState } from 'react';
import { fmt, type DistrictResult } from '../lib/model';

interface Props {
  results: DistrictResult[];
  selected: string | null;
  onSelect: (ubz: string) => void;
}

type SortKey = 'gap' | 'gapPer1000' | 'needed' | 'chargers' | 'residents' | 'name';

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: 'name', label: 'Unterbezirk', numeric: false },
  { key: 'residents', label: 'EW', numeric: true },
  { key: 'needed', label: 'Bedarf', numeric: true },
  { key: 'chargers', label: 'Bestand', numeric: true },
  { key: 'gap', label: 'Lücke', numeric: true },
  { key: 'gapPer1000', label: 'je 1.000 EW', numeric: true },
];

function toCsv(rows: DistrictResult[]) {
  const header = [
    'Unterbezirk_Nr',
    'Unterbezirk',
    'Stadtbezirk',
    'Einwohner_geschaetzt',
    'E_Pkw',
    'Bedarf_Ladepunkte',
    'Bestand_Ladepunkte',
    'Luecke_Ladepunkte',
    'Luecke_je_1000_EW',
  ];
  const lines = rows.map((r) =>
    [
      r.ubz,
      `"${r.name}"`,
      `"${r.stadtbezirk}"`,
      r.residents,
      r.evs.toFixed(1),
      r.needed.toFixed(1),
      r.chargers,
      r.gap.toFixed(1),
      r.gapPer1000.toFixed(2),
    ].join(';'),
  );
  return [header.join(';'), ...lines].join('\n');
}

export function RankingTable({ results, selected, onSelect }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('gap');
  const [asc, setAsc] = useState(false);

  const rows = useMemo(() => {
    const sorted = [...results].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = typeof av === 'string' ? av.localeCompare(bv as string, 'de') : (av as number) - (bv as number);
      return asc ? cmp : -cmp;
    });
    return sorted;
  }, [results, sortKey, asc]);

  const sortBy = (key: SortKey) => {
    if (key === sortKey) setAsc(!asc);
    else {
      setSortKey(key);
      setAsc(key === 'name');
    }
  };

  const download = () => {
    const blob = new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ladebedarf-dortmund-unterbezirke.csv';
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
            {rows.map((r, i) => (
              <tr key={r.ubz} className={r.ubz === selected ? 'is-selected' : undefined}>
                <td className="num muted">{i + 1}</td>
                <td>
                  <button type="button" className="row-button" onClick={() => onSelect(r.ubz)}>
                    {r.name}
                  </button>
                  <span className="sub">{r.stadtbezirk}</span>
                </td>
                <td className="num">{fmt(r.residents)}</td>
                <td className="num">{fmt(r.needed, 1)}</td>
                <td className="num">{fmt(r.chargers)}</td>
                <td className="num strong">{fmt(r.gap, 1)}</td>
                <td className="num">{fmt(r.gapPer1000, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
