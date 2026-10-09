import { describe, it, expect } from 'vitest';
import ampJson from '../../../../../public/data/game/amplification.json';
import { layoutGraph } from '../amplified/graph';
import type { AmplificationStructure } from '../../../../shared/gamedata/types';

const weapons = (ampJson as unknown as AmplificationStructure).weapons;

describe('Amplification graph layout', () => {
  it('Burletta: three paths, Increased Burst continues the Burst path', () => {
    const g = layoutGraph(weapons.burletta_i);
    expect(g.rows).toBe(3);
    expect(g.cols).toBe(3);
    const node = (id: string) => g.nodes.find((n) => n.id === id)!;
    expect(g.edges.filter((e) => e.from === null)).toHaveLength(3);
    expect(node('IncreasedBurst')).toMatchObject({ col: 2, row: node('Burst').row });
    expect(new Set(['Burst', 'FullAuto', 'SprintShooting'].map((id) => node(id).row)).size).toBe(3);
    expect(g.edges.find((e) => e.to === 'IncreasedBurst')?.from).toBe('Burst');
  });

  it('places every Amplification of every weapon exactly once', () => {
    for (const w of Object.values(weapons)) {
      const g = layoutGraph(w);
      expect(g.nodes.map((n) => n.id).sort()).toEqual(w.amplifications.map((a) => a.id).sort());
    }
  });
});
