/**
 * Generator context shared by all domain modules (scripts/gamedata/domains/*).
 *
 * Rules every module follows:
 * - Public output contains slugs only. Convert every asset reference through the helpers here;
 *   references that do not resolve are dropped and reported (never emit an asset id).
 * - Items must be built first: `ctx.shippedItems` decides which items exist on the site.
 * - Text goes through `ctx.text.add(domain, slug, field, localization)`.
 */
import type {
  Amount,
  Cost,
  GameDomain,
  Requirement,
  Reward,
} from '../../src/shared/gamedata/types';
import type { ArcData, CanonAmount, CanonCost, CanonItem, CanonOffer, CanonRecord, CanonRewardPackage } from './arcData';
import type { SlugKind, SlugStore } from './slugs';
import { TextCollector } from './text';

/** Canonical item types that are cosmetics (never shipped as site items). */
const COSMETIC_TYPES = new Set(['CharacterItem', 'Emote', 'CharacterExpressionStructure', 'MusicTrack']);

/** Internal unlock flags (rewards that only flip a state; meaning comes from ctx.requirement). */
const UNLOCK_TYPES = new Set(['OnlineItem', 'LevelUnlock']);

export class Report {
  readonly sections = new Map<string, string[]>();
  add(section: string, message: string): void {
    const list = this.sections.get(section) ?? [];
    list.push(message);
    this.sections.set(section, list);
  }
  count(section: string): number {
    return this.sections.get(section)?.length ?? 0;
  }
  print(log: (s: string) => void = console.log, limit = 15): void {
    for (const [section, list] of [...this.sections].sort()) {
      const unique = [...new Set(list)];
      log(`${section}: ${unique.length}`);
      for (const m of unique.slice(0, limit)) log(`  ${m}`);
      if (unique.length > limit) log(`  … ${unique.length - limit} more`);
    }
  }
}

export interface BenchLevelRef {
  benchKey: string; // slug-table key (chain base asset id)
  benchId: string | null; // slug
  level: number;
}

export interface GenContext {
  arc: ArcData;
  slugs: SlugStore;
  text: TextCollector;
  report: Report;
  /** Structure results of domains built so far (crossref pass reads them). */
  results: Partial<Record<GameDomain, Record<string, unknown>>>;
  /** Shipped items: asset id → slug. Filled by the items module. */
  shippedItems: Map<number, string>;
  /** Slug for any canonical record (creates one from its English name when missing). */
  slugFor(kind: SlugKind, key: string | number, rec?: CanonRecord | null): string | null;
  /** Slug of a shipped item; null (and reported under `context`) otherwise. */
  itemRef(assetId: number, context?: string): string | null;
  amounts(list: CanonAmount[] | null | undefined, context?: string): Amount[];
  rewards(pkg: CanonRewardPackage | null | undefined, context?: string): Reward[];
  cost(cost: CanonCost | null | undefined, context?: string): Cost;
  /** Turns a gate item (requiredItems / upgrade requirements) into a Requirement. */
  requirement(gate: CanonAmount, context?: string): Requirement | null;
  requirements(gates: CanonAmount[] | null | undefined, context?: string): Requirement[];
  /** Bench level of a Generator item (bench level asset id). */
  benchLevel(generatorAssetId: number): BenchLevelRef | null;
  /** Offers whose reward contains the asset id. */
  offersRewarding(assetId: number): CanonOffer[];
}

export function createContext(arc: ArcData, slugs: SlugStore): GenContext {
  const report = new Report();
  const text = new TextCollector();
  const shippedItems = new Map<number, string>();

  // --- indexes -------------------------------------------------------------------------------
  const rewardIndex = new Map<number, CanonOffer[]>();
  for (const offer of arc.offers.values()) {
    for (const r of offer.rewards.items) {
      const list = rewardIndex.get(r.id) ?? [];
      list.push(offer);
      rewardIndex.set(r.id, list);
    }
  }

  // Bench chains: Generator items grouped by chain base, ordered by following `next`.
  const benchLevels = new Map<number, BenchLevelRef>();
  const generators = [...arc.items.values()].filter((i) => i.type === 'Generator');
  const byBase = new Map<number, CanonItem[]>();
  for (const g of generators) {
    const base = g.baseId || g.id;
    byBase.set(base, [...(byBase.get(base) ?? []), g]);
  }
  for (const [base, members] of byBase) {
    const ids = new Set(members.map((m) => m.id));
    const nextOf = new Map(members.map((m) => [m.id, m.upgrades.find((u) => ids.has(u.next))?.next]));
    const pointedTo = new Set([...nextOf.values()].filter((v): v is number => v != null));
    const start = members.find((m) => m.id === base) ?? members.find((m) => !pointedTo.has(m.id)) ?? members[0];
    const benchKey = String(base);
    let level = 1;
    const seen = new Set<number>();
    for (let cur: number | undefined = start.id; cur != null && !seen.has(cur); cur = nextOf.get(cur)) {
      seen.add(cur);
      benchLevels.set(cur, { benchKey, benchId: null, level: level++ });
    }
  }

  // Gate sources: level groups, quest rewards, blueprint learning offers.
  const levelGroupGate = new Map<number, { group: number; level: number }>();
  for (const g of arc.file('level-groups').values()) {
    for (const lvl of (g.levels as { level: number; reward: CanonRewardPackage }[]) ?? []) {
      for (const r of lvl.reward?.items ?? []) levelGroupGate.set(r.id, { group: Number(g.id), level: lvl.level });
    }
  }
  const questGate = new Map<number, string>();
  for (const [key, q] of arc.file('quests')) {
    const rewards = (q.rewards as Record<string, CanonRewardPackage>) ?? {};
    for (const pkg of Object.values(rewards)) for (const r of pkg?.items ?? []) questGate.set(r.id, key);
  }
  const OUTPOST_ROOMS_GROUP = 807616292;
  const { blueprintLearning, furnitureDesigns, stencils: stencilOwner } = arc.constants.owners;
  const learningOwners = new Set([blueprintLearning, furnitureDesigns, stencilOwner]);

  const ctx: GenContext = {
    arc,
    slugs,
    text,
    report,
    results: {},
    shippedItems,

    slugFor(kind, key, rec) {
      const name = rec?.name?.en || null;
      const slug = slugs.getOrCreate(kind, String(key), { name, internalName: rec?.internalName ?? null });
      if (!slug) report.add(`noSlug:${kind}`, `${key}${rec?.internalName ? ` (${rec.internalName})` : ''}`);
      return slug;
    },

    itemRef(assetId, context) {
      const slug = shippedItems.get(assetId);
      if (!slug) {
        // Cosmetics never ship (docs/Game-Data.md); everything else dropped is worth a look.
        const t = arc.items.get(assetId)?.type ?? '';
        const section = COSMETIC_TYPES.has(t) ? 'droppedCosmeticRefs' : UNLOCK_TYPES.has(t) ? 'droppedUnlockRefs' : 'droppedItemRefs';
        report.add(section, `${assetId}${t ? ` ${t}` : ''}${context ? ` in ${context}` : ''}`);
      }
      return slug ?? null;
    },

    amounts(list, context) {
      const out: Amount[] = [];
      for (const a of list ?? []) {
        const itemId = ctx.itemRef(a.id, context);
        if (itemId) out.push({ itemId, quantity: a.amount });
      }
      return out;
    },

    rewards(pkg, context) {
      const out: Reward[] = ctx.amounts(pkg?.items, context);
      for (const pool of pkg?.random?.pools ?? []) {
        const total = pool.items.reduce((s, i) => s + i.weight, 0) || 1;
        for (const i of pool.items) {
          const itemId = ctx.itemRef(i.id, context);
          if (itemId) out.push({ itemId, quantity: i.amount, chance: Math.round((i.weight / total) * 10000) / 10000 });
        }
      }
      return out;
    },

    cost(c, context) {
      if (!c) return { items: [] };
      if (c.type === 'itemScrapValue') {
        const sc = c as { itemIds: number[]; itemTags: string[]; value: number };
        const itemIds = sc.itemIds.map((id) => ctx.itemRef(id, context)).filter((s): s is string => !!s);
        return { scrapValue: sc.value, ...(itemIds.length ? { itemIds } : {}), ...(sc.itemTags.length ? { tags: sc.itemTags } : {}) };
      }
      if (c.type !== 'itemAmounts') report.add('unknownCostType', `${c.type}${context ? ` in ${context}` : ''}`);
      return { items: ctx.amounts((c as { items?: CanonAmount[] }).items, context) };
    },

    requirement(gate, context) {
      const bench = ctx.benchLevel(gate.id);
      if (bench?.benchId) return { kind: 'bench', id: bench.benchId, level: bench.level };
      const lg = levelGroupGate.get(gate.id);
      if (lg?.group === OUTPOST_ROOMS_GROUP) return { kind: 'outpostLevel', id: String(lg.level) };
      const questKey = questGate.get(gate.id);
      if (questKey) {
        const questId = slugs.slugOf('quests', questKey) ?? ctx.slugFor('quests', questKey, arc.file('quests').get(questKey));
        if (questId) return { kind: 'quest', id: questId };
      }
      // Unlocks learned by consuming an item (blueprints, furniture designs, stencil designs):
      // the requirement is the consumed item.
      const learn = rewardIndex.get(gate.id)?.find((o) => o.type === 'Chamber' && learningOwners.has(o.owner));
      if (learn) {
        const bp = learn.cost.type === 'itemAmounts' ? (learn.cost as { items: CanonAmount[] }).items[0] : undefined;
        const bpSlug = bp ? shippedItems.get(bp.id) : undefined;
        if (bpSlug) return { kind: 'unlock', id: bpSlug };
      }
      const gateItem = arc.items.get(gate.id);
      if (gateItem?.type === 'CharacterSkill') {
        const skillId = ctx.slugFor('skills', gate.id, gateItem);
        if (skillId) return { kind: 'skill', id: skillId };
      }
      const itemSlug = shippedItems.get(gate.id);
      if (itemSlug) return { kind: 'item', id: itemSlug, amount: gate.amount };
      if (lg) return { kind: 'unlock', id: `levelGroup:${lg.group}:${lg.level}` };
      if (gateItem && !gateItem.name?.en) {
        // Known asset without a name yet (game files lag behind the API): not a data error.
        report.add('requirementsPendingNames', `${gate.id} ${gateItem.type}${context ? ` in ${context}` : ''}`);
        return null;
      }
      report.add('unresolvedRequirements', `${gate.id}${context ? ` in ${context}` : ''}`);
      return null;
    },

    requirements(gates, context) {
      return (gates ?? []).map((g) => ctx.requirement(g, context)).filter((r): r is Requirement => !!r);
    },

    benchLevel(id) {
      const ref = benchLevels.get(id);
      if (!ref) return null;
      if (ref.benchId === null) {
        const base = arc.items.get(Number(ref.benchKey));
        ref.benchId = slugs.slugOf('benches', ref.benchKey) ?? ctx.slugFor('benches', ref.benchKey, base ?? null);
      }
      return ref;
    },

    offersRewarding(assetId) {
      return rewardIndex.get(assetId) ?? [];
    },
  };
  return ctx;
}
