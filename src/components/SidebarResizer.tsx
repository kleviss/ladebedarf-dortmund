import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

const KEY = 'ladebedarf-sidebar';
const MIN = 300;
const DEFAULT = 420;
const STEP = 24;
const maxWidth = () => Math.max(MIN, Math.round(window.innerWidth * 0.6));
const clamp = (w: number) => Math.min(maxWidth(), Math.max(MIN, Math.round(w)));

interface Saved {
  width: number;
  collapsed: boolean;
}

function load(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { width: typeof s.width === 'number' ? s.width : DEFAULT, collapsed: s.collapsed === true };
  } catch {
    return { width: DEFAULT, collapsed: false };
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
  const reset = useCallback(() => setState({ width: DEFAULT, collapsed: false }), []);
  const style = { '--sidebar-w': `${state.width}px` } as CSSProperties;
  return { ...state, setWidth, toggle, reset, style };
}

interface Props {
  width: number;
  collapsed: boolean;
  onWidth: (w: number) => void;
  onToggle: () => void;
  onReset: () => void;
}

/** Drag handle between sidebar and map, with a collapse button. */
export function SidebarResizer({ width, collapsed, onWidth, onToggle, onReset }: Props) {
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
        aria-label={collapsed ? 'Seitenleiste einblenden' : 'Seitenleiste ausblenden'}
        aria-expanded={!collapsed}
        title={collapsed ? 'Seitenleiste einblenden' : 'Seitenleiste ausblenden'}
      >
        {collapsed ? '›' : '‹'}
      </button>
      {!collapsed && (
        <div
          className="sidebar-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="Breite der Seitenleiste (Pfeiltasten, Doppelklick setzt zurück)"
          aria-valuemin={MIN}
          aria-valuemax={maxWidth()}
          aria-valuenow={width}
          tabIndex={0}
          title="Ziehen zum Ändern der Breite, Doppelklick setzt zurück"
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
