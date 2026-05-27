import type { ItemsMap } from '../types/item';
import type { PlannerResult } from '../types/planner';
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

export interface ItemInsight {
  finalListNeeds: ItemFinalListNeed[];
  craftingNeeds: ItemCraftingNeed[];
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
};

function getOrCreateInsight(map: ItemInsightsMap, itemId: string): ItemInsight {
  if (!map[itemId]) {
    map[itemId] = {
      finalListNeeds: [],
      craftingNeeds: [],
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
): void {
  const dedupe = new Set<string>();

  const targetItemIds = Object.keys(plannerResult.requiredSourcesByItemId).sort();
  for (const targetItemId of targetItemIds) {
    const targetItem = itemsMap[targetItemId];
    if (!targetItem) continue;

    const listSources = plannerResult.requiredSourcesByItemId[targetItemId] ?? [];
    if (listSources.length === 0) continue;

    const chains = collectIngredientChainsForTarget(itemsMap, targetItemId);
    for (const chain of chains) {
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
}


export function buildItemInsights(itemsMap: ItemsMap, plannerResult: PlannerResult): ItemInsightsMap {
  const insights: ItemInsightsMap = {};
  const missingByItemId = buildPlanMissingMap(plannerResult);

  addFinalNeeds(insights, plannerResult, missingByItemId);
  addCraftingNeeds(insights, itemsMap, plannerResult, missingByItemId);

  // Ensure stable sorting for deterministic rendering
  for (const insight of Object.values(insights)) {
    insight.finalListNeeds.sort((a, b) => a.listName.localeCompare(b.listName));
    insight.craftingNeeds.sort((a, b) => {
      if (a.listName !== b.listName) return a.listName.localeCompare(b.listName);
      if (a.targetItemName !== b.targetItemName) return a.targetItemName.localeCompare(b.targetItemName);
      return a.chainLabel.localeCompare(b.chainLabel);
    });
  }

  return insights;
}

export function getEmptyItemInsight(itemInsights: ItemInsightsMap, itemId: string): ItemInsight {
  return itemInsights[itemId] ?? EMPTY_INSIGHT;
}
