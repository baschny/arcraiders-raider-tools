import type { ItemsMap } from '../types/item';
import type { PlannerResult, RequiredSource } from '../types/planner';
import { walkDependencies } from './planner/provenance';

export interface ItemFinalListNeed {
  listId: string;
  listName: string;
  quantity: number;
  isComplete: boolean;
}

export interface ItemCraftingNeed {
  listId: string;
  listName: string;
  targetItemId: string;
  targetItemName: string;
  chainItemIds: string[];
  chainLabel: string;
  isComplete: boolean;
}

export interface ItemRecycleSalvageNeed {
  mode: 'recycle' | 'salvage';
  producedItemId: string;
  producedItemName: string;
  listId: string;
  listName: string;
  targetItemId: string;
  targetItemName: string;
  chainItemIds: string[];
  chainLabel: string;
  isComplete: boolean;
}

export interface ItemInsight {
  finalListNeeds: ItemFinalListNeed[];
  craftingNeeds: ItemCraftingNeed[];
  recycleSalvageNeeds: ItemRecycleSalvageNeed[];
  neededRecycleYieldIds: string[];
  neededSalvageYieldIds: string[];
}

export type ItemInsightsMap = Record<string, ItemInsight>;

interface DependencyChain {
  targetItemId: string;
  ingredientItemId: string;
  chainItemIds: string[];
}

const EMPTY_INSIGHT: ItemInsight = {
  finalListNeeds: [],
  craftingNeeds: [],
  recycleSalvageNeeds: [],
  neededRecycleYieldIds: [],
  neededSalvageYieldIds: [],
};

function getOrCreateInsight(map: ItemInsightsMap, itemId: string): ItemInsight {
  if (!map[itemId]) {
    map[itemId] = {
      finalListNeeds: [],
      craftingNeeds: [],
      recycleSalvageNeeds: [],
      neededRecycleYieldIds: [],
      neededSalvageYieldIds: [],
    };
  }
  return map[itemId];
}

function collectIngredientChainsForTarget(
  itemsMap: ItemsMap,
  targetItemId: string,
): DependencyChain[] {
  return walkDependencies(itemsMap, targetItemId, 6);
}

function buildPlanMissingMap(plannerResult: PlannerResult): Record<string, number> {
  const missingByItemId: Record<string, number> = {};
  for (const row of plannerResult.planRows) {
    missingByItemId[row.itemId] = row.missing;
  }
  for (const [itemId, quantity] of Object.entries(plannerResult.remainingIngredientDeficits)) {
    missingByItemId[itemId] = Math.max(missingByItemId[itemId] ?? 0, quantity);
  }
  return missingByItemId;
}

function formatChainLabel(chainItemIds: string[], itemsMap: ItemsMap): string {
  return chainItemIds
    .map((itemId) => itemsMap[itemId]?.name ?? itemId)
    .join(' -> ');
}

function addFinalNeeds(
  insights: ItemInsightsMap,
  plannerResult: PlannerResult,
  missingByItemId: Record<string, number>,
): void {
  const requiredSourcesEntries = Object.entries(plannerResult.requiredSourcesByItemId).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  for (const [itemId, sources] of requiredSourcesEntries) {
    const isComplete = (missingByItemId[itemId] ?? 0) <= 0;
    const insight = getOrCreateInsight(insights, itemId);
    const sortedSources = [...sources].sort((a, b) => a.listName.localeCompare(b.listName));
    for (const source of sortedSources) {
      insight.finalListNeeds.push({
        listId: source.listId,
        listName: source.listName,
        quantity: source.quantity,
        isComplete,
      });
    }
  }
}

function addCraftingNeeds(
  insights: ItemInsightsMap,
  itemsMap: ItemsMap,
  plannerResult: PlannerResult,
  missingByItemId: Record<string, number>,
): Record<string, DependencyChain[]> {
  const chainsByIngredient: Record<string, DependencyChain[]> = {};
  const dedupe = new Set<string>();

  const targetItemIds = Object.keys(plannerResult.requiredSourcesByItemId).sort();
  for (const targetItemId of targetItemIds) {
    const targetItem = itemsMap[targetItemId];
    if (!targetItem) continue;

    const listSources = plannerResult.requiredSourcesByItemId[targetItemId] ?? [];
    if (listSources.length === 0) continue;

    const chains = collectIngredientChainsForTarget(itemsMap, targetItemId);
    for (const chain of chains) {
      if (!chainsByIngredient[chain.ingredientItemId]) {
        chainsByIngredient[chain.ingredientItemId] = [];
      }
      chainsByIngredient[chain.ingredientItemId].push(chain);

      const ingredientItem = itemsMap[chain.ingredientItemId];
      if (!ingredientItem) continue;

      const chainLabel = formatChainLabel(chain.chainItemIds, itemsMap);
      const isComplete = (missingByItemId[chain.ingredientItemId] ?? 0) <= 0;
      const sortedSources = [...listSources].sort((a, b) => a.listName.localeCompare(b.listName));
      const insight = getOrCreateInsight(insights, chain.ingredientItemId);

      for (const source of sortedSources) {
        const dedupeKey = [
          chain.ingredientItemId,
          source.listId,
          targetItemId,
          chain.chainItemIds.join('>'),
        ].join('|');
        if (dedupe.has(dedupeKey)) continue;
        dedupe.add(dedupeKey);

        insight.craftingNeeds.push({
          listId: source.listId,
          listName: source.listName,
          targetItemId,
          targetItemName: targetItem.name,
          chainItemIds: chain.chainItemIds,
          chainLabel,
          isComplete,
        });
      }
    }
  }

  return chainsByIngredient;
}

function addRecycleAndSalvageNeeds(
  insights: ItemInsightsMap,
  itemsMap: ItemsMap,
  plannerResult: PlannerResult,
  missingByItemId: Record<string, number>,
  chainsByIngredient: Record<string, DependencyChain[]>,
): void {
  const dedupe = new Set<string>();
  const itemIds = Object.keys(itemsMap).sort();

  const buildNeedsForOutput = (
    srcItemId: string,
    mode: 'recycle' | 'salvage',
    producedItemId: string,
    listSourcesByTargetId: Record<string, RequiredSource[]>,
  ) => {
    const producedItem = itemsMap[producedItemId];
    if (!producedItem) return;

    const baseChains = chainsByIngredient[producedItemId] ?? [];
    const syntheticFinalChains: DependencyChain[] =
      plannerResult.requiredSourcesByItemId[producedItemId] && (plannerResult.required[producedItemId] ?? 0) > 0
        ? [
            {
              targetItemId: producedItemId,
              ingredientItemId: producedItemId,
              chainItemIds: [producedItemId],
            },
          ]
        : [];
    const relevantChains = [...baseChains, ...syntheticFinalChains];

    if (relevantChains.length === 0) return;

    const srcInsight = getOrCreateInsight(insights, srcItemId);
    const isComplete = (missingByItemId[producedItemId] ?? 0) <= 0;

    if (mode === 'recycle' && !srcInsight.neededRecycleYieldIds.includes(producedItemId)) {
      srcInsight.neededRecycleYieldIds.push(producedItemId);
    }
    if (mode === 'salvage' && !srcInsight.neededSalvageYieldIds.includes(producedItemId)) {
      srcInsight.neededSalvageYieldIds.push(producedItemId);
    }

    for (const chain of relevantChains) {
      const targetItem = itemsMap[chain.targetItemId];
      if (!targetItem) continue;
      const listSources = listSourcesByTargetId[chain.targetItemId] ?? [];
      const sortedSources = [...listSources].sort((a, b) => a.listName.localeCompare(b.listName));

      for (const source of sortedSources) {
        const chainLabel = formatChainLabel(chain.chainItemIds, itemsMap);
        const dedupeKey = [
          srcItemId,
          mode,
          producedItemId,
          source.listId,
          chain.targetItemId,
          chain.chainItemIds.join('>'),
        ].join('|');
        if (dedupe.has(dedupeKey)) continue;
        dedupe.add(dedupeKey);

        srcInsight.recycleSalvageNeeds.push({
          mode,
          producedItemId,
          producedItemName: producedItem.name,
          listId: source.listId,
          listName: source.listName,
          targetItemId: chain.targetItemId,
          targetItemName: targetItem.name,
          chainItemIds: chain.chainItemIds,
          chainLabel,
          isComplete,
        });
      }
    }
  };

  for (const itemId of itemIds) {
    const item = itemsMap[itemId];

    if (item.recyclesInto) {
      const yieldIds = Object.keys(item.recyclesInto).sort();
      for (const yieldId of yieldIds) {
        buildNeedsForOutput(itemId, 'recycle', yieldId, plannerResult.requiredSourcesByItemId);
      }
    }

    if (item.salvagesInto) {
      const yieldIds = Object.keys(item.salvagesInto).sort();
      for (const yieldId of yieldIds) {
        buildNeedsForOutput(itemId, 'salvage', yieldId, plannerResult.requiredSourcesByItemId);
      }
    }
  }
}

export function buildItemInsights(itemsMap: ItemsMap, plannerResult: PlannerResult): ItemInsightsMap {
  const insights: ItemInsightsMap = {};
  const missingByItemId = buildPlanMissingMap(plannerResult);

  addFinalNeeds(insights, plannerResult, missingByItemId);
  const chainsByIngredient = addCraftingNeeds(insights, itemsMap, plannerResult, missingByItemId);
  addRecycleAndSalvageNeeds(insights, itemsMap, plannerResult, missingByItemId, chainsByIngredient);

  // Ensure stable sorting for deterministic rendering
  for (const insight of Object.values(insights)) {
    insight.finalListNeeds.sort((a, b) => a.listName.localeCompare(b.listName));
    insight.craftingNeeds.sort((a, b) => {
      if (a.listName !== b.listName) return a.listName.localeCompare(b.listName);
      if (a.targetItemName !== b.targetItemName) return a.targetItemName.localeCompare(b.targetItemName);
      return a.chainLabel.localeCompare(b.chainLabel);
    });
    insight.recycleSalvageNeeds.sort((a, b) => {
      if (a.mode !== b.mode) return a.mode.localeCompare(b.mode);
      if (a.listName !== b.listName) return a.listName.localeCompare(b.listName);
      if (a.targetItemName !== b.targetItemName) return a.targetItemName.localeCompare(b.targetItemName);
      if (a.producedItemName !== b.producedItemName) return a.producedItemName.localeCompare(b.producedItemName);
      return a.chainLabel.localeCompare(b.chainLabel);
    });
    insight.neededRecycleYieldIds.sort();
    insight.neededSalvageYieldIds.sort();
  }

  return insights;
}

export function getEmptyItemInsight(itemInsights: ItemInsightsMap, itemId: string): ItemInsight {
  return itemInsights[itemId] ?? EMPTY_INSIGHT;
}
