import type { Map as MapLibreMap } from 'maplibre-gl';

// "Power flow" played over the map while it updates: current spreads from one point along a grid that
// joins every subdistrict to its nearest neighbours, and each subdistrict lights up as the current reaches it.

/** Time for the current to reach the farthest subdistrict */
const FLOW_MS = 800;
/** Fade-out after that */
const FADE_MS = 380;
/** How long a subdistrict glows once reached */
const FLASH_MS = 320;
/** Neighbours each subdistrict is wired to */
const NEIGHBOURS = 3;

const GLOW = '#1ea7ff';
const CORE = '#e9f8ff';

type LngLat = [number, number];

interface Grid {
  nodes: LngLat[];
  /** neighbour lists with distances */
  links: { to: number; d: number }[][];
}

/** Rough centroid of a subdistrict: the mean of its largest ring's vertices. */
function centroid(geometry: GeoJSON.MultiPolygon): LngLat {
  let ring = geometry.coordinates[0][0];
  for (const polygon of geometry.coordinates) if (polygon[0].length > ring.length) ring = polygon[0];
  let x = 0;
  let y = 0;
  for (const [lon, lat] of ring) {
    x += lon;
    y += lat;
  }
  return [x / ring.length, y / ring.length];
}

// longitude degrees are shorter than latitude degrees at Dortmund's latitude
const dist = (a: LngLat, b: LngLat) => Math.hypot((a[0] - b[0]) * 0.62, a[1] - b[1]);

export function buildGrid(districts: GeoJSON.FeatureCollection<GeoJSON.MultiPolygon>): Grid {
  const nodes = districts.features.map((f) => centroid(f.geometry));
  const links: Grid['links'] = nodes.map(() => []);
  const add = (a: number, b: number, d: number) => {
    if (!links[a].some((l) => l.to === b)) links[a].push({ to: b, d });
  };
  nodes.forEach((n, i) => {
    const nearest = nodes
      .map((m, j) => ({ j, d: dist(n, m) }))
      .filter((x) => x.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, NEIGHBOURS);
    for (const { j, d } of nearest) {
      add(i, j, d);
      add(j, i, d);
    }
  });
  return { nodes, links };
}

/** Shortest-path tree from the node nearest to `origin`: the branches the current travels along. */
function flowTree(grid: Grid, origin: LngLat) {
  const n = grid.nodes.length;
  const reach = new Array<number>(n).fill(Infinity);
  const parent = new Array<number>(n).fill(-1);
  let root = 0;
  grid.nodes.forEach((p, i) => {
    if (dist(p, origin) < dist(grid.nodes[root], origin)) root = i;
  });
  reach[root] = 0;
  const done = new Array<boolean>(n).fill(false);
  // a plain O(n²) Dijkstra is plenty for a city's subdistricts
  for (let k = 0; k < n; k++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || reach[i] < reach[u])) u = i;
    if (u < 0 || reach[u] === Infinity) break;
    done[u] = true;
    for (const { to, d } of grid.links[u]) {
      if (reach[u] + d < reach[to]) {
        reach[to] = reach[u] + d;
        parent[to] = u;
      }
    }
  }
  const far = Math.max(...reach.filter(Number.isFinite)) || 1;
  // start/end of each node's arrival as a share of FLOW_MS
  return { root, parent, at: reach.map((r) => (Number.isFinite(r) ? r / far : Infinity)) };
}

export interface PowerFlow {
  /**
   * Play once: current spreads over the grid from `origin` (the city centre when omitted), or, when `outline`
   * is given, only runs round that border. A call while the current is still spreading is ignored.
   */
  play(origin?: LngLat, outline?: LngLat[]): void;
  dispose(): void;
}

export function createPowerFlow(map: MapLibreMap, canvas: HTMLCanvasElement, grid: Grid, onRunning: (running: boolean) => void): PowerFlow {
  const ctx = canvas.getContext('2d');
  const centre: LngLat = [
    grid.nodes.reduce((a, n) => a + n[0], 0) / grid.nodes.length,
    grid.nodes.reduce((a, n) => a + n[1], 0) / grid.nodes.length,
  ];
  let frame = 0;
  let started = 0;
  let tree: ReturnType<typeof flowTree> | null = null;
  let ring: LngLat[] = [];
  /** distance along the ring up to each vertex */
  let ringLength: number[] = [];

  const stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    tree = null;
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    onRunning(false);
  };

  const draw = (now: number) => {
    if (!ctx || !tree) return;
    // the frame timestamp can be a little earlier than the performance.now() taken in play()
    const t = Math.max(0, now - started);
    if (t > FLOW_MS + FADE_MS) return stop();
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const fade = t <= FLOW_MS ? 1 : 1 - (t - FLOW_MS) / FADE_MS;
    // re-project every frame so the flow stays on the districts while the map pans or zooms
    const pts = grid.nodes.map((n) => map.project(n));
    const { parent, at } = tree;
    ctx.lineCap = 'round';
    const line = (x0: number, y0: number, x1: number, y1: number) => {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    };

    for (let i = 0; i < pts.length; i++) {
      const p = parent[i];
      if (p < 0) continue;
      const t0 = at[p] * FLOW_MS;
      const t1 = at[i] * FLOW_MS;
      if (t < t0) continue;
      const e = Math.min(1, (t - t0) / Math.max(1, t1 - t0));
      const a = pts[p];
      const b = pts[i];
      const x = a.x + (b.x - a.x) * e;
      const y = a.y + (b.y - a.y) * e;
      // the wire that has carried current: a soft glow under a thin bright line
      ctx.strokeStyle = GLOW;
      ctx.shadowColor = GLOW;
      ctx.shadowBlur = 10;
      ctx.globalAlpha = 0.35 * fade;
      ctx.lineWidth = 5;
      line(a.x, a.y, x, y);
      ctx.globalAlpha = 0.9 * fade;
      ctx.lineWidth = 1.6;
      line(a.x, a.y, x, y);
      // the bright spark at the front while it is still travelling
      if (e < 1) {
        const tail = Math.max(0, e - 0.35);
        ctx.globalAlpha = fade;
        ctx.shadowBlur = 16;
        ctx.strokeStyle = CORE;
        ctx.lineWidth = 3;
        line(a.x + (b.x - a.x) * tail, a.y + (b.y - a.y) * tail, x, y);
      }
    }

    // current runs once around the selected subdistrict's border
    if (ring.length > 1) {
      const e = Math.min(1, t / FLOW_MS);
      const p = ring.map((c) => map.project(c));
      // move along the border at an even speed, however unevenly its vertices are spaced
      const target = e * ringLength[ringLength.length - 1];
      let n = 0;
      while (n < p.length - 2 && ringLength[n + 1] < target) n++;
      const frac = Math.min(1, (target - ringLength[n]) / Math.max(1e-12, ringLength[n + 1] - ringLength[n]));
      const head = n + 1 < p.length ? { x: p[n].x + (p[n + 1].x - p[n].x) * frac, y: p[n].y + (p[n + 1].y - p[n].y) * frac } : p[n];
      const trace = () => {
        ctx.beginPath();
        ctx.moveTo(p[0].x, p[0].y);
        for (let k = 1; k <= n; k++) ctx.lineTo(p[k].x, p[k].y);
        ctx.lineTo(head.x, head.y);
        ctx.stroke();
      };
      ctx.lineJoin = 'round';
      ctx.strokeStyle = GLOW;
      ctx.shadowColor = GLOW;
      ctx.shadowBlur = 14;
      ctx.globalAlpha = 0.45 * fade;
      ctx.lineWidth = 7;
      trace();
      ctx.globalAlpha = fade;
      ctx.lineWidth = 2.5;
      trace();
      if (e < 1) {
        ctx.fillStyle = CORE;
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(head.x, head.y, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // each subdistrict flashes when the current reaches it
    ctx.shadowColor = GLOW;
    for (let i = 0; i < pts.length; i++) {
      const since = t - at[i] * FLOW_MS;
      if (since < 0) continue;
      const k = Math.min(1, since / FLASH_MS);
      const pt = pts[i];
      ctx.globalAlpha = (1 - k) * fade;
      ctx.shadowBlur = 16;
      ctx.fillStyle = CORE;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2.5 + 6 * k, 0, Math.PI * 2);
      ctx.fill();
      // a small lit node stays until the fade
      ctx.globalAlpha = 0.9 * fade;
      ctx.shadowBlur = 6;
      ctx.fillStyle = GLOW;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    frame = requestAnimationFrame(draw);
  };

  return {
    play(origin, outline) {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !ctx) return;
      if (tree && performance.now() - started < FLOW_MS) return;
      cancelAnimationFrame(frame);
      // a subdistrict only gets its border traced; the grid flow is for city-wide changes
      tree = outline ? { root: -1, parent: grid.nodes.map(() => -1), at: grid.nodes.map(() => Infinity) } : flowTree(grid, origin ?? centre);
      ring = outline ?? [];
      ringLength = [0];
      for (let i = 1; i < ring.length; i++) ringLength.push(ringLength[i - 1] + dist(ring[i - 1], ring[i]));
      started = performance.now();
      onRunning(true);
      frame = requestAnimationFrame(draw);
    },
    dispose: stop,
  };
}
