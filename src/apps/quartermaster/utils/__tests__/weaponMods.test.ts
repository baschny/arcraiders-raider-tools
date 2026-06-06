import { describe, expect, it } from 'vitest';
import type { CachedLoadout, CachedStash } from '../api';
import type { ItemsMap } from '../../types/item';
import type { OwnedItemDisplayRow } from '../../types/planner';
import {
  buildModCompatibilityMap,
  buildOwnedWeaponInstances,
  countFitsEmptySlots,
  flattenOwnedModInstances,
  getSlotIcon,
  matchWeaponSlots,
} from '../weaponMods';

const itemsMap = {
  weapon_i: {
    id: 'weapon_i',
    name: 'Weapon I',
    description: '',
    icon: '',
    rarity: 'Common',
    type: 'SMG',
    category: 'Weapon',
    subCategory: 'SMG',
    stationLevelRequired: 1,
    blueprintLocked: false,
    craftQuantity: 1,
    stackSize: 1,
    modSlots: {
      muzzle: ['silencer_i'],
      magazine: ['extended_light_mag_i'],
    },
  },
  silencer_i: {
    id: 'silencer_i',
    name: 'Silencer I',
    description: '',
    icon: '',
    rarity: 'Common',
    type: 'Modification',
    category: 'Modification',
    stationLevelRequired: 1,
    blueprintLocked: false,
    craftQuantity: 1,
    stackSize: 1,
  },
  extended_light_mag_i: {
    id: 'extended_light_mag_i',
    name: 'Extended Light Mag I',
    description: '',
    icon: '',
    rarity: 'Common',
    type: 'Modification',
    category: 'Modification',
    stationLevelRequired: 1,
    blueprintLocked: false,
    craftQuantity: 1,
    stackSize: 1,
  },
} satisfies ItemsMap;

describe('weapon mod utilities', () => {
  it('builds a reverse compatibility map by mod and slot type', () => {
    expect(buildModCompatibilityMap(itemsMap)).toEqual({
      silencer_i: [
        {
          slotType: 'muzzle',
          compatibleWeaponIds: ['weapon_i'],
        },
      ],
      extended_light_mag_i: [
        {
          slotType: 'light-mag',
          compatibleWeaponIds: ['weapon_i'],
        },
      ],
    });
  });

  it('derives exact owned weapon instances from stash and loadout roots', () => {
    const stash = {
      items: [
        {
          itemId: 'weapon_i',
          name: 'Weapon I',
          quantity: 1,
          slotIndex: 3,
          durabilityPercent: 74,
          attachments: [
            { itemId: 'silencer_i', name: 'Silencer I', quantity: 1, slotIndex: 0, durabilityPercent: 100 },
          ],
        },
      ],
    } as CachedStash;
    const loadout = {
      loadout: {
        weapon1: {
          itemId: 'weapon_i',
          name: 'Weapon I',
          quantity: 1,
          slotIndex: 0,
          durabilityPercent: 55,
          attachments: [
            { itemId: 'extended_light_mag_i', name: 'Extended Light Mag I', quantity: 1, slotIndex: 1, durabilityPercent: 100 },
          ],
        },
        weapon2: { itemId: null, name: null, quantity: 1, slotIndex: 1, durabilityPercent: 100 },
      },
    } as CachedLoadout;

    expect(buildOwnedWeaponInstances(stash, loadout, itemsMap)).toMatchObject([
      {
        instanceId: 'stash:3:weapon_i:0',
        itemId: 'weapon_i',
        source: 'stash',
        durabilityPercent: 74,
        attachments: [{ itemId: 'silencer_i', slotIndex: 0 }],
      },
      {
        instanceId: 'loadout:weapon1:weapon_i:0',
        itemId: 'weapon_i',
        source: 'loadout',
        durabilityPercent: 55,
        attachments: [{ itemId: 'extended_light_mag_i', slotIndex: 1 }],
      },
    ]);
  });

  it('matches filled and empty weapon slots and counts empty fits', () => {
    const instance = {
      instanceId: 'stash:3:weapon_i:0',
      itemId: 'weapon_i',
      source: 'stash' as const,
      sourceLabelKey: 'quartermaster.weapons.mod.inStash' as const,
      durabilityPercent: 74,
      attachments: [{ itemId: 'silencer_i', slotIndex: 0 }],
    };

    expect(matchWeaponSlots(itemsMap.weapon_i, instance).slots).toEqual([
      {
        slotKey: 'muzzle',
        rawSlotKey: 'muzzle',
        compatibleModIds: ['silencer_i'],
        attachedModId: 'silencer_i',
      },
      {
        slotKey: 'light-mag',
        rawSlotKey: 'magazine',
        compatibleModIds: ['extended_light_mag_i'],
        attachedModId: null,
      },
    ]);
    expect(countFitsEmptySlots('extended_light_mag_i', [instance], itemsMap)).toBe(1);
    expect(countFitsEmptySlots('silencer_i', [instance], itemsMap)).toBe(0);
  });

  it('flattens owned mod rows into attached and unattached instances', () => {
    const rows: OwnedItemDisplayRow[] = [
      {
        itemId: 'silencer_i',
        quantity: 2,
        locations: [
          { source: 'stash', quantity: 1 },
          { source: 'loadout_attachment', quantity: 1, parentItemId: 'weapon_i', parentName: 'Weapon I' },
        ],
      },
    ];

    expect(flattenOwnedModInstances(rows, itemsMap)).toEqual([
      {
        instanceId: 'silencer_i:stash:0',
        itemId: 'silencer_i',
        attached: false,
        source: 'stash',
      },
      {
        instanceId: 'silencer_i:loadout_attachment:weapon_i:0',
        itemId: 'silencer_i',
        attached: true,
        source: 'loadout',
        parentItemId: 'weapon_i',
        parentName: 'Weapon I',
      },
    ]);
  });

  it('selects deterministic slot icons from compatible mod ids', () => {
    expect(getSlotIcon('magazine', ['extended_light_mag_i'])).toBe('light-mag.webp');
    expect(getSlotIcon('muzzle', ['shotgun_silencer'])).toBe('shotgun-muzzle.webp');
    expect(getSlotIcon('grip', [])).toBe('underbarrel.webp');
  });
});
