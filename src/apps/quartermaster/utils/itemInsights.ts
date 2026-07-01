import type { ItemsMap } from '../types/item';
import type { ItemRecycleSalvageAction, ItemRecycleSalvageUsage, ListType, PlannerResult } from '../types/planner';
import { getAdvisoryDependencyRecipe, walkDependencies } from './planner/provenance';

export interface ItemFinalListNeed {
  listId: string;
  listName: string;
  quantity: number;
  missing: number;
  craftable: number;
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
  return { ...plannerResult.deficit };
}

function formatChainLabel(chainItemIds: string[], itemsMap: ItemsMap): string {
  return chainItemIds
    .map((itemId) => itemsMap[itemId]?.name ?? itemId)
    .join(' -> ');
}

/**
 * Allocate owned, craftable, and deficit across sources first-come-first-serve
 * by list priority order (preserved from aggregation insertion order).
 * Returns arrays of per-source { owned, craftable, missing } that sum to the totals.
 */
function allocateFirstComeFirstServe(
  sources: { quantity: number }[],
  ownedQty: number,
  craftableQty: number,
  deficitQty: number,
): Array<{ owned: number; craftable: number; missing: number }> {
  let ownedRemaining = ownedQty;
  let craftableRemaining = craftableQty;
  let deficitRemaining = deficitQty;

  return sources.map((source) => {
    const owned = Math.min(ownedRemaining, source.quantity);
    ownedRemaining -= owned;
    let unmet = source.quantity - owned;

    const craftable = Math.min(craftableRemaining, unmet);
    craftableRemaining -= craftable;
    unmet -= craftable;

    const missing = Math.min(deficitRemaining, unmet);
    deficitRemaining -= missing;

    return { owned, craftable, missing };
  });
}

function addFinalNeeds(
  insights: ItemInsightsMap,
  plannerResult: PlannerResult,
  missingByItemId: Record<string, number>,
): void {
  const ownedByItemId = new Map<string, number>();
  for (const row of plannerResult.planRows) {
    ownedByItemId.set(row.itemId, row.have);
  }

  const requiredSourcesEntries = Object.entries(plannerResult.requiredSourcesByItemId).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  for (const [itemId, sources] of requiredSourcesEntries) {
    const totalMissing = missingByItemId[itemId] ?? 0;
    const isComplete = totalMissing <= 0;
    const ownedQty = ownedByItemId.get(itemId) ?? 0;
    const craftableQty = plannerResult.craftableQty[itemId] ?? 0;
    const insight = getOrCreateInsight(insights, itemId);
    // Preserve insertion order from aggregation (hideout → quest → project → user priority)
    const perSource = allocateFirstComeFirstServe(sources, ownedQty, craftableQty, totalMissing);
    for (let i = 0; i < sources.length; i++) {
      const source = sources[i];
      insight.finalListNeeds.push({
        listId: source.listId,
        listName: source.listName,
        quantity: source.quantity,
        missing: perSource[i].missing,
        craftable: perSource[i].craftable,
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
  missingByItemId: Record<string, number>,
): void {
  const dedupe = new Set<string>();
  const satisfiableTargets = plannerResult.satisfiableTargets;

  const addUsage = (
    srcItemId: string,
    action: ItemRecycleSalvageAction,
    listId: string,
    listName: string,
    listType: ListType,
    yieldItemId: string,
    yieldItemName: string,
    yieldQuantity: number,
    targetItemId: string,
    targetItemName: string,
    targetItemRarity: string,
    chainLabel: string,
  ) => {
    if (srcItemId === targetItemId) return;

    const dedupeKey = [
      srcItemId,
      action,
      listId,
      targetItemId,
      yieldItemId,
    ].join('|');
    if (dedupe.has(dedupeKey)) return;
    dedupe.add(dedupeKey);

    const insight = getOrCreateInsight(insights, srcItemId);
    insight.recycleSalvageUsages.push({
      listId,
      listName,
      listType,
      action,
      yieldItemId,
      yieldItemName,
      yieldQuantity,
      targetItemId,
      targetItemName,
      targetItemRarity,
      chainLabel,
      isComplete: (missingByItemId[targetItemId] ?? 0) <= 0 || satisfiableTargets.has(targetItemId),
    });
  };

  for (const action of plannerResult.recyclePlan.actions) {
    for (const reason of action.reasons) {
      const targetItem = itemsMap[reason.targetItemId];
      if (!targetItem) continue;

      const yieldItem = itemsMap[reason.producedItemId];
      if (!yieldItem) continue;

      const sources = plannerResult.requiredSourcesByItemId[reason.targetItemId] ?? [];
      const source = sources.find((s) => s.listId === reason.listId);
      const listType = source?.listType ?? 'user';

      addUsage(
        action.srcItemId,
        'recycle',
        reason.listId,
        reason.listName,
        listType,
        reason.producedItemId,
        reason.producedItemName,
        reason.quantityCovered,
        reason.targetItemId,
        reason.targetItemName,
        targetItem.rarity ?? '',
        reason.chainLabel,
      );
    }
  }

  const targetItemIds = Object.keys(plannerResult.requiredSourcesByItemId).sort();
  const allSourceItemIds = Object.keys(itemsMap).sort();
  for (const targetItemId of targetItemIds) {
    const targetItem = itemsMap[targetItemId];
    if (!targetItem) continue;

    const listSources = plannerResult.requiredSourcesByItemId[targetItemId] ?? [];
    if (listSources.length === 0) continue;

    const directAdvisoryRecipe = getAdvisoryDependencyRecipe(itemsMap, targetItemId);
    const directYieldItemIds = Object.keys(directAdvisoryRecipe).sort();
    for (const yieldItemId of directYieldItemIds) {
      const yieldItem = itemsMap[yieldItemId];
      if (!yieldItem) continue;

      for (const srcItemId of allSourceItemIds) {
        const sourceItem = itemsMap[srcItemId];
        if (!sourceItem) continue;

        const recycleQuantity = sourceItem.recyclesInto?.[yieldItemId] ?? 0;
        const salvageQuantity = sourceItem.salvagesInto?.[yieldItemId] ?? 0;
        if (recycleQuantity <= 0 && salvageQuantity <= 0) continue;

        const action: ItemRecycleSalvageAction = recycleQuantity > 0 ? 'recycle' : 'salvage';
        const yieldQuantity = action === 'recycle' ? recycleQuantity : salvageQuantity;

        const chainLabel = formatChainLabel([targetItemId, yieldItemId], itemsMap);
        const sortedSources = [...listSources].sort((a, b) => a.listName.localeCompare(b.listName));
        for (const source of sortedSources) {
          addUsage(
            srcItemId,
            action,
            source.listId,
            source.listName,
            source.listType,
            yieldItemId,
            yieldItem.name,
            yieldQuantity,
            targetItemId,
            targetItem.name,
            targetItem.rarity ?? '',
            chainLabel,
          );
        }
      }
    }
  }
}


export function buildItemInsights(itemsMap: ItemsMap, plannerResult: PlannerResult): ItemInsightsMap {
  const insights: ItemInsightsMap = {};
  const missingByItemId = buildPlanMissingMap(plannerResult);

  addFinalNeeds(insights, plannerResult, missingByItemId);
  addCraftingNeeds(insights, itemsMap, plannerResult, missingByItemId);
  addRepairNeeds(insights, itemsMap, plannerResult);
  addRecycleSalvageUsages(insights, itemsMap, plannerResult, missingByItemId);

  // Ensure stable sorting for deterministic rendering
  for (const insight of Object.values(insights)) {
    insight.finalListNeeds.sort((a, b) => a.listName.localeCompare(b.listName));
    insight.craftingNeeds.sort((a, b) => {
      if (a.listName !== b.listName) return a.listName.localeCompare(b.listName);
      if (a.targetItemName !== b.targetItemName) return a.targetItemName.localeCompare(b.targetItemName);
      return a.chainLabel.localeCompare(b.chainLabel);
    });
    insight.recycleSalvageUsages.sort((a, b) => {
      if (a.action !== b.action) return a.action === 'recycle' ? -1 : 1;
      if (a.yieldItemName !== b.yieldItemName) return a.yieldItemName.localeCompare(b.yieldItemName);
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
