import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

const MIN = 240;
const STEP = 24;
const maxWidth = () => Math.max(MIN, Math.round(window.innerWidth * 0.6));
const clamp = (w: number) => Math.min(maxWidth(), Math.max(MIN, Math.round(w)));

interface Saved {
  width: number;
  collapsed: boolean;
  /** true: sidebar floats over the map; false: it takes its own column */
  floating: boolean;
}

function load(key: string, initial: number): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(key) ?? '{}');
    return {
      width: typeof s.width === 'number' ? s.width : initial,
      collapsed: s.collapsed === true,
      floating: s.floating === true,
    };
  } catch {
    return { width: initial, collapsed: false, floating: false };
  }
}

/**
 * Sidebar width and collapsed state, remembered per browser.
 * `cssVar` carries the width to the layout; the left filters use --sidebar-w, the right panel --panel-w.
 */
export function useSidebar(key = 'ladebedarf-sidebar', initial = 320, cssVar = '--sidebar-w') {
  const [state, setState] = useState<Saved>(() => {
    const s = load(key, initial);
    return { ...s, width: clamp(s.width) };
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* private mode: just don't remember */
    }
  }, [key, state]);

  const setWidth = useCallback((w: number) => setState((s) => ({ ...s, width: clamp(w), collapsed: false })), []);
  const toggle = useCallback(() => setState((s) => ({ ...s, collapsed: !s.collapsed })), []);
  const toggleFloating = useCallback(() => setState((s) => ({ ...s, floating: !s.floating })), []);
  const expand = useCallback(() => setState((s) => (s.collapsed ? { ...s, collapsed: false } : s)), []);
  const reset = useCallback(() => setState((s) => ({ ...s, width: initial, collapsed: false })), [initial]);
  const style = { [cssVar]: `${state.width}px` } as CSSProperties;
  return { ...state, setWidth, toggle, expand, toggleFloating, reset, style };
}

interface Props {
  /** which edge of the map the pane sits on; a right pane grows when dragged left */
  side?: 'left' | 'right';
  /** what the pane holds, for the button labels */
  label?: string;
  width: number;
  collapsed: boolean;
  floating: boolean;
  onWidth: (w: number) => void;
  onToggle: () => void;
  onToggleFloating: () => void;
  onReset: () => void;
}

/** Drag handle between sidebar and map, with a collapse button. */
export function SidebarResizer({
  side = 'left',
  label = 'filters',
  width,
  collapsed,
  floating,
  onWidth,
  onToggle,
  onToggleFloating,
  onReset,
}: Props) {
  const dir = side === 'left' ? 1 : -1;
  const drag = useRef<{ x: number; w: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: React.PointerEvent) => {
    if (collapsed || e.button !== 0) return;
    drag.current = { x: e.clientX, w: width };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (drag.current) onWidth(drag.current.w + dir * (e.clientX - drag.current.x));
  };
  const stop = () => {
    drag.current = null;
    setDragging(false);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') onWidth(width - dir * STEP);
    else if (e.key === 'ArrowRight') onWidth(width + dir * STEP);
    else if (e.key === 'Home') onWidth(MIN);
    else if (e.key === 'End') onWidth(maxWidth());
    else return;
    e.preventDefault();
  };

  return (
    <div
      className={`sidebar-resizer${side === 'right' ? ' is-right' : ''}${dragging ? ' is-dragging' : ''}${
        collapsed ? ' is-collapsed' : ''
      }`}
    >
      <button
        type="button"
        className="sidebar-toggle"
        onClick={onToggle}
        aria-label={collapsed ? `Show ${label}` : `Hide ${label}`}
        aria-expanded={!collapsed}
        title={collapsed ? `Show ${label}` : `Hide ${label}`}
      >
        {collapsed === (side === 'left') ? '›' : '‹'}
      </button>
      <button
        type="button"
        className="sidebar-toggle sidebar-mode"
        onClick={onToggleFloating}
        aria-pressed={floating}
        aria-label={floating ? `Dock the ${label} next to the map` : `Float the ${label} over the map`}
        title={floating ? 'Dock next to the map' : 'Float over the map'}
      >
        {floating ? '▣' : '▢'}
      </button>
      {!collapsed && (
        <div
          className="sidebar-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label={`${label[0].toUpperCase()}${label.slice(1)} pane width (arrow keys; double-click resets)`}
          aria-valuemin={MIN}
          aria-valuemax={maxWidth()}
          aria-valuenow={width}
          tabIndex={0}
          title="Drag to resize, double-click to reset"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={stop}
          onPointerCancel={stop}
          onDoubleClick={onReset}
          onKeyDown={onKeyDown}
        />
      )}
    </div>
  );
}
