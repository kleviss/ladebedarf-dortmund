// Small static discharges behind the cursor: a short jagged arc now and then while the mouse moves.
// Sparse on purpose (one every ~140 px of travel, at most one per 200 ms), drawn on one canvas,
// and the animation loop only runs while a spark is fading. Off for touch and reduced motion.

interface Spark {
  points: [number, number][];
  born: number;
}

const LIFE = 320;
const MIN_TRAVEL = 140;
const MIN_GAP = 200;

function bolt(x: number, y: number, dx: number, dy: number): [number, number][] {
  // shoot off sideways from the direction of travel, 12–20 px long, in 3–4 kinks
  const len = Math.hypot(dx, dy) || 1;
  const side = Math.random() < 0.5 ? 1 : -1;
  let ux = (-dy / len) * side * 0.8 - (dx / len) * 0.6;
  let uy = (dx / len) * side * 0.8 - (dy / len) * 0.6;
  const norm = Math.hypot(ux, uy) || 1;
  ux /= norm;
  uy /= norm;
  const total = 12 + Math.random() * 8;
  const n = 3 + Math.round(Math.random());
  const pts: [number, number][] = [[x, y]];
  for (let i = 1; i <= n; i++) {
    const t = (total * i) / n;
    const jitter = (Math.random() - 0.5) * 7;
    pts.push([x + ux * t - uy * jitter, y + uy * t + ux * jitter]);
  }
  return pts;
}

export function setupCursorSparks() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'cursor-sparks';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const colour = getComputedStyle(document.documentElement).getPropertyValue('--spark').trim() || '#2bb3ff';

  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize);

  const sparks: Spark[] = [];
  let running = false;
  let last: { x: number; y: number; t: number } | null = null;

  const frame = (now: number) => {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      const age = (now - s.born) / LIFE;
      if (age >= 1) {
        sparks.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = 0.6 * (1 - age);
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1.2;
      ctx.lineJoin = 'miter';
      ctx.shadowColor = colour;
      ctx.shadowBlur = 3;
      ctx.beginPath();
      s.points.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (sparks.length) requestAnimationFrame(frame);
    else running = false;
  };

  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      const now = performance.now();
      if (!last) {
        last = { x: e.clientX, y: e.clientY, t: now };
        return;
      }
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      if (Math.hypot(dx, dy) < MIN_TRAVEL || now - last.t < MIN_GAP) return;
      last = { x: e.clientX, y: e.clientY, t: now };
      sparks.push({ points: bolt(e.clientX, e.clientY, dx, dy), born: now });
      if (!running) {
        running = true;
        requestAnimationFrame(frame);
      }
    },
    { passive: true },
  );
}
