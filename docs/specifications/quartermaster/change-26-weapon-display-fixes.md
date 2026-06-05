# Change-26: Weapon Display Fixes (My Items Icon, Blueprint Lock, Cumulative Recipe)

## Status
Implemented

## Summary
Three fixes to the My Items view and item overlay for weapons: suppress quantity badge on unstacked weapon rows, propagate blueprint lock (and bench requirement) from tier 1 base weapons to all higher tiers, and show the cumulative crafting recipe in the tooltip for tier 2+ weapons.

## Motivation
The My Items view renders weapons one-by-one (unstacked) when they have `repairCost`, but each icon still shows the aggregate owned quantity — e.g. "3" on each of 3 individual KBR Longshot tiles. This is misleading because each tile represents a single instance.

Higher-tier weapons (tier 2–4) are currently invisible to the blueprint-lock system. The tier 1 base weapon carries the `blueprintLocked` flag and the red lock icon, but upgrading through tiers is also blocked behind the same blueprint. The user has no way to see this — higher-tier weapons show no red lock, no uncraftable status, and no bench requirement.

The item tooltip for tier 2+ weapons shows only the direct upgrade cost (not the full investment from scratch), making it difficult to understand the total materials needed.

---

## Requirements

### R1 — Suppress Quantity Badge on Unstacked Rows

**R1.1** — In the StashView (`My Items` table), when a row is unstacked (`instanceIndex !== undefined`), the `ItemIcon` must not display the quantity overlay badge (`showQuantity = false`). Each unstacked row represents a single instance; the aggregate total is irrelevant on a per-instance icon.

**R1.2** — Stacked rows (items without `repairCost`) continue to show their quantity overlay as before.

**R1.3** — The `ownedQuantity` value passed to `ItemTooltip` remains the aggregate total, so the tooltip "have" pill continues to show the correct overall count.

---

### R2 — Propagate Blueprint Lock to Higher-Tier Weapons

**R2.1** — `computeCraftability` propagates blueprint lock status from tier 1 base weapons to all higher-tier family members (weapons with the same `weaponBaseId` and `weaponTier > 1`). When the base weapon is blueprint-locked (`blueprint.satisfied === false`), every family member receives:
- `hasRecipe: true` (to trigger the red lock icon)
- `canCraft: false`
- The same `blueprint` condition (`{ satisfied: false, label: "Blueprint", detail: "Not learned" }`)

**R2.2** — The red lock icon (the `Lock` icon from lucide-react in `ItemIcon.tsx`) now appears on tier 2–4 weapons whose tier 1 base weapon blueprint is not learned.

**R2.3** — The tooltip craft conditions section shows the blueprint condition row for affected higher-tier weapons.

**R2.4** — `planWeaponUpgradeTarget` adds the `targetId` (the higher-tier weapon) to `state.blueprintBlockers` when the root weapon crafting fails due to a blueprint lock. This ensures the StashView status column shows "Blocked: blueprint not unlocked" for the tier 2+ target, not only for the tier 1 base.

**R2.5** — The cumulative recipe condition crafted from R3 renders the bench requirement row from the base weapon on tier 2+ items in the tooltip (see R3.3).

---

### R3 — Cumulative Crafting Recipe for Higher-Tier Weapons

**R3.1** — A new helper `computeWeaponCumulativeRecipe(item, itemsMap)` walks the upgrade chain from the tier 1 base weapon to the current item, summing:
- Tier 1 base `recipe` costs (once)
- Every `upgradeCost` along the path from base to current tier

It returns a flat `Record<ItemId, Qty>` of cumulative materials.

**R3.2** — In `ItemTooltip`, when `item.weaponTier > 1` and a `weaponBaseId` exists, the "Crafting Recipe" section uses `computeWeaponCumulativeRecipe` instead of `item.recipe`. The section header changes to **"Crafting Recipe (including Upgrades)"** to signal that the displayed materials include all upgrade steps.

**R3.3** — The craft conditions area (bench and blueprint) in the tooltip uses the propagated `craftability` from R2, so tier 2+ weapons show both the base weapon's blueprint condition and the base weapon's bench requirement.

**R3.4** — Tier 1 base weapons are unaffected: they continue to show their direct `item.recipe` with the standard "Crafting Recipe" header.

---

## Design Rationale

**Why propagate instead of duplicating?** The tier 1 base weapon is the authoritative owner of the blueprint and bench data. Propagating from the base ensures consistency and avoids duplicating `blueprintLocked` flags in the data layer. The `weaponBaseId` / `weaponTier` metadata already links the family; it is the natural graph edge for inheritance.

**Why cumulative recipe?** The game UI only shows upgrade cost for tier transitions. Showing the full cumulative investment (base craft + N upgrades) gives the player an honest picture of the total materials required.

**Why suppress quantity on unstacked icons?** Unstacked rows already communicate "each row is one item" through the durability bar and instance-specific location labels. Showing the aggregate on each instance is redundant and creates visual noise. The aggregate is preserved in the tooltip's "have" pill.

---

## Files Summary

### Modified Files

| File | Change |
|------|--------|
| `src/apps/quartermaster/components/views/StashView.tsx` | Add `showQuantity={ownedItem.instanceIndex === undefined}` to `ItemIcon` props for unstacked rows (R1.1) |
| `src/apps/quartermaster/utils/planner/greedyPlanner.ts` | In `computeCraftability`: propagate blueprint and bench from base to higher-tier weapons (R2.1). In `planWeaponUpgradeTarget`: add targetId to `blueprintBlockers` when root crafting fails (R2.4) |
| `src/apps/quartermaster/components/ItemTooltip.tsx` | Add `computeWeaponCumulativeRecipe` helper (R3.1); use cumulative recipe and "including Upgrades" header for tier 2+ weapons (R3.2–R3.4) |
| `src/shared/i18n/locales/en.json` | Add `quartermaster.itemTooltip.craftingRecipeIncludingUpgrades` key (R3.2) |
| `src/apps/quartermaster/utils/planner/__tests__/blueprintCraftability.test.ts` | Update test expectation for `blueprintBlockers` to include `anvil_iv` (R2.4) |

### NOT Modified

| File | Reason |
|------|--------|
| `src/apps/quartermaster/components/ItemIcon.tsx` | Red lock logic (`showRedLock = craftability?.hasRecipe && !craftability?.canCraft`) unchanged; works correctly with propagated `craftability` from R2 |
| `src/apps/quartermaster/types/planner.ts` | `CraftabilityInfo` interface unchanged |
| `src/apps/quartermaster/utils/api.ts` | Unstacking logic (`addOwnedItem` with `repairCost`) unchanged |
| `scripts/generate-items.ts` | Weapon chain metadata (`weaponBaseId`, `weaponTier`) already generated correctly |

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Tier 1 blueprint is unlocked | No blueprint condition shown on tier 2+; bench info still propagated if base has it |
| Tier 1 has no bench info (`craftBench` missing) | No bench condition propagated (only blueprint lock condition, if applicable) |
| Weapon with `weaponTier > 1` but missing `weaponBaseId` | Cumulative recipe and propagation skipped; standard tooltip shown |
| Upgrade chain is broken (missing intermediate tier data) | `computeWeaponCumulativeRecipe` stops at the first missing link; returns whatever was accumulated |
| Item has no inventory synced (`ownedQuantity === null`) | Quantity badge suppressed as usual; tooltip shows "?" for have pill |
| Weapon is stacked (no `repairCost`) | Quantity badge shown normally; no change |
| Item has `repairCost` but `durabilityPercent` is undefined | Defaults to 100%; row is still unstacked; quantity still suppressed |
