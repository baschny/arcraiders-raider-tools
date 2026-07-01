# Change 35 — In-Raid Deficit Fix & Craftable Item Indicators

**Status:** Proposed

## Summary

The In-Raid suggestion pipeline operates on stale deficit data: items the greedy planner has fully satisfied through crafting still retain their pre-planner deficit values, causing them to leak into the "Crafting Materials" section of the In-Raid view despite having no actual loot requirement. This change fixes the data pipeline and adds yellow "CRAFTABLE" indicators throughout the UI so users can distinguish between items they must physically loot in raids (red) and items they can produce from stash materials (yellow).

---

## Motivation

### Bug: Satisfiable targets leak into In-Raid suggestions

`PlannerResult.deficit` is computed as `max(0, required - owned)` *before* the greedy planner runs (`index.ts` line 113-117). Satisfiable targets retain their full deficit even after the planner resolves the entire shortfall through crafting. Pipeline 2 (`inRaidSuggestions.ts` line 178) checks `deficits[itemId] > 0` and tags these items as `BRING_HOME_DIRECT_MATERIAL` — placing them in the In-Raid view with a yellow Bring Home icon even though the user can craft them entirely from stash materials they already own.

**Example**: Medical Lab Tier 3 requires 6 Antiseptic. The planner determines all 6 are craftable from stash materials (`satisfiableTargets` includes Antiseptic). Yet Antiseptic appears in "Crafting Materials" with a yellow Bring Home badge, cluttering the In-Raid view and confusing the user about whether the item is needed from raids. The red deficit badge on the item also shows "6" as if 6 Antiseptic must be looted.

### UX Gap: No visual distinction between must-loot and can-craft

When an item is partially satisfiable (need 10 total, planner can craft 7 from stash, must loot 3), the current UI shows a single red badge — either "3 NEEDED" in the tooltip or "3" on the item icon. This hides the 7 craftable units entirely from the user's immediate view. The user only discovers those 7 units are satisifiable by navigating to the Crafting view.

This is especially confusing in My Items, list views, and item tooltips where the user sees "Need 6 more for Medical Lab Tier 3" when 6 can actually be crafted. There is no indicator that tells the user "you don't need to raid for this — go craft it instead."

---

## Requirements

### R1 — Compute merged post-planner deficit map

**File(s)**: `src/apps/quartermaster/utils/planner/index.ts`

**Change type**: modification

**Detail**: After the greedy planner runs (line 129), compute a `mergedDeficit` map that zeroes out satisfiable targets and merges with remaining ingredient deficits:

```ts
// Zero out satisfiable targets — planner resolved them via crafting
const mergedDeficit: Record<ItemId, Qty> = { ...deficit };
for (const targetId of greedyResult.satisfiableTargets) {
  delete mergedDeficit[targetId];
}
// Merge remaining ingredient deficits (planner couldn't source these)
for (const [itemId, qty] of Object.entries(remainingIngredientDeficits)) {
  mergedDeficit[itemId] = Math.max(mergedDeficit[itemId] ?? 0, qty);
}
```

Pass `mergedDeficit` to `generateInRaidSuggestions` as the `deficits` argument instead of the current `lootDeficits` (line 156). The `lootDeficits` / current `deficits` contains stale pre-planner values for satisfiable targets; `mergedDeficit` has them zeroed so Pipeline 2 correctly skips them.

Store `mergedDeficit` in `PlannerResult` as the `deficit` field, replacing the stale pre-planner value. The `deficit` field in `PlannerResult` currently holds the pre-planner `max(0, required - owned)` — from this point forward it must hold the *post-planner* unmet deficit.

Update `totalMissingItemsCount` (line 192) to count from `mergedDeficit` instead of `deficit`.

Update `buildBlockerSummary` call (line 166): it uses `deficit` to find missing base materials. Pass `mergedDeficit` instead. In `deficit.ts`, update `buildBlockerSummary` parameter naming for clarity but no logic change needed — merging removes entries for satisfiable targets, which affects which items appear as missing base materials. This is correct because satisfiable targets are not "missing" base materials — they can be crafted.

Update `getMissingItemsCount` (called at line 192) to receive `mergedDeficit`.

Update `createEmptyResult()` (line 211-238) to match the new shape.

### R2 — Compute craftable quantity per item

**File(s)**: `src/apps/quartermaster/utils/planner/index.ts`, `src/apps/quartermaster/types/planner.ts`

**Change type**: addition

**Detail**: Add `craftableQty: Record<ItemId, Qty>` to the `PlannerResult` interface. Compute it after `buildPlanRows` returns (line 163), using planRows which contain the `required` and `have` (raw owned) for every needed item:

```ts
const craftableQty: Record<ItemId, Qty> = {};
for (const row of planRows) {
  const rawShortfall = Math.max(0, row.required - row.have);
  const unmet = mergedDeficit[row.itemId] ?? 0;
  const craftable = rawShortfall - unmet;
  if (craftable > 0) {
    craftableQty[row.itemId] = craftable;
  }
}
```

**Logic**: `rawShortfall = required - have` is the total amount the planner needs to cover. `mergedDeficit` is what remains unmet after planning. Therefore `rawShortfall - mergedDeficit` is the amount the planner successfully covered through crafting, recycling, and weapon upgrade paths. Only items with `craftable > 0` have entries in the map.

**Examples**:
- Antiseptic (fully satisfiable): required=6, have=0, rawShortfall=6, mergedDeficit=0. craftableQty=6.
- ItemX (need 10, craftable 7, must loot 3): required=10, have=0, rawShortfall=10, mergedDeficit=3. craftableQty=7.
- ItemY (must loot entirely): required=4, have=0, rawShortfall=4, mergedDeficit=4. craftableQty=0 (no entry).
- ItemZ (partially owned, need 6, own 2, craftable 4): required=6, have=2, rawShortfall=4, mergedDeficit=0. craftableQty=4.
- ItemW (ingredient only, demand=5, own=1, planner needed 4 more, sourced 3 from recycling, still short 1): planRow required=5, have=1, rawShortfall=4, remainingIngredientDeficit for this item=1, mergedDeficit=1. craftableQty=3.

Return `craftableQty` in `PlannerResult` and add to `createEmptyResult()` as `{}`.

### R3 — Add deficit badge rendering to shared ItemIcon

**File(s)**: `src/apps/quartermaster/components/ItemIcon.tsx`, `src/apps/quartermaster/styles/_item-icon.scss`

**Change type**: addition

**Detail**: Add an optional `deficitBadge` prop to `ItemIcon`:

```ts
export interface ItemIconDeficitBadge {
  craftable: number;   // quantity satisfiable through crafting (yellow)
  missing: number;     // quantity that must be looted (red)
}

// Add to ItemIconProps:
deficitBadge?: ItemIconDeficitBadge;
```

**Rendering rules** in `ItemIcon`:

- If `craftable > 0 && missing > 0`: Render a single split badge — left portion yellow (`#ffd700`) with craftable count, right portion red (`#f44336`) with missing count, both within a single visual badge separated by padding (no vertical divider line). The badge has a single rounded-rect background using `background: linear-gradient(to right, #ffd700 0%, #ffd700 50%, #f44336 50%, #f44336 100%)`. Two child `<span>` elements display the numbers with padding between them.

- If `craftable > 0 && missing === 0`: Render a single yellow badge with craftable count. `background: #ffd700`.

- If `missing > 0 && craftable === 0`: Render a single red badge with missing count. `background: #f44336`.

- If both 0 or prop not provided: Render nothing.

Position: Absolute, top-right corner (`top: -4px; right: -4px;`), matching the current position of inline deficit badges in views. `z-index: 2` to overlay the item icon. `border-radius: 999px`. `min-width: 20px; height: 20px`. `font-size: 10px; font-weight: 800; color: #fff`. `box-shadow: 0 2px 4px rgba(0,0,0,0.3)`. `border: 1px solid rgba(255,255,255,0.2)`.

**SCSS classes** in `_item-icon.scss`:
- `.item-icon__deficit-badge` — base (absolute positioning, dimensions, font, border-radius)
- `.item-icon__deficit-badge--craftable` — `background: #ffd700`
- `.item-icon__deficit-badge--missing` — `background: #f44336`
- `.item-icon__deficit-badge--split` — `background: linear-gradient(to right, #ffd700 0%, #ffd700 50%, #f44336 50%, #f44336 100%)`
- `.item-icon__deficit-badge__half` — child span styling: `padding: 0 2px`, `display: inline-block`

For the split badge, use a wrapper `<span>` with class `--split` containing two child `<span>` elements — the first with the craftable count, the second with the missing count. The gradient provides the visual split; padding between the children provides the separation. No vertical divider.

### R4 — Replace inline deficit badges in views with ItemIcon.deficitBadge

**File(s)**: `src/apps/quartermaster/components/views/InRaidView.tsx`, `QuestsView.tsx`, `ProjectsView.tsx`, `HideoutView.tsx`

**Change type**: modification

**Detail**: In each view, replace the inline `<span className="...__item-missing-badge">` element with a `deficitBadge` prop on the existing `<ItemIcon>` component.

**InRaidView** (`InRaidView.tsx`):

Current code (~lines 338-367):
```tsx
const deficit = plannerResult.deficit[suggestion.itemId] ?? 0;
const required = plannerResult.required[suggestion.itemId] ?? 0;
// ...later in the render:
{deficit > 0 && (
  <span className="in-raid-view__item-missing-badge" title={...}>
    {deficit}
  </span>
)}
```

Replacement: Pass `deficitBadge` to `<ItemIcon>`. Compute values from `plannerResult.craftableQty` and `plannerResult.deficit` (now = mergedDeficit). After the R1 fix, satisfiable items won't appear in InRaidView at all, so `craftable` will typically be 0 for InRaid items. The badge will show red "missing" only. Remove the inline `<span>` and the `deficit`/`required` variables if no longer needed elsewhere.

```tsx
<ItemIcon
  itemId={suggestion.itemId}
  // ...existing props...
  deficitBadge={{
    craftable: plannerResult.craftableQty[suggestion.itemId] ?? 0,
    missing: plannerResult.deficit[suggestion.itemId] ?? 0,
  }}
/>
```

**QuestsView** (`QuestsView.tsx`, ~lines 400-441):

Current: computes `Math.max(0, listItem.quantity - owned)` per item, renders `<span className="quests-view__item-missing-badge">`.

Replacement: Pass `deficitBadge` to `<ItemIcon>`. The `owned` and `listItem.quantity` are available locally; compute craftable/missing using the same allocation logic described in R5 but applied per list item.

**ProjectsView** (`ProjectsView.tsx`, ~lines 548-597): Same pattern as QuestsView.

**HideoutView** (`HideoutView.tsx`, ~lines 534-574): Same pattern as QuestsView.

**Reminder**: After replacing the inline spans, remove the now-dead `__item-missing-badge` SCSS classes from:
- `_in-raid-view.scss` (`.in-raid-view__item-missing-badge` block)
- `_quests-view.scss` (`.quests-view__item-missing-badge` block)
- `_projects-view.scss` (`.projects-view__item-missing-badge` block)
- `_hideout-view.scss` (`.hideout-view__item-missing-badge` block)

Before deleting, grep the entire `src/apps/quartermaster/` directory for each class name to ensure no other component references them.

### R5 — Update ItemTooltip right column with craftable indicators

**File(s)**: `src/apps/quartermaster/components/ItemTooltip.tsx`, `src/apps/quartermaster/styles/_item-tooltip.scss`, `src/apps/quartermaster/utils/itemInsights.ts`

**Change type**: modification

**Detail**: 

**Step 1 — Per-list craftable allocation** (`itemInsights.ts`):

Current behavior: `addFinalNeeds` (line 133-159) computes `totalMissing = missingByItemId[itemId]`, then uses `allocateMissingToSources` (proportional, largest-remainder) to distribute `totalMissing` across sources sorted alphabetically.

New behavior: Replace the proportional + alphabetical allocation with first-come-first-serve by list priority order. The `requiredSourcesByItemId[itemId]` array preserves insertion order from `aggregateRequired()`, which processes lists in priority order (hideout → quest → project → user). Owned quantity is allocated first, then craftable quantity, then the remainder becomes missing — all first-come-first-serve by source priority.

```ts
function allocateFirstComeFirstServe(
  sources: RequiredSource[],
  ownedQty: number,
  craftableQty: number,
  deficitQty: number,
): Array<{ owned: number; craftable: number; missing: number }> {
  let ownedRemaining = ownedQty;
  let craftableRemaining = craftableQty;
  let deficitRemaining = deficitQty;

  return sources.map((source) => {
    // Owned first
    const owned = Math.min(ownedRemaining, source.quantity);
    ownedRemaining -= owned;
    let unmet = source.quantity - owned;

    // Craftable second
    const craftable = Math.min(craftableRemaining, unmet);
    craftableRemaining -= craftable;
    unmet -= craftable;

    // Remaining is missing
    const missing = Math.min(deficitRemaining, unmet);
    deficitRemaining -= missing;

    return { owned, craftable, missing };
  });
}
```

Sources must be passed in their original insertion order (priority order from `requiredSourcesByItemId`), not sorted alphabetically. Remove the `sort((a,b) => a.listName...)` call at line 145.

The `finalListNeeds` entries need a new field `craftable: number`. Add to `ItemFinalListNeed` interface.

**Step 2 — Update badge renderers** (`ItemTooltip.tsx`):

`renderNeededBadge` (lines 58-63): Add a `craftable` parameter. When `craftable > 0 && missing > 0`, render two side-by-side badges in a flex group:

```tsx
function renderNeededBadge(missing: number, craftable: number, t: (key: string) => string) {
  if (missing <= 0 && craftable <= 0) {
    return <span className="qm-item-tooltip__needed-badge qm-item-tooltip__needed-badge--complete">
      {t('quartermaster.itemTooltip.complete')}
    </span>;
  }
  return (
    <span className="qm-item-tooltip__needed-badge-group">
      {craftable > 0 && (
        <span className="qm-item-tooltip__needed-badge qm-item-tooltip__needed-badge--craftable">
          {craftable} {t('quartermaster.itemTooltip.craftable')}
        </span>
      )}
      {missing > 0 && (
        <span className="qm-item-tooltip__needed-badge qm-item-tooltip__needed-badge--missing">
          {missing} {t('quartermaster.itemTooltip.needed')}
        </span>
      )}
    </span>
  );
}
```

Update all call sites (lines 487, 506, 525, etc.) to pass `need.craftable` as the second argument.

`renderCompleteBadge` (lines 50-55): Rename to accept a `craftable` parameter. When the item is not complete (`isComplete = false`) but has craftable quantity, add a yellow "CRAFTABLE" badge alongside the red "NEEDED" (used in crafting target groups at line 239).

**Step 3 — Derive per-item craftable for the tooltip**:

In `ItemTooltip`, compute a per-item craftable map from `plannerResult.craftableQty` and per-item owned from planRows:

```ts
const craftableByItemId = new Map<string, number>();
const ownedByItemId = new Map<string, number>();
for (const row of plannerResult.planRows) {
  craftableByItemId.set(row.itemId, plannerResult.craftableQty[row.itemId] ?? 0);
  ownedByItemId.set(row.itemId, row.have);
}
```

This is needed because the tooltip shows per-item info (missing, craftable) for crafting ingredients too, not just the target item being inspected.

**SCSS additions** (`_item-tooltip.scss`):
- `.qm-item-tooltip__needed-badge-group` — `display: inline-flex; gap: 4px; align-items: center;`
- `.qm-item-tooltip__needed-badge--craftable` — `background: rgba(#ffd700, 0.9); color: #1a1a1a; border-radius: 4px; padding: 1px 6px; font-size: 11px; font-weight: 600;`

### R6 — Update StashView with craftable indicators

**File(s)**: `src/apps/quartermaster/components/views/StashView.tsx`, `src/apps/quartermaster/styles/_stash-view.scss`

**Change type**: modification

**Detail**: Currently the StashView status column (lines 413-452) shows red "Need N more (source requires Y, you own Z)" when `missing > 0`. Add a yellow "Can craft N more" indicator when the item has craftable quantity, placed alongside or above the missing indicator.

Compute per-item craftable and deficit from plannerResult:
```ts
const craftableQty = plannerResult.craftableQty[ownedItem.itemId] ?? 0;
const deficit = plannerResult.deficit[ownedItem.itemId] ?? 0;
```

**Rendering logic**:
- If `craftableQty > 0 && deficit === 0` (fully satisfiable): Yellow indicator `"Can craft {craftableQty} more ({source} requires {required}, you own {owned})"`. No red indicator.
- If `craftableQty > 0 && deficit > 0` (partial): Two indicators — yellow `"Can craft {craftableQty}"` above red `"Need {deficit} more ({source} requires {required}, you own {owned})"`.
- If `deficit > 0 && craftableQty === 0` (must loot): Red indicator only (unchanged from current).

New i18n key: `quartermaster.stash.status.canCraftMore: "Can craft {count} more ({source} requires {required}, you own {owned})"`.

New SCSS class: `stash-view__indicator--craftable` with yellow `#ffd700` background.

### R7 — Ensure CraftingView passes craftableQty to tooltip context

**File(s)**: `src/apps/quartermaster/components/views/CraftingView.tsx`

**Change type**: modification

**Detail**: The CraftingView already passes `plannerResult` in `tooltipContext` to `ItemIcon`. No code change is needed for the tooltipContext construction itself — `plannerResult.craftableQty` will be available through the existing `plannerResult` spread.

However, ensure that items rendered in the CraftingView that have `deficit > 0 && craftableQty > 0` pass a `deficitBadge` to `ItemIcon` (via R4 pattern). Items in the craft plan are by definition fully satisfiable (they wouldn't be in the plan otherwise), so they should show `missing: 0` or no badge.

### R8 — i18n keys

**File(s)**: `src/shared/i18n/locales/en.json`

**Change type**: addition

**Detail**: Add the following new keys (do NOT modify any existing key values per AGENTS.md translation workflow rules):

```json
"quartermaster.itemTooltip.craftable": "CRAFTABLE",
"quartermaster.stash.status.canCraftMore": "Can craft {count} more ({source} requires {required}, you own {owned})"
```

**Note**: The existing key `quartermaster.itemTooltip.needed` (value `"Needed"`) is kept unchanged. The red badges continue to use `"Needed"` text. The new `"CRAFTABLE"` key is used exclusively for the yellow craftable badge.

### R9 — SCSS additions

**File(s)**: `src/apps/quartermaster/styles/_item-icon.scss`, `_item-tooltip.scss`, `_stash-view.scss`, `_variables.scss`

**Change type**: addition

**Detail**:

1. **`_variables.scss`**: Add `$status-craftable: #ffd700;` for semantic clarity (reuses the color value of `$status-available`).

2. **`_item-icon.scss`**: Add deficit badge styles per R3.

3. **`_item-tooltip.scss`**: Add craftable badge style per R5 Step 3.

4. **`_stash-view.scss`**: Add `&__indicator--craftable` with `background: #ffd700; color: #1a1a1a;` (dark text on yellow for readability).

### R10 — Remove dead SCSS

**File(s)**: `src/apps/quartermaster/styles/_in-raid-view.scss`, `_quests-view.scss`, `_projects-view.scss`, `_hideout-view.scss`

**Change type**: removal

**Detail**: Remove `__item-missing-badge` CSS blocks from each file:

- `_in-raid-view.scss`: Remove `&__item-missing-badge { ... }` block (~lines 332-350)
- `_quests-view.scss`: Remove `&__item-missing-badge { ... }` block (~lines 213-230)
- `_projects-view.scss`: Remove `&__item-missing-badge { ... }` block (~lines 416-434)
- `_hideout-view.scss`: Remove `&__item-missing-badge { ... }` block (~lines 402-420)

Before deleting, run: `grep -r "item-missing-badge" src/apps/quartermaster/` to verify no other components reference these class names.

---

## Files Summary

### Modified Files

| File | Change |
|------|--------|
| `src/apps/quartermaster/types/planner.ts` | Add `craftableQty` to `PlannerResult`; add `craftable` to `ItemFinalListNeed` |
| `src/apps/quartermaster/utils/planner/index.ts` | Compute `mergedDeficit` and `craftableQty`; update return object, `createEmptyResult()`, `buildBlockerSummary` call, `totalMissingItemsCount` |
| `src/apps/quartermaster/utils/planner/deficit.ts` | Rename `deficits` param in `buildBlockerSummary` to `mergedDeficit` (cosmetic) |
| `src/apps/quartermaster/utils/itemInsights.ts` | Replace `allocateMissingToSources` with `allocateFirstComeFirstServe`; add `craftable` field to finalListNeeds; remove alphabetical sort of sources |
| `src/apps/quartermaster/components/ItemIcon.tsx` | Add `ItemIconDeficitBadge` type; add `deficitBadge` prop; render split badge per R3 |
| `src/apps/quartermaster/styles/_item-icon.scss` | Add deficit badge styles per R3 |
| `src/apps/quartermaster/components/ItemTooltip.tsx` | Add `craftable` param to `renderNeededBadge` / `renderCompleteBadge`; compute per-item craftable/owned maps; render dual badges per R5 |
| `src/apps/quartermaster/styles/_item-tooltip.scss` | Add `--craftable` badge style, `badge-group` flex style per R5 |
| `src/apps/quartermaster/components/views/InRaidView.tsx` | Replace inline deficit badge with ItemIcon `deficitBadge` per R4 |
| `src/apps/quartermaster/components/views/QuestsView.tsx` | Replace inline deficit badge with ItemIcon `deficitBadge` per R4 |
| `src/apps/quartermaster/components/views/ProjectsView.tsx` | Replace inline deficit badge with ItemIcon `deficitBadge` per R4 |
| `src/apps/quartermaster/components/views/HideoutView.tsx` | Replace inline deficit badge with ItemIcon `deficitBadge` per R4 |
| `src/apps/quartermaster/components/views/StashView.tsx` | Add craftable indicators in status column per R6 |
| `src/apps/quartermaster/components/views/CraftingView.tsx` | (Minimal: verify tooltipContext includes `craftableQty`; add `deficitBadge` to ItemIcon for items with deficit) |
| `src/apps/quartermaster/styles/_variables.scss` | Add `$status-craftable: #ffd700` |
| `src/apps/quartermaster/styles/_stash-view.scss` | Add `--craftable` indicator style per R6 |
| `src/shared/i18n/locales/en.json` | Add two new keys per R8 |
| `src/apps/quartermaster/styles/_in-raid-view.scss` | Remove `__item-missing-badge` block per R10 |
| `src/apps/quartermaster/styles/_quests-view.scss` | Remove `__item-missing-badge` block per R10 |
| `src/apps/quartermaster/styles/_projects-view.scss` | Remove `__item-missing-badge` block per R10 |
| `src/apps/quartermaster/styles/_hideout-view.scss` | Remove `__item-missing-badge` block per R10 |

### No files deleted

---

## Edge Cases & Behavior

| Scenario | Expected Behavior |
|----------|------------------|
| Item fully satisfiable (craftableQty=6, deficit=0) | **In Raid**: not shown. **ItemIcon**: yellow badge "6". **Tooltip**: "6 CRAFTABLE" yellow. **StashView**: "Can craft 6 more" yellow. |
| Item partially satisfiable (craftableQty=7, deficit=3) | **In Raid**: shown with missing=3 (red). **ItemIcon**: split badge "7" yellow + "3" red. **Tooltip**: "7 CRAFTABLE" yellow + "3 NEEDED" red side-by-side. **StashView**: "Can craft 7" yellow + "Need 3 more" red. |
| Item must be fully looted (craftableQty=0, deficit=6) | **In Raid**: shown with missing=6 (red). **ItemIcon**: red badge "6". **Tooltip**: "6 NEEDED" red. **StashView**: "Need 6 more" red. Unchanged from current. |
| Item owned in sufficient quantity (have >= required) | No deficit badge, no craftable badge. Tooltip: "Complete" green. StashView: "Have X/X" green. |
| Item is an ingredient only (not a direct list target) | craftableQty derived from planRow (which includes ingredient demand). If `remainingIngredientDeficits` has an entry, deficit > 0. Standard red/yellow split applies. |
| Item recycled/salvaged for materials AND a direct target | `planRow.required` includes both direct + ingredient demand. `mergedDeficit` uses `Math.max`. `craftableQty = rawShortfall - mergedDeficit` covers both uses. |
| `createEmptyResult()` (no lists configured) | `craftableQty: {}`, `deficit: {}`. All existing empty result behavior preserved. |
| Item appears in multiple views with different ItemIcon instances | Each view independently computes and passes `deficitBadge`. Consistent data from `plannerResult`. |
| `deficitBadge` prop not passed to ItemIcon (backward compat) | ItemIcon renders nothing for the deficit badge. All existing callers that don't pass the prop are unaffected. |
| Per-list craftable allocation with tied priorities | First-come-first-serve by array insertion order from `aggregateRequired()`. Insertion order: hideout → quest → project → user. Within same type, earliest list index wins. Deterministic. |
| CraftableQty contains items the user didn't mark as targets (ingredients) | These appear with craftable indicators in tooltips and may show yellow badges on icons in My Items. Correct — the planner identified them as craftable into needed targets. |
| `getMissingItemsCount()` after R1 | Must count from `mergedDeficit`. Previous `deficit` counted satisfiable targets as "missing" — R1 fixes this. |

---

## Rollout Strategy

### Phase 1: Data Pipeline Fix (R1, R2)
1. Compute `mergedDeficit` in `index.ts` — zero out satisfiable targets, merge ingredient deficits.
2. Update `PlannerResult.deficit` to use `mergedDeficit`. Update `createEmptyResult()`.
3. Pass `mergedDeficit` to `generateInRaidSuggestions` (the function reads `deficits[itemId] > 0` which will now correctly be 0 for satisfiable targets).
4. Compute `craftableQty` from planRows + mergedDeficit.
5. Add `craftableQty: Record<ItemId, Qty>` to `PlannerResult` type.
6. Update `getMissingItemsCount` and `buildBlockerSummary` to use mergedDeficit.
7. Run `npm run build` and `npm test` to verify compilation and existing tests pass.

### Phase 2: Shared ItemIcon Deficit Badge (R3, R4, R10)
1. Add `ItemIconDeficitBadge` type and `deficitBadge` prop to `ItemIcon`.
2. Add SCSS for deficit badges in `_item-icon.scss`.
3. Add `$status-craftable` to `_variables.scss`.
4. Update InRaidView, QuestsView, ProjectsView, HideoutView to pass `deficitBadge` instead of inline spans.
5. Remove dead `__item-missing-badge` SCSS from each view.
6. Run `npm run build` to verify no visual regressions.

### Phase 3: ItemInsights Allocation Update (R5 Step 1)
1. Replace `allocateMissingToSources` with `allocateFirstComeFirstServe` in `itemInsights.ts`.
2. Add `craftable` field to `ItemFinalListNeed` items.
3. Remove alphabetical sort of sources — preserve priority order.
4. Run `npm run build`.

### Phase 4: Tooltip & View Updates (R5 Step 2-3, R6, R7)
1. Update `renderNeededBadge` and `renderCompleteBadge` in `ItemTooltip.tsx` to accept craftable param and render dual badges.
2. Compute per-item craftable/owned maps in `ItemTooltip`.
3. Add craftable SCSS to `_item-tooltip.scss`.
4. Update all call sites in `ItemTooltip.tsx`.
5. Update `StashView.tsx` with craftable/missing split indicators.
6. Add `stash-view__indicator--craftable` SCSS.
7. Verify `CraftingView.tsx` passes `deficitBadge` where appropriate.
8. Add i18n keys to `en.json`.
9. Run `npm run build`.

### Phase 5: Verification
1. `npm run build` — full compilation.
2. `npm test` — ensure no regressions.
3. Manual: Medical Lab Tier 3 scenario — Antiseptic no longer in In Raid, yellow "6" craftable elsewhere.
4. Manual: Partially satisfiable item — verify split badge and dual tooltip indicators.
5. Manual: Item needed across multiple lists — verify first-come-first-serve allocation.
