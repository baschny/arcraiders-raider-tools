import { toItemRef, type WhatsNewPageData } from '../../hooks/useWhatsNewData';
import type { ItemRef, TileSpec } from '../../components';
import type { WhatsNewFieldRecipe } from '../../../../shared/gamedata/types';

export interface SkillPill {
  id: string;
  name: string;
  icon?: string;
  isNew: boolean;
}

export interface CraftRecipe {
  result: ItemRef;
  cost: TileSpec[];
  status: WhatsNewFieldRecipe['status'];
}

export interface SkillGroup {
  skill: SkillPill;
  recipes: CraftRecipe[];
}

export interface FieldCraftingData {
  before: SkillPill[];
  after: SkillPill[];
  /** New (and changed) crafts, grouped by their gating skill, newest skill first. */
  added: SkillGroup[];
  addedCount: number;
  unchanged: SkillGroup[];
  unchangedCount: number;
  /** Result icons of the unchanged crafts, for the collapsed line. */
  unchangedResults: ItemRef[];
}

/** Old skill ids carry a `_characterskill_<effect>` suffix; the new tree uses the bare id. */
export function normalizeSkillId(id: string): string {
  return id.replace(/_characterskill_.*$/, '');
}

/**
 * Picks the skill a recipe is filed under: the most specific one, i.e. the one gating the fewest recipes
 * (the base skill is shared by all), a skill that is new in 2.0 winning ties.
 */
export function groupRecipesBySkill<R extends { skills: string[] }>(
  recipes: R[],
  counts: Map<string, number>,
  newSkills: Set<string>,
): Map<string, R[]> {
  const groups = new Map<string, R[]>();
  for (const r of recipes) {
    const primary = [...r.skills].sort(
      (a, b) =>
        (counts.get(a) ?? 0) - (counts.get(b) ?? 0) || Number(newSkills.has(b)) - Number(newSkills.has(a)),
    )[0];
    if (primary === undefined) continue;
    const list = groups.get(primary) ?? [];
    list.push(r);
    groups.set(primary, list);
  }
  return groups;
}

export function buildFieldCraftingData(data: WhatsNewPageData): FieldCraftingData {
  const fc = data.whatsNew?.versions['frozen-trail']?.fieldCrafting;
  const nodes = data.skilltree.structure.nodes;
  const text = data.skilltree.text;
  const beforeIds = [...new Set((fc?.skillsBefore ?? []).map(normalizeSkillId))];
  const afterIds = [...new Set((fc?.skillsAfter ?? []).map(normalizeSkillId))];
  const newIds = new Set(afterIds.filter((id) => !beforeIds.includes(id)));

  const pill = (rawId: string): SkillPill => {
    const id = normalizeSkillId(rawId);
    const node = nodes[id] as (typeof nodes)[string] & { icon?: string } | undefined;
    return { id, name: text[id]?.name ?? node?.nameEn ?? id, icon: node?.icon, isNew: newIds.has(id) };
  };

  const all = (fc?.recipes ?? []).map((r) => ({
    skills: [...new Set((r.skills ?? []).map(normalizeSkillId))],
    recipe: {
      result: toItemRef(data.catalog, r.result),
      cost: r.cost.map((c) => ({ item: toItemRef(data.catalog, c.itemId), amount: c.quantity })),
      status: r.status,
    } as CraftRecipe,
  }));

  const counts = new Map<string, number>();
  for (const r of all) for (const s of r.skills) counts.set(s, (counts.get(s) ?? 0) + 1);

  const toGroups = (subset: typeof all): SkillGroup[] =>
    [...groupRecipesBySkill(subset, counts, newIds)]
      .map(([id, rs]) => ({ skill: pill(id), recipes: rs.map((r) => r.recipe) }))
      .sort(
        (a, b) =>
          Number(b.skill.isNew) - Number(a.skill.isNew) ||
          (counts.get(a.skill.id) ?? 0) - (counts.get(b.skill.id) ?? 0),
      );

  const addedSrc = all.filter((r) => r.recipe.status !== 'unchanged');
  const unchangedSrc = all.filter((r) => r.recipe.status === 'unchanged');
  const unchanged = toGroups(unchangedSrc);

  return {
    before: beforeIds.map(pill),
    after: afterIds.map(pill),
    added: toGroups(addedSrc),
    addedCount: addedSrc.length,
    unchanged,
    unchangedCount: unchangedSrc.length,
    unchangedResults: unchanged.flatMap((g) => g.recipes.map((r) => r.result)),
  };
}
