import * as fs from 'fs';
import * as path from 'path';
import type {
  Amount,
  WhatsNewBenchRef,
  WhatsNewChanges,
  WhatsNewExistingItem,
  WhatsNewFieldRecipe,
  WhatsNewItemGroup,
  WhatsNewKeepPath,
  WhatsNewNewItem,
  WhatsNewRef,
  WhatsNewSystem,
  WhatsNewTradeLine,
  WhatsNewTraderChange,
  WhatsNewUse,
  WhatsNewVerdict,
  WhatsNewVersion,
} from '../../../src/shared/gamedata/types';
import type { GenContext } from '../context';
import type { DomainModule } from './types';

/**
 * Domain 'whats-new': the diff between two game versions, from arc-data/whats-new/<version>.json
 * (written by embark-api scripts/build-whats-new.js, verdict overlay already applied). Keyed by
 * version slug. Asset ids become slugs; references without a slug are dropped and reported under
 * `whatsNew:*` (the file stays locale independent: names come from the items text).
 */

interface RawAmount {
  id: number;
  amount: number;
}
interface RawUse {
  system: WhatsNewSystem;
  target: number;
  amount: number;
  via?: number;
}
interface RawTradeLine {
  result: number;
  cost?: RawAmount[];
  scrapValue?: number;
  scrapItems?: (number | { id: number })[];
}
export interface RawWhatsNew {
  gameVersion: string;
  slug: string;
  baseline: { label: string };
  summary: WhatsNewVersion['summary'];
  newItems?: { id: number; group: WhatsNewItemGroup; verdict: WhatsNewVerdict; keepCount?: number | null; uses?: RawUse[]; recyclesInto?: RawAmount[] }[];
  existingItems?: { id: number; gained?: RawUse[]; lost?: RawUse[] }[];
  keepPaths?: { id: string; steps: { label: string; cost: RawAmount[] }[] }[];
  blueprints?: { newlyResearchable?: number[]; findOnly?: number[] };
  designs?: { newlyResearchable?: number[]; findOnly?: number[] };
  fieldCrafting?: {
    skillsBefore?: number[];
    skillsAfter?: number[];
    recipes?: { result: number; cost: RawAmount[]; costBefore?: RawAmount[]; skills?: number[]; skillsBefore?: number[]; status: WhatsNewFieldRecipe['status'] }[];
  };
  changes?: {
    recipes?: { result: number; bench: number; before?: RawAmount[]; after?: RawAmount[] }[];
    upgrades?: { from: number; to: number; before?: RawAmount[]; after?: RawAmount[] }[];
    repairs?: { id: number; before?: RawAmount[]; after?: RawAmount[] }[];
    recycling?: { id: number; before?: RawAmount[]; after?: RawAmount[] }[];
    traders?: { npc: number; added?: RawTradeLine[]; removed?: RawTradeLine[]; priceChanged?: { result: number; before?: RawAmount[]; after?: RawAmount[] }[] }[];
    stash?: { from: number; to: number; before?: RawAmount[] | null; after?: RawAmount[] | null }[];
  };
}

const DROP_USES = 'whatsNew:droppedUses';
const DROP_REFS = 'whatsNew:droppedRefs';

function slotsOf(ctx: GenContext, id: number): number | null {
  const slots = ctx.arc.items.get(id)?.slots as { numberOfSlots?: number } | undefined;
  return slots?.numberOfSlots ?? null;
}

/** Resolves one asset id by the kind of record it is; null (and reported) when it has no slug. */
function resolveRef(ctx: GenContext, id: number, system: string, where: string): WhatsNewRef | null {
  const item = ctx.arc.items.get(id);
  const fail = (): null => {
    ctx.report.add(DROP_REFS, `${id}${item ? ` ${item.type} ${item.internalName ?? ''}`.trimEnd() : ''} (${where})`);
    return null;
  };
  if (system === 'quest') return ctx.slugs.slugOf('quests', id) ?? fail();
  if (system === 'project') return ctx.slugs.slugOf('projects', id) ?? fail();
  const shipped = ctx.shippedItems.get(id);
  if (shipped) return shipped;
  switch (item?.type) {
    case 'Generator': {
      const ref = ctx.benchLevel(id);
      return ref?.benchId ? { bench: ref.benchId, level: ref.level } : fail();
    }
    case 'NPC':
      return ctx.slugs.slugOf('traders', id) ?? fail();
    case 'InventoryStructure': {
      const n = slotsOf(ctx, id);
      return n != null ? { stashSlots: n } : fail();
    }
    case 'CharacterSkill':
      return ctx.slugs.slugOf('skills', id) ?? fail();
    default:
      return fail();
  }
}

function itemSlug(ctx: GenContext, id: number, where: string): string | null {
  const slug = ctx.shippedItems.get(id);
  if (!slug) ctx.report.add(DROP_REFS, `${id} ${ctx.arc.items.get(id)?.type ?? '?'} (${where})`);
  return slug ?? null;
}

function amounts(ctx: GenContext, list: RawAmount[] | null | undefined, where: string): Amount[] {
  const out: Amount[] = [];
  for (const a of list ?? []) {
    const itemId = itemSlug(ctx, a.id, where);
    if (itemId) out.push({ itemId, quantity: a.amount });
  }
  return out;
}

function slugList(ctx: GenContext, ids: number[] | undefined, where: string): string[] {
  return (ids ?? []).map((id) => itemSlug(ctx, id, where)).filter((s): s is string => !!s);
}

function skillList(ctx: GenContext, ids: number[] | undefined, where: string): string[] {
  const out: string[] = [];
  for (const id of ids ?? []) {
    const slug = ctx.slugs.slugOf('skills', id);
    if (slug) out.push(slug);
    else ctx.report.add(DROP_REFS, `${id} skill (${where})`);
  }
  return out;
}

/** `via` is optional context (unlock items without a slug): dropped alone, the use stays. */
function uses(ctx: GenContext, list: RawUse[] | undefined, where: string): WhatsNewUse[] {
  const out: WhatsNewUse[] = [];
  for (const u of list ?? []) {
    const target = resolveRef(ctx, u.target, u.system, `${where} ${u.system} target`);
    if (target == null) {
      ctx.report.add(DROP_USES, `${u.system} ${u.target} (${where})`);
      continue;
    }
    const use: WhatsNewUse = { system: u.system, target, amount: u.amount };
    if (u.via != null) {
      const via = resolveRef(ctx, u.via, u.system, `${where} ${u.system} via`);
      if (via != null) use.via = via;
    }
    out.push(use);
  }
  return out;
}

function benchRef(ctx: GenContext, id: number, where: string): WhatsNewBenchRef | null {
  const ref = ctx.benchLevel(id);
  if (ref?.benchId) return { bench: ref.benchId, level: ref.level };
  ctx.report.add(DROP_REFS, `${id} bench (${where})`);
  return null;
}

function tradeLine(ctx: GenContext, l: RawTradeLine, where: string): WhatsNewTradeLine | null {
  const result = itemSlug(ctx, l.result, where);
  if (!result) return null;
  const scrapItems = slugList(ctx, (l.scrapItems ?? []).map((s) => (typeof s === 'number' ? s : s.id)), where);
  return {
    result,
    cost: amounts(ctx, l.cost, where),
    scrapValue: l.scrapValue ?? undefined,
    scrapItems,
  };
}

function changes(ctx: GenContext, c: NonNullable<RawWhatsNew['changes']>): WhatsNewChanges {
  const out: WhatsNewChanges = {};
  out.recipes = [];
  for (const r of c.recipes ?? []) {
    const result = itemSlug(ctx, r.result, 'changes.recipes');
    const bench = benchRef(ctx, r.bench, 'changes.recipes');
    if (result && bench) out.recipes.push({ result, bench, before: amounts(ctx, r.before, 'changes.recipes'), after: amounts(ctx, r.after, 'changes.recipes') });
  }
  out.upgrades = [];
  for (const r of c.upgrades ?? []) {
    const from = itemSlug(ctx, r.from, 'changes.upgrades');
    const to = itemSlug(ctx, r.to, 'changes.upgrades');
    if (from && to) out.upgrades.push({ from, to, before: amounts(ctx, r.before, 'changes.upgrades'), after: amounts(ctx, r.after, 'changes.upgrades') });
  }
  out.repairs = [];
  for (const r of c.repairs ?? []) {
    const id = itemSlug(ctx, r.id, 'changes.repairs');
    if (id) out.repairs.push({ id, before: amounts(ctx, r.before, 'changes.repairs'), after: amounts(ctx, r.after, 'changes.repairs') });
  }
  out.recycling = [];
  for (const r of c.recycling ?? []) {
    const id = itemSlug(ctx, r.id, 'changes.recycling');
    if (id) out.recycling.push({ id, before: amounts(ctx, r.before, 'changes.recycling'), after: amounts(ctx, r.after, 'changes.recycling') });
  }
  out.traders = [];
  for (const t of c.traders ?? []) {
    const npc = ctx.slugs.slugOf('traders', t.npc);
    if (!npc) {
      ctx.report.add(DROP_REFS, `${t.npc} trader (changes.traders)`);
      continue;
    }
    const where = `changes.traders ${npc}`;
    const row: WhatsNewTraderChange = { npc };
    row.added = (t.added ?? []).map((l) => tradeLine(ctx, l, where)).filter((l): l is WhatsNewTradeLine => !!l);
    row.removed = (t.removed ?? []).map((l) => tradeLine(ctx, l, where)).filter((l): l is WhatsNewTradeLine => !!l);
    row.priceChanged = [];
    for (const p of t.priceChanged ?? []) {
      const result = itemSlug(ctx, p.result, where);
      if (result) row.priceChanged.push({ result, before: amounts(ctx, p.before, where), after: amounts(ctx, p.after, where) });
    }
    out.traders.push(row);
  }
  out.stash = [];
  for (const s of c.stash ?? []) {
    const from = slotsOf(ctx, s.from);
    const to = slotsOf(ctx, s.to);
    if (from == null || to == null) {
      ctx.report.add(DROP_REFS, `${s.from}->${s.to} stash (changes.stash)`);
      continue;
    }
    out.stash.push({ from, to, before: amounts(ctx, s.before, 'changes.stash'), after: amounts(ctx, s.after, 'changes.stash') });
  }
  return out;
}

/** Builds one version from its raw file (exported for tests). */
export function buildWhatsNewVersion(ctx: GenContext, raw: RawWhatsNew): WhatsNewVersion {
  const newItems: WhatsNewNewItem[] = [];
  for (const n of raw.newItems ?? []) {
    const id = itemSlug(ctx, n.id, 'newItems');
    if (!id) continue;
    newItems.push({
      id,
      group: n.group,
      verdict: n.verdict,
      keepCount: n.keepCount ?? undefined,
      uses: uses(ctx, n.uses, `newItems ${id}`),
      recyclesInto: amounts(ctx, n.recyclesInto, `newItems ${id}`),
    });
  }
  const existingItems: WhatsNewExistingItem[] = [];
  for (const e of raw.existingItems ?? []) {
    const id = itemSlug(ctx, e.id, 'existingItems');
    if (!id) continue;
    const gained = uses(ctx, e.gained, `existingItems ${id}`);
    const lost = uses(ctx, e.lost, `existingItems ${id}`);
    if (gained.length || lost.length) existingItems.push({ id, gained, lost });
  }
  const keepPaths: WhatsNewKeepPath[] = (raw.keepPaths ?? []).map((p) => ({
    id: p.id,
    steps: p.steps.map((s) => ({ label: s.label, cost: amounts(ctx, s.cost, `keepPaths ${p.id}`) })),
  }));
  const fc = raw.fieldCrafting;
  const fieldRecipes: WhatsNewFieldRecipe[] = [];
  for (const r of fc?.recipes ?? []) {
    const result = itemSlug(ctx, r.result, 'fieldCrafting');
    if (!result) continue;
    fieldRecipes.push({
      result,
      cost: amounts(ctx, r.cost, 'fieldCrafting'),
      costBefore: amounts(ctx, r.costBefore, 'fieldCrafting'),
      skills: skillList(ctx, r.skills, 'fieldCrafting'),
      skillsBefore: skillList(ctx, r.skillsBefore, 'fieldCrafting'),
      status: r.status,
    });
  }
  const lists = (l?: { newlyResearchable?: number[]; findOnly?: number[] }, where = '') => ({
    newlyResearchable: slugList(ctx, l?.newlyResearchable, where),
    findOnly: slugList(ctx, l?.findOnly, where),
  });
  return {
    slug: raw.slug,
    gameVersion: raw.gameVersion,
    baselineLabel: raw.baseline.label,
    summary: raw.summary,
    newItems,
    existingItems,
    keepPaths,
    blueprints: lists(raw.blueprints, 'blueprints'),
    designs: lists(raw.designs, 'designs'),
    fieldCrafting: {
      skillsBefore: skillList(ctx, fc?.skillsBefore, 'fieldCrafting'),
      skillsAfter: skillList(ctx, fc?.skillsAfter, 'fieldCrafting'),
      recipes: fieldRecipes,
    },
    changes: raw.changes ? changes(ctx, raw.changes) : undefined,
  };
}

const module: DomainModule = {
  domain: 'whats-new',
  build(ctx) {
    const dir = path.join(ctx.arc.dir, 'whats-new');
    const versions: Record<string, WhatsNewVersion> = {};
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir).sort()) {
        if (!f.endsWith('.json')) continue;
        const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as RawWhatsNew;
        versions[raw.slug] = buildWhatsNewVersion(ctx, raw);
      }
    }
    return { versions };
  },
};

export default module;
