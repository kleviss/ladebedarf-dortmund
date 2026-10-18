// Sections switch on as they scroll into view: a spark runs along the top edge, the content
// flickers on like a fluorescent tube, the wire in "how it works" charges from end to end and
// the figures count up. Without IntersectionObserver or with reduced motion, nothing is hidden.

const ITEMS: Record<string, string> = {
  honours: '.honour',
  problem: 'h2, p',
  how: 'h2, .wire li',
  data: 'h2, .data-lede, .facts > div, .sources',
  cta: 'h2, .btn',
};

const fmt = new Intl.NumberFormat('en-GB');

function countUp(el: HTMLElement) {
  const m = el.textContent?.match(/^([\d,]+)(.*)$/);
  if (!m) return;
  const target = Number(m[1].replace(/,/g, ''));
  const rest = m[2];
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / 900);
    // fast surge that settles, like a meter needle
    const v = Math.round(target * (1 - Math.pow(1 - t, 4)));
    el.textContent = `${fmt.format(v)}${rest}`;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function setupReveal() {
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const sections = Object.keys(ITEMS)
    .map((cls) => document.querySelector<HTMLElement>(`section.${cls}`))
    .filter((s): s is HTMLElement => s !== null);
  // a section already on screen when the page opens shows straight away
  const fold = window.innerHeight * 0.9;
  for (const s of sections) {
    if (s.getBoundingClientRect().top < fold) continue;
    s.classList.add('reveal');
    const cls = Object.keys(ITEMS).find((c) => s.classList.contains(c))!;
    s.querySelectorAll<HTMLElement>(ITEMS[cls]).forEach((el, i) => {
      el.classList.add('reveal-item');
      el.style.setProperty('--i', String(i));
    });
    const spark = document.createElement('span');
    spark.className = 'spark';
    spark.setAttribute('aria-hidden', 'true');
    s.prepend(spark);
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const s = e.target as HTMLElement;
        io.unobserve(s);
        s.classList.add('is-live');
        s.querySelectorAll<HTMLElement>('.facts dt').forEach((dt, i) => setTimeout(() => countUp(dt), 250 + i * 120));
      }
    },
    { threshold: 0.2 },
  );
  sections.filter((s) => s.classList.contains('reveal')).forEach((s) => io.observe(s));
}
