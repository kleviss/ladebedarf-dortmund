/** Switch between the simple presentation view and the full expert view. */
export function ModeToggle({ expert, onChange }: { expert: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className={`mode-toggle${expert ? ' is-on' : ''}`}
      role="switch"
      aria-checked={expert}
      onClick={() => onChange(!expert)}
      title={expert ? 'Alle Kennzahlen, Regler und Berichte' : 'Vereinfachte Ansicht für die Präsentation'}
    >
      <span className="mode-track" aria-hidden="true">
        <span className="mode-thumb" />
      </span>
      Expertenmodus
    </button>
  );
}
