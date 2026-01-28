import { describe, it, expect } from 'vitest';
import { getActiveStashItems } from '../stash';

describe('stash helpers', () => {
  it('filters out disabled stash items', () => {
    const stash = new Set(['a', 'b', 'c']);
    const disabled = new Set(['b']);

    const active = getActiveStashItems(stash, disabled);

    expect(Array.from(active).sort()).toEqual(['a', 'c']);
  });

  it('returns empty set when all stash items are disabled', () => {
    const stash = new Set(['a', 'b']);
    const disabled = new Set(['a', 'b']);

    const active = getActiveStashItems(stash, disabled);

    expect(active.size).toBe(0);
  });

  it('ignores disabled entries not present in stash', () => {
    const stash = new Set(['a']);
    const disabled = new Set(['x']);

    const active = getActiveStashItems(stash, disabled);

    expect(Array.from(active)).toEqual(['a']);
  });
});