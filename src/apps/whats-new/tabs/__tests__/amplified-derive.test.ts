import { describe, it, expect } from 'vitest';
import ampJson from '../../../../../public/data/game/amplification.json';
import { weaponRows, moduleOrder } from '../amplified/derive';
import type { AmplificationStructure } from '../../../../shared/gamedata/types';

describe('amplified section data', () => {
  const rows = weaponRows(ampJson as unknown as AmplificationStructure);

  it('derives a row with Amplifications for every weapon, grouped into 5 modules', () => {
    expect(rows).toHaveLength(15);
    expect(rows.every((r) => r.amplifications.length >= 2)).toBe(true);
    expect(new Set(rows.map((r) => r.moduleId)).size).toBe(5);
  });

  it('dedupes permutations: aphelion has bigger mag, incendiary, charged burst, increased burst', () => {
    const aphelion = rows.find((r) => r.baseId === 'aphelion');
    expect(aphelion?.amplifications.map((p) => p.name)).toEqual(
      expect.arrayContaining(['Bigger Mag', 'Incendiary Rounds', 'Charged Burst', 'Increased Burst']),
    );
    expect(aphelion?.amplifications).toHaveLength(4);
  });

  it('orders modules by MK number', () => {
    expect(moduleOrder('Amplification Module MK. III')).toBe(3);
    expect(moduleOrder('Amplification Module MK. V')).toBe(5);
  });
});
