import { describe, expect, it } from 'vitest';
import { MARKER_SIZE, SOCKET_ICON_ZOOM, markerScaleAt } from '../MapEngine';

describe('marker sizes', () => {
  it('grow with the zoom, slower than the map, up to 2.5×', () => {
    expect(markerScaleAt(0.5)).toBe(1);
    expect(markerScaleAt(1)).toBe(1);
    expect(markerScaleAt(4)).toBeCloseTo(1.74, 2);
    expect(markerScaleAt(10)).toBeCloseTo(2.5, 2);
    expect(markerScaleAt(40)).toBe(2.5);
  });

  it('keep the icons inside at 6 px or more (loot dots only show icons from SOCKET_ICON_ZOOM on)', () => {
    expect(MARKER_SIZE.small * 0.56).toBeGreaterThanOrEqual(6);
    expect(MARKER_SIZE.socket * markerScaleAt(SOCKET_ICON_ZOOM) * 0.58).toBeGreaterThanOrEqual(10);
  });
});
