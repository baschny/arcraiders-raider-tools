import type { AppLocale } from '../../../shared/i18n/config';
import type { CatalogItem, ItemCatalog } from '../../../shared/gamedata/catalog';
import type {
  LoadedDomain,
  ObjectiveNode,
  Quest as QuestRecord,
  QuestCategory,
  Reward,
} from '../../../shared/gamedata/types';
import type {
  BlueprintReward,
  ObjectiveView,
  Quest,
  QuestItemEntry,
  QuestItemRarity,
} from '../types/quest';
import { questLabel } from './labels';

/** Categories shown in the quest graph. research/daily/weekly/project/mastery are hidden. */
export const VISIBLE_QUEST_CATEGORIES: ReadonlySet<QuestCategory> = new Set<QuestCategory>([
  'main',
  'side',
]);

/** Trader value of the synthetic map prerequisite nodes. */
export const MAP_TRADER = 'Map';

/**
 * Id of the map prerequisite node for a map slug. Matches the ids of the old synthetic nodes
 * (`map_dam_battleground`, `map_blue_gate`, `map_stella_montis`) so saved progress keeps working.
 */
export function mapNodeId(mapId: string): string {
  return `map_${mapId.replaceAll('-', '_')}`;
}

export interface BuildQuestsInput {
  quests: LoadedDomain<'quests'>;
  maps: LoadedDomain<'maps'>;
  catalog: ItemCatalog;
  /** Trader slug → English name. */
  traderNames: Record<string, string>;
  locale: AppLocale;
}

function toEntry(reward: Reward, catalog: ItemCatalog): QuestItemEntry {
  const item: CatalogItem | undefined = catalog.items[reward.itemId];
  return {
    id: reward.itemId,
    quantity: reward.quantity,
    name: item?.name ?? reward.itemId,
    rarity: (item?.rarity ?? 'Common') as QuestItemRarity,
    imageFilename: item?.icon ?? '',
    ...(reward.chance !== undefined ? { chance: reward.chance } : {}),
  };
}

function isBlueprint(item: CatalogItem | undefined): boolean {
  return !!item && (item.category === 'Recipe' || !!item.item.blueprintFor);
}

/** Visible objective tree (hidden nodes removed) with the localized texts. */
export function buildObjectiveTree(
  root: ObjectiveNode,
  texts: Record<string, string> | undefined,
): { tree: ObjectiveView | null; leafTexts: string[] } {
  const leafTexts: string[] = [];
  let leafCounter = 0;

  const walk = (node: ObjectiveNode): ObjectiveView | null => {
    if (node.hidden) return null;
    const text = texts?.[node.key] || undefined;
    const children = (node.children ?? []).map(walk).filter((c): c is ObjectiveView => !!c);
    const view: ObjectiveView = {
      key: node.key,
      kind: node.kind,
      oneRound: !!node.oneRound,
      optional: !!node.optional,
      children,
    };
    if (text) view.text = text;
    if (node.kind === 'nOf') view.requiredCount = node.requiredCount;
    if (node.kind === 'atomic') {
      view.leafIndex = leafCounter++;
      if (text) leafTexts.push(text);
    } else if (children.length === 0 && !text) {
      return null;
    }
    return view;
  };

  return { tree: walk(root), leafTexts };
}

function collectDeliveries(node: ObjectiveNode, out: Map<string, number>): void {
  if (node.hidden) return;
  if (node.kind === 'atomic' && node.action?.type === 'Deliver' && node.action.itemId) {
    out.set(node.action.itemId, (out.get(node.action.itemId) ?? 0) + node.action.amount);
  }
  node.children?.forEach((child) => collectDeliveries(child, out));
}

export function buildQuests({ quests, maps, catalog, traderNames, locale }: BuildQuestsInput): Quest[] {
  const records = Object.values(quests.structure.quests).filter(
    (q: QuestRecord) => VISIBLE_QUEST_CATEGORIES.has(q.category) && !q.hidden,
  );
  const shown = new Set(records.map((q) => q.id));
  const mapName = (mapId: string): string => {
    const text = maps.text[mapId]?.name;
    return (typeof text === 'string' && text) || maps.structure.maps[mapId]?.nameEn || mapId;
  };

  const result: Quest[] = [];
  const mapNodes = new Map<string, Quest>();

  for (const record of records) {
    const text = quests.text[record.id];
    const objectiveTexts = (text?.objectives ?? undefined) as Record<string, string> | undefined;
    const { tree, leafTexts } = buildObjectiveTree(record.objective, objectiveTexts);

    const previousQuestIds: string[] = [];
    const otherRequirements: string[] = [];
    for (const req of record.requires ?? []) {
      if (req.questId && shown.has(req.questId)) previousQuestIds.push(req.questId);
      if (req.mapId) {
        const id = mapNodeId(req.mapId);
        previousQuestIds.push(id);
        let node = mapNodes.get(id);
        if (!node) {
          node = createMapNode(id, req.mapId, mapName(req.mapId));
          mapNodes.set(id, node);
        }
        node.nextQuestIds.push(record.id);
      }
      if (req.raids) otherRequirements.push(questLabel('raids', locale, { count: req.raids }));
    }

    const deliveries = new Map<string, number>();
    collectDeliveries(record.objective, deliveries);

    const blueprintRewards: BlueprintReward[] = [];
    for (const reward of record.rewards?.complete ?? []) {
      const item = catalog.items[reward.itemId];
      if (isBlueprint(item) && !blueprintRewards.some((b) => b.id === reward.itemId)) {
        blueprintRewards.push({ id: reward.itemId, name: item.name, imageFilename: item.icon });
      }
    }

    const nameEn = record.nameEn;
    result.push({
      id: record.id,
      name: (typeof text?.name === 'string' && text.name) || nameEn,
      originalNameEn: nameEn,
      category: record.category,
      trader: (record.traderId && (traderNames[record.traderId] ?? record.traderId)) || '',
      map: record.mapIds ?? [],
      previousQuestIds,
      nextQuestIds: (record.next ?? []).filter((id) => shown.has(id)),
      hasBlueprint: blueprintRewards.length > 0,
      blueprintRewards,
      description: typeof text?.description === 'string' ? text.description : '',
      objectiveTree: tree,
      objectives: leafTexts,
      objectivesOneRound: !!tree?.oneRound,
      otherRequirements,
      grantedItems: (record.rewards?.accept ?? []).map((r) => toEntry(r, catalog)),
      requiredItems: Array.from(deliveries, ([itemId, quantity]) =>
        toEntry({ itemId, quantity }, catalog),
      ),
      rewardItems: (record.rewards?.complete ?? []).map((r) => toEntry(r, catalog)),
      optionalRewardItems: (record.rewards?.optionals ?? []).map((r) => toEntry(r, catalog)),
      addedIn: record.addedIn ?? null,
      xp: record.rewards?.xp,
    });
  }

  // Flag quests introduced in the newest game version found in the data
  const newestVersion = result
    .map((quest) => quest.addedIn)
    .filter((version): version is string => Boolean(version))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .at(-1);
  for (const quest of result) {
    quest.isNew = Boolean(newestVersion) && quest.addedIn === newestVersion;
  }

  return [...mapNodes.values(), ...result];
}

function createMapNode(id: string, mapId: string, name: string): Quest {
  return {
    id,
    name,
    category: 'map',
    trader: MAP_TRADER,
    map: [mapId],
    previousQuestIds: [],
    nextQuestIds: [],
    hasBlueprint: false,
    blueprintRewards: [],
    description: '',
    objectiveTree: null,
    objectives: [],
    objectivesOneRound: false,
    otherRequirements: [],
    grantedItems: [],
    requiredItems: [],
    rewardItems: [],
    optionalRewardItems: [],
  };
}
