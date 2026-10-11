import { describe, expect, it } from 'vitest';
import index from '../../../../public/data/map-data/index.json';
import { MAP_SLUGS } from '../routing';

describe('MAP_SLUGS', () => {
  it('lists the slug of every map of the data', () => {
    expect([...MAP_SLUGS].sort()).toEqual(index.maps.map((m) => m.slug).sort());
  });
});
