import { useMemo } from 'react';
import type { ComponentProps } from 'react';
import type { District } from '../lib/isme';
import { FactorControls } from './FactorControls';

interface Props {
  districts: District[];
  selected: string | null;
  showChargers: boolean;
  onSelect: (ubz: string | null) => void;
  onToggleChargers: (visible: boolean) => void;
  factorSettings: ComponentProps<typeof FactorControls>;
}

export function Legend({ districts, selected, showChargers, onSelect, onToggleChargers, factorSettings }: Props) {
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
        Show charging stations
      </label>
      <ul className="station-key" aria-label="Charging station markers">
        <li><span className="dot" aria-hidden="true" />Public AC</li>
        <li><span className="dot dot-dc" aria-hidden="true" />Fast charger (DC)</li>
        <li><span className="dot dot-offstreet" aria-hidden="true" />Car park, customers</li>
        <li className="muted">Size and number = charging points per station</li>
      </ul>
      <FactorControls {...factorSettings} />
    </aside>
  );
}
