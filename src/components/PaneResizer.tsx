import { useEffect, useRef, useState } from 'react';

const KEY = 'ladebedarf-filters-width';
const MIN = 240;
const DEFAULT = 320;
const STEP = 24;
const maxWidth = () => Math.max(MIN, Math.round(window.innerWidth * 0.6));
const clamp = (w: number) => Math.min(maxWidth(), Math.max(MIN, Math.round(w)));

/** Width of the filter pane, remembered per browser. */
export function usePaneWidth() {
  const [width, setWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(KEY));
      return clamp(saved > 0 ? saved : DEFAULT);
    } catch {
      return DEFAULT;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(KEY, String(width));
    } catch {
      /* private mode: just don't remember */
    }
  }, [width]);
  return { width, setWidth: (w: number) => setWidth(clamp(w)), reset: () => setWidth(DEFAULT) };
}

interface Props {
  width: number;
  onWidth: (w: number) => void;
  onReset: () => void;
}

/** Vertical drag handle on the right edge of the filter pane. */
export function PaneResizer({ width, onWidth, onReset }: Props) {
  const drag = useRef<{ x: number; w: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className={`pane-resizer${dragging ? ' is-dragging' : ''}`}
      style={{ left: width }}
      role="separator"
      aria-orientation="vertical"
      aria-label="Filter pane width (arrow keys; double-click resets)"
      aria-valuemin={MIN}
      aria-valuemax={maxWidth()}
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to resize, double-click to reset"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        drag.current = { x: e.clientX, w: width };
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
      }}
      onPointerMove={(e) => {
        if (drag.current) onWidth(drag.current.w + e.clientX - drag.current.x);
      }}
      onPointerUp={() => {
        drag.current = null;
        setDragging(false);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setDragging(false);
      }}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') onWidth(width - STEP);
        else if (e.key === 'ArrowRight') onWidth(width + STEP);
        else return;
        e.preventDefault();
      }}
    />
  );
}
