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
  QuestUnlockView,
} from '../types/quest';
import { questLabel } from './labels';
import { normalizeObjectiveTree } from './objectiveTree';

/** Categories shown in the quest graph. research/daily/weekly/project/mastery are hidden. */
export const VISIBLE_QUEST_CATEGORIES: ReadonlySet<QuestCategory> = new Set<QuestCategory>([
  'main',
  'side',
]);


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
    rarity: item?.rarity,
    imageFilename: item?.icon ?? '',
    ...(reward.chance !== undefined ? { chance: reward.chance } : {}),
  };
}

function isBlueprint(item: CatalogItem | undefined): boolean {
  return !!item && (item.category === 'Recipe' || !!item.item.blueprintFor);
}

/** Camera every Photo step needs (the quests hand out a Basic Camera). */
const CAMERA_ITEM = 'basic_camera';

export interface ObjectiveResolvers {
  mapName: (mapId: string) => string;
  item: (itemId: string, quantity: number) => QuestItemEntry;
}

/** Items to take into the round, hand in or find for an atomic step. */
function stepItems(node: ObjectiveNode, resolve: ObjectiveResolvers): ObjectiveView['items'] {
  const a = node.action;
  if (!a) return undefined;
  const out: NonNullable<ObjectiveView['items']> = [];
  for (const r of a.interaction?.requiredItems ?? []) {
    out.push({ ...resolve.item(r.itemId, r.quantity), role: r.consumed === false ? 'kept' : 'consumed' });
  }
  if (a.itemId && (a.type === 'Deliver' || a.type === 'Obtain')) {
    out.push({ ...resolve.item(a.itemId, a.amount), role: a.type === 'Deliver' ? 'deliver' : 'obtain' });
  }
  if (a.type === 'Photo') out.push({ ...resolve.item(CAMERA_ITEM, 1), role: 'bring' });
  return out.length ? out : undefined;
}

/**
 * Objective tree with the localized texts, prompts, map names and items, normalized for display
 * (`normalizeObjectiveTree`). Hidden nodes are kept. `leafKeys` lists every atomic leaf in tree
 * order, the order of the linked progress objectives.
 */
export function buildObjectiveTree(
  root: ObjectiveNode,
  texts: Record<string, string> | undefined,
  resolve: ObjectiveResolvers,
  prompts?: Record<string, string>,
): { tree: ObjectiveView | null; leafTexts: string[]; leafKeys: string[] } {
  const leafTexts: string[] = [];
  const leafKeys: string[] = [];

  const walk = (node: ObjectiveNode): ObjectiveView | null => {
    const text = texts?.[node.key] || undefined;
    const children = (node.children ?? []).map(walk).filter((c): c is ObjectiveView => !!c);
    const view: ObjectiveView = {
      key: node.key,
      kind: node.kind,
      oneRound: !!node.oneRound,
      optional: !!node.optional,
      hidden: !!node.hidden,
      children,
    };
    if (text) view.text = text;
    if (node.kind === 'nOf') view.requiredCount = node.requiredCount;
    if (node.kind === 'atomic') {
      leafKeys.push(node.key);
      if (text) leafTexts.push(text);
      const a = node.action;
      if (a) {
        view.actionType = a.type;
        view.amount = a.amount;
        if (a.mapIds?.length) view.mapNames = a.mapIds.map(resolve.mapName);
        if (a.interaction?.holdSeconds) view.holdSeconds = a.interaction.holdSeconds;
      }
      const prompt = prompts?.[node.key];
      if (prompt) view.prompt = prompt;
      const items = stepItems(node, resolve);
      if (items) view.items = items;
      if (!text) return null;
    } else if (children.length === 0) {
      return null;
    }
    return view;
  };

  const tree = walk(root);
  return { tree: tree && normalizeObjectiveTree(tree), leafTexts, leafKeys };
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

  // Hidden unlock quests the shown quests depend on (directly or through other unlocks).
  const unlockIds = new Set<string>();
  const queue = records.flatMap((q) => (q.requires ?? []).map((r) => r.questId));
  while (queue.length) {
    const id = queue.shift()!;
    const record = quests.structure.quests[id];
    if (!record?.unlock || unlockIds.has(id)) continue;
    unlockIds.add(id);
    queue.push(...(record.requires ?? []).map((r) => r.questId));
  }
  const inGraph = (id: string) => shown.has(id) || unlockIds.has(id);

  const resolvers: ObjectiveResolvers = { mapName, item: (itemId, quantity) => toEntry({ itemId, quantity }, catalog) };

  const result: Quest[] = [];

  for (const record of records) {
    const text = quests.text[record.id];
    const objectiveTexts = (text?.objectives ?? undefined) as Record<string, string> | undefined;
    const prompts = (text?.prompts ?? undefined) as Record<string, string> | undefined;
    const { tree, leafTexts, leafKeys } = buildObjectiveTree(record.objective, objectiveTexts, resolvers, prompts);

    const previousQuestIds = (record.requires ?? []).map((r) => r.questId).filter(inGraph);
    const otherRequirements: string[] = [];

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
      nextQuestIds: (record.next ?? []).filter(inGraph),
      hasBlueprint: blueprintRewards.length > 0,
      blueprintRewards,
      description: typeof text?.description === 'string' ? text.description : '',
      objectiveTree: tree,
      objectives: leafTexts,
      objectiveLeafKeys: leafKeys,
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

  const unlocks = [...unlockIds].map((id) =>
    createUnlockNode(quests.structure.quests[id], quests.text[id], inGraph, mapName, locale),
  );
  return [...unlocks, ...result];
}

/** Label of an unlock node, from its kind (the quest's own name is internal). */
function unlockView(
  record: QuestRecord,
  text: LoadedDomain<'quests'>['text'][string] | undefined,
  mapName: (mapId: string) => string,
  locale: AppLocale,
): QuestUnlockView {
  const unlock = record.unlock!;
  const objective = (text?.objectives as Record<string, string> | undefined)?.['0'];
  switch (unlock.kind) {
    case 'rounds':
      return { kind: 'rounds', label: questLabel('unlockRounds', locale, { count: unlock.amount ?? 0 }) };
    case 'level':
      return { kind: 'level', label: questLabel('unlockLevel', locale, { level: unlock.amount ?? 0 }) };
    case 'location': {
      const place = typeof text?.place === 'string' ? text.place : '';
      const maps = (unlock.mapIds ?? []).map(mapName).join(', ');
      return {
        kind: 'location',
        label: place ? questLabel('unlockLocation', locale, { place }) : questLabel('unlockOther', locale),
        ...(maps ? { detail: questLabel('unlockLocationMap', locale, { map: maps }) } : {}),
      };
    }
    case 'damage':
      return { kind: 'damage', label: objective || questLabel('unlockOther', locale) };
    default:
      return { kind: 'other', label: questLabel('unlockOther', locale) };
  }
}

function createUnlockNode(
  record: QuestRecord,
  text: LoadedDomain<'quests'>['text'][string] | undefined,
  inGraph: (id: string) => boolean,
  mapName: (mapId: string) => string,
  locale: AppLocale,
): Quest {
  const unlock = unlockView(record, text, mapName, locale);
  return {
    id: record.id,
    name: unlock.label,
    category: 'unlock',
    unlock,
    trader: '',
    map: record.unlock?.mapIds ?? [],
    previousQuestIds: (record.requires ?? []).map((r) => r.questId).filter(inGraph),
    nextQuestIds: (record.next ?? []).filter(inGraph),
    hasBlueprint: false,
    blueprintRewards: [],
    description: '',
    objectiveTree: null,
    objectives: [],
    objectiveLeafKeys: [],
    objectivesOneRound: false,
    otherRequirements: [],
    grantedItems: [],
    requiredItems: [],
    rewardItems: [],
    optionalRewardItems: [],
  };
}
