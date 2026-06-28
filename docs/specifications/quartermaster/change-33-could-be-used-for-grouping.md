# Change 33 - Group Tooltip Could-Be-Used-For Entries

## Status
Implemented

## Problem

The item tooltip's **Could be used for** section currently renders each recycle/salvage advisory usage as a separate row. This makes useful provenance technically visible but hard to scan.

Example: `Magnetic Accelerator` can recycle into `Advanced Mechanical Components`, and that yield can help several active weapon targets. The current layout repeats a compact `yield -> target` row for every target, which hides the first action the player should consider: recycling the hovered item into a useful material.

The change introduced by Change 31 intentionally expanded advisory provenance for upgrade-chain materials. The data is useful, but the tooltip layout should now organize it around player action.

## Required Behavior

### R1 - Group By First Action and Yield

The **Could be used for** section groups entries by the first action to perform with the hovered item and the yield material produced by that action.

Group headline format:

```text
POSSIBLE USE AFTER RECYCLING: ADVANCED MECHANICAL COMPONENTS
```

Rules:

- Do not show a generic **Could be used for** headline above the groups.
- Do not show an action icon in the group headline.
- Do not show the yielded item icon in the group headline.
- Show `Possible Use After Recycling: <yield item name>` for recycle groups.
- Show `Possible Use After Salvage: <yield item name>` for salvage groups.
- The group itself must not be wrapped in a card; only the per-list rows remain card-like.
- The headline replaces repeated inline `x1 ->` usage rows.

### R2 - Prefer Recycle Over Salvage For Duplicate Yields

If the same hovered item can both recycle and salvage into the same yield material, show only the Recycle group.

Rules:

- Recycle is preferred because it is the clearer first action for this tooltip section.
- Suppressing the duplicate Salvage group is presentation-only.
- Do not remove salvage data from the item's static `Salvages Into` section.
- Do not change planner behavior or In Raid suggestion behavior.

### R3 - Target Layout Matches Crafting Why Rows

Inside each action/yield group, targets use the same shared advisory target layout as the tooltip's **Possible Craft Uses** section.

For each target item:

- Show a compact target header outside the list-card layout:
  - target item small icon at 18px with a 1px border
  - target item name in uppercase
- Under the target header, show list cards:
  - list-type icon
  - list name
  - required quantity badge, e.g. `3x`
  - completion or needed badge

This removes the current inline `yield -> target` row style.

### R3.1 - Rename and Reformat Crafting Advisory Uses

The tooltip's crafting provenance section is advisory and must be labeled **Possible Craft Uses** instead of **Needed for Crafting (Direct / Indirect)**.

Rules:

- Use the same shared advisory target layout as recycle/salvage groups.
- Show the target item icon at 18px with a 1px border.
- Show the target item name in uppercase.
- Show the list card below the target header with list icon, list name, desired quantity badge, and completion/needed badge.
- Use a single subtle dotted divider before the first advisory section only when the tooltip has both direct **Needed for Lists** rows and advisory possible-use sections.
- Do not show the divider between individual advisory sections.
- Do not show the divider when the tooltip only has advisory possible-use sections.

### R4 - List Quantities and Missing State

The list card should use the final target's list source information where available.

Rules:

- Resolve quantity and missing count by looking up `itemInsights[usage.targetItemId].finalListNeeds` by `usage.listId`.
- If a matching final-list need exists, use its `quantity`, `missing`, `isComplete`, and `listType`.
- If no matching final-list need exists, fall back to existing usage data:
  - `usage.listType`
  - `usage.isComplete`
  - `usage.yieldQuantity` as a last-resort quantity display
  - `Needed` status without a numeric missing count if no better missing value is available

### R5 - Preserve Advisory Semantics

The section remains advisory even though the insight generation is narrowed.

- `Possible Craft Uses` and `Possible Use After...` sections remain advisory.
- It does not mean the player must recycle/salvage the item.
- It is not filtered out solely because the target is complete or currently owned in sufficient quantity; it helps the player decide whether to keep or sell the item for future repeats.
- It does not change protected-from-recycling behavior.
- It does not change committed recycle actions.
- It does not change useless-filter relevance.

### R5.1 - Limit Advisory Recycle/Salvage Provenance To Direct Target Materials

Advisory recycle/salvage provenance must stay close to paths a player would plausibly use.

Rules:

- For each active target, inspect only the target's advisory dependency recipe.
- A source item receives a **Could be used for** usage only when it recycles or salvages into a direct material in that advisory dependency recipe.
- Advisory dependency recipes include cumulative upgrade-chain direct materials, so an item that yields a direct upgrade material for a tracked higher-tier target still appears.
- Do not traverse deeper material chains for this section.
- Keep the broader crafting dependency provenance for `Possible Craft Uses`; only recycle/salvage advisory provenance is narrowed.

Examples:

- `Magnetron -> Magnetic Accelerator -> Hullcracker` remains valid when `Magnetic Accelerator` is a direct advisory material for `Hullcracker`.
- `Angled Grip I -> Plastic -> Electrical Components -> Advanced Electrical Components -> Looting Mk. 3` is suppressed because `Plastic` is not a direct advisory material for `Looting Mk. 3`.

### R6 - Suppress Self-Target Recycle/Salvage Suggestions

An item must not receive a **Could be used for** suggestion where the final target item is the hovered/source item itself.

Example:

- `Deadline` can recycle into materials.
- Those materials could theoretically craft `Deadline`.
- The tooltip must not suggest recycling `Deadline` as a way to craft `Deadline`.

Rules:

- Suppress these self-target entries in advisory insight generation, not only in tooltip rendering.
- The suppression applies to committed and advisory recycle/salvage usage insight rows.
- Do not remove static `Recycles Into`, `Salvages Into`, or `Crafting Recipe` information.
- Do not change executable planner behavior; this only removes misleading advisory provenance.

## Data Changes

Extend `ItemRecycleSalvageUsage` with an action discriminator:

```ts
type ItemRecycleSalvageAction = 'recycle' | 'salvage';

interface ItemRecycleSalvageUsage {
  action: ItemRecycleSalvageAction;
  // existing fields unchanged
}
```

Data population rules:

- Committed recycle action provenance always uses `action: 'recycle'`.
- Advisory source provenance must inspect `recyclesInto` and `salvagesInto` separately instead of merging them into one object.
- Advisory source provenance must only inspect yielded materials that are direct entries in the target's advisory dependency recipe.
- If both actions yield the same material, emit only the recycle advisory usage for tooltip grouping.
- If `srcItemId === targetItemId`, emit no recycle/salvage usage insight row.

## Implementation Plan

1. Update the main Quartermaster specification to describe grouped advisory tooltip behavior.
2. Add `ItemRecycleSalvageAction` and `action` to `ItemRecycleSalvageUsage`.
3. Update `addRecycleSalvageUsages` to populate `action` explicitly, prefer recycle over salvage for duplicate yields, and limit advisory source provenance to direct advisory materials.
4. Suppress recycle/salvage usage insights where the source item and final target item are identical.
5. Update existing Quartermaster tests that assert recycle/salvage usage shape.
6. Refactor `ItemTooltip` advisory rendering:
   - group by `action + yieldItemId`
   - render `Possible Use After Recycling/Salvage: <yield item>` group headlines
   - group entries by target item
   - render target headers and list cards using the shared advisory target layout
7. Refactor `ItemTooltip` crafting provenance rendering as `Possible Craft Uses`.
8. Add SCSS for the grouped advisory tooltip sections.
9. Add only English source strings for new advisory labels if existing strings are insufficient.
10. Run `npm run build` and `npm test -- src/apps/quartermaster`.

## Non-Goals

- Do not redesign `Needed for Lists` or `Needed for Repair`.
- Do not change static `Recycles Into` or `Salvages Into` sections.
- Do not change planner calculations.
- Do not edit Crowdin-managed locale files.
