import { union, type MultiPolygon, type Pair } from 'polygon-clipping';

/** Merge district polygons so internal borders are not highlighted as city limits. */
export function cityBoundary(
  districts: GeoJSON.FeatureCollection<GeoJSON.MultiPolygon>,
): GeoJSON.Feature<GeoJSON.MultiLineString> {
  const polygons: MultiPolygon[] = districts.features.map((feature) =>
    feature.geometry.coordinates.map((polygon) =>
      polygon.map((ring) => ring.map((position): Pair => [position[0], position[1]])),
    ),
  );
  const merged = polygons.length > 0 ? union(polygons[0], ...polygons.slice(1)) : [];
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'MultiLineString',
      coordinates: merged.map((polygon) => polygon[0]),
    },
  };
}
