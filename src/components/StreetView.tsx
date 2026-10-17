import { useEffect, useState } from 'react';

/** Google Maps Embed API key (optional). Without it the button opens Street View in a new tab. */
const KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

interface Props {
  lat: number;
  lon: number;
  label: string;
}

/** Street View of a site, loaded only on demand. */
export function StreetView({ lat, lon, label }: Props) {
  const [open, setOpen] = useState(false);
  const at = `${lat.toFixed(6)},${lon.toFixed(6)}`;
  const tab = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${at}`;

  // a different site starts closed again
  useEffect(() => setOpen(false), [at]);

  if (!KEY) {
    return (
      <a className="link-button street-view-link" href={tab} target="_blank" rel="noopener noreferrer">
        Open Street View ↗
      </a>
    );
  }

  const src = `https://www.google.com/maps/embed/v1/streetview?key=${encodeURIComponent(KEY)}&location=${at}&radius=60&fov=90`;
  return (
    <div className="street-view">
      <div className="street-view-head">
        <button type="button" className="link-button" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide Street View' : 'Show Street View'}
        </button>
        {open && (
          <a className="link-button" href={tab} target="_blank" rel="noopener noreferrer">
            Full screen ↗
          </a>
        )}
      </div>
      {open && (
        <iframe
          className="street-view-frame"
          title={`Street View: ${label}`}
          src={src}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      )}
    </div>
  );
}
