import type { ObjectiveKind, ObjectiveNode, Quest, QuestCategory, QuestRequirement } from '../../../src/shared/gamedata/types';
import type { CanonRecord, CanonRewardPackage, Localization } from '../arcData';
import type { GenContext } from '../context';
import type { DomainModule } from './types';

/** Tracking item of the "Rounds Played" level group (631648175); quests gated by it become `raids`. */
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
    const overlay = arc.json<Record<string, { requiresMaps?: (number | string)[] }>>('overlay/quest.json') ?? {};

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
        }
        const maps = mapSlugs(a.mapIds, ctxName);
        if (maps.length) node.action.mapIds = maps;
      }
      const text = n.name?.en ? n.name : n.description?.en ? n.description : null;
      if (text) ctx.text.add('quests', slug, ['objectives', key], withAmount(text, a?.amount));
      if (n.children?.length) node.children = n.children.map((c, i) => buildNode(c, `${key}.${i}`, slug));
      return node;
    };

    // --- quests ---------------------------------------------------------------------------
    const quests: Record<string, Quest> = {};
    const nextOf = new Map<string, Set<string>>();

    for (const [key, q] of canon) {
      const slug = slugByKey.get(key);
      if (!slug) continue;

      const requires: QuestRequirement[] = [];
      let raids = 0;
      for (const pre of prereqsOf(q)) {
        const r = rounds.get(pre);
        if (r != null) {
          raids = Math.max(raids, r);
          continue;
        }
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
      for (const mapId of mapSlugs(overlay[key]?.requiresMaps, `${slug} requiresMaps`)) requires.push({ mapId });
      if (raids) requires.push({ raids });

      const withoutXp = (pkg: CanonRewardPackage | undefined): CanonRewardPackage => ({
        items: (pkg?.items ?? []).filter((i) => i.id !== xpId),
        random: pkg?.random ?? null,
      });
      const xp = (q.rewards?.complete?.items ?? []).filter((i) => i.id === xpId).reduce((s, i) => s + i.amount, 0);
      const accept = ctx.rewards(withoutXp(q.rewards?.accept), `${slug} accept`);
      const optionals = ctx.rewards(withoutXp(q.rewards?.optionals), `${slug} optionals`);

      const owner = q.owner ? arc.items.get(q.owner) : undefined;
      const traderId = owner && owner.id !== workbench ? ctx.slugFor('traders', owner.id, owner) : null;
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
