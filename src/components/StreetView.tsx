interface Props {
  lat: number;
  lon: number;
}

/** Opens Google Street View at a site in a new tab. */
export function StreetView({ lat, lon }: Props) {
  const href = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat.toFixed(6)},${lon.toFixed(6)}`;
  return (
    <a className="link-button street-view-link" href={href} target="_blank" rel="noopener noreferrer">
      Open Street View ↗
    </a>
  );
}
