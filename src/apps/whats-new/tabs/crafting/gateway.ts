import type { NeedsCardProps } from '../../components';
import { toItemRef, toUnlockedRef, type WhatsNewPageData } from '../../hooks/useWhatsNewData';

export const GATEWAY_RECIPE_ID = 'recipes:emperor_gateway_conduit';

/** Props of the NeedsCard for the Emperor Gateway key, or null when the recipe is missing. */
export function buildGatewayCard(data: WhatsNewPageData): NeedsCardProps | null {
  const { catalog } = data;
  const recipe = data.recipes.structure.recipes[GATEWAY_RECIPE_ID];
  if (!recipe) return null;
  const bench = recipe.benchId ? data.benches.structure.benches[recipe.benchId] : undefined;
  const level = bench?.levels.find((l) => l.level === (recipe.benchLevel ?? 1)) ?? bench?.levels[0];
  const blueprintId = recipe.requires?.find((r) => r.kind === 'unlock')?.id;
  const result = (recipe.rewards ?? [])[0];
  const benchName = bench ? data.benches.text[bench.id]?.name ?? bench.nameEn : undefined;
  return {
    result: { item: toItemRef(catalog, result?.itemId ?? 'emperor_gateway_conduit') },
    where: benchName ? { image: level?.icon ?? undefined, label: benchName } : undefined,
    needs: ('items' in recipe.cost ? recipe.cost.items : []).map((c) => ({ item: toItemRef(catalog, c.itemId), amount: c.quantity })),
    alsoNeeds: blueprintId ? [{ item: toUnlockedRef(catalog, blueprintId), isBlueprint: true }] : undefined,
  };
}
