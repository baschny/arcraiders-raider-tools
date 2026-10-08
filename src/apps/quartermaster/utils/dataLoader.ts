/**
 * Data Loader for Quartermaster
 * Reads the v2 game-data domains (items/recipes/research, benches, projects, quests) via the
 * shared gamedata loader and maps them to the Quartermaster models. Ids are the v2 slugs, which
 * are identical to the 1.x ids, so persisted state keeps working unchanged.
 */

import type { AppLocale } from '../../../shared/i18n/config';
import { loadItemCatalog, type CatalogItem } from '../../../shared/gamedata/catalog';
import { loadDomain, loadStructure, nameOf } from '../../../shared/gamedata/loader';
import { loadQuestMapLocalizations } from '../../../shared/utils/questLocalization';
import type {
  ObjectiveNode,
  Project,
  ProjectGoal,
  Quest as GameQuest,
  Reward,
  TextEntry,
} from '../../../shared/gamedata/types';
import type { PlannerItem, ItemsMap, BenchId } from '../types/item';
import type { ItemRarity } from '../../../shared/types/item';
import type { HideoutModuleDefinition } from '../types/hideout';
import type { ProjectDefinition, ProjectOtherGoal, ProjectRequirementItem, ProjectStep } from '../types/project';
import type { QuestDefinition } from '../types/quest';
import type { Quest, QuestItemEntry } from '../../../shared/types/quest';
import { registerBenchNames } from './localization';

/** Game category of blueprints: not planner items (their recipes are read through the unlock). */
const EXCLUDED_CATEGORIES = new Set(['Recipe']);

/** Bench slugs that can craft items, read from the benches domain by loadAllItems/loadHideoutDefinitions. */
export let VALID_BENCH_IDS: ReadonlySet<string> = new Set<string>();

async function loadBenches(locale: AppLocale) {
  const benches = await loadDomain('benches', locale);
  VALID_BENCH_IDS = new Set(Object.keys(benches.structure.benches));
  registerBenchNames(
    Object.fromEntries(
      Object.values(benches.structure.benches).map((b) => [b.id, nameOf(benches, b.id, b.nameEn)]),
    ),
  );
  return benches;
}

/**
 * Cost to upgrade INTO this item (planner semantics), taken from the previous tier's ungated
 * upgrade entry. The catalog's own `upgradeCost` is the cost to the next tier.
 */
function costToReach(c: CatalogItem, all: Record<string, CatalogItem>): Record<string, number> | undefined {
  const prev = c.upgradesFrom ? all[c.upgradesFrom] : undefined;
  return prev?.upgradesTo === c.id ? prev.upgradeCost : undefined;
}

function plannerItemFromCatalog(c: CatalogItem, all: Record<string, CatalogItem>): PlannerItem {
  // Items that are only unlocked via Research Station research are not crafted at a bench.
  const crafted = c.researchId === undefined;
  const craftBench: BenchId | undefined =
    crafted && c.craftBench && c.craftBench !== 'in_raid' && VALID_BENCH_IDS.has(c.craftBench)
      ? c.craftBench
      : undefined;

  const has = (r?: Record<string, number>) => r && Object.keys(r).length > 0;
  return {
    id: c.id,
    name: c.name,
    originalNameEn: c.nameEn,
    description: c.description,
    icon: c.icon,
    ...(c.rarity !== undefined && { rarity: c.rarity as ItemRarity }),
    ...(c.category !== undefined && { category: c.category }),
    ...(c.group !== undefined && { group: c.group }),
    ...(c.subgroup !== undefined && { subgroup: c.subgroup }),
    ...(c.categoryName !== undefined && { categoryName: c.categoryName }),
    ...(c.groupName !== undefined && { groupName: c.groupName }),
    ...(c.subgroupName !== undefined && { subgroupName: c.subgroupName }),
    ...(craftBench !== undefined && { craftBench }),
    stationLevelRequired: crafted ? (c.stationLevelRequired ?? 1) : 1,
    blueprintLocked: c.blueprintLocked,
    craftQuantity: crafted ? c.craftQuantity : 1,
    ...(crafted && has(c.recipe) && { recipe: c.recipe }),
    ...(has(costToReach(c, all)) && { upgradeCost: costToReach(c, all) }),
    ...(c.upgradesTo && { upgradesTo: c.upgradesTo }),
    ...(c.upgradesFrom && { upgradesFrom: c.upgradesFrom }),
    // v2 baseId/tier replace weaponBaseId/weaponTier; same root slugs. Only weapons carry them here.
    ...(c.isWeapon && c.baseId && { weaponBaseId: c.baseId }),
    ...(c.isWeapon && c.tier !== undefined && { weaponTier: c.tier as 1 | 2 | 3 | 4 }),
    ...(c.modSlots && Object.keys(c.modSlots).length > 0 && { modSlots: c.modSlots }),
    ...(has(c.recyclesInto) && { recyclesInto: c.recyclesInto }),
    ...(has(c.salvagesInto) && { salvagesInto: c.salvagesInto }),
    ...(has(c.repairCost) && { repairCost: c.repairCost }),
    ...(c.repairDurability !== undefined && { repairDurability: c.repairDurability }),
    stackSize: c.stackSize,
    ...(c.value !== undefined && { value: c.value }),
    ...(c.weightKg !== undefined && { weight: c.weightKg }),
    ...(c.foundIn !== undefined && { foundIn: c.foundIn }),
    ...(c.foundInNames !== undefined && { foundInNames: c.foundInNames }),
    ...(c.effects !== undefined && { effects: c.effects }),
    ...(c.questItem === true && { questItem: true }),
  };
}

/**
 * Load all items from the v2 item catalog (items + recipes + research).
 * Excludes blueprints (category `Recipe`); resolves the craft bench from the explicit recipe data.
 */
export async function loadAllItems(locale: AppLocale): Promise<ItemsMap> {
  const [catalog] = await Promise.all([loadItemCatalog(locale), loadBenches(locale)]);
  const itemsMap: ItemsMap = {};
  for (const c of Object.values(catalog.items)) {
    if (c.category && EXCLUDED_CATEGORIES.has(c.category)) continue;
    itemsMap[c.id] = plannerItemFromCatalog(c, catalog.items);
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
 * Load hideout module definitions from the benches domain (Research Station included; its
 * level gates are carried in `requires`). Benches without any build cost (Workbench) are omitted
 * like before.
 */
export async function loadHideoutDefinitions(locale: AppLocale): Promise<HideoutModuleDefinition[]> {
  const benches = await loadBenches(locale);
  const out: HideoutModuleDefinition[] = [];
  for (const bench of Object.values(benches.structure.benches)) {
    if (!bench.levels.some((l) => l.buildCost?.length || l.requires?.length)) continue;
    out.push({
      id: bench.id,
      name: nameOf(benches, bench.id, bench.nameEn),
      originalNameEn: bench.nameEn,
      maxLevel: bench.maxLevel,
      levels: bench.levels.map((l) => ({
        level: l.level,
        image: l.icon,
        requirementItemIds: (l.buildCost ?? []).map(({ itemId, quantity }) => ({ itemId, quantity })),
        ...(l.requires?.length && { requires: l.requires }),
      })),
    });
  }
  return out;
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

const toSeconds = (iso?: string): number | undefined => {
  if (!iso) return undefined;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? undefined : Math.floor(ms / 1000);
};

/** Text lookup for nested keys like '0.1' → text.steps['0']['1']. */
function nestedText(entry: TextEntry | undefined, field: string, key: string): Record<string, string> | undefined {
  let cur: unknown = entry?.[field];
  for (const part of key.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur && typeof cur === 'object' ? (cur as Record<string, string>) : undefined;
}

function mapProject(project: Project, text: TextEntry | undefined, textEn: TextEntry | undefined): ProjectDefinition {
  const steps: ProjectStep[] = [];
  let index = 0;
  for (const phase of project.phases ?? []) {
    for (const step of phase.steps ?? []) {
      index += 1;
      const requirements = new Map<string, number>();
      const otherGoals: ProjectOtherGoal[] = [];
      for (const goal of step.goals ?? []) {
        const goalName = nestedText(text, 'goals', goal.key)?.name;
        if (goal.goalType === 'items' && goal.itemIds?.length === 1) {
          requirements.set(goal.itemIds[0], (requirements.get(goal.itemIds[0]) ?? 0) + goal.amount);
        } else {
          otherGoals.push(toOtherGoal(goal, goalName));
        }
      }
      const requirementItemIds: ProjectRequirementItem[] = [...requirements].map(([itemId, quantity]) => ({ itemId, quantity }));
      steps.push({
        name: nestedText(text, 'steps', step.key)?.name ?? `Step ${index}`,
        originalNameEn: nestedText(textEn, 'steps', step.key)?.name,
        index,
        requirementItemIds,
        ...(otherGoals.length > 0 && { otherGoals }),
      });
    }
  }
  return {
    id: project.id,
    name: text?.name ?? project.nameEn,
    originalNameEn: project.nameEn,
    startDate: toSeconds(project.start),
    endDate: toSeconds(project.end),
    phases: steps,
  };
}

function toOtherGoal(goal: ProjectGoal, name: string | undefined): ProjectOtherGoal {
  return {
    key: goal.key,
    goalType: goal.goalType,
    amount: goal.amount,
    required: goal.required,
    ...(goal.repeatable && { repeatable: true }),
    ...(name && { name }),
    ...(goal.tags?.length && { tags: goal.tags }),
  };
}

/**
 * Load project definitions from the projects domain. Phases and steps are flattened into one
 * running step list (1-based `index`, as in persisted keys and API progress); item goals become
 * the requirement list, other goal types (value, complete_quests, photo, ...) are kept as
 * `otherGoals`. Community events (type 'event') are not tracked by the project API and skipped.
 */
export async function loadProjectDefinitions(locale: AppLocale): Promise<ProjectDefinition[]> {
  const [projects, projectsEn] = await Promise.all([
    loadDomain('projects', locale),
    locale === 'en' ? undefined : loadDomain('projects', 'en'),
  ]);
  return Object.values(projects.structure.projects)
    .filter((p) => p.type !== 'event')
    .map((p) => mapProject(p, projects.text[p.id], (projectsEn ?? projects).text[p.id]));
}

function leafObjectives(node: ObjectiveNode, out: ObjectiveNode[] = []): ObjectiveNode[] {
  if (node.children?.length) node.children.forEach((c) => leafObjectives(c, out));
  else if (!node.hidden) out.push(node);
  return out;
}

function allActions(node: ObjectiveNode, out: NonNullable<ObjectiveNode['action']>[] = []) {
  if (node.action) out.push(node.action);
  node.children?.forEach((c) => allActions(c, out));
  return out;
}


/**
 * Load quest data from the quests domain.
 * Returns both minimal QuestDefinition[] (for list logic) and full Quest[] (for tooltips).
 * Required items are the Deliver/Obtain objectives; granted items are the accept rewards.
 */
export async function loadQuestData(
  locale: AppLocale,
): Promise<{ definitions: QuestDefinition[]; fullQuests: Quest[] }> {
  // map names for the shared QuestTooltip (map indicators)
  const [quests, catalog, trades] = await Promise.all([
    loadDomain('quests', locale),
    loadItemCatalog(locale),
    loadStructure('trades'),
    loadQuestMapLocalizations().catch((error: unknown) => console.error('Failed to load map names:', error)),
  ]);

  const entry = (itemId: string, quantity: number): QuestItemEntry => {
    const item = catalog.items[itemId];
    return {
      id: itemId,
      quantity,
      name: item?.name ?? itemId,
      originalNameEn: item?.nameEn ?? itemId,
      rarity: item?.rarity,
      imageFilename: item?.icon ?? '',
    };
  };
  const fromRewards = (rewards?: Reward[]) => (rewards ?? []).map((r) => entry(r.itemId, r.quantity));

  const definitions: QuestDefinition[] = [];
  const fullQuests: Quest[] = [];

  for (const q of Object.values(quests.structure.quests) as GameQuest[]) {
    const text = quests.text[q.id];
    const objectiveText = (text?.objectives ?? {}) as Record<string, string>;
    const required = new Map<string, number>();
    for (const a of allActions(q.objective)) {
      if ((a.type === 'Deliver' || a.type === 'Obtain') && a.itemId) {
        required.set(a.itemId, (required.get(a.itemId) ?? 0) + a.amount);
      }
    }
    const requiredItems = [...required].map(([itemId, quantity]) => entry(itemId, quantity));
    const previousQuestIds = (q.requires ?? []).flatMap((r) => (r.questId ? [r.questId] : []));
    const nextQuestIds = q.next ?? [];
    const name = nameOf(quests, q.id, q.nameEn);
    const blueprintRewards = (q.rewards?.complete ?? [])
      .filter((r) => catalog.items[r.itemId]?.category === 'Recipe')
      .map((r) => ({
        id: r.itemId,
        name: catalog.items[r.itemId]?.name ?? r.itemId,
        originalNameEn: catalog.items[r.itemId]?.nameEn,
        imageFilename: catalog.items[r.itemId]?.icon ?? '',
      }));

    definitions.push({
      id: q.id,
      name,
      requiredItems: requiredItems.map((ri) => ({ itemId: ri.id, quantity: ri.quantity })),
      previousQuestIds,
      nextQuestIds,
    });

    fullQuests.push({
      id: q.id,
      name,
      originalNameEn: q.nameEn,
      trader: q.traderId ? (trades.traders[q.traderId]?.nameEn ?? q.traderId) : 'Unknown',
      map: q.mapIds ?? [],
      previousQuestIds,
      nextQuestIds,
      hasBlueprint: blueprintRewards.length > 0,
      blueprintRewards,
      description: text?.description ?? '',
      objectives: leafObjectives(q.objective)
        .map((n) => objectiveText[n.key])
        .filter((v): v is string => !!v),
      objectivesOneRound: !!q.objective.oneRound,
      otherRequirements: [],
      grantedItems: fromRewards(q.rewards?.accept),
      requiredItems,
      rewardItems: fromRewards(q.rewards?.complete),
      addedIn: q.addedIn ?? null,
      ...(q.rewards?.xp !== undefined && { xp: q.rewards.xp }),
    });
  }

  return { definitions, fullQuests };
}
