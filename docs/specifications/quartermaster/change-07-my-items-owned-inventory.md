# CHANGE REQUEST
## Quartermaster Specification Update - My Items and Owned Inventory Aggregation

Document Type: Structured Delta vs Previous Specification
Scope: Quartermaster inventory aggregation, navigation, My Items UI, planner inputs, and status wording
Impact Level: UX removal plus planner behavior correction
Version: CR-My-Items-Owned-Inventory-v1

---

# 1. SUMMARY

Quartermaster must remove the dedicated **Current Loadout** view and replace the **Stash** view with **My Items**.

**My Items** is the user's canonical owned inventory view. It must include:

- items in stash
- items in current loadout
- attachments slotted into weapons in stash
- attachments slotted into weapons in current loadout

The same canonical owned item totals must be used by all planner calculations:

- missing item calculations
- craft plan calculations
- recycle plan calculations
- In Raid / bring-home suggestions
- item icon quantity overlays
- item tooltips and status summaries

This change resolves the current mismatch where some UI quantity overlays can represent stash plus loadout, while planner calculations still use only aggregated stash.

---

# 2. MOTIVATION

The current **Current Loadout** view is not useful as a separate destination. Users need one inventory-oriented view that answers what they currently own, not two fragmented views split by ArcTracker source.

The planner is also misleading if items equipped in the current loadout are ignored for deficits and crafting decisions. If a list requires 10 items and the user has 7 total across stash, loadout, and attached weapon modifications, the planner must report 3 missing, not the stash-only deficit.

Weapon attachments are actual owned items. If an attachment is slotted into a weapon, it must be counted and visible as a separate owned item, while retaining context that explains where it currently is.

---

# 3. SCOPE

This change affects:

- Quartermaster navigation
- Stash view naming and behavior
- Current Loadout view removal
- ArcTracker stash/loadout aggregation
- owned quantity calculation
- planner input construction
- item provenance metadata for display
- My Items status rendering
- localization keys
- tests for aggregation and planner behavior

This change does not alter:

- user list editing behavior
- hideout list generation
- blueprint sync semantics
- ArcTracker proxy endpoint contracts
- static item generation

---

# 4. MODIFICATIONS

## CR-001 - Rename Stash to My Items

### Type
Modification

### Affected Sections
- 1.2 Purpose
- 2.2 Owned Quantity Definition
- 4.2 Stash Integration
- 7 UX View-Specific Display Rules

### Change

The navigation item currently labeled **Stash** must be renamed to **My Items**.

The underlying ArcTracker stash sync operation may keep the existing technical name where appropriate, but user-facing labels should use **My Items** when the view represents the merged owned inventory.

Examples:

- Sidebar label: `My Items`
- Page/view terminology: `My Items`
- Search placeholder: `Search my items...`
- Empty state should explain that the user needs to sync inventory and loadout to get complete item ownership.

### Technical Impact

- Rename user-facing localization keys or values.
- Keep compatibility with existing `stash` route/view id only if that minimizes churn; the visible label must change.
- Existing SCSS class names may remain as implementation details, but new code should prefer `my-items` naming if files/classes are touched substantially.

---

## CR-002 - Remove Current Loadout View

### Type
Removal

### Affected Sections
- 4.3 Loadout Integration
- 7 UX View-Specific Display Rules

### Change

Remove the dedicated **Current Loadout** view from Quartermaster navigation.

Loadout data remains required as an inventory source, but it must no longer be presented as a separate page.

Loadout sync remains available through a combined **Sync My Items** action in the My Items view controls.

The combined sync action must:

- sync inventory first
- then sync loadout
- show the current sync step next to or inside the control:
  - `Syncing inventory...`
  - `Syncing loadout...`
- preserve individual error handling internally so a failed inventory or loadout sync can produce a useful error message

### Technical Impact

- Remove `current-loadout` from `ViewId`.
- Remove the sidebar item.
- Remove the route/render branch for `CurrentLoadoutView`.
- Remove or archive `CurrentLoadoutView` and its dedicated SCSS once implementation is complete.
- Preserve both cached inventory and loadout timestamp display in the global header.

---

## CR-003 - Define Canonical Owned Inventory

### Type
Modification

### Affected Sections
- 2.2 Owned Quantity Definition
- 4.2 Stash Integration
- 4.3 Loadout Integration
- 6 Planner Logic

### Change

Quartermaster must construct one canonical owned inventory collection from all currently cached owned-item sources:

```ts
ownedInventory[itemId] =
    stashRootQuantity[itemId]
  + stashAttachmentQuantity[itemId]
  + loadoutRootQuantity[itemId]
  + loadoutAttachmentQuantity[itemId]
```

Definitions:

- `stashRootQuantity`: top-level items returned by the stash cache.
- `stashAttachmentQuantity`: valid attachment items nested under stash items.
- `loadoutRootQuantity`: top-level items returned by the current loadout cache.
- `loadoutAttachmentQuantity`: valid attachment items nested under loadout items.

Unknown `itemId`, `null` `itemId`, and non-positive quantities must be ignored.

Only item ids present in the static Quartermaster item dataset may participate in planner calculations or My Items display.

### Technical Impact

- Introduce a shared aggregation helper for canonical owned inventory.
- Replace planner `stashItems` input with canonical owned items, or rename the planner input to avoid implying stash-only behavior.
- `computePlan(...)`, greedy planning, deficits, crafting, recycling, In Raid suggestions, `getOwnedQuantity`, and item tooltip quantities must all read from the same canonical owned totals.
- Tests must prove that equipped and attached items reduce deficits.

---

## CR-004 - Count Slotted Attachments as Owned Items

### Type
Addition

### Affected Sections
- 2.2 Owned Quantity Definition
- 4.2 Stash Integration
- 4.3 Loadout Integration

### Change

When an ArcTracker item contains an `attachments` array, each valid attachment must be counted as a separate owned item.

Example source item:

```json
{
  "itemId": "stitcher_iii",
  "name": "Stitcher III",
  "quantity": 1,
  "slotIndex": 21,
  "durabilityPercent": 74.3618,
  "attachments": [
    {
      "itemId": "extended_barrel",
      "name": "Extended Barrel",
      "quantity": 1,
      "slotIndex": 0,
      "durabilityPercent": 100
    },
    {
      "itemId": null,
      "name": null,
      "quantity": 1,
      "slotIndex": 1,
      "durabilityPercent": 100
    },
    {
      "itemId": "extended_light_mag_i",
      "name": "Extended Light Mag I",
      "quantity": 1,
      "slotIndex": 2,
      "durabilityPercent": 100
    },
    {
      "itemId": "padded_stock",
      "name": "Padded Stock",
      "quantity": 1,
      "slotIndex": 3,
      "durabilityPercent": 100
    }
  ]
}
```

This must add the following owned quantities:

- `stitcher_iii` x1
- `extended_barrel` x1
- `extended_light_mag_i` x1
- `padded_stock` x1

The `null` attachment slot must be ignored.

### Technical Impact

- Extend stash item type support if the cached stash type does not currently include `attachments`.
- Ensure loadout aggregation recursively or explicitly processes weapon attachments.
- Do not require attachment durability for planning.
- Preserve parent weapon context for display provenance.

---

## CR-005 - Display Inventory Provenance in My Items

### Type
Addition

### Affected Sections
- 7 UX View-Specific Display Rules

### Change

My Items must display contextual subtext under item names when an owned item is not simply a top-level stash item.

Required provenance labels:

- `In current loadout`
- `Attached to {weaponName} in stash`
- `Attached to {weaponName} in current loadout`

Display rules:

- The main item name remains the static localized item name from the Quartermaster item dataset.
- Provenance appears as smaller, secondary text under the item name.
- If the same item id appears from multiple sources, the row remains aggregated by item id.
- If multiple provenance labels apply, the row should show a concise summary rather than duplicate rows.

Recommended summary behavior for aggregated rows:

- Show up to two provenance labels directly.
- If more than two labels apply, append `+N more locations`.
- Top-level stash ownership does not need a sublabel unless it is the only source and a future design calls for it.

### Technical Impact

Suggested display model:

```ts
interface OwnedItemDisplayRow {
  itemId: string
  quantity: number
  locations: OwnedItemLocation[]
}

type OwnedItemLocation =
  | { source: "stash"; quantity: number }
  | { source: "loadout"; quantity: number }
  | {
      source: "stash_attachment" | "loadout_attachment"
      quantity: number
      parentItemId: string
      parentName: string
    }
```

Planner calculations only need `itemId` and `quantity`; My Items display needs the richer `locations`.

---

## CR-006 - Remove Need Column From My Items

### Type
Removal

### Affected Sections
- 7 UX View-Specific Display Rules

### Change

Remove the **Need** column from the inventory table.

The status column must carry all requirement and deficit explanation.

### Technical Impact

- Remove `quartermaster.stash.columns.need` usage from this view.
- Remove `missingCount` display from a dedicated column.
- Keep any compact missing count text only as part of status chips or tooltip content.

---

## CR-007 - Replace Status Chips With Explanatory Status Stack

### Type
Modification

### Affected Sections
- 7 UX View-Specific Display Rules

### Change

The status column must provide clear, quantified explanations.

Recommended visualization:

- Use a vertical stack of compact status chips.
- The first chip communicates the requirement state.
- Additional chips communicate planner actions or blockers.
- Chips use stable color semantics:
  - green: enough owned quantity
  - red: still needed
  - amber: recycle recommendation
  - neutral/blue: craftable or informational
  - muted red/purple: blocked or uncraftable

Required wording changes:

- Rename red `Missing` status to `Needed`.
- Avoid standalone `Have` without counts.

Recommended status examples:

For a satisfied required item:

```text
Have 12 / 10 required for Loadout
```

For a missing required item:

```text
Need 3 more for Loadout (10 required, 7 owned)
```

For requirements from multiple lists:

```text
Need 5 more across 3 lists (18 required, 13 owned)
```

For an owned item with no active requirement:

```text
Owned 4
```

For a recycle recommendation:

```text
Recycle for Mechanical Components (Loadout)
```

For an uncraftable blocker:

```text
Blocked: blueprint not unlocked
```

### Technical Impact

- Status rendering needs access to:
  - owned quantity
  - total required quantity
  - missing quantity
  - requirement source list names
  - recycle target context
  - uncraftable reason
- Existing `itemInsights` and `requiredSourcesByItemId` may provide much of the provenance, but may need additional aggregation for concise status text.
- Localization keys should use parameterized templates instead of inline concatenation.

---

## CR-008 - Use Canonical Owned Inventory Throughout Planner Calculations

### Type
Modification

### Affected Sections
- 6 Planner Logic
- 6.8 Planner Result
- 11 Testing & Validation

### Change

Every planner calculation must use canonical owned inventory, not stash-only inventory.

This includes:

- top-level deficit calculation
- greedy craft planning
- recycle reservation
- craft plan material availability
- blocker calculation
- loot suggestions
- In Raid suggestions
- plan rows
- global missing item count

If one cache is missing:

- Planner calculations may use the available cached source, with missing cache sources contributing `0`.
- My Items and planner-adjacent views must show a visible warning that owned inventory is incomplete.
- The warning must identify which source has not been synced yet: inventory, loadout, or both.
- UI quantity overlays may still render unknown where the product needs to communicate incomplete ownership confidence.

### Technical Impact

- Current `computePlan(itemsMap, allLists, stashItems, ...)` call must receive canonical owned items instead of stash-only items.
- The planner input type should be renamed from `StashItem[]` to a neutral name such as `OwnedItemQuantity[]`.
- Existing code comments that say "stash" inside planner internals should be updated when they now mean "owned".

---

# 5. ACCEPTANCE CRITERIA

1. Quartermaster sidebar no longer contains **Current Loadout**.
2. Quartermaster sidebar displays **My Items** instead of **Stash**.
3. My Items shows top-level stash items, top-level loadout items, stash weapon attachments, and loadout weapon attachments.
4. Attachments with `null` item ids are ignored.
5. Attached items display contextual subtext such as `Attached to Stitcher III in stash`.
6. Loadout items display `In current loadout` contextual subtext.
7. The My Items table no longer has a **Need** column.
8. Requirement status text is quantified, for example `Need 3 more for Loadout (10 required, 7 owned)`.
9. Red requirement status uses `Needed` semantics, not `Missing - Loadout`.
10. Planner deficits are reduced by quantities from stash, loadout, and attachments.
11. Crafting calculations use the same owned totals as My Items.
12. In Raid suggestions use the same owned totals as My Items.
13. Item icon overlays and tooltips use the same owned totals as planner calculations.
14. My Items has one combined **Sync My Items** action and displays `Syncing inventory...` / `Syncing loadout...` while running.
15. If inventory or loadout cache is missing, the UI warns that owned inventory is incomplete.
16. The global header continues to show both inventory/stash and loadout sync timestamps.
17. Aggregated My Items rows use summarized location labels, not separate duplicate rows or expandable detail.
18. Attached items count as fully available for list satisfaction and crafting calculations.
19. Top-level weapons with counted attachments show an indicator that attachments were included separately.

---

# 6. TESTING & VALIDATION

Required tests:

- Aggregating stash root items counts quantities by item id.
- Aggregating loadout root items counts quantities by item id.
- Aggregating stash attachments counts valid attachment item ids.
- Aggregating loadout attachments counts valid attachment item ids.
- `null` attachment slots are ignored.
- Unknown item ids are ignored before planner input.
- Duplicate item ids across stash, loadout, and attachments are summed.
- `computePlan` deficits use canonical owned quantities.
- Craft plan availability uses canonical owned quantities.
- In Raid suggestions disappear or decrease when loadout/attachment ownership satisfies a requirement.
- My Items status text renders `Owned`, `Have`, and `Need` cases with correct quantities.

Suggested fixture:

- Stash includes `stitcher_iii` with `extended_barrel`, `extended_light_mag_i`, and `padded_stock`.
- Loadout includes at least one item also required by an active list.
- Active list requires more of one attachment than currently owned, proving attached quantity partially satisfies the requirement.

---

# 7. OPEN QUESTIONS

None.

Resolved decisions:

- My Items uses one combined **Sync My Items** button.
- During sync, the UI displays the current step: `Syncing inventory...` or `Syncing loadout...`.
- If stash/inventory or loadout has not synced, the UI warns that owned inventory is incomplete.
- The global header continues to show both stash/inventory and loadout timestamps.
- Aggregated item rows use summarized location labels.
- Attached items count as fully available.
- Top-level weapons with counted attachments show an attachment-counted indicator.

---

# 8. NON-GOALS

- No automatic loadout modification.
- No automatic attachment removal guidance beyond location labels.
- No durability-based valuation or filtering.
- No change to ArcTracker API endpoints.
- No migration requirement for pre-release local cache structures unless implementation discovers a concrete cache compatibility issue.
