import type { Bench, BenchLevel, Recipe, Research, Reward } from '../../../src/shared/gamedata/types';
import type { CanonItem } from '../arcData';
import { benchIconUrl } from '../icons';
import { offersOfClass } from '../offer-classes';
import type { DomainModule } from './types';

/**
 * Benches (spec-site.md#benches): one entry per Generator chain (ctx.benchLevel). Level 1 is built
 * by a 'benches:build' Chamber offer that rewards the level-1 generator; every further level costs
 * the previous level's upgrade. Gates come from the build offer's / upgrade's requirements.
 * Scrappy levels list what they produce per round ('benches:scrappy', RoundCrafting by owner).
 * Must run after recipes and research (lists their slugs per level).
 */
const module: DomainModule = {
  domain: 'benches',
  build(ctx) {
    const generators = [...ctx.arc.items.values()].filter((i) => i.type === 'Generator');
    const byBench = new Map<string, { item: CanonItem; level: number }[]>();
    for (const g of generators) {
      const ref = ctx.benchLevel(g.id);
      if (!ref?.benchId) continue;
      byBench.set(ref.benchId, [...(byBench.get(ref.benchId) ?? []), { item: g, level: ref.level }]);
    }

    const buildOffer = new Map<number, ReturnType<typeof offersOfClass>[number]>();
    for (const o of offersOfClass(ctx, 'benches:build')) for (const r of o.rewards.items) if (!buildOffer.has(r.id)) buildOffer.set(r.id, o);

    const produces = new Map<number, Reward[]>(); // scrappy level generator id → rewards
    for (const o of offersOfClass(ctx, 'benches:scrappy')) {
      produces.set(o.owner, [...(produces.get(o.owner) ?? []), ...ctx.rewards(o.rewards, `scrappy ${o.id}`)]);
    }

    const recipes = Object.values((ctx.results.recipes?.recipes ?? {}) as Record<string, Recipe>);
    const research = Object.values((ctx.results.research?.research ?? {}) as Record<string, Research>);

    const benches: Record<string, Bench> = {};
    for (const [benchId, members] of [...byBench].sort(([a], [b]) => a.localeCompare(b))) {
      members.sort((a, b) => a.level - b.level);
      const levels: BenchLevel[] = members.map(({ item, level }, idx) => {
        const context = `bench ${benchId} ${level}`;
        let cost: BenchLevel['buildCost'] = [];
        let requires: BenchLevel['requires'] = [];
        if (idx === 0) {
          const o = buildOffer.get(item.id);
          if (o) {
            const c = ctx.cost(o.cost, context);
            cost = 'items' in c ? c.items : [];
            requires = ctx.requirements(o.requires, context);
          }
        } else {
          const up = members[idx - 1].item.upgrades.find((u) => u.next === item.id);
          if (up) {
            const c = ctx.cost(up.cost, context);
            cost = 'items' in c ? c.items : [];
            requires = ctx.requirements(up.requires, context);
          }
        }
        const scrap = produces.get(item.id);
        return {
          level,
          icon: benchIconUrl(benchId, level),
          buildCost: cost,
          requires,
          recipes: recipes.filter((r) => r.benchId === benchId && r.benchLevel === level).map((r) => r.id).sort(),
          research: research.filter((r) => r.benchId === benchId && r.benchLevel === level).map((r) => r.id).sort(),
          ...(scrap?.length ? { produces: scrap } : {}),
        };
      });
      const used = buildOffer.has(members[0].item.id) || levels.some((l) => l.recipes?.length || l.research?.length || l.produces?.length);
      if (!used && benchId !== 'workbench') {
        // e.g. the Recycle Station: assets without build offer, upgrades or recipes (not in the game)
        ctx.report.add('benchesSkipped', `${benchId} (no build offer, recipes or production)`);
        continue;
      }
      const first = members[0].item;
      const nameEn = first.name?.en || ctx.slugs.get('benches', String(first.baseId || first.id))?.name || benchId;
      benches[benchId] = { id: benchId, nameEn, maxLevel: levels.length, levels };
      ctx.text.add('benches', benchId, 'name', first.name?.en ? first.name : nameEn);
      ctx.text.add('benches', benchId, 'description', first.description);
    }
    return { benches };
  },
};

export default module;
