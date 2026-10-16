import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import katex from 'katex';
import 'katex/dist/katex.min.css';

/** LaTeX formula rendered by KaTeX (fonts are bundled, no external requests). */
export function Tex({ tex, display = false }: { tex: string; display?: boolean }) {
  const html = useMemo(() => katex.renderToString(tex, { displayMode: display, throwOnError: false }), [tex, display]);
  return <span className={display ? 'tex tex-display' : 'tex'} dangerouslySetInnerHTML={{ __html: html }} />;
}

const GAP = 10;
const WIDTH = 340;

/**
 * Info button with a popover card. The card is portalled to <body> with fixed
 * positioning, so scrolling sidebars do not clip it. Opens on hover or focus,
 * stays open while the pointer is over the card, click pins it, Esc closes.
 */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const button = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  const show = () => {
    window.clearTimeout(timer.current);
    setOpen(true);
  };
  const hide = () => {
    if (pinned) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(false), 160);
  };

  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const place = () => {
      const r = button.current!.getBoundingClientRect();
      const h = card.current?.offsetHeight ?? 200;
      const right = r.right + GAP + WIDTH <= window.innerWidth - 8;
      const left = right ? r.right + GAP : Math.max(8, r.left - GAP - WIDTH);
      const top = Math.min(Math.max(8, r.top - 12), window.innerHeight - h - 8);
      setPos({ left, top });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPinned(false);
        setOpen(false);
      }
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!card.current?.contains(t) && !button.current?.contains(t)) {
        setPinned(false);
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`info-btn${pinned ? ' is-pinned' : ''}`}
        aria-label={`How is ${label} calculated?`}
        aria-expanded={open}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => {
          e.preventDefault(); // inside <summary>: don't toggle the section
          setPinned((p) => !p);
          setOpen(true);
        }}
      >
        i
      </button>
      {open &&
        createPortal(
          <div
            ref={card}
            role="tooltip"
            className="info-card"
            style={{ left: pos.left, top: pos.top, width: WIDTH }}
            onMouseEnter={show}
            onMouseLeave={hide}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}
