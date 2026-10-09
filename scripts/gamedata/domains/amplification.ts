import type {
  Amplification,
  AmplificationBranch,
  AmplificationEffect,
  AmplifiedWeapon,
  Item,
} from '../../../src/shared/gamedata/types';
import type { CanonAmpEffect } from '../arcData';
import type { GenContext } from '../context';
import { ampIconUrl } from '../ampIcons';
import type { DomainModule } from './types';

/** Amplification ids applied by a variant item (`DA_Item_<W>_<A>_<B>`, `…_Ascended` = none); null if not parseable. */
export function appliedAmplifications(internalName: string | null | undefined, weaponKey: string): Set<string> | null {
  const prefix = `DA_Item_${weaponKey}_`;
  if (!internalName?.startsWith(prefix)) return null;
  const rest = internalName.slice(prefix.length);
  return new Set(rest === 'Ascended' ? [] : rest.split('_'));
}

function effectsOf(list: CanonAmpEffect[] | undefined): AmplificationEffect[] {
  return (list ?? []).map((e) => ({ key: e.text.key ?? '', value: e.value, type: e.type }));
}

/**
 * Adds Amplification names, effects and rules (arc-data amplifications.json, optional) to the
 * weapons. Weapons are matched by their Amplified item; the cost of an Amplification is the
 * graph edge that adds it (same on every such edge; reported otherwise).
 */
function addAmplifications(ctx: GenContext, weapons: Record<string, AmplifiedWeapon>): void {
  const canon = Object.entries(ctx.arc.amplifications());
  if (!canon.length) return;
  const internalNameOf = new Map<string, string | null | undefined>();
  for (const [id, slug] of ctx.shippedItems) internalNameOf.set(slug, ctx.arc.items.get(id)?.internalName);
  const shippedSlugs = new Set(ctx.shippedItems.values());

  for (const [baseSlug, w] of Object.entries(weapons)) {
    const found = canon.find(([, c]) => (w.variants ?? []).includes(c.amplifiedSlug));
    if (!found) {
      ctx.report.add('amplificationsMissing', baseSlug);
      continue;
    }
    const [key, c] = found;
    w.maxAmplifications = c.maxAmplifications;
    w.amplifiedItemId = ctx.itemRef(c.amplifiedItemId, `amplification ${key}`) ?? c.amplifiedSlug;
    if (c.baseEffects?.length) {
      w.baseEffects = effectsOf(c.baseEffects);
      c.baseEffects.forEach((e, i) => ctx.text.add('amplification', baseSlug, ['baseEffects', String(i)], e.text));
    }

    // Graph edges that add exactly one Amplification: id -> cost/requires of that edge.
    const sets = new Map<string, Set<string>>();
    for (const v of [w.fromItemId, ...(w.variants ?? [])]) {
      const set = appliedAmplifications(internalNameOf.get(v), key);
      if (set) sets.set(v, set);
    }
    const steps = new Map<string, NonNullable<Amplification['variantStep']>>();
    for (const [from, branches] of Object.entries(w.graph)) {
      const a = sets.get(from);
      if (!a) continue;
      for (const b of branches) {
        const t = sets.get(b.itemId);
        if (!t || t.size !== a.size + 1 || ![...a].every((x) => t.has(x))) continue;
        const added = [...t].find((x) => !a.has(x))!;
        const step = { cost: b.cost, ...(b.requires?.length ? { requires: b.requires } : {}) };
        const prev = steps.get(added);
        if (!prev) steps.set(added, step);
        else if (JSON.stringify(prev) !== JSON.stringify(step)) {
          ctx.report.add('amplificationStepMismatch', `${baseSlug} ${added}: edge into ${b.itemId} differs from the first edge`);
        }
      }
    }

    w.amplifications = c.amplifications.map((a): Amplification => {
      const icon = ampIconUrl(a.icon);
      if (!icon) ctx.report.add('amplificationIconUnmapped', `${baseSlug} ${a.id}: ${a.icon}`);
      let researchItemId: string | undefined;
      if (a.researchSlug) {
        if (shippedSlugs.has(a.researchSlug)) researchItemId = a.researchSlug;
        else ctx.report.add('amplificationResearchNotShipped', `${baseSlug} ${a.id}: ${a.researchSlug}`);
      }
      const step = steps.get(a.id);
      if (!step) ctx.report.add('amplificationWithoutStep', `${baseSlug} ${a.id}`);
      ctx.text.add('amplification', baseSlug, ['amplifications', a.id, 'name'], a.name);
      ctx.text.add('amplification', baseSlug, ['amplifications', a.id, 'description'], a.description);
      a.effects.forEach((e, i) => ctx.text.add('amplification', baseSlug, ['amplifications', a.id, 'effects', String(i)], e.text));
      return {
        id: a.id,
        ...(icon ? { icon } : {}),
        effects: effectsOf(a.effects),
        requires: a.requires,
        excludes: a.excludes,
        ...(researchItemId ? { researchItemId } : {}),
        ...(step ? { variantStep: step } : {}),
      };
    });
  }
}

/**
 * Amplified weapons (docs/Game-Data.md), derived from the items domain: variants are items
 * with `amplifiedFrom`; the graph holds every upgrade edge leaving the weapon's tier chain into the
 * variants and between variants. Must run after `items`. Amplification names, effects and rules
 * come from arc-data amplifications.json when present.
 */
const module: DomainModule = {
  domain: 'amplification',
  build(ctx) {
    const items = (ctx.results.items?.items ?? {}) as Record<string, Item>;
    const weapons: Record<string, AmplifiedWeapon> = {};
    for (const it of Object.values(items).sort((a, b) => a.id.localeCompare(b.id))) {
      if (!it.amplifiedFrom) continue;
      const from = items[it.amplifiedFrom];
      const baseId = from?.baseId ?? it.amplifiedFrom;
      // maxAmplifications, amplifiedItemId and amplifications are added by addAmplifications
      // (absent without amplifications.json).
      const w = (weapons[baseId] ??= { id: baseId, fromItemId: it.amplifiedFrom, variants: [], graph: {} } as AmplifiedWeapon);
      w.variants!.push(it.id);
    }
    for (const w of Object.values(weapons)) {
      const variants = w.variants!;
      for (const id of [w.fromItemId, ...variants]) {
        const branches: AmplificationBranch[] = (items[id]?.upgradesTo ?? [])
          .filter((u) => variants.includes(u.itemId))
          .map((u) => ({ itemId: u.itemId, cost: u.cost, ...(u.requires?.length ? { requires: u.requires } : {}) }));
        if (branches.length) w.graph[id] = branches;
      }
      // repair material of the variants (Amplified Fragments)
      const repair = variants.flatMap((v) => items[v]?.repairCost ?? []).map((a) => a.itemId);
      if (repair.length) w.repairItemId = repair[0];
      variants.sort();
    }
    addAmplifications(ctx, weapons);
    return { weapons };
  },
};

export default module;
