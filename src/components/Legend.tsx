import { useMemo } from 'react';
import type { District } from '../lib/isme';

interface Props {
  districts: District[];
  selected: string | null;
  showChargers: boolean;
  onSelect: (ubz: string | null) => void;
  onToggleChargers: (visible: boolean) => void;
}

export function Legend({ districts, selected, showChargers, onSelect, onToggleChargers }: Props) {
  const subdistricts = useMemo(
    () => [...districts].sort((a, b) => a.name.localeCompare(b.name, 'en') || a.ubz.localeCompare(b.ubz)),
    [districts],
  );

  return (
    <aside className="current-filters" aria-labelledby="filters-title">
      <h2 id="filters-title">Filters</h2>
      <label htmlFor="subdistrict-select">Subdistrict (Unterbezirk)</label>
      <select id="subdistrict-select" value={selected ?? ''} onChange={(event) => onSelect(event.target.value || null)}>
        <option value="">All subdistricts — city view</option>
        {subdistricts.map((district) => (
          <option key={district.ubz} value={district.ubz}>
            {district.name} ({district.ubz})
          </option>
        ))}
      </select>
      <label className="toggle">
        <input type="checkbox" checked={showChargers} onChange={(event) => onToggleChargers(event.target.checked)} />
        <span className="dot" aria-hidden="true" />
        Show current charging points
      </label>
    </aside>
  );
}
