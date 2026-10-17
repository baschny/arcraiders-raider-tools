import type { ObjectiveKind, ObjectiveNode, Quest, QuestCategory, QuestRequirement, QuestUnlock } from '../../../src/shared/gamedata/types';
import { LOCALES, type CanonRecord, type CanonRewardPackage, type Localization } from '../arcData';
import type { GenContext } from '../context';
import type { DomainModule } from './types';

/** Tracking item of the "Rounds Played" level group (631648175). */
const ROUNDS_PLAYED_ITEM = -1869396984;

interface CanonAction {
  type: string;
  amount: number;
  mapIds?: (number | string)[];
  params?: Record<string, string>;
}

interface CanonNode {
  kind: string;
  requiredCount?: number;
  oneRound?: boolean;
  optional?: boolean;
  hidden?: boolean;
  name?: Localization | null;
  description?: Localization | null;
  action?: CanonAction | null;
  children?: CanonNode[] | null;
}

interface CanonInteraction {
  prompt?: Localization | null;
  holdSeconds?: number | null;
  requiredItems?: { id: number; amount: number; consumed?: boolean }[] | null;
}

interface CanonQuestTarget extends CanonRecord {
  interactions?: CanonInteraction[] | null;
  /** Named map locations whose volume is the target area. */
  pois?: { mapId: number; poi: string; title: string }[] | null;
  /** Map actors of the target per map. */
  maps?: { mapId: number; count: number }[] | null;
}

interface CanonQuest extends CanonRecord {
  type: string;
  hidden?: boolean;
  owner?: number;
  mapIds?: (number | string)[];
  requires?: { quest: number | string; state?: string }[];
  rewards?: { accept?: CanonRewardPackage; complete?: CanonRewardPackage; optionals?: CanonRewardPackage };
  objective: CanonNode;
}

const KIND: Record<string, ObjectiveKind> = {
  ATOMIC: 'atomic',
  SEQUENCE: 'sequence',
  ALL_OF: 'allOf',
  ANY_OF: 'anyOf',
  ANY_OF_EXCLUSIVE: 'anyOfExclusive',
  N_OF: 'nOf',
};

const CADENCE_CATEGORY: Record<string, QuestCategory> = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  PROJECT: 'project',
  MASTERY: 'mastery',
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function atomics(node: CanonNode): CanonNode[] {
  return node.children?.length ? node.children.flatMap(atomics) : [node];
}

/** Amount of a "Rounds Played" tracker quest (single Obtain objective on the rounds item), else null. */
export function roundsPlayedAmount(q: { objective: CanonNode }): number | null {
  const leaves = atomics(q.objective);
  if (leaves.length !== 1) return null;
  const a = leaves[0].action;
  if (a?.type !== 'Obtain' || Number(a.params?.Item) !== ROUNDS_PLAYED_ITEM) return null;
  return a.amount;
}

function withAmount(text: Localization, amount: number | undefined): Localization {
  if (amount == null) return text;
  const out: Record<string, unknown> = { ...text };
  for (const [k, v] of Object.entries(out)) if (typeof v === 'string' && k !== 'key') out[k] = v.split('{0}').join(String(amount));
  return out as unknown as Localization;
}

const module: DomainModule = {
  domain: 'quests',
  build(ctx: GenContext) {
    const { arc, report } = ctx;
    const canon = arc.file('quests') as unknown as Map<string, CanonQuest>;
    const workbench = arc.constants.owners.workbenchGenerator;
    const xpId = arc.constants.currencies.xp;

    const prereqsOf = (q: CanonQuest): string[] => (q.requires ?? []).map((r) => String(r.quest));
    const rounds = new Map<string, number>();
    for (const [key, q] of canon) {
      const n = roundsPlayedAmount(q);
      if (n != null) rounds.set(key, n);
    }

    // --- category ---------------------------------------------------------------------------
    const narrative = new Map([...canon].filter(([, q]) => q.type === 'NARRATIVE'));
    const sideCache = new Map<string, boolean>();
    const isSide = (key: string): boolean => {
      const cached = sideCache.get(key);
      if (cached != null) return cached;
      sideCache.set(key, false); // cycle guard
      const prereqs = prereqsOf(narrative.get(key)!)
        .filter((id) => narrative.has(id))
        .map((id) => ({ id, q: narrative.get(id)! }));
      const visible = prereqs.filter((p) => !p.q.hidden);
      const triggers = prereqs.filter((p) => p.q.hidden && !rounds.has(p.id));
      const result = visible.length === 0 ? triggers.length > 0 : visible.every((p) => isSide(p.id));
      sideCache.set(key, result);
      return result;
    };
    const categoryOf = (key: string, q: CanonQuest): QuestCategory => {
      if (q.type !== 'NARRATIVE') {
        const c = CADENCE_CATEGORY[q.type];
        if (!c) report.add('quests:unknownType', `${key} ${q.type}`);
        return c ?? 'main';
      }
      if (q.owner === workbench) return 'research';
      return !q.hidden && isSide(key) ? 'side' : 'main';
    };

    // --- slugs ---------------------------------------------------------------------------
    const slugByKey = new Map<string, string>();
    for (const [key, q] of canon) {
      const slug = ctx.slugFor('quests', key, q);
      if (slug) slugByKey.set(key, slug);
    }

    // --- references -----------------------------------------------------------------------
    const mapSlug = (id: number | string, context: string): string | null => {
      const slug = ctx.slugs.slugOf('maps', String(id));
      if (!slug) report.add('quests:unknownMap', `${id} in ${context}`);
      return slug;
    };
    const mapSlugs = (ids: (number | string)[] | undefined, context: string): string[] => {
      const out: string[] = [];
      for (const id of ids ?? []) {
        const s = mapSlug(id, context);
        if (s && !out.includes(s)) out.push(s);
      }
      return out;
    };
    const enemyNames = new Map<string, string>(); // slug → enemy asset id (collision check)
    const targetSlug = (type: string, targetId: string, context: string): string | null => {
      const enemy = arc.file('enemies').get(targetId);
      if (enemy?.name?.en) {
        const slug = slugify(enemy.name.en);
        const prev = enemyNames.get(slug);
        if (prev && prev !== targetId) report.add('quests:enemySlugCollision', `${slug}: ${prev} vs ${targetId}`);
        enemyNames.set(slug, targetId);
        return slug;
      }
      const item = ctx.shippedItems.get(Number(targetId));
      if (item) return item;
      // Interact/Photo targets are world objects (no canonical record); only count them.
      const world = type === 'Interact' || type === 'Photo';
      report.add(world ? 'quests:worldObjectTargets (omitted)' : 'quests:unresolvedTarget', world ? targetId : `${type} target ${targetId} in ${context}`);
      return null;
    };

    // Interact targets: prompt, hold time and item cost of the world object (the cost is not in
    // the objective's amount). Several setups (locked gates with a code each): only what they share.
    const questTargets = arc.file('quest-targets') as unknown as Map<string, CanonQuestTarget>;
    const targetMapIds = (params: Record<string, string> | undefined): number[] => {
      const area = params?.POIVolume ?? params?.POIVolumeFilter;
      const areaMaps = [...new Set((questTargets.get(String(area))?.pois ?? []).map((p) => p.mapId))];
      if (area && areaMaps.length) return areaMaps;
      const objectMaps = [...new Set((questTargets.get(String(params?.Target))?.maps ?? []).map((m) => m.mapId))];
      return objectMaps.length === 1 ? objectMaps : [];
    };
    const interactionOf = (targetId: string): CanonInteraction | null => {
      const list = questTargets.get(targetId)?.interactions ?? [];
      if (!list.length) return null;
      const [first, ...rest] = list;
      const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
      return {
        prompt: rest.every((i) => same(i.prompt?.en, first.prompt?.en)) ? first.prompt : null,
        holdSeconds: rest.every((i) => i.holdSeconds === first.holdSeconds) ? first.holdSeconds : null,
        requiredItems: rest.every((i) => same(i.requiredItems, first.requiredItems)) ? first.requiredItems : null,
      };
    };

    // --- objective tree -------------------------------------------------------------------
    const buildNode = (n: CanonNode, key: string, slug: string): ObjectiveNode => {
      const node: ObjectiveNode = { key, kind: KIND[n.kind] ?? 'allOf' };
      if (!KIND[n.kind]) report.add('quests:unknownObjectiveKind', `${n.kind} in ${slug}`);
      if (n.requiredCount) node.requiredCount = n.requiredCount;
      if (n.oneRound) node.oneRound = true;
      if (n.optional) node.optional = true;
      if (n.hidden) node.hidden = true;
      const a = n.action;
      if (a) {
        const ctxName = `${slug} objective ${key}`;
        node.action = { type: a.type, amount: a.amount };
        const itemParam = a.params?.Item;
        if (itemParam != null) {
          const itemId = ctx.itemRef(Number(itemParam), ctxName);
          if (itemId) node.action.itemId = itemId;
        }
        const target = a.params?.Target;
        if (target != null) {
          const t = targetSlug(a.type, target, ctxName);
          if (t) node.action.targetId = t;
          const interaction = a.type === 'Interact' ? interactionOf(target) : null;
          if (interaction) {
            const out: NonNullable<NonNullable<ObjectiveNode['action']>['interaction']> = {};
            if (interaction.holdSeconds) out.holdSeconds = interaction.holdSeconds;
            const items = (interaction.requiredItems ?? []).flatMap((r) => {
              const itemId = ctx.itemRef(r.id, `${ctxName} interaction`);
              return itemId ? [{ itemId, quantity: r.amount, ...(r.consumed === false ? { consumed: false as const } : {}) }] : [];
            });
            if (items.length) out.requiredItems = items;
            if (Object.keys(out).length) node.action.interaction = out;
            if (interaction.prompt?.en) ctx.text.add('quests', slug, ['prompts', key], interaction.prompt);
          }
        }
        // The game names the map on some steps only; otherwise take it from the step's area (its
        // named locations), or from its world object when that exists on one map only. Generic
        // targets (any container, any enemy) stay without a map.
        const maps = mapSlugs(a.mapIds?.length ? a.mapIds : targetMapIds(a.params), ctxName);
        if (maps.length) node.action.mapIds = maps;
      }
      const text = n.name?.en ? n.name : n.description?.en ? n.description : null;
      if (text) ctx.text.add('quests', slug, ['objectives', key], withAmount(text, a?.amount));
      if (n.children?.length) node.children = n.children.map((c, i) => buildNode(c, `${key}.${i}`, slug));
      return node;
    };

    // --- quests ---------------------------------------------------------------------------
    // --- unlocks ---------------------------------------------------------------------------
    // Hidden quests that other quests require: the game's unlock triggers (rounds played, player
    // level, entering a place, damaging an enemy). Their names are internal; the site builds the
    // label from the kind, plus the localized place name for location unlocks.
    const unlockers = new Set<string>();
    for (const q of canon.values()) for (const pre of prereqsOf(q)) if (canon.get(pre)?.hidden) unlockers.add(pre);
    const levelOfItem = new Map<number, number>();
    for (const g of arc.file('level-groups').values()) {
      if (Number(g.trackingItemId) !== xpId) continue;
      for (const lvl of (g.levels as { level: number; reward?: CanonRewardPackage }[]) ?? []) {
        for (const r of lvl.reward?.items ?? []) levelOfItem.set(r.id, lvl.level);
      }
    }
    const placeName = (volumeId: string): Localization | null => {
      const poi = questTargets.get(volumeId)?.pois?.[0];
      if (!poi) return null;
      const featureId = poi.poi.replace(/^PioneerPointOfInterestVolume_/, 'POI_');
      const titleKey = mapFeaturePoiKeys().get(featureId);
      const out: Record<string, string> = { en: poi.title };
      if (titleKey) {
        for (const locale of LOCALES) {
          const strings = locale === 'en' ? null : arc.json<Record<string, string>>(`derived/map-features/map-strings.${locale}.json`);
          if (strings?.[titleKey]) out[locale] = strings[titleKey];
        }
      }
      return out as unknown as Localization;
    };
    let poiKeys: Map<string, string> | null = null;
    const mapFeaturePoiKeys = (): Map<string, string> => {
      if (poiKeys) return poiKeys;
      poiKeys = new Map();
      const index = arc.json<{ maps: { file: string }[] }>('derived/map-features/index.json');
      for (const m of index?.maps ?? []) {
        const map = arc.json<{ pois?: { titleKey?: string; ids?: string[] }[] }>(`derived/map-features/${m.file}`);
        for (const p of map?.pois ?? []) for (const id of p.ids ?? []) if (p.titleKey) poiKeys.set(id, p.titleKey);
      }
      return poiKeys;
    };
    const unlockOf = (key: string, q: CanonQuest, slug: string): QuestUnlock => {
      const amount = rounds.get(key);
      if (amount != null) return { kind: 'rounds', amount };
      const leaves = atomics(q.objective);
      const a = leaves.length === 1 ? leaves[0].action : null;
      const level = a?.type === 'Obtain' ? levelOfItem.get(Number(a.params?.Item)) : undefined;
      if (level != null) return { kind: 'level', amount: level };
      if (a?.type === 'VisitPOI' && a.params?.POIVolume) {
        const place = placeName(a.params.POIVolume);
        if (place) ctx.text.add('quests', slug, 'place', place);
        else report.add('quests:unlockPlaceWithoutName', `${slug} ${a.params.POIVolume}`);
        const mapIds = mapSlugs(a.mapIds, `${slug} unlock`);
        return { kind: 'location', ...(mapIds.length ? { mapIds } : {}) };
      }
      if (a?.type === 'Damage') return { kind: 'damage' };
      report.add('quests:unlockOther', slug);
      return { kind: 'other' };
    };

    const quests: Record<string, Quest> = {};
    const nextOf = new Map<string, Set<string>>();

    for (const [key, q] of canon) {
      const slug = slugByKey.get(key);
      if (!slug) continue;

      const requires: QuestRequirement[] = [];
      for (const pre of prereqsOf(q)) {
        const preSlug = slugByKey.get(pre);
        if (!preSlug) {
          report.add('quests:droppedPrerequisite', `${pre} of ${slug}`);
          continue;
        }
        if (!requires.some((x) => x.questId === preSlug)) requires.push({ questId: preSlug });
        const set = nextOf.get(preSlug) ?? new Set();
        set.add(slug);
        nextOf.set(preSlug, set);
      }
      const unlock = q.hidden && unlockers.has(key) ? unlockOf(key, q, slug) : null;

      const withoutXp = (pkg: CanonRewardPackage | undefined): CanonRewardPackage => ({
        items: (pkg?.items ?? []).filter((i) => i.id !== xpId),
        random: pkg?.random ?? null,
      });
      const xp = (q.rewards?.complete?.items ?? []).filter((i) => i.id === xpId).reduce((s, i) => s + i.amount, 0);
      const accept = ctx.rewards(withoutXp(q.rewards?.accept), `${slug} accept`);
      const optionals = ctx.rewards(withoutXp(q.rewards?.optionals), `${slug} optionals`);

      const owner = q.owner ? arc.items.get(q.owner) : undefined;
      const traderId = owner && owner.id !== workbench ? String(owner.id) : null;
      const mapIds = mapSlugs(q.mapIds, slug);

      quests[slug] = {
        id: slug,
        nameEn: q.name?.en ?? slug,
        category: categoryOf(key, q),
        ...(traderId ? { traderId } : {}),
        ...(mapIds.length ? { mapIds } : {}),
        requires,
        next: [],
        objective: buildNode(q.objective, '0', slug),
        rewards: {
          ...(accept.length ? { accept } : {}),
          complete: ctx.rewards(withoutXp(q.rewards?.complete), `${slug} complete`),
          ...(optionals.length ? { optionals } : {}),
          ...(xp ? { xp } : {}),
        },
        ...(q.hidden ? { hidden: true } : {}),
        ...(unlock ? { unlock } : {}),
        ...(q.addedIn ? { addedIn: q.addedIn } : {}),
      };
      ctx.text.add('quests', slug, 'name', q.name);
      ctx.text.add('quests', slug, 'description', q.description);
    }

    for (const [slug, set] of nextOf) if (quests[slug]) quests[slug].next = [...set].sort();

    // dangling check (graph must be closed)
    for (const q of Object.values(quests)) {
      for (const r of q.requires ?? []) if (r.questId && !quests[r.questId]) report.add('quests:dangling', `${q.id} -> ${r.questId}`);
    }
    return { quests };
  },
};

export default module;
