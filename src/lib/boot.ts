// The boot screen lives in index.html so it shows from the first paint, before any script runs.

/** Keep the boot animation up at least this long after navigation, so a fast (cached) load doesn't just flash it */
const MIN_VISIBLE_MS = 900;

let hidden = false;

/**
 * Fade out the boot screen once the map has drawn (or loading failed); safe to call more than once.
 * Returns the milliseconds until the fade starts.
 */
export function hideBoot(): number {
  const boot = document.getElementById('boot');
  if (hidden || !boot) return 0;
  hidden = true;
  const wait = Math.max(0, MIN_VISIBLE_MS - performance.now());
  window.setTimeout(() => {
    boot.classList.add('boot-done');
    boot.addEventListener('transitionend', () => boot.remove(), { once: true });
    // reduced motion turns the fade off, so transitionend may never fire
    window.setTimeout(() => boot.remove(), 600);
  }, wait);
  return wait;
}
