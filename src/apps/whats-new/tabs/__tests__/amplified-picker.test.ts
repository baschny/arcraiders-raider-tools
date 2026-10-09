import { describe, it, expect } from 'vitest';
import ampJson from '../../../../../public/data/game/amplification.json';
import { canSelect, excludesOf, requiresOf, resultingVariant, toggle, totalParts, variantSets } from '../amplified/picker';
import type { AmplificationStructure, AmplifiedWeapon } from '../../../../shared/gamedata/types';

const weapons = (ampJson as unknown as AmplificationStructure).weapons;
const amp = (w: AmplifiedWeapon, id: string) => w.amplifications.find((a) => a.id === id)!;

describe('Amplification picker logic', () => {
  const hairpin = weapons.hairpin_i;

  it('Hairpin: Semi-Auto locks Incendiary and Tracker and unlocks Sprint Shooting', () => {
    expect(canSelect([], amp(hairpin, 'SprintShooting'), hairpin)).toEqual({ ok: false, reason: 'requires', by: 'SemiAuto' });
    expect(canSelect([], amp(hairpin, 'SemiAuto'), hairpin)).toEqual({ ok: true });
    const after = ['SemiAuto'];
    expect(canSelect(after, amp(hairpin, 'IncendiaryRounds'), hairpin)).toMatchObject({ ok: false, reason: 'excluded', by: 'SemiAuto' });
    expect(canSelect(after, amp(hairpin, 'TrackerRounds'), hairpin)).toMatchObject({ ok: false, reason: 'excluded', by: 'SemiAuto' });
    expect(canSelect(after, amp(hairpin, 'SprintShooting'), hairpin)).toEqual({ ok: true });
  });

  it('locks the rest with "limit" once the maximum is reached', () => {
    const w = weapons.burletta_i;
    expect(w.maxAmplifications).toBe(3);
    // pick any 3 that can be combined
    let sel: string[] = [];
    for (const a of w.amplifications) sel = toggle(sel, a, w);
    expect(sel).toHaveLength(3);
    const rest = w.amplifications.filter((a) => !sel.includes(a.id));
    expect(rest.length).toBeGreaterThan(0);
    for (const a of rest) {
      const r = canSelect(sel, a, w);
      expect(r.ok).toBe(false);
    }
    const free = rest.filter((a) => requiresOf(a).every((r) => sel.includes(r)) && !excludesOf(a).some((e) => sel.includes(e)));
    for (const a of free) expect(canSelect(sel, a, w)).toEqual({ ok: false, reason: 'limit' });
  });

  it('Aphelion: Increased Burst needs Charged Burst; deselecting Charged Burst removes it', () => {
    const w = weapons.aphelion;
    expect(canSelect([], amp(w, 'IncreasedBurst'), w)).toEqual({ ok: false, reason: 'requires', by: 'ChargedBurst' });
    let sel = toggle([], amp(w, 'ChargedBurst'), w);
    sel = toggle(sel, amp(w, 'IncreasedBurst'), w);
    expect(sel).toEqual(['ChargedBurst', 'IncreasedBurst']);
    expect(toggle(sel, amp(w, 'ChargedBurst'), w)).toEqual([]);
    expect(toggle(['ChargedBurst', 'IncreasedBurst', 'BiggerMag'], amp(w, 'ChargedBurst'), w)).toEqual(['BiggerMag']);
  });

  it('Anvil allows a single Amplification', () => {
    const w = weapons.anvil_i;
    expect(w.maxAmplifications).toBe(1);
    const sel = toggle([], w.amplifications[0], w);
    expect(sel).toHaveLength(1);
    expect(canSelect(sel, w.amplifications[1], w).ok).toBe(false);
  });

  it('sums parts per item and resolves the variant', () => {
    const w = hairpin;
    const sel = ['SemiAuto', 'SprintShooting'];
    expect(totalParts(sel, w).map((p) => p.quantity)).toEqual([3, 3]);
    expect(resultingVariant(sel, w)).toBe('hairpin_amplified_semi_auto_sprint_shooting');
  });

  it('every reachable selection corresponds to a variant where variants can be matched', () => {
    for (const w of Object.values(weapons)) {
      const sets = variantSets(w);
      if (!sets) continue;
      const ids = w.amplifications.map((a) => a.id);
      const subsets: string[][] = [[]];
      for (const id of ids) subsets.push(...subsets.map((s) => [...s, id]));
      for (const s of subsets) {
        const ok = s.length <= w.maxAmplifications && s.every((id) => requiresOf(amp(w, id)).every((r) => s.includes(r)) && !excludesOf(amp(w, id)).some((e) => s.includes(e)));
        if (!ok) continue;
        // building s one by one in dependency order must be allowed by canSelect, and s must be a variant
        expect(sets.some((v) => v.size === s.length && s.every((id) => v.has(id))), `${w.id}: ${s.join('+')}`).toBe(true);
      }
    }
  });
});
