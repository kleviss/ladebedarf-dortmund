import { useMemo } from 'react';
import type { District } from '../lib/isme';
import { ZERO_COLOR, type Classes } from '../lib/metrics';

interface Props {
  districts: District[];
  /** Colour classes of the missing charging points */
  classes: Classes;
  selected: string | null;
  showChargers: boolean;
  onSelect: (ubz: string | null) => void;
  onToggleChargers: (visible: boolean) => void;
}

export function Legend({ districts, classes, selected, showChargers, onSelect, onToggleChargers }: Props) {
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
      <p className="hint">Select a subdistrict here or click it on the map.</p>
      <label className="toggle">
        <input type="checkbox" checked={showChargers} onChange={(event) => onToggleChargers(event.target.checked)} />
        <span className="dot" aria-hidden="true" />
        Show current charging points
      </label>
      <p className="hint">Markers show recorded locations, not live availability.</p>
      <h3 className="legend-title">Missing charging points</h3>
      <ul className="legend-scale">
        {classes.hasZero && (
          <li>
            <span className="swatch" style={{ background: ZERO_COLOR }} aria-hidden="true" />0 (demand covered)
          </li>
        )}
        {classes.breaks.map((b, i) => {
          const from = i === 0 ? 1 : classes.breaks[i - 1] + 1;
          return (
            <li key={b}>
              <span className="swatch" style={{ background: classes.colours[i] }} aria-hidden="true" />
              {from === b ? b : `${from}–${b}`}
            </li>
          );
        })}
      </ul>
      <p className="hint">Street space, today's electric cars. Hover a subdistrict for existing, required and missing points.</p>
    </aside>
  );
}
