/**
 * Data Loader for Quartermaster
 * Loads and transforms item data from public/data/quartermaster/items.json
 */

import type { AppLocale } from '../../../shared/i18n/config';
import { fetchLocalizedJson } from '../../../shared/utils/localizedContent';
import type { PlannerItem, ItemsMap, LocalizedItemsData } from '../types/item';
import type { HideoutModuleDefinition, LocalizedHideoutModuleDefinition } from '../types/hideout';
import type { ProjectDefinition, LocalizedProjectDefinition } from '../types/project';
import type { QuestDefinition } from '../types/quest';
import type { Quest, QuestItemEntry } from '../../../shared/types/quest';

const ITEMS_URL = '/data/quartermaster/items.json';
const HIDEOUT_URL = '/data/quartermaster/hideout.json';
const PROJECTS_URL = '/data/quartermaster/projects.json';
const QUESTS_URL = '/data/quests/quest-data.json';

/**
 * Load all items from the generated JSON file
 * Transforms the stored format into ItemsMap with id property included
 */
export async function loadAllItems(locale: AppLocale): Promise<ItemsMap> {
  const data = await fetchLocalizedJson<LocalizedItemsData>(ITEMS_URL, locale);
  
  // Transform items to include id property
  const itemsMap: ItemsMap = {};
  for (const [id, item] of Object.entries(data.items)) {
    itemsMap[id] = {
      ...item,
      name: item.name.value,
      originalNameEn: item.name.originalEn,
      id,
    } as PlannerItem;
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
