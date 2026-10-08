import { describe, expect, it } from 'vitest';
import {
  buildGroupFilters,
  compareRarityAsc,
  compareRarityDesc,
  getThemeIcon,
  itemFilterGroup,
  itemFilterSubgroup,
  matchesGroupFilter,
  rarityLevel,
} from '../classificationFilters';
import { buildClassification } from '../catalog';
import type { ClassificationStructure, Rarity } from '../types';

const structure: ClassificationStructure = {
  rarities: {
    Common: { level: 1, color: '#6C6C6C' },
    Uncommon: { level: 2, color: '#26BF57' },
    Rare: { level: 3, color: '#00A9F2' },
    Epic: { level: 4, color: '#CC3099' },
    Legendary: { level: 5, color: '#FFC600' },
    Amplified: { level: 6, color: '#E88629' },
  },
  groups: [
    { id: 'Weapons', order: 4, subgroups: ['Firearm.AssaultRifle', 'Firearm.Pistol'] },
    { id: 'Augment', order: 2 },
    { id: 'Utilities', order: 7, subgroups: ['Utility.Tools', 'Utility.Grenade'] },
  ],
  categories: {},
};

const classification = buildClassification(structure, {
  groups: { Augment: 'Augments', Weapons: 'Weapons', Utilities: 'Quick Use' },
  subgroups: {
    'Firearm.AssaultRifle': 'Assault Rifle',
    'Firearm.Pistol': 'Pistol',
    'Utility.Tools': 'Tools',
    'Utility.Grenade': 'Grenades',
  },
} as never);

describe('group filters from the classification', () => {
  it('lists the groups of the items in game (tab) order, not alphabetically', () => {
    const filters = buildGroupFilters(classification, [
      { group: 'Utilities', subgroup: 'Utility.Grenade' },
      { group: 'Weapons', subgroup: 'Firearm.Pistol' },
      { group: 'Augment' },
    ]);
    expect(filters.map((g) => g.id)).toEqual(['Augment', 'Weapons', 'Utilities']);
    expect(filters.map((g) => g.name)).toEqual(['Augments', 'Weapons', 'Quick Use']);
  });

  it('only lists groups and subgroups that have items, subgroups in game order', () => {
    const filters = buildGroupFilters(classification, [
      { group: 'Utilities', subgroup: 'Utility.Grenade' },
      { group: 'Utilities', subgroup: 'Utility.Tools' },
    ]);
    expect(filters).toEqual([
      {
        id: 'Utilities',
        name: 'Quick Use',
        subgroups: [
          { id: 'Utility.Tools', name: 'Tools' },
          { id: 'Utility.Grenade', name: 'Grenades' },
        ],
      },
    ]);
  });

  it('files weapons outside the stash (Amplified rows) under Weapons and their weapon class', () => {
    const amplified = { category: 'Firearm.AssaultRifle' };
    expect(itemFilterGroup(amplified)).toBe('Weapons');
    expect(itemFilterSubgroup(amplified)).toBe('Firearm.AssaultRifle');
    expect(itemFilterGroup({ category: 'Currency' })).toBeUndefined();
    const filters = buildGroupFilters(classification, [amplified]);
    expect(filters[0]).toMatchObject({ id: 'Weapons', subgroups: [{ id: 'Firearm.AssaultRifle', name: 'Assault Rifle' }] });
  });

  it('matches single-select group and subgroup filter values', () => {
    const grenade = { group: 'Utilities', subgroup: 'Utility.Grenade', category: 'Utility.Grenade' };
    expect(matchesGroupFilter('all', grenade)).toBe(true);
    expect(matchesGroupFilter('g:Utilities', grenade)).toBe(true);
    expect(matchesGroupFilter('s:Utility.Grenade', grenade)).toBe(true);
    expect(matchesGroupFilter('s:Utility.Tools', grenade)).toBe(false);
    expect(matchesGroupFilter('Quick Use', grenade)).toBe(false);
  });
});

describe('rarity sorting', () => {
  // sorted as objects: Array.prototype.sort always moves bare undefined values to the end
  const rows: { rarity?: Rarity }[] = [{ rarity: 'Rare' }, {}, { rarity: 'Amplified' }, { rarity: 'Common' }, { rarity: 'Legendary' }];
  const sorted = (cmp: typeof compareRarityDesc) => [...rows].sort((a, b) => cmp(a.rarity, b.rarity)).map((r) => r.rarity);

  it('sorts items without rarity after Common (lowest) when sorting by rarity, highest first', () => {
    expect(sorted(compareRarityDesc)).toEqual(['Amplified', 'Legendary', 'Rare', 'Common', undefined]);
  });

  it('sorts items without rarity first when ascending', () => {
    expect(sorted(compareRarityAsc)).toEqual([undefined, 'Common', 'Rare', 'Legendary', 'Amplified']);
  });

  it('gives no rarity level 0 and Amplified level 6', () => {
    expect(rarityLevel(undefined)).toBe(0);
    expect(rarityLevel('Common')).toBe(1);
    expect(rarityLevel('Amplified')).toBe(6);
  });
});

describe('theme icons', () => {
  it('is keyed by theme ids', () => {
    expect(getThemeIcon('OldWorld')).toBe('/images/locations/old_world.webp');
    expect(getThemeIcon('Old World')).toBeUndefined();
    expect(getThemeIcon('ARC')).toBe('/images/locations/arc.webp');
  });
});
