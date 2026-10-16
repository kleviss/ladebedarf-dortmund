/** Switch between the map tool and the reports, next to the page title. Keeps the scenario. */
export function PageTabs({ current }: { current: 'karte' | 'berichte' }) {
  const tabs = [
    { id: 'karte', label: 'Karte', path: '/' },
    { id: 'berichte', label: 'Berichte', path: '/berichte.html' },
  ] as const;
  // read the query string when clicked: the app rewrites it after every change
  const go = (e: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    window.location.href = `${path}${window.location.search}`;
  };
  return (
    <nav className="page-tabs" aria-label="Ansicht">
      {tabs.map((t) => (
        <a
          key={t.id}
          href={`${t.path}${window.location.search}`}
          onClick={(e) => go(e, t.path)}
          aria-current={t.id === current ? 'page' : undefined}
        >
          {t.label}
        </a>
      ))}
    </nav>
  );
}
