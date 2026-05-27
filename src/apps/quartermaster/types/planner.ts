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

export type ListType = 'user' | 'hideout';

export interface RequiredSource {
  listId: string;
  listName: string;
  quantity: number;
  listType: ListType;
  impactedTargetItemIds?: string[];
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

// Weapon Upgrade Plan (CR-010)
export interface WeaponUpgradeStep {
  benchId: BenchId;
  fromItemId: ItemId;
  toItemId: ItemId;
  qty: Qty;
  upgradeCost: Record<ItemId, Qty>;
  stationLevelRequired: 1 | 2 | 3;
  isFullySatisfiable: boolean;
}

export interface WeaponUpgradePlan {
  steps: WeaponUpgradeStep[];
}

// Recycling Plan (section 6.8.5)
export interface RecycleActionReason {
  listId: string;
  listName: string;
  targetItemId: ItemId;
  targetItemName: string;
  producedItemId: ItemId;
  producedItemName: string;
  chainItemIds: ItemId[];
  chainLabel: string;
  quantityCovered: Qty;
}

export type RecycleSourcePriorityGroup = 'normal' | 'direct_recipe_input';

export interface RecycleSourcePriorityWarning {
  targetItemId: ItemId;
  targetItemName: string;
  listId: string;
  listName: string;
}

export interface RecycleAction {
  srcItemId: ItemId;
  qtyToRecycle: Qty;
  yields: Record<ItemId, Qty>;
  reasons: RecycleActionReason[];
  sourcePriorityGroup?: RecycleSourcePriorityGroup;
  sourcePriorityWarnings?: RecycleSourcePriorityWarning[];
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
  remainingIngredientDeficits: Record<ItemId, Qty>;

  planRows: PlanRow[];

  craftPlan: CraftPlan;
  weaponUpgradePlan: WeaponUpgradePlan;
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
  totalWeaponUpgradeStepsCount: number;
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
