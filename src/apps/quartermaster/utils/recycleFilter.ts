import type { ItemsMap, PlannerItem } from '../types/item';

export interface RecycleYieldInfo {
  type: 'direct';
  perItem: number;
}

export interface RecycleYieldInfoIndirect {
  type: 'indirect';
  perItem: number;
  intermediateId: string;
  intermediateName: string;
  intermediateYield: number;
  finalYield: number;
}

export type RecycleYieldInfoUnion = RecycleYieldInfo | RecycleYieldInfoIndirect;

export function getRecycleYieldInfo(
  itemsMap: ItemsMap,
  sourceId: string,
  targetId: string,
): RecycleYieldInfoUnion | null {
  const source = itemsMap[sourceId];
  if (!source?.recyclesInto) return null;

  if (source.recyclesInto[targetId] !== undefined) {
    return { type: 'direct', perItem: source.recyclesInto[targetId] };
  }

  for (const [intermediateId, intermediateQty] of Object.entries(source.recyclesInto)) {
    const intermediate = itemsMap[intermediateId];
    const finalQty = intermediate?.recyclesInto?.[targetId];
    if (finalQty !== undefined) {
      return {
        type: 'indirect',
        perItem: intermediateQty * finalQty,
        intermediateId,
        intermediateName: intermediate.name,
        intermediateYield: intermediateQty,
        finalYield: finalQty,
      };
    }
  }

  return null;
}

export function getRecycleTargetItems(itemsMap: ItemsMap): Map<string, PlannerItem> {
  const targetIds = new Map<string, PlannerItem>();
  for (const item of Object.values(itemsMap)) {
    if (!item.recyclesInto) continue;
    for (const targetId of Object.keys(item.recyclesInto)) {
      if (itemsMap[targetId] && !targetIds.has(targetId)) {
        targetIds.set(targetId, itemsMap[targetId]);
      }
      const intermediate = itemsMap[targetId];
      if (intermediate?.recyclesInto) {
        for (const indirectTargetId of Object.keys(intermediate.recyclesInto)) {
          if (itemsMap[indirectTargetId] && !targetIds.has(indirectTargetId)) {
            targetIds.set(indirectTargetId, itemsMap[indirectTargetId]);
          }
        }
      }
    }
  }
  return targetIds;
}

export function getRecycleSourceItems(itemsMap: ItemsMap, targetId: string): Set<string> {
  const sourceIds = new Set<string>();
  for (const item of Object.values(itemsMap)) {
    if (!item.recyclesInto) continue;
    if (item.recyclesInto[targetId]) {
      sourceIds.add(item.id);
      continue;
    }
    for (const intermediateId of Object.keys(item.recyclesInto)) {
      const intermediate = itemsMap[intermediateId];
      if (intermediate?.recyclesInto?.[targetId]) {
        sourceIds.add(item.id);
        break;
      }
    }
  }
  return sourceIds;
}
