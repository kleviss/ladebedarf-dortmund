/** Switch between the map tool and the reports, next to the page title. Keeps the scenario. */
export function PageTabs({ current }: { current: 'karte' | 'berichte' }) {
  const search = window.location.search;
  const tabs = [
    { id: 'karte', label: 'Karte', href: `/${search}` },
    { id: 'berichte', label: 'Berichte', href: `/berichte.html${search}` },
  ] as const;
  return (
    <nav className="page-tabs" aria-label="Ansicht">
      {tabs.map((t) => (
        <a key={t.id} href={t.href} aria-current={t.id === current ? 'page' : undefined}>
          {t.label}
        </a>
      ))}
    </nav>
  );
}
