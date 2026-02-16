/**
 * Loadout Aggregation
 * See specification section 6.1
 */

import type { StoredLoadout } from '../../types/loadout';
import type { ItemId, Qty, ReservationBreakdown, ReservationReason, ReasonType } from '../../types/planner';

// Tier order for future reservation priority (section 6.4.1)
// Currently only 'craft' tier is used in v1
// const TIER_ORDER: ReasonType[] = ['project', 'hideout', 'craft'];

/**
 * Aggregate required items from all enabled loadouts
 * Returns a map of itemId -> total required quantity
 */
export function aggregateRequired(loadouts: StoredLoadout[]): Record<ItemId, Qty> {
  const required: Record<ItemId, Qty> = {};

  // Only process enabled loadouts
  const enabledLoadouts = loadouts.filter(l => l.isEnabled);

  for (const loadout of enabledLoadouts) {
    // Only process enabled items within each loadout
    const enabledItems = loadout.items.filter(item => item.isEnabled);

    for (const item of enabledItems) {
      required[item.itemId] = (required[item.itemId] ?? 0) + item.quantity;
    }
  }

  return required;
}

/**
 * Generate reservation reasons for v1 (craft tier only)
 * See specification section 6.4.5
 */
export function generateReservationReasons(
  loadouts: StoredLoadout[]
): Map<ItemId, ReservationReason[]> {
  const reasonsMap = new Map<ItemId, ReservationReason[]>();

  // Only process enabled loadouts
  const enabledLoadouts = loadouts.filter(l => l.isEnabled);

  for (const loadout of enabledLoadouts) {
    const loadoutRef = `loadout:${loadout.id}`;

    // Only process enabled items
    const enabledItems = loadout.items.filter(item => item.isEnabled);

    for (const item of enabledItems) {
      const referenceId = `${loadoutRef}:${item.itemId}`;
      
      const reason: ReservationReason = {
        referenceId,
        requestedQty: item.quantity,
        allocatedQty: 0, // Will be computed during allocation
        shortfall: 0,    // Will be computed during allocation
      };

      const existing = reasonsMap.get(item.itemId) ?? [];
      existing.push(reason);
      reasonsMap.set(item.itemId, existing);
    }
  }

  // Sort reasons by referenceId within each itemId for determinism
  for (const [itemId, reasons] of reasonsMap.entries()) {
    reasons.sort((a, b) => a.referenceId.localeCompare(b.referenceId));
    reasonsMap.set(itemId, reasons);
  }

  return reasonsMap;
}

/**
 * Allocate inventory to reservation reasons
 * See specification section 6.4.3
 */
export function allocateReservations(
  stash: Record<ItemId, Qty>,
  reasonsMap: Map<ItemId, ReservationReason[]>
): ReservationBreakdown[] {
  const breakdowns: ReservationBreakdown[] = [];

  // Get all itemIds with reservations, sorted for determinism
  const itemIds = Array.from(reasonsMap.keys()).sort();

  for (const itemId of itemIds) {
    const reasons = reasonsMap.get(itemId) ?? [];
    const have = stash[itemId] ?? 0;
    let remaining = have;

    // v1: all reasons are 'craft' tier
    // Sort by referenceId for determinism (already done in generateReservationReasons)
    const allocatedReasons: ReservationReason[] = [];

    for (const reason of reasons) {
      const allocated = Math.min(reason.requestedQty, remaining);
      allocatedReasons.push({
        ...reason,
        allocatedQty: allocated,
        shortfall: reason.requestedQty - allocated,
      });
      remaining -= allocated;
    }

    const totalReserved = allocatedReasons.reduce((sum, r) => sum + r.allocatedQty, 0);

    breakdowns.push({
      itemId,
      totalReserved,
      tiers: [
        {
          reasonType: 'craft' as ReasonType,
          reasons: allocatedReasons,
        },
      ],
    });
  }

  // Sort breakdowns by itemId for determinism
  return breakdowns.sort((a, b) => a.itemId.localeCompare(b.itemId));
}

/**
 * Get count of active loadouts
 */
export function getActiveLoadoutsCount(loadouts: StoredLoadout[]): number {
  return loadouts.filter(l => l.isEnabled).length;
}
