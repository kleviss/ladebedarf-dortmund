// Landing page: draws the 145 Unterbezirke shaded by missing charging points, with the same
// default model, colours and classes as the map at /dortmund/, so the numbers match the app.
import type { District } from '../lib/isme';
import { computeCurrentDemand, type DistrictResult } from '../lib/isme';
import { computeFactors, currentStreetDemand } from '../lib/factors';
import { factorDefaults, factorDestinations, factorDistricts } from '../lib/factorData';
import { quantileClasses, RAMP } from '../lib/metrics';
import './landing.css';

type Districts = GeoJSON.FeatureCollection<GeoJSON.MultiPolygon | GeoJSON.Polygon, District>;

const fmt = new Intl.NumberFormat('en-GB');
const svgNs = 'http://www.w3.org/2000/svg';

function demandOf(districts: Districts): Map<string, DistrictResult> {
  const run = computeFactors(factorDistricts, factorDestinations, factorDefaults);
  const byUbz = new Map(run.results.map((r) => [r.ubz, r]));
  const out = new Map<string, DistrictResult>();
  for (const f of districts.features) {
    const fr = byUbz.get(f.properties.ubz);
    out.set(f.properties.ubz, fr ? currentStreetDemand(f.properties, fr) : computeCurrentDemand(f.properties));
  }
  return out;
}

/** Equirectangular projection fitted to the box; good enough at city scale. */
function projector(districts: Districts, width: number, height: number) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const each = (fn: (p: number[]) => void) =>
    districts.features.forEach((f) => {
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      polys.forEach((rings) => rings.forEach((ring) => ring.forEach(fn)));
    });
  each(([x, y]) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  });
  const k = Math.cos((((minY + maxY) / 2) * Math.PI) / 180);
  const scale = Math.min(width / ((maxX - minX) * k), height / (maxY - minY));
  const ox = (width - (maxX - minX) * k * scale) / 2;
  const oy = (height - (maxY - minY) * scale) / 2;
  return ([x, y]: number[]) => [ox + (x - minX) * k * scale, oy + (maxY - y) * scale] as const;
}

function pathOf(geom: GeoJSON.MultiPolygon | GeoJSON.Polygon, project: ReturnType<typeof projector>) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  let d = '';
  for (const rings of polys)
    for (const ring of rings) {
      ring.forEach((p, i) => {
        const [x, y] = project(p);
        d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
      });
      d += 'Z';
    }
  return d;
}

function drawMap(districts: Districts, demand: Map<string, DistrictResult>) {
  const svg = document.querySelector<SVGSVGElement>('#city-map');
  const tip = document.querySelector<HTMLElement>('#map-tip');
  const stage = document.querySelector<HTMLElement>('.map-stage');
  if (!svg || !tip || !stage) return;
  const hide = () => {
    tip.hidden = true;
    paths.forEach((q) => q.classList.remove('is-active'));
  };
  const W = 600, H = 520;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const project = projector(districts, W, H);
  const gaps = districts.features.map((f) => demand.get(f.properties.ubz)?.gap ?? 0);
  const classes = quantileClasses(gaps);
  // fill in from the city centre outwards, once
  const centre = project([7.4653, 51.5136]);
  const group = document.createElementNS(svgNs, 'g');
  const paths: SVGPathElement[] = [];
  for (const f of districts.features) {
    const r = demand.get(f.properties.ubz);
    const gap = r?.gap ?? 0;
    const c = classes.classOf(gap);
    const p = document.createElementNS(svgNs, 'path');
    p.setAttribute('d', pathOf(f.geometry, project));
    p.style.setProperty('--fill', c < 0 ? 'var(--covered)' : RAMP[c]);
    const [x0, y0] = project(f.geometry.type === 'Polygon' ? f.geometry.coordinates[0][0] : f.geometry.coordinates[0][0][0]);
    p.style.setProperty('--delay', `${Math.round(Math.hypot(x0 - centre[0], y0 - centre[1]) * 2.2)}ms`);
    p.setAttribute('tabindex', '0');
    p.setAttribute('pathLength', '1');
    p.setAttribute('aria-label', `${f.properties.name}: ${fmt.format(gap)} missing charging points`);
    const show = (e?: MouseEvent) => {
      paths.forEach((q) => q.classList.toggle('is-active', q === p));
      tip.innerHTML = '';
      const name = document.createElement('strong');
      name.textContent = f.properties.name;
      const line = document.createElement('span');
      line.textContent =
        gap > 0 ? `${fmt.format(gap)} missing charging ${gap === 1 ? 'point' : 'points'}` : 'Covered: no missing points today';
      const sub = document.createElement('span');
      sub.className = 'map-tip-sub';
      sub.textContent = `${fmt.format(r?.existing ?? 0)} existing, ${fmt.format(r?.needed ?? 0)} needed`;
      tip.append(name, line, sub);
      tip.hidden = false;
      // follow the pointer; for keyboard focus sit on the district
      const box = stage.getBoundingClientRect();
      const at = e ? { x: e.clientX, y: e.clientY } : (() => {
        const b = p.getBoundingClientRect();
        return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
      })();
      const x = at.x - box.left, y = at.y - box.top;
      tip.style.left = `${Math.min(Math.max(x, tip.offsetWidth / 2), box.width - tip.offsetWidth / 2)}px`;
      tip.style.top = `${y}px`;
      tip.classList.toggle('below', y < tip.offsetHeight + 16);
    };
    p.addEventListener('mousemove', show);
    p.addEventListener('focus', () => show());
    p.addEventListener('blur', hide);
    paths.push(p);
    group.append(p);
  }
  svg.append(group);
  svg.addEventListener('mouseleave', hide);
  // commit the hidden start state before switching to the drawn one, so the transition runs
  svg.getBoundingClientRect();
  requestAnimationFrame(() => requestAnimationFrame(() => svg.classList.add('is-drawn')));

  // legend: same classes as the app
  const legend = document.querySelector<HTMLElement>('#map-legend');
  if (legend) {
    const items = classes.breaks.map((b, i) => {
      const from = i === 0 ? 1 : classes.breaks[i - 1] + 1;
      return `<li><i style="background:${classes.colours[i]}"></i>${from === b ? fmt.format(b) : `${fmt.format(from)}–${fmt.format(b)}`}</li>`;
    });
    if (classes.hasZero) items.unshift(`<li><i style="background:var(--covered)"></i>covered</li>`);
    legend.innerHTML = items.join('');
  }
}

async function main() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/city/unterbezirke.geojson`);
    if (!res.ok) throw new Error(String(res.status));
    const districts = (await res.json()) as Districts;
    const demand = demandOf(districts);
    let missing = 0, existing = 0;
    for (const r of demand.values()) {
      missing += r.gap;
      existing += r.existing;
    }
    document.querySelectorAll<HTMLElement>('[data-stat="missing"]').forEach((el) => (el.textContent = fmt.format(missing)));
    document.querySelectorAll<HTMLElement>('[data-stat="existing"]').forEach((el) => (el.textContent = fmt.format(existing)));
    document.documentElement.classList.add('has-stats');
    const readout = document.querySelector<HTMLElement>('#map-readout');
    if (readout) {
      readout.textContent = `${fmt.format(missing)} missing charging points across 145 subdistricts. Point at one for its numbers.`;
    }
    drawMap(districts, demand);
  } catch {
    // the page reads fine without the map; the button still opens the app
    document.querySelector('.hero-map')?.classList.add('is-empty');
  }
}

main();
