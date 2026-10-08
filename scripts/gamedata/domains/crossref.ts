import type { Amount, Cost, Item, ObjectiveNode, Quest, Reward } from '../../../src/shared/gamedata/types';
import type { GenContext } from '../context';

type Bucket = 'recipes' | 'research' | 'benches' | 'projects' | 'quests' | 'trades' | 'outpost';

const costItems = (c: Cost | undefined): string[] => (c && 'items' in c ? c.items.map((a: Amount) => a.itemId) : (c?.itemIds ?? []));
const rewardItems = (r: Reward[] | undefined): string[] => (r ?? []).map((x) => x.itemId);

/**
 * Cross-domain pass after all domains are built (docs/Game-Data.md principle 4): fills the precomputed
 * reverse lookups on items — craftedBy, researchedBy, usedIn, soldBy, recycledFrom, rewardedBy,
 * blueprintFor/blueprintId — from ctx.results. Each list is sorted and deduplicated.
 */
export function crossref(ctx: GenContext): void {
  const items = (ctx.results.items?.items ?? {}) as Record<string, Item>;
  const add = (itemId: string, field: 'craftedBy' | 'researchedBy' | 'soldBy' | 'recycledFrom', ref: string) => {
    const it = items[itemId];
    if (it) it[field] = [...new Set([...(it[field] ?? []), ref])].sort();
  };
  const used = (itemId: string, bucket: Bucket, ref: string) => {
    const it = items[itemId];
    if (!it) return;
    const u = (it.usedIn ??= {});
    u[bucket] = [...new Set([...(u[bucket] ?? []), ref])].sort();
  };
  const rewarded = (itemId: string, bucket: 'quests' | 'projects', ref: string) => {
    const it = items[itemId];
    if (!it) return;
    const r = (it.rewardedBy ??= {});
    r[bucket] = [...new Set([...(r[bucket] ?? []), ref])].sort();
  };

  type O = { id: string; cost: Cost; rewards?: Reward[] };
  for (const r of Object.values((ctx.results.recipes?.recipes ?? {}) as Record<string, O>)) {
    for (const i of rewardItems(r.rewards)) add(i, 'craftedBy', r.id);
    for (const i of costItems(r.cost)) used(i, 'recipes', r.id);
  }
  for (const r of Object.values((ctx.results.research?.research ?? {}) as Record<string, O>)) {
    for (const i of rewardItems(r.rewards)) add(i, 'researchedBy', r.id);
    for (const i of costItems(r.cost)) used(i, 'research', r.id);
  }
  for (const t of Object.values((ctx.results.trades?.trades ?? {}) as Record<string, O>)) {
    for (const i of rewardItems(t.rewards)) add(i, 'soldBy', t.id);
    for (const i of costItems(t.cost)) used(i, 'trades', t.id);
  }
  for (const b of Object.values((ctx.results.blueprints?.blueprints ?? {}) as Record<string, { blueprintItemId: string; unlocksItemId?: string }>)) {
    if (!b.unlocksItemId) continue;
    if (items[b.blueprintItemId]) items[b.blueprintItemId].blueprintFor = b.unlocksItemId;
    if (items[b.unlocksItemId]) items[b.unlocksItemId].blueprintId = b.blueprintItemId;
  }
  for (const b of Object.values((ctx.results.benches?.benches ?? {}) as Record<string, { id: string; levels?: { buildCost?: Amount[] }[] }>)) {
    for (const l of b.levels ?? []) for (const a of l.buildCost ?? []) used(a.itemId, 'benches', b.id);
  }
  for (const f of Object.values((ctx.results.outpost?.furniture ?? {}) as Record<string, { id: string; craft?: { cost: Cost } }>)) {
    for (const i of costItems(f.craft?.cost)) used(i, 'outpost', f.id);
  }
  type P = {
    id: string;
    rewards?: Reward[];
    phases?: { steps?: { rewards?: Reward[]; goals?: { itemIds?: string[]; rewards?: Reward[] }[] }[] }[];
  };
  for (const p of Object.values((ctx.results.projects?.projects ?? {}) as Record<string, P>)) {
    for (const i of rewardItems(p.rewards)) rewarded(i, 'projects', p.id);
    for (const ph of p.phases ?? []) {
      for (const st of ph.steps ?? []) {
        for (const i of rewardItems(st.rewards)) rewarded(i, 'projects', p.id);
        for (const g of st.goals ?? []) {
          for (const i of g.itemIds ?? []) used(i, 'projects', p.id);
          for (const i of rewardItems(g.rewards)) rewarded(i, 'projects', p.id);
        }
      }
    }
  }
  const walk = (n: ObjectiveNode, f: (n: ObjectiveNode) => void) => {
    f(n);
    for (const c of n.children ?? []) walk(c, f);
  };
  for (const q of Object.values((ctx.results.quests?.quests ?? {}) as Record<string, Quest>)) {
    const r = q.rewards ?? {};
    for (const i of [...rewardItems(r.accept), ...rewardItems(r.complete), ...rewardItems(r.optionals)]) rewarded(i, 'quests', q.id);
    walk(q.objective, (n) => {
      if (n.action?.itemId && /^(Deliver|Obtain)/.test(n.action.type)) used(n.action.itemId, 'quests', q.id);
    });
  }
  for (const it of Object.values(items)) for (const r of it.recyclesInto ?? []) add(r.itemId, 'recycledFrom', it.id);
}
