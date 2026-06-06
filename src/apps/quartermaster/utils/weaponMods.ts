import type { CachedLoadout, CachedStash } from './api';
import type { ItemsMap, PlannerItem } from '../types/item';
import type { OwnedItemDisplayRow } from '../types/planner';
import type { CraftabilityInfo } from '../types/planner';

export type CraftStatus = 'craftable' | 'uncraftable' | 'unknown';

/**
 * Determine whether an item can be crafted right now.
 * Uses the same algorithm as ItemIcon's red Lock icon:
 *   Lock shown  ⇔ craftability?.hasRecipe && !craftability?.canCraft
 *
 * Returns:
 *   'craftable'    — the item has a recipe and all conditions are met
 *   'uncraftable'  — the item has a recipe but is currently blocked
 *   'unknown'      — the item has no recipe (not applicable)
 */
export function getCraftStatus(craftability?: CraftabilityInfo): CraftStatus {
  if (!craftability?.hasRecipe) return 'unknown';
  return craftability.canCraft ? 'craftable' : 'uncraftable';
}

type RawWeaponSlotKey = 'muzzle' | 'magazine' | 'stock' | 'grip' | 'special';

export type WeaponSlotType =
  | 'muzzle'
  | 'light-mag'
  | 'medium-mag'
  | 'shotgun-mag'
  | 'stock'
  | 'grip'
  | 'special';

export interface SlotCompatInfo {
  slotType: WeaponSlotType;
  compatibleWeaponIds: string[];
}

export type ModCompatibilityMap = Record<string, SlotCompatInfo[]>;

export interface OwnedWeaponAttachment {
  itemId: string;
  slotIndex: number;
}

export interface OwnedWeaponInstance {
  instanceId: string;
  itemId: string;
  source: 'stash' | 'loadout';
  sourceLabelKey: 'quartermaster.weapons.mod.inStash' | 'quartermaster.weapons.mod.inLoadout';
  durabilityPercent?: number;
  attachments: OwnedWeaponAttachment[];
}

export interface WeaponSlotState {
  slotKey: WeaponSlotType;
  rawSlotKey: RawWeaponSlotKey;
  compatibleModIds: string[];
  attachedModId: string | null;
}

export interface WeaponSlotMatch {
  slots: WeaponSlotState[];
  unmatchedAttachments: OwnedWeaponAttachment[];
}

export interface OwnedModInstance {
  instanceId: string;
  itemId: string;
  attached: boolean;
  source: 'stash' | 'loadout';
  parentItemId?: string;
  parentName?: string;
}

export interface WeaponSlotDefinition {
  slotKey: WeaponSlotType;
  rawSlotKey: RawWeaponSlotKey;
  compatibleModIds: string[];
}

export const WEAPON_SLOT_ORDER: WeaponSlotType[] = [
  'muzzle',
  'light-mag',
  'medium-mag',
  'shotgun-mag',
  'stock',
  'grip',
  'special',
];

export const WEAPON_TYPE_ORDER = [
  'Assault Rifle',
  'Battle Rifle',
  'SMG',
  'Shotgun',
  'Hand Cannon',
  'Pistol',
  'Sniper Rifle',
  'Launcher',
] as const;

function isRawWeaponSlotKey(slotKey: string): slotKey is RawWeaponSlotKey {
  return slotKey === 'muzzle' || slotKey === 'magazine' || slotKey === 'stock' || slotKey === 'grip' || slotKey === 'special';
}

function getSlotOrderIndex(slotKey: WeaponSlotType): number {
  return WEAPON_SLOT_ORDER.indexOf(slotKey);
}

export function deriveDisplaySlotType(rawSlotKey: string, compatibleModIds: string[]): WeaponSlotType | null {
  if (!isRawWeaponSlotKey(rawSlotKey)) return null;

  if (rawSlotKey === 'magazine') {
    if (compatibleModIds.some((id) => id.startsWith('extended_light_mag'))) return 'light-mag';
    if (compatibleModIds.some((id) => id.startsWith('extended_shotgun_mag'))) return 'shotgun-mag';
    return 'medium-mag';
  }

  return rawSlotKey;
}

function isKnownItem(itemId: string | null | undefined, itemsMap: ItemsMap): itemId is string {
  return !!itemId && !!itemsMap[itemId];
}

export function buildModCompatibilityMap(itemsMap: ItemsMap): ModCompatibilityMap {
  const working = new Map<string, Map<WeaponSlotType, Set<string>>>();

  for (const weapon of Object.values(itemsMap)) {
    if (!weapon.modSlots) continue;

    for (const [rawSlotKey, modIds] of Object.entries(weapon.modSlots)) {
      const slotType = deriveDisplaySlotType(rawSlotKey, modIds);
      if (!slotType) continue;

      for (const modId of modIds) {
        if (!working.has(modId)) {
          working.set(modId, new Map());
        }
        const bySlot = working.get(modId)!;
        if (!bySlot.has(slotType)) {
          bySlot.set(slotType, new Set());
        }
        bySlot.get(slotType)!.add(weapon.id);
      }
    }
  }

  const result: ModCompatibilityMap = {};
  for (const [modId, bySlot] of working.entries()) {
    result[modId] = Array.from(bySlot.entries())
      .map(([slotType, weaponIds]) => ({
        slotType,
        compatibleWeaponIds: Array.from(weaponIds).sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => getSlotOrderIndex(a.slotType) - getSlotOrderIndex(b.slotType));
  }

  return result;
}

function mapAttachments(
  attachments: Array<{ itemId: string | null; slotIndex: number; quantity: number }> | undefined,
  itemsMap: ItemsMap,
): OwnedWeaponAttachment[] {
  const result: OwnedWeaponAttachment[] = [];
  for (const attachment of attachments ?? []) {
    if (!isKnownItem(attachment.itemId, itemsMap) || attachment.quantity <= 0) continue;
    result.push({
      itemId: attachment.itemId,
      slotIndex: attachment.slotIndex,
    });
  }
  return result;
}

export function buildOwnedWeaponInstances(
  cachedStash: CachedStash | null,
  cachedLoadout: CachedLoadout | null,
  itemsMap: ItemsMap,
): OwnedWeaponInstance[] {
  const instances: OwnedWeaponInstance[] = [];
  const ordinals = new Map<string, number>();

  const nextOrdinal = (source: 'stash' | 'loadout', itemId: string): number => {
    const key = `${source}:${itemId}`;
    const current = ordinals.get(key) ?? 0;
    ordinals.set(key, current + 1);
    return current;
  };

  for (const stashItem of cachedStash?.items ?? []) {
    if (!isKnownItem(stashItem.itemId, itemsMap) || stashItem.quantity <= 0) continue;
    if (itemsMap[stashItem.itemId].category !== 'Weapon') continue;

    const ordinal = nextOrdinal('stash', stashItem.itemId);
    instances.push({
      instanceId: `stash:${stashItem.slotIndex}:${stashItem.itemId}:${ordinal}`,
      itemId: stashItem.itemId,
      source: 'stash',
      sourceLabelKey: 'quartermaster.weapons.mod.inStash',
      ...(stashItem.durabilityPercent !== undefined && { durabilityPercent: stashItem.durabilityPercent }),
      attachments: mapAttachments(stashItem.attachments, itemsMap),
    });
  }

  const loadoutSlots = [
    { slotKey: 'weapon1', slot: cachedLoadout?.loadout.weapon1 },
    { slotKey: 'weapon2', slot: cachedLoadout?.loadout.weapon2 },
  ] as const;

  for (const { slotKey, slot } of loadoutSlots) {
    if (!slot || !isKnownItem(slot.itemId, itemsMap) || slot.quantity <= 0) continue;
    if (itemsMap[slot.itemId].category !== 'Weapon') continue;

    const ordinal = nextOrdinal('loadout', slot.itemId);
    instances.push({
      instanceId: `loadout:${slotKey}:${slot.itemId}:${ordinal}`,
      itemId: slot.itemId,
      source: 'loadout',
      sourceLabelKey: 'quartermaster.weapons.mod.inLoadout',
      ...(slot.durabilityPercent !== undefined && { durabilityPercent: slot.durabilityPercent }),
      attachments: mapAttachments(slot.attachments, itemsMap),
    });
  }

  return instances;
}

export function getSlotIcon(slotKey: string, compatibleModIds: string[]): string {
  if (slotKey === 'muzzle') {
    return compatibleModIds.some((id) => id.startsWith('shotgun_choke') || id === 'shotgun_silencer')
      ? 'shotgun-muzzle.webp'
      : 'muzzle.webp';
  }

  if (slotKey === 'light-mag') return 'light-mag.webp';
  if (slotKey === 'medium-mag') return 'medium-mag.webp';
  if (slotKey === 'shotgun-mag') return 'shotgun-mag.webp';

  if (slotKey === 'magazine') {
    if (compatibleModIds.some((id) => id.startsWith('extended_light_mag'))) return 'light-mag.webp';
    if (compatibleModIds.some((id) => id.startsWith('extended_shotgun_mag'))) return 'shotgun-mag.webp';
    return 'medium-mag.webp';
  }

  if (slotKey === 'stock') return 'stock.webp';
  if (slotKey === 'grip') return 'underbarrel.webp';
  if (slotKey === 'special') return 'tech-mod.webp';
  return 'tech-mod.webp';
}

export function getSlotLabelKey(slotKey: WeaponSlotType): string {
  if (slotKey === 'light-mag') return 'quartermaster.weapons.slot.lightMagShort';
  if (slotKey === 'medium-mag') return 'quartermaster.weapons.slot.mediumMagShort';
  if (slotKey === 'shotgun-mag') return 'quartermaster.weapons.slot.shotgunMagShort';
  return `quartermaster.weapons.slot.${slotKey}`;
}

export function getWeaponSlotDefinitions(weapon: PlannerItem): WeaponSlotDefinition[] {
  const definitions: WeaponSlotDefinition[] = [];

  for (const [rawSlotKey, compatibleModIds] of Object.entries(weapon.modSlots ?? {})) {
    if (!isRawWeaponSlotKey(rawSlotKey) || compatibleModIds.length === 0) continue;
    const slotKey = deriveDisplaySlotType(rawSlotKey, compatibleModIds);
    if (!slotKey) continue;
    definitions.push({
      slotKey,
      rawSlotKey,
      compatibleModIds,
    });
  }

  return definitions.sort((a, b) => getSlotOrderIndex(a.slotKey) - getSlotOrderIndex(b.slotKey));
}

export function matchWeaponSlots(weapon: PlannerItem, instance: OwnedWeaponInstance): WeaponSlotMatch {
  const usedAttachmentIndexes = new Set<number>();
  const slots: WeaponSlotState[] = [];

  for (const definition of getWeaponSlotDefinitions(weapon)) {
    const compatibleSet = new Set(definition.compatibleModIds);
    const attachmentIndex = instance.attachments.findIndex((attachment, index) =>
      !usedAttachmentIndexes.has(index) && compatibleSet.has(attachment.itemId),
    );
    const attachedModId = attachmentIndex >= 0 ? instance.attachments[attachmentIndex].itemId : null;
    if (attachmentIndex >= 0) {
      usedAttachmentIndexes.add(attachmentIndex);
    }

    slots.push({
      slotKey: definition.slotKey,
      rawSlotKey: definition.rawSlotKey,
      compatibleModIds: definition.compatibleModIds,
      attachedModId,
    });
  }

  return {
    slots,
    unmatchedAttachments: instance.attachments.filter((_, index) => !usedAttachmentIndexes.has(index)),
  };
}

export function hasEmptyWeaponSlot(weapon: PlannerItem, instance: OwnedWeaponInstance): boolean {
  return matchWeaponSlots(weapon, instance).slots.some((slot) => slot.attachedModId === null);
}

export function countFitsEmptySlots(
  modItemId: string,
  ownedWeaponInstances: OwnedWeaponInstance[],
  itemsMap: ItemsMap,
): number {
  let count = 0;
  for (const instance of ownedWeaponInstances) {
    const weapon = itemsMap[instance.itemId];
    if (!weapon) continue;
    for (const slot of matchWeaponSlots(weapon, instance).slots) {
      if (slot.attachedModId === null && slot.compatibleModIds.includes(modItemId)) {
        count++;
      }
    }
  }
  return count;
}

export function flattenOwnedModInstances(ownedItemRows: OwnedItemDisplayRow[], itemsMap: ItemsMap): OwnedModInstance[] {
  const instances: OwnedModInstance[] = [];

  for (const row of ownedItemRows) {
    const item = itemsMap[row.itemId];
    if (!item || item.category !== 'Modification') continue;

    for (const location of row.locations) {
      for (let index = 0; index < location.quantity; index++) {
        if (location.source === 'stash_attachment' || location.source === 'loadout_attachment') {
          instances.push({
            instanceId: `${row.itemId}:${location.source}:${location.parentItemId}:${index}`,
            itemId: row.itemId,
            attached: true,
            source: location.source === 'stash_attachment' ? 'stash' : 'loadout',
            parentItemId: location.parentItemId,
            parentName: location.parentName,
          });
        } else {
          instances.push({
            instanceId: `${row.itemId}:${location.source}:${index}`,
            itemId: row.itemId,
            attached: false,
            source: location.source,
          });
        }
      }
    }
  }

  return instances;
}

export function getWeaponTypeSortIndex(type: string | undefined): number {
  if (!type) return WEAPON_TYPE_ORDER.length;
  const index = (WEAPON_TYPE_ORDER as readonly string[]).indexOf(type);
  return index >= 0 ? index : WEAPON_TYPE_ORDER.length;
}
