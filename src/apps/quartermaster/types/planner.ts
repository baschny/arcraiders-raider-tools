/**
 * Quartermaster Planner Types
 * See specification section 6.8 for canonical output structures
 */

import type { BenchId } from './item';

// Core types (section 6.8.1)
export type ItemId = string;
export type Qty = number;

export type UncraftableReason = 'blueprint_locked' | 'insufficient_bench_level' | 'missing_bench' | 'cycle';

export type LootReason =
  | 'missing_direct'
  | 'recycle_yields_missing'
  | 'salvage_yields_missing';

export type LootBadge = 'CAN_SALVAGE' | 'BRING_HOME';

// In-Raid acquisition types (CR-005)
export type InRaidReason =
  | 'BRING_HOME_FINAL_TARGET'
  | 'BRING_HOME_DIRECT_MATERIAL'
  | 'SALVAGE_FOR_MATERIAL'
  | 'BRING_HOME_FOR_RECYCLE_YIELD';

export interface RequiredSource {
  listId: string;
  listName: string;
  quantity: number;
}

export interface InRaidSuggestion {
  itemId: ItemId;
  reasons: InRaidReason[];
  badge: LootBadge;
  impactedTargetItemIds: string[];
  listSources?: RequiredSource[];
}

// Requirement badge for planner rows and My Items status (CR-MOD-7)
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

// Loot Suggestions (section 6.8.6) - legacy
export interface LootSuggestion {
  itemId: ItemId;
  reasons: LootReason[];
  badge: LootBadge;
  impactedTargetsCount?: number;
}

export interface LootSuggestionList {
  items: LootSuggestion[];
}

// In-Raid Suggestion List (CR-005)
export interface InRaidSuggestionList {
  items: InRaidSuggestion[];
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
  inRaidSuggestions: InRaidSuggestionList;

  /** Per-item list provenance (CR-003) */
  requiredSourcesByItemId: Record<ItemId, RequiredSource[]>;

  blockers: BlockerSummary;

  /** Set of fully satisfiable target itemIds */
  satisfiableTargets: Set<ItemId>;

  activeListsCount: number;
  totalMissingItemsCount: number;
  totalRecycleActionsCount: number;
  totalCraftStepsCount: number;
}

// Advisory badge for legacy planner recommendations (section 7.3.2)
export type AdvisoryBadge = 'KEEP' | 'RECYCLE' | 'DISCARD';

// Stash and API data
export interface OwnedItemQuantity {
  itemId: ItemId;
  quantity: Qty;
}

export type OwnedItemLocation =
  | {
      source: 'stash';
      quantity: Qty;
      hasAttachments?: boolean;
    }
  | {
      source: 'loadout';
      quantity: Qty;
      hasAttachments?: boolean;
    }
  | {
      source: 'stash_attachment' | 'loadout_attachment';
      quantity: Qty;
      parentItemId: ItemId;
      parentName: string;
    };

export interface OwnedItemDisplayRow extends OwnedItemQuantity {
  locations: OwnedItemLocation[];
}

export type StashItem = OwnedItemQuantity;

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
