/**
 * Data Loader for Quartermaster
 * Loads item data from the shared database at public/data/items/items.json
 * Applies Quartermaster-specific transformations at load time.
 */

import type { AppLocale } from '../../../shared/i18n/config';
import { fetchLocalizedJson } from '../../../shared/utils/localizedContent';
import type { RawItemsOutput, ItemRarity } from '../../../shared/types/item';
import type { PlannerItem, ItemsMap, BenchId } from '../types/item';
import type { HideoutModuleDefinition, LocalizedHideoutModuleDefinition } from '../types/hideout';
import type { ProjectDefinition, LocalizedProjectDefinition } from '../types/project';
import type { QuestDefinition } from '../types/quest';
import type { Quest, QuestItemEntry } from '../../../shared/types/quest';

const ITEMS_URL = '/data/items/items.json';
const HIDEOUT_URL = '/data/quartermaster/hideout.json';
const PROJECTS_URL = '/data/quartermaster/projects.json';
const QUESTS_URL = '/data/quests/quest-data.json';

/**
 * Load all items from the shared item database.
 * Applies Quartermaster-specific transformations:
 *   - Excludes Blueprint types
 *   - Normalizes craftBench from string|string[] to single BenchId
 *   - Maps category and subCategory
 *   - Renames imageFilename→icon, weightKg→weight
 *   - Fills defaults (stationLevelRequired, blueprintLocked, craftQuantity)
 */
export async function loadAllItems(locale: AppLocale): Promise<ItemsMap> {
  const data = await fetchLocalizedJson<RawItemsOutput>(ITEMS_URL, locale);
  const itemsMap: ItemsMap = {};
  const EXCLUDED_TYPES = new Set(['Blueprint']);
  const VALID_BENCH_IDS = new Set<string>([
    'equipment_bench', 'explosives_bench', 'med_station',
    'refiner', 'utility_bench', 'weapon_bench', 'workbench',
  ]);

  for (const [id, raw] of Object.entries(data.items)) {
    if (EXCLUDED_TYPES.has(raw.type)) continue;

    // craftBench normalization
    let craftBench: BenchId | undefined;
    if (raw.craftBench !== undefined) {
      if (typeof raw.craftBench === 'string') {
        craftBench = raw.craftBench !== 'in_raid' && VALID_BENCH_IDS.has(raw.craftBench)
          ? (raw.craftBench as BenchId)
          : undefined;
      } else {
        const filtered = raw.craftBench.filter(b => b !== 'workbench' && b !== 'in_raid');
        for (const bench of filtered) {
          if (VALID_BENCH_IDS.has(bench)) {
            craftBench = bench as BenchId;
            break;
          }
        }
      }
    }

    // Category mapping
    let category: string;
    let subCategory: string | undefined;
    if (raw.isWeapon === true) {
      category = 'Weapon';
      subCategory = raw.type;
    } else if (raw.type === 'Quick Use') {
      category = 'Quick Use';
      if (craftBench === 'explosives_bench') subCategory = 'Explosive';
      else if (craftBench === 'med_station') subCategory = 'Medicinal';
      else if (craftBench === 'utility_bench') subCategory = 'Utility';
    } else {
      category = raw.type;
    }

    const item: PlannerItem = {
      id,
      name: raw.name.value,
      originalNameEn: raw.name.originalEn,
      description: raw.description,
      icon: raw.imageFilename ?? '',
      rarity: raw.rarity as ItemRarity,
      type: raw.type,
      category,
      ...(subCategory !== undefined && { subCategory }),
      ...(craftBench !== undefined && { craftBench }),
      stationLevelRequired: (raw.stationLevelRequired ?? 1) as 1 | 2 | 3,
      blueprintLocked: raw.blueprintLocked ?? false,
      craftQuantity: raw.craftQuantity ?? 1,
      ...(raw.recipe && Object.keys(raw.recipe).length > 0 && { recipe: raw.recipe }),
      ...(raw.upgradeCost && Object.keys(raw.upgradeCost).length > 0 && { upgradeCost: raw.upgradeCost }),
      ...(raw.upgradesTo && { upgradesTo: raw.upgradesTo }),
      ...(raw.upgradesFrom && { upgradesFrom: raw.upgradesFrom }),
      ...(raw.weaponBaseId && { weaponBaseId: raw.weaponBaseId }),
      ...(raw.weaponTier !== undefined && { weaponTier: raw.weaponTier as 1 | 2 | 3 | 4 }),
      ...(raw.modSlots && Object.keys(raw.modSlots).length > 0 && { modSlots: raw.modSlots }),
      ...(raw.recyclesInto && Object.keys(raw.recyclesInto).length > 0 && { recyclesInto: raw.recyclesInto }),
      ...(raw.salvagesInto && Object.keys(raw.salvagesInto).length > 0 && { salvagesInto: raw.salvagesInto }),
      ...(raw.repairCost && Object.keys(raw.repairCost).length > 0 && { repairCost: raw.repairCost }),
      ...(raw.repairDurability !== undefined && { repairDurability: raw.repairDurability }),
      stackSize: raw.stackSize,
      ...(raw.value !== undefined && { value: raw.value }),
      ...(raw.weightKg !== undefined && { weight: raw.weightKg }),
      ...(raw.foundIn !== undefined && {
        foundIn: typeof raw.foundIn === 'string'
          ? raw.foundIn.split(',').map(s => s.trim()).filter(Boolean)
          : raw.foundIn,
      }),
      ...(raw.questItem === true && { questItem: true }),
    };

    itemsMap[id] = item;
  }

  return itemsMap;
}

/**
 * Get an item by ID from the items map
 * Returns undefined if item doesn't exist
 */
export function getItem(itemsMap: ItemsMap, itemId: string): PlannerItem | undefined {
  return itemsMap[itemId];
}

/**
 * Check if an item ID exists in the items map
 */
export function itemExists(itemsMap: ItemsMap, itemId: string): boolean {
  return itemId in itemsMap;
}

/**
 * Get all item IDs sorted alphabetically
 */
export function getAllItemIds(itemsMap: ItemsMap): string[] {
  return Object.keys(itemsMap).sort();
}

/**
 * Filter items by category
 */
export function getItemsByCategory(itemsMap: ItemsMap, category: string): PlannerItem[] {
  return Object.values(itemsMap)
    .filter(item => item.category === category)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Load hideout module definitions from the generated JSON file
 */
export async function loadHideoutDefinitions(locale: AppLocale): Promise<HideoutModuleDefinition[]> {
  const definitions = await fetchLocalizedJson<LocalizedHideoutModuleDefinition[]>(
    HIDEOUT_URL,
    locale
  );

  return definitions.map((definition) => ({
    ...definition,
    name: definition.name.value,
    originalNameEn: definition.name.originalEn,
  }));
}

/**
 * Search items by name (case-insensitive)
 */
export function searchItems(itemsMap: ItemsMap, query: string): PlannerItem[] {
  const lowerQuery = query.toLowerCase();
  return Object.values(itemsMap)
    .filter(item => item.name.toLowerCase().includes(lowerQuery))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Load project definitions from the generated JSON file
 */
export async function loadProjectDefinitions(locale: AppLocale): Promise<ProjectDefinition[]> {
  const definitions = await fetchLocalizedJson<LocalizedProjectDefinition[]>(
    PROJECTS_URL,
    locale
  );

  return definitions.map((definition) => ({
    ...definition,
    name: definition.name.value,
    originalNameEn: definition.name.originalEn,
    phases: definition.phases.map((phase) => ({
      ...phase,
      name: phase.name.value,
      originalNameEn: phase.name.originalEn,
    })),
  }));
}

/**
 * Load quest data from the generated JSON file.
 * Returns both minimal QuestDefinition[] (for list logic) and full Quest[] (for tooltips).
 */
export async function loadQuestData(
  locale: AppLocale,
): Promise<{ definitions: QuestDefinition[]; fullQuests: Quest[] }> {
  interface LocalizedName {
    value: string;
    originalEn: string;
  }
  interface LocalizedQuestItemEntry {
    id: string;
    quantity: number;
    name: LocalizedName;
    rarity?: string;
    imageFilename?: string;
  }
  interface LocalizedBlueprintReward {
    id: string;
    name: LocalizedName;
    imageFilename?: string;
  }
  interface LocalizedQuest {
    id: string;
    name: LocalizedName;
    trader?: string;
    map?: string[];
    previousQuestIds?: string[];
    nextQuestIds?: string[];
    hasBlueprint?: boolean;
    blueprintRewards?: LocalizedBlueprintReward[];
    description?: LocalizedName;
    objectives?: LocalizedName[];
    objectivesOneRound?: boolean;
    otherRequirements?: string[];
    grantedItems?: LocalizedQuestItemEntry[];
    requiredItems?: LocalizedQuestItemEntry[];
    rewardItems?: LocalizedQuestItemEntry[];
  }

  const data = await fetchLocalizedJson<LocalizedQuest[]>(QUESTS_URL, locale);

  const definitions: QuestDefinition[] = [];
  const fullQuests: Quest[] = [];

  const mapQuestItem = (item: LocalizedQuestItemEntry): QuestItemEntry => ({
    id: item.id,
    quantity: item.quantity,
    name: item.name.value,
    originalNameEn: item.name.originalEn,
    rarity: (item.rarity ?? 'Common') as QuestItemEntry['rarity'],
    imageFilename: item.imageFilename ?? '',
  });

  for (const q of data) {
    definitions.push({
      id: q.id,
      name: q.name.value,
      requiredItems: (q.requiredItems ?? []).map((ri) => ({
        itemId: ri.id,
        quantity: ri.quantity,
      })),
      previousQuestIds: q.previousQuestIds ?? [],
      nextQuestIds: q.nextQuestIds ?? [],
    });

    fullQuests.push({
      id: q.id,
      name: q.name.value,
      originalNameEn: q.name.originalEn,
      trader: q.trader ?? 'Unknown',
      map: q.map ?? [],
      previousQuestIds: q.previousQuestIds ?? [],
      nextQuestIds: q.nextQuestIds ?? [],
      hasBlueprint: q.hasBlueprint ?? false,
      blueprintRewards: (q.blueprintRewards ?? []).map((b) => ({
        id: b.id,
        name: b.name.value,
        originalNameEn: b.name.originalEn,
        imageFilename: b.imageFilename ?? '',
      })),
      description: q.description?.value ?? '',
      descriptionOriginalEn: q.description?.originalEn,
      objectives: (q.objectives ?? []).map((o) => o.value),
      objectivesOneRound: q.objectivesOneRound ?? false,
      otherRequirements: q.otherRequirements ?? [],
      grantedItems: (q.grantedItems ?? []).map(mapQuestItem),
      requiredItems: (q.requiredItems ?? []).map(mapQuestItem),
      rewardItems: (q.rewardItems ?? []).map(mapQuestItem),
    });
  }

  return { definitions, fullQuests };
}
