import type { ItemsMap } from '../types/item';
import type { ItemRecycleSalvageUsage, ListType, PlannerResult } from '../types/planner';
import { walkDependencies } from './planner/provenance';

export interface ItemFinalListNeed {
  listId: string;
  listName: string;
  quantity: number;
  missing: number;
  isComplete: boolean;
  listType: ListType;
}

export interface ItemCraftingNeed {
  listId: string;
  listName: string;
  listType: ListType;
  targetItemId: string;
  targetItemName: string;
  targetItemRarity: string;
  chainItemIds: string[];
  chainLabel: string;
  isComplete: boolean;
}

export interface ItemRepairNeed {
  listId: string;
  listName: string;
  quantity: number;
  listType: ListType;
  targetItemId: string;
  targetItemName: string;
}

export interface ItemInsight {
  finalListNeeds: ItemFinalListNeed[];
  craftingNeeds: ItemCraftingNeed[];
  recycleSalvageUsages: ItemRecycleSalvageUsage[];
  repairNeeds: ItemRepairNeed[];
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
  recycleSalvageUsages: [],
  repairNeeds: [],
};

function getOrCreateInsight(map: ItemInsightsMap, itemId: string): ItemInsight {
  if (!map[itemId]) {
    map[itemId] = {
      finalListNeeds: [],
      craftingNeeds: [],
      recycleSalvageUsages: [],
      repairNeeds: [],
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

/**
 * Allocate totalMissing across sources proportionally using largest-remainder.
 * Returns an array of per-source missing quantities that sum to totalMissing.
 */
function allocateMissingToSources(
  sources: { quantity: number }[],
  totalMissing: number,
): number[] {
  if (totalMissing <= 0) return sources.map(() => 0);

  const totalRequired = sources.reduce((sum, s) => sum + s.quantity, 0);
  if (totalRequired <= 0) return sources.map(() => 0);

  // Calculate proportional allocations with remainders
  const allocations: { index: number; quotient: number; remainder: number }[] = sources.map(
    (source, index) => {
      const exact = (source.quantity / totalRequired) * totalMissing;
      return {
        index,
        quotient: Math.floor(exact),
        remainder: exact - Math.floor(exact),
      };
    },
  );

  // Distribute remaining units to largest remainders
  const allocated = allocations.map((a) => a.quotient);
  const distributed = allocated.reduce((sum, v) => sum + v, 0);
  const remaining = totalMissing - distributed;

  if (remaining > 0) {
    const sortedByRemainder = [...allocations].sort((a, b) => b.remainder - a.remainder);
    for (let i = 0; i < remaining; i++) {
      allocated[sortedByRemainder[i].index]++;
    }
  }

  return allocated;
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
    const totalMissing = missingByItemId[itemId] ?? 0;
    const isComplete = totalMissing <= 0;
    const insight = getOrCreateInsight(insights, itemId);
    const sortedSources = [...sources].sort((a, b) => a.listName.localeCompare(b.listName));
    const perSourceMissing = allocateMissingToSources(sortedSources, totalMissing);
    for (let i = 0; i < sortedSources.length; i++) {
      const source = sortedSources[i];
      insight.finalListNeeds.push({
        listId: source.listId,
        listName: source.listName,
        quantity: source.quantity,
        missing: perSourceMissing[i],
        isComplete,
        listType: source.listType,
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
          listType: source.listType,
          targetItemId,
          targetItemName: targetItem.name,
          targetItemRarity: targetItem.rarity ?? '',
          chainItemIds: chain.chainItemIds,
          chainLabel,
          isComplete,
        });
      }
    }
  }
}

function addRepairNeeds(
  insights: ItemInsightsMap,
  itemsMap: ItemsMap,
  plannerResult: PlannerResult,
): void {
  const dedupe = new Set<string>();

  for (const action of plannerResult.repairPlan.actions) {
    const insight = getOrCreateInsight(insights, action.itemId);
    for (const source of action.listSources) {
      const dedupeKey = `${action.itemId}|${source.listId}`;
      if (dedupe.has(dedupeKey)) continue;
      dedupe.add(dedupeKey);
      insight.repairNeeds.push({
        listId: source.listId,
        listName: source.listName,
        quantity: source.quantity,
        listType: source.listType,
        targetItemId: action.itemId,
        targetItemName: itemsMap[action.itemId]?.name ?? action.itemId,
      });
    }

    // Also add repair material needs (materials consumed for repair)
    for (const [materialId, qty] of Object.entries(action.materialsNeeded)) {
      const matInsight = getOrCreateInsight(insights, materialId);
      if (!matInsight.repairNeeds.some((r) => r.targetItemId === action.itemId)) {
        matInsight.repairNeeds.push({
          listId: action.listSources[0]?.listId ?? '',
          listName: action.listSources[0]?.listName ?? '',
          quantity: qty,
          listType: action.listSources[0]?.listType ?? 'user',
          targetItemId: action.itemId,
          targetItemName: itemsMap[action.itemId]?.name ?? action.itemId,
        });
      }
    }
  }
}

function addRecycleSalvageUsages(
  insights: ItemInsightsMap,
  itemsMap: ItemsMap,
  plannerResult: PlannerResult,
): void {
  const dedupe = new Set<string>();
  const satisfiableTargets = plannerResult.satisfiableTargets;

  for (const action of plannerResult.recyclePlan.actions) {
    for (const reason of action.reasons) {
      const targetItem = itemsMap[reason.targetItemId];
      if (!targetItem) continue;

      const yieldItem = itemsMap[reason.producedItemId];
      if (!yieldItem) continue;

      const sources = plannerResult.requiredSourcesByItemId[reason.targetItemId] ?? [];
      const source = sources.find((s) => s.listId === reason.listId);
      const listType = source?.listType ?? 'user';

      const dedupeKey = [
        action.srcItemId,
        reason.listId,
        reason.targetItemId,
        reason.producedItemId,
      ].join('|');
      if (dedupe.has(dedupeKey)) continue;
      dedupe.add(dedupeKey);

      const insight = getOrCreateInsight(insights, action.srcItemId);
      insight.recycleSalvageUsages.push({
        listId: reason.listId,
        listName: reason.listName,
        listType,
        yieldItemId: reason.producedItemId,
        yieldItemName: reason.producedItemName,
        yieldQuantity: reason.quantityCovered,
        targetItemId: reason.targetItemId,
        targetItemName: reason.targetItemName,
        targetItemRarity: targetItem.rarity ?? '',
        chainLabel: reason.chainLabel,
        isComplete: satisfiableTargets.has(reason.targetItemId),
      });
    }
  }
}


export function buildItemInsights(itemsMap: ItemsMap, plannerResult: PlannerResult): ItemInsightsMap {
  const insights: ItemInsightsMap = {};
  const missingByItemId = buildPlanMissingMap(plannerResult);

  addFinalNeeds(insights, plannerResult, missingByItemId);
  addCraftingNeeds(insights, itemsMap, plannerResult, missingByItemId);
  addRepairNeeds(insights, itemsMap, plannerResult);
  addRecycleSalvageUsages(insights, itemsMap, plannerResult);

  // Ensure stable sorting for deterministic rendering
  for (const insight of Object.values(insights)) {
    insight.finalListNeeds.sort((a, b) => a.listName.localeCompare(b.listName));
    insight.craftingNeeds.sort((a, b) => {
      if (a.listName !== b.listName) return a.listName.localeCompare(b.listName);
      if (a.targetItemName !== b.targetItemName) return a.targetItemName.localeCompare(b.targetItemName);
      return a.chainLabel.localeCompare(b.chainLabel);
    });
    insight.recycleSalvageUsages.sort((a, b) => {
      if (a.listName !== b.listName) return a.listName.localeCompare(b.listName);
      if (a.targetItemName !== b.targetItemName) return a.targetItemName.localeCompare(b.targetItemName);
      return a.chainLabel.localeCompare(b.chainLabel);
    });
    insight.repairNeeds.sort((a, b) => {
      if (a.listName !== b.listName) return a.listName.localeCompare(b.listName);
      if (a.targetItemName !== b.targetItemName) return a.targetItemName.localeCompare(b.targetItemName);
      return a.quantity - b.quantity;
    });
  }

  return insights;
}

export function getEmptyItemInsight(itemInsights: ItemInsightsMap, itemId: string): ItemInsight {
  return itemInsights[itemId] ?? EMPTY_INSIGHT;
}
