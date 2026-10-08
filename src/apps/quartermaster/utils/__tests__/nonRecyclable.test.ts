import { describe, expect, it } from 'vitest';
import { isModItem, isNonRecyclable, isWeaponItem } from '../../types/item';

describe('item rules on the game classification', () => {
  it('treats firearms, ammunition, augments, shields, mods and quick use items as non-recyclable', () => {
    expect(isNonRecyclable({ category: 'Firearm.Pistol', group: 'Weapons' })).toBe(true);
    // Amplified weapon rows have no stash group
    expect(isNonRecyclable({ category: 'Firearm.BattleRifle' })).toBe(true);
    expect(isNonRecyclable({ category: 'RiflePayload', group: 'Ammunition' })).toBe(true);
    expect(isNonRecyclable({ category: 'Augment', group: 'Augment' })).toBe(true);
    expect(isNonRecyclable({ category: 'Armor', group: 'Armor' })).toBe(true);
    expect(isNonRecyclable({ category: 'Modification.Firearm.Muzzle', group: 'Modifications' })).toBe(true);
    expect(isNonRecyclable({ category: 'Utility.Grenade', group: 'Utilities' })).toBe(true);
    expect(isNonRecyclable({ category: 'Gadget', group: 'Utilities' })).toBe(true);
  });

  it('keeps materials, trinkets, keys and items without classification recyclable', () => {
    expect(isNonRecyclable({ category: 'CraftingMaterial.Recyclable', group: 'CraftingItems' })).toBe(false);
    expect(isNonRecyclable({ category: 'CraftingMaterial.Basic', group: 'CraftingItems' })).toBe(false);
    expect(isNonRecyclable({ category: 'Misc.Trinket', group: 'Misc' })).toBe(false);
    expect(isNonRecyclable({ category: 'Utility.Key', group: 'Keys' })).toBe(false);
    expect(isNonRecyclable({})).toBe(false);
  });

  it('detects weapons by category and mods by stash group', () => {
    expect(isWeaponItem({ category: 'Firearm.LMG' })).toBe(true);
    expect(isWeaponItem({ category: 'MeleeWeapon' })).toBe(false);
    expect(isWeaponItem({})).toBe(false);
    expect(isModItem({ group: 'Modifications' })).toBe(true);
    expect(isModItem({ group: 'Weapons' })).toBe(false);
  });
});
