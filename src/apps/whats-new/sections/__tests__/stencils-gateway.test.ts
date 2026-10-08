import { describe, it, expect } from 'vitest';
import stencilsJson from '../../../../../public/data/game/stencils.json';
import { buildStencilGroups } from '../stencils/data';
import type { StencilsStructure } from '../../../../shared/gamedata/types';

describe('stencils section data', () => {
  it('groups the 14 stencils by cost with weapons', () => {
    const s = stencilsJson as unknown as StencilsStructure;
    const groups = buildStencilGroups(s);
    expect(groups.map(([c]) => c)).toEqual([2, 4, 7, 15]);
    expect(groups.flatMap(([, l]) => l)).toHaveLength(14);
    expect(groups.flatMap(([, l]) => l).every((e) => e.weapons.length > 0)).toBe(true);
  });
});
