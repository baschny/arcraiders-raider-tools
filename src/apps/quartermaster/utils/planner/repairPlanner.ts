import type { ItemsMap } from '../../types/item';
import type {
  ItemId,
  Qty,
  OwnedItemDisplayRow,
  RepairAction,
  RepairPlan,
  RequiredSource,
} from '../../types/planner';

const REPAIR_THRESHOLD_PERCENT = 30;

function consumeAvail(
  avail: Record<ItemId, Qty>,
  itemId: ItemId,
  qty: Qty,
): void {
  avail[itemId] = Math.max(0, (avail[itemId] ?? 0) - qty);
}

export interface RepairPrePassResult {
  repairPlan: RepairPlan;
  updatedAvail: Record<ItemId, Qty>;
}

/**
 * Run repair pre-pass before the greedy planner.
 *
 * For each owned item with repairCost that appears in any enabled list
 * and has durabilityPercent < 30, consume repair materials from avail.
 * Returns updated avail and the RepairPlan.
 */
export function runRepairPrePass(
  itemsMap: ItemsMap,
  ownedItemRows: OwnedItemDisplayRow[],
  ownedAvail: Record<ItemId, Qty>,
  listItems: Set<ItemId>,
  requiredSourcesByItemId: Record<ItemId, RequiredSource[]>,
): RepairPrePassResult {
  const avail = { ...ownedAvail };
  const actions: RepairAction[] = [];
  const committedMaterials: Record<ItemId, Qty> = {};
  const deficits: Record<ItemId, Qty> = {};

  // Identify repair candidates: owned items with repairCost, in lists, below threshold
  const repairCandidates = ownedItemRows
    .map((row, rowIndex) => {
      const item = itemsMap[row.itemId];
      if (!item?.repairCost) return null;
      if (!listItems.has(row.itemId)) return null;
      const durabilityPercent = row.durabilityPercent ?? 100;
      if (durabilityPercent >= REPAIR_THRESHOLD_PERCENT) return null;
      return {
        row,
        rowIndex,
        item,
        durabilityPercent,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  // Sort: worst durability first, then itemId ASC
  repairCandidates.sort((a, b) => {
    if (a.durabilityPercent !== b.durabilityPercent) {
      return a.durabilityPercent - b.durabilityPercent;
    }
    return a.item.id.localeCompare(b.item.id);
  });

  for (const candidate of repairCandidates) {
    const { item, rowIndex, durabilityPercent } = candidate;
    const listSources = requiredSourcesByItemId[item.id] ?? [];
    const materialsNeeded: Record<ItemId, Qty> = { ...item.repairCost! };

    // Consume each material from avail
    for (const [materialId, neededQty] of Object.entries(item.repairCost!)) {
      const haveQty = avail[materialId] ?? 0;
      const consumableQty = Math.min(neededQty, haveQty);

      if (consumableQty > 0) {
        consumeAvail(avail, materialId, consumableQty);
        committedMaterials[materialId] = (committedMaterials[materialId] ?? 0) + consumableQty;
      }

      const deficit = neededQty - consumableQty;
      if (deficit > 0) {
        deficits[materialId] = (deficits[materialId] ?? 0) + deficit;
      }
    }

    actions.push({
      itemId: item.id,
      instanceIndex: rowIndex,
      durabilityPercent,
      materialsNeeded,
      listSources,
    });
  }

  return {
    repairPlan: {
      actions,
      committedMaterials,
      deficits,
    },
    updatedAvail: avail,
  };
}

/**
 * Get the set of material itemIds used in repair costs for items that appear in lists.
 * These materials should be protected from recycling.
 */
export function getRepairMaterialIds(
  itemsMap: ItemsMap,
  ownedItemRows: OwnedItemDisplayRow[],
  listItems: Set<ItemId>,
): Set<ItemId> {
  const materialIds = new Set<ItemId>();

  for (const row of ownedItemRows) {
    if (!listItems.has(row.itemId)) continue;
    const item = itemsMap[row.itemId];
    if (!item?.repairCost) continue;
    const durabilityPercent = row.durabilityPercent ?? 100;
    if (durabilityPercent >= REPAIR_THRESHOLD_PERCENT) continue;
    for (const materialId of Object.keys(item.repairCost)) {
      materialIds.add(materialId);
    }
  }

  return materialIds;
}
