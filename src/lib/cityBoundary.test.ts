import { describe, expect, it } from 'vitest';
import { cityBoundary } from './cityBoundary';

const square = (x: number): GeoJSON.Feature<GeoJSON.MultiPolygon> => ({
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'MultiPolygon',
    coordinates: [[[[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]]]],
  },
});

describe('cityBoundary', () => {
  it('merges adjacent districts without their shared internal border', () => {
    const result = cityBoundary({ type: 'FeatureCollection', features: [square(0), square(1)] });
    expect(result.geometry.coordinates).toEqual([[[0, 0], [2, 0], [2, 1], [0, 1], [0, 0]]]);
  });

  it('preserves separate city areas and handles empty geometry', () => {
    expect(cityBoundary({ type: 'FeatureCollection', features: [square(0), square(3)] }).geometry.coordinates).toHaveLength(2);
    expect(cityBoundary({ type: 'FeatureCollection', features: [] }).geometry.coordinates).toEqual([]);
  });
});
