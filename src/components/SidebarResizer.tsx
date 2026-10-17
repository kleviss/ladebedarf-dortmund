import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

const KEY = 'ladebedarf-sidebar';
const MIN = 240;
const DEFAULT = 320;
const STEP = 24;
const maxWidth = () => Math.max(MIN, Math.round(window.innerWidth * 0.6));
const clamp = (w: number) => Math.min(maxWidth(), Math.max(MIN, Math.round(w)));

interface Saved {
  width: number;
  collapsed: boolean;
  /** true: sidebar floats over the map; false: it takes its own column */
  floating: boolean;
}

function load(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return {
      width: typeof s.width === 'number' ? s.width : DEFAULT,
      collapsed: s.collapsed === true,
      floating: s.floating === true,
    };
  } catch {
    return { width: DEFAULT, collapsed: false, floating: false };
  }
}

/** Sidebar width and collapsed state, remembered per browser. */
export function useSidebar() {
  const [state, setState] = useState<Saved>(() => {
    const s = load();
    return { ...s, width: clamp(s.width) };
  });
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* private mode: just don't remember */
    }
  }, [state]);

  const setWidth = useCallback((w: number) => setState((s) => ({ ...s, width: clamp(w), collapsed: false })), []);
  const toggle = useCallback(() => setState((s) => ({ ...s, collapsed: !s.collapsed })), []);
  const toggleFloating = useCallback(() => setState((s) => ({ ...s, floating: !s.floating })), []);
  const reset = useCallback(() => setState((s) => ({ ...s, width: DEFAULT, collapsed: false })), []);
  const style = { '--sidebar-w': `${state.width}px` } as CSSProperties;
  return { ...state, setWidth, toggle, toggleFloating, reset, style };
}

interface Props {
  width: number;
  collapsed: boolean;
  floating: boolean;
  onWidth: (w: number) => void;
  onToggle: () => void;
  onToggleFloating: () => void;
  onReset: () => void;
}

/** Drag handle between sidebar and map, with a collapse button. */
export function SidebarResizer({ width, collapsed, floating, onWidth, onToggle, onToggleFloating, onReset }: Props) {
  const drag = useRef<{ x: number; w: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: React.PointerEvent) => {
    if (collapsed || e.button !== 0) return;
    drag.current = { x: e.clientX, w: width };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (drag.current) onWidth(drag.current.w + e.clientX - drag.current.x);
  };
  const stop = () => {
    drag.current = null;
    setDragging(false);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') onWidth(width - STEP);
    else if (e.key === 'ArrowRight') onWidth(width + STEP);
    else if (e.key === 'Home') onWidth(MIN);
    else if (e.key === 'End') onWidth(maxWidth());
    else return;
    e.preventDefault();
  };

  return (
    <div className={`sidebar-resizer${dragging ? ' is-dragging' : ''}${collapsed ? ' is-collapsed' : ''}`}>
      <button
        type="button"
        className="sidebar-toggle"
        onClick={onToggle}
        aria-label={collapsed ? 'Show filters' : 'Hide filters'}
        aria-expanded={!collapsed}
        title={collapsed ? 'Show filters' : 'Hide filters'}
      >
        {collapsed ? '›' : '‹'}
      </button>
      <button
        type="button"
        className="sidebar-toggle sidebar-mode"
        onClick={onToggleFloating}
        aria-pressed={floating}
        aria-label={floating ? 'Dock the filters next to the map' : 'Float the filters over the map'}
        title={floating ? 'Dock next to the map' : 'Float over the map'}
      >
        {floating ? '▣' : '▢'}
      </button>
      {!collapsed && (
        <div
          className="sidebar-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="Filter pane width (arrow keys; double-click resets)"
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
