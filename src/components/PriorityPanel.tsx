import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DATA_CHECKS,
  GROUP_LABEL,
  KIND_LABEL,
  TIER_COLOUR,
  TIER_LABEL,
  address,
  onSiteChecks,
  siteNotes,
  sitesCsv,
  type PlannedSite,
  type SiteLevel,
} from '../lib/sitePlan';
import { StreetView } from './StreetView';

interface Props {
  sites: PlannedSite[];
  level: SiteLevel;
  /** walking distances per group (m) */
  radius: Record<'residents' | 'commuters' | 'visitors', number>;
  names: Map<string, string>;
  /** list only this subdistrict */
  district: { ubz: string; name: string } | null;
  focusId: string | null;
  /** ticked on-site checks per site id */
  done: Record<string, string[]>;
  onFocus: (id: string | null) => void;
  onToggleCheck: (siteId: string, checkId: string) => void;
  onClearDistrict: () => void;
  onClose: () => void;
}

const PAGE = 100;
const fmt = (n: number, digits = 0) => n.toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function PriorityPanel({ sites, level, radius, names, district, focusId, done, onFocus, onToggleCheck, onClearDistrict, onClose }: Props) {
  const [shown, setShown] = useState(PAGE);
  const list = useMemo(() => (district ? sites.filter((s) => s.ubz === district.ubz) : sites), [sites, district]);
  const points = list.reduce((a, s) => a + s.points, 0);
  const unplaced = district ? level.unplaced[district.ubz] ?? 0 : Object.values(level.unplaced).reduce((a, n) => a + n, 0);
  const focused = useRef<HTMLLIElement>(null);

  useEffect(() => setShown(PAGE), [level, district]);
  // a site clicked on the map: page it in and scroll to it
  useEffect(() => {
    if (!focusId) return;
    const i = list.findIndex((s) => s.id === focusId);
    if (i >= shown) setShown(Math.ceil((i + 1) / PAGE) * PAGE);
  }, [focusId, list, shown]);
  useEffect(() => {
    focused.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focusId, shown]);

  const exportCsv = () => {
    const blob = new Blob(['﻿', sitesCsv(list, level, names, done)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `charging-sites-${level.key}${district ? `-${district.ubz}` : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <aside className="current-district priority-panel" aria-labelledby="priority-title">
      <header className="district-head">
        <div>
          <p className="eyebrow">{level.today ? "Today's electric cars" : `Scenario ${level.label} electric cars`}</p>
          <h2 id="priority-title">Priority list</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close priority list" title="Close priority list">
          ×
        </button>
      </header>
      <p className="site-summary">
        <b className="num">{fmt(list.length)}</b> stations · <b className="num">{fmt(points)}</b> new charging points
        {district && (
          <button type="button" className="chip" onClick={onClearDistrict} title="Show all subdistricts">
            {district.name} <span aria-hidden="true">×</span>
          </button>
        )}
      </p>
      {unplaced > 0 && <p className="hint site-warning">{fmt(unplaced)} missing points find no free kerb: street space is exhausted.</p>}
      <p className="hint">
        Ranked by electric cars without a charger within walking distance ({radius.residents} m home, {radius.commuters} m work,{' '}
        {radius.visitors} m leisure). Two points per station.
      </p>
      {list.length === 0 ? (
        <p className="hint">No new stations needed here.</p>
      ) : (
        <ol className="site-list">
          {list.slice(0, shown).map((s) => {
            const open = s.id === focusId;
            const notes = siteNotes(s);
            const onSite = onSiteChecks(s);
            const ticked = (done[s.id] ?? []).filter((id) => onSite.some((c) => c.id === id)).length;
            return (
              <li key={s.id} ref={open ? focused : undefined} className={`site-item${open ? ' is-open' : ''}`}>
                <button type="button" className="site-row" aria-expanded={open} onClick={() => onFocus(open ? null : s.id)}>
                  <span className="site-rank" style={{ background: TIER_COLOUR[s.tier], color: s.tier === 2 ? '#0b0b0b' : '#fff' }} title={`${TIER_LABEL[s.tier]} priority`}>
                    {s.rank}
                  </span>
                  <span className="site-main">
                    <span className="site-address">{address(s)}</span>
                    <span className="site-meta">
                      {names.get(s.ubz) ?? s.ubz} · {s.points} pt{s.points === 1 ? '' : 's'} · {fmt(s.evsNearby, 1)} EVs nearby · {GROUP_LABEL[s.group]}
                    </span>
                  </span>
                  <span className={`site-progress${ticked === onSite.length ? ' is-done' : ''}`} title="On-site checks ticked">
                    {ticked}/{onSite.length}
                  </span>
                </button>
                {open && (
                  <div className="site-detail">
                    <p className="site-coords">
                      <span className="num">
                        {s.lat.toFixed(5)}, {s.lon.toFixed(5)}
                      </span>{' '}
                      · {KIND_LABEL[s.kind]}
                    </p>
                    <StreetView lat={s.lat} lon={s.lon} />
                    <h3>Checked with data</h3>
                    <ul className="checklist">
                      {DATA_CHECKS.map((c) => (
                        <li key={c.id} className="check-ok">
                          <span aria-hidden="true">✓</span>
                          {c.label}
                        </li>
                      ))}
                    </ul>
                    {notes.length > 0 && (
                      <>
                        <h3>Notes</h3>
                        <ul className="checklist">
                          {notes.map((c) => (
                            <li key={c.id} className={c.status === 'option' ? 'check-option' : 'check-note'}>
                              <span aria-hidden="true">{c.status === 'option' ? '+' : '!'}</span>
                              {c.label}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    <h3>Check on site</h3>
                    <ul className="checklist">
                      {onSite.map((c) => (
                        <li key={c.id}>
                          <label>
                            <input type="checkbox" checked={(done[s.id] ?? []).includes(c.id)} onChange={() => onToggleCheck(s.id, c.id)} />
                            {c.label}
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <div className="site-list-foot">
        {shown < list.length && (
          <button type="button" className="link-button" onClick={() => setShown((n) => n + PAGE)}>
            Show {fmt(Math.min(PAGE, list.length - shown))} more of {fmt(list.length - shown)}
          </button>
        )}
        <button type="button" className="button" onClick={exportCsv} disabled={list.length === 0}>
          Export CSV
        </button>
      </div>
    </aside>
  );
}
