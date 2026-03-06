/**
 * Quartermaster Planner Types
 * See specification section 6.8 for canonical output structures
 */

import type { BenchId } from './item';

// Core types (section 6.8.1)
export type ItemId = string;
export type Qty = number;

export type UncraftableReason = 'blueprint_or_bench' | 'cycle';

export type LootReason =
  | 'missing_direct'
  | 'recycle_yields_missing'
  | 'salvage_yields_missing';

export type LootBadge = 'CAN_SALVAGE' | 'BRING_HOME';

// Loadout badge for Current Loadout / Stash views (CR-MOD-7)
export type LoadoutBadge = 'HAVE' | 'CAN_CRAFT' | 'MISSING';

// Plan Table (section 6.8.2)
export interface PlanRow {
  itemId: ItemId;
  have: Qty;
  required: Qty;
  missing: Qty;
  badge: LoadoutBadge;

  isUncraftable: boolean;
  uncraftableReason?: UncraftableReason;
}

// Craft Plan (section 6.8.4)
export interface CraftStep {
  benchId: BenchId;
  itemId: ItemId;
  qty: Qty;
  stationLevelRequired: 1 | 2 | 3;
  blueprintLocked: boolean;
  isFullySatisfiable: boolean;
}

export interface CraftPlan {
  steps: CraftStep[];
}

// Recycling Plan (section 6.8.5)
export interface RecycleAction {
  srcItemId: ItemId;
  qtyToRecycle: Qty;
  yields: Record<ItemId, Qty>;
}

export interface RecyclePlan {
  actions: RecycleAction[];
}

// Loot Suggestions (section 6.8.6)
export interface LootSuggestion {
  itemId: ItemId;
  reasons: LootReason[];
  badge: LootBadge;
  impactedTargetsCount?: number;
}

export interface LootSuggestionList {
  items: LootSuggestion[];
}

// Blockers and Diagnostics (section 6.8.7)
export interface CycleDiagnostic {
  itemId: ItemId;
}

export interface BlockerSummary {
  missingBaseMaterials: ItemId[];
  benchBlockers: ItemId[];
  blueprintBlockers: ItemId[];
  craftCycleBlockers: ItemId[];
  cycleDiagnostics: CycleDiagnostic[];
}

// Top-Level Planner Result (section 6.8.8)
export interface PlannerResult {
  required: Record<ItemId, Qty>;
  deficit: Record<ItemId, Qty>;

  planRows: PlanRow[];

  craftPlan: CraftPlan;
  recyclePlan: RecyclePlan;
  lootSuggestions: LootSuggestionList;

  blockers: BlockerSummary;

  /** Set of fully satisfiable target itemIds */
  satisfiableTargets: Set<ItemId>;

  activeListsCount: number;
  totalMissingItemsCount: number;
  totalRecycleActionsCount: number;
  totalCraftStepsCount: number;
}

// Advisory badge for Current Loadout view (section 7.3.2)
export type AdvisoryBadge = 'KEEP' | 'RECYCLE' | 'DISCARD';

// Stash and API data
export interface StashItem {
  itemId: ItemId;
  quantity: Qty;
}

export interface CurrentLoadoutItem {
  itemId: ItemId;
  quantity: Qty;
  slot?: string;
}

export interface SyncState {
  stash: StashItem[];
  stashTimestamp: Date | null;
  currentLoadout: CurrentLoadoutItem[];
  loadoutTimestamp: Date | null;
  benchLevels: Record<BenchId, number>;
}
